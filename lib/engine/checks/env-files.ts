import type { Check } from "../types";
import { isIgnoredPath } from "../util";

// Template files meant to be committed: they list variable names, not real values.
const TEMPLATE_SUFFIXES = new Set(["example", "sample", "template", "dist", "defaults"]);

/** `.env`, `.env.local`, `.env.production`… anywhere in the repo, but not templates like `.env.example`. */
export function isEnvFile(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (name === ".env") return true;
  if (!name.startsWith(".env.")) return false;
  return !TEMPLATE_SUFFIXES.has(name.slice(".env.".length).toLowerCase());
}

// Works on paths only: env file contents are never downloaded.
export const envFiles: Check = {
  id: "env-files",
  category: "security",
  title: "Committed env files",
  weight: 10,
  run(snapshot) {
    const found = snapshot.files.filter((f) => isEnvFile(f.path) && !isIgnoredPath(f.path));

    if (found.length === 0) {
      return { status: "pass", summary: "No environment files are committed to the repo.", files: [], fix: "" };
    }

    return {
      status: "fail",
      summary: `${found.length} environment file${found.length === 1 ? " is" : "s are"} committed to the repo.`,
      files: found.map((f) => ({ path: f.path })),
      fix:
        "Environment files usually hold passwords and API keys. Because this repo is public, anyone can read them, " +
        "and deleting the file now won't help: it stays in the project's history. Treat every key in these files as " +
        "leaked: create new keys with each provider and switch the old ones off. Then delete the files, add `.env*` " +
        "to `.gitignore`, and keep a `.env.example` with the variable names only.",
    };
  },
};
