import type { Check, FileRef, RepoFile } from "../types";
import { isSourceFile, isTestFile, lineCount } from "../util";

// Spec: more than 1 `any` per 50 lines is "heavy".
const LINES_PER_ANY = 50;
// A tiny repo with one or two `any`s isn't a real problem; don't flag below this many.
const MIN_ANY_COUNT = 5;

// `: any`, `as any`, `<any>`, `any[]`. Word boundaries keep "many", "company" etc. out.
const ANY_RE = /:\s*any\b|\bas\s+any\b|<any>|\bany\[\]/g;

function isTsSource(path: string): boolean {
  return isSourceFile(path) && !isTestFile(path) && /\.(ts|tsx|mts|cts)$/i.test(path);
}

/** Parses tsconfig-style JSON with comments and trailing commas. Returns undefined if it can't. */
export function parseJsonc(text: string): unknown {
  // Each regex matches a whole string literal first, so `//` inside strings (URLs, globs) is left alone.
  const noComments = text.replace(/("(?:[^"\\\n]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str: string | undefined) =>
    str ?? "",
  );
  const noTrailingCommas = noComments.replace(/("(?:[^"\\\n]|\\.)*")|,(\s*[}\]])/g, (m, str: string | undefined, tail: string | undefined) =>
    str ?? tail ?? m,
  );
  try {
    return JSON.parse(noTrailingCommas);
  } catch {
    return undefined;
  }
}

function countAny(content: string): number {
  return content.match(ANY_RE)?.length ?? 0;
}

type StrictState = "on" | "off" | "unknown";

function strictState(tsconfig: RepoFile | undefined): StrictState {
  if (tsconfig?.content === undefined) return "unknown";
  const parsed = parseJsonc(tsconfig.content);
  if (typeof parsed !== "object" || parsed === null) return "unknown";
  const config = parsed as { extends?: unknown; references?: unknown; compilerOptions?: { strict?: unknown } };
  const strict = config.compilerOptions?.strict;
  if (strict === true) return "on";
  // A base config we can't see may turn strict on, and a solution-style config (Vite's template:
  // `{ "files": [], "references": [...] }`) leaves it to the referenced configs. Only an explicit `false` counts then.
  if (strict === undefined && (config.extends !== undefined || config.references !== undefined)) return "unknown";
  return "off";
}

export const typeSafety: Check = {
  id: "type-safety",
  category: "maintainability",
  title: "Type safety",
  weight: 4,
  run(snapshot) {
    const tsconfig = snapshot.files.find((f) => f.path === "tsconfig.json");
    const tsFiles = snapshot.files.filter((f) => isTsSource(f.path));

    if (!tsconfig && tsFiles.length === 0) {
      return { status: "na", summary: "Not a TypeScript project.", files: [], fix: "" };
    }

    const strict = strictState(tsconfig);

    let totalLines = 0;
    let totalAny = 0;
    const anyFiles: { path: string; count: number }[] = [];
    for (const f of tsFiles) {
      if (f.content === undefined) continue;
      totalLines += lineCount(f.content);
      const count = countAny(f.content);
      totalAny += count;
      if (count > 0) anyFiles.push({ path: f.path, count });
    }
    const heavyAny = totalAny >= MIN_ANY_COUNT && totalAny * LINES_PER_ANY > totalLines;

    if (strict !== "off" && !heavyAny) {
      return {
        status: "pass",
        summary:
          strict === "on"
            ? "TypeScript's strict mode is on and `any` is used sparingly."
            : "`any` is used sparingly. (Couldn't confirm strict mode from `tsconfig.json`.)",
        files: [],
        fix: "",
      };
    }

    const problems: string[] = [];
    const files: FileRef[] = [];
    const fixes: string[] = [];
    if (strict === "off") {
      problems.push("TypeScript's strict mode is off");
      files.push({ path: "tsconfig.json" });
      fixes.push(
        "Turn on strict mode by setting `\"strict\": true` under `compilerOptions` in `tsconfig.json`, then fix the " +
          "errors it reports. Each one is a spot where the app could crash on missing or unexpected data.",
      );
    }
    if (heavyAny) {
      problems.push(`\`any\` is used ${totalAny} times in ${totalLines.toLocaleString("en-US")} lines`);
      anyFiles.sort((a, b) => b.count - a.count);
      for (const f of anyFiles.slice(0, 10)) files.push({ path: f.path, preview: `${f.count} × any` });
      fixes.push(
        "Replace `any` with real types, starting with the files listed. `any` tells TypeScript to stop checking, " +
          "so mistakes there only show up when users hit them.",
      );
    }

    return {
      status: "fail",
      summary: `${problems.join(", and ")}.`.replace(/^./, (c) => c.toUpperCase()),
      files,
      fix:
        "TypeScript's main job is catching bugs before your users do, but here it's partly switched off. " +
        fixes.join(" "),
    };
  },
};
