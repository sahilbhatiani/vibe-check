import type { Check } from "../types";

// The env files we expect a .gitignore to keep out of the repo. `.env` is where most tutorials
// put secrets; `.env.local` is the Next.js / Vite convention.
const MAIN = ".env";
const LOCAL = ".env.local";

/** Turns one .gitignore pattern into a regex for root-level file names, or null if it can't match one. */
function patternToRegex(pattern: string): RegExp | null {
  let p = pattern;
  if (p.endsWith("/")) return null; // directories only
  p = p.replace(/^\*\*\//, "").replace(/^\//, "");
  if (p.includes("/")) return null; // a path inside some folder, not a root file
  const source = p
    .split("")
    .map((c) => (c === "*" ? "[^/]*" : c === "?" ? "[^/]" : c.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`);
}

/** Which of the given file names the .gitignore ignores. Later lines win, and `!` lines un-ignore. */
export function ignoredNames(gitignore: string, names: string[]): Set<string> {
  const ignored = new Set<string>();
  for (const raw of gitignore.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    const re = patternToRegex(negate ? line.slice(1) : line);
    if (!re) continue;
    for (const name of names) {
      if (!re.test(name)) continue;
      if (negate) ignored.delete(name);
      else ignored.add(name);
    }
  }
  return ignored;
}

const FIX_ADD =
  "A `.gitignore` file tells Git which files to never upload. Without a rule for env files, it's easy to " +
  "accidentally publish your passwords and API keys with the next commit. Add a line with `.env*` to the " +
  "`.gitignore` file at the top of the project (and `!.env.example` if you keep a template with variable names only).";

export const gitignoreEnv: Check = {
  id: "gitignore-env",
  category: "security",
  title: ".gitignore covers env files",
  weight: 5,
  run(snapshot) {
    const file = snapshot.files.find((f) => f.path === ".gitignore");
    if (!file) {
      return { status: "fail", summary: "The repo has no .gitignore file, so env files aren't protected.", files: [], fix: FIX_ADD };
    }
    if (file.content === undefined) {
      return { status: "na", summary: "The .gitignore file couldn't be checked.", files: [], fix: "" };
    }

    const ignored = ignoredNames(file.content, [MAIN, LOCAL]);
    const files = [{ path: ".gitignore" }];

    // Both covered (e.g. `.env*`, or `.env` plus `.env*.local`) → pass.
    if (ignored.has(MAIN) && ignored.has(LOCAL)) {
      return { status: "pass", summary: "The .gitignore keeps env files out of the repo.", files: [], fix: "" };
    }
    // Only one covered (e.g. just `.env.local`, or the old Next.js default `.env*.local`) → warn:
    // it's a real gap, but the project clearly thought about it.
    if (ignored.size > 0) {
      const missing = ignored.has(MAIN) ? LOCAL : MAIN;
      return {
        status: "warn",
        summary: `The .gitignore covers some env files but not \`${missing}\`.`,
        files,
        fix:
          `The \`.gitignore\` file ignores some env files, but a file named \`${missing}\` would still be uploaded, ` +
          "along with any keys in it. Replace the env lines in `.gitignore` with a single `.env*` line (and " +
          "`!.env.example` if you keep a template) so every env file is covered.",
      };
    }
    return { status: "fail", summary: "The .gitignore doesn't ignore env files.", files, fix: FIX_ADD };
  },
};
