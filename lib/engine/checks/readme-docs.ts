import type { Check, FileRef } from "../types";
import { isIgnoredPath, isSourceFile, isTestFile } from "../util";

const MIN_README_CHARS = 300;

// Matches `.env.example`, `.env.sample`, `.env.template`, `.env.local.example`, `.env.dist`, `env.example`, `example.env`…
function isEnvTemplate(path: string): boolean {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  if (name === "example.env" || name === "sample.env") return true;
  if (!name.startsWith(".env.") && !name.startsWith("env.")) return false;
  return /(^|\.)(example|sample|template|dist|defaults)(\.|$)/.test(name.replace(/^\.?env\./, ""));
}

// Set by the runtime or hosting platform, not something a developer has to configure.
const BUILT_IN_VARS = new Set([
  "NODE_ENV", "CI", "PORT", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "NEXT_RUNTIME",
  // Vite built-ins on import.meta.env
  "MODE", "DEV", "PROD", "SSR", "BASE_URL",
]);

const ENV_READ_RE =
  /process\.env\.([A-Za-z_]\w*)|process\.env\[\s*["'`]([A-Za-z_]\w*)["'`]\s*\]|import\.meta\.env\.([A-Za-z_]\w*)|os\.environ|os\.getenv|os\.Getenv|\bENV\[|\bENV\.fetch\b/g;

/** Names of the config variables a line reads; "" for languages where we don't extract the name. */
function envReads(line: string): string[] {
  const names: string[] = [];
  for (const m of line.matchAll(ENV_READ_RE)) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name === undefined) names.push("");
    else if (!BUILT_IN_VARS.has(name)) names.push(name);
  }
  return names;
}

function isRootReadme(path: string): boolean {
  return /^readme(\.[a-z0-9]+)?$/i.test(path);
}

export const readmeDocs: Check = {
  id: "readme-docs",
  category: "maintainability",
  title: "README / env documentation",
  weight: 3,
  run(snapshot) {
    const problems: string[] = [];
    const fixes: string[] = [];
    const files: FileRef[] = [];

    const readme = snapshot.files.find((f) => isRootReadme(f.path));
    if (!readme) {
      problems.push("there's no README");
      fixes.push(
        "Add a `README.md` explaining what the project does, how to install and run it, and how to deploy it.",
      );
    } else if (readme.content !== undefined && readme.content.trim().length < MIN_README_CHARS) {
      problems.push("the README is almost empty");
      files.push({ path: readme.path });
      fixes.push("Expand the README to explain what the project does, how to install and run it, and how to deploy it.");
    }

    const hasTemplate = snapshot.files.some((f) => isEnvTemplate(f.path) && !isIgnoredPath(f.path));
    if (!hasTemplate) {
      const readers: FileRef[] = [];
      for (const f of snapshot.files) {
        if (f.content === undefined || !isSourceFile(f.path) || isTestFile(f.path)) continue;
        const lines = f.content.split(/\r?\n/);
        const index = lines.findIndex((l) => envReads(l).length > 0);
        if (index === -1) continue;
        // Variable names aren't secrets, so it's safe to show which one is read.
        const name = envReads(lines[index]).find((n) => n !== "");
        readers.push(name ? { path: f.path, line: index + 1, preview: name } : { path: f.path, line: index + 1 });
      }
      if (readers.length > 0) {
        problems.push("the code reads settings from environment variables but there's no `.env.example` listing them");
        files.push(...readers.slice(0, 10));
        fixes.push(
          "Add a `.env.example` file listing every setting the app needs (names only, never real values), so " +
            "anyone setting it up knows what to provide.",
        );
      }
    }

    if (problems.length === 0) {
      return { status: "pass", summary: "The project has a README and documents the settings it needs.", files: [], fix: "" };
    }

    const summary = problems.join(", and ") + ".";
    return {
      status: "fail",
      summary: summary.charAt(0).toUpperCase() + summary.slice(1),
      files,
      fix:
        "Without setup instructions, the next developer you bring on (or you, in six months) will waste time " +
        "guessing how to run the app, and a missing setting can quietly break it in production. " +
        fixes.join(" "),
    };
  },
};
