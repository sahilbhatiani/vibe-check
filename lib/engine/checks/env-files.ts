import type { Check } from "../types";
import { isIgnoredPath, isTestFile } from "../util";

// Files meant to be committed: templates list variable names, not real values, and dotenv-vault's
// `.env.vault` is encrypted.
const TEMPLATE_PARTS = new Set(["example", "sample", "template", "dist", "defaults", "vault"]);

/**
 * `.env`, `.env.local`, `.env.production`… anywhere in the repo, but not templates like `.env.example`
 * or `.env.local.example`.
 */
export function isEnvFile(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (name === ".env") return true;
  if (!name.startsWith(".env.")) return false;
  return !name
    .slice(".env.".length)
    .toLowerCase()
    .split(".")
    .some((part) => TEMPLATE_PARTS.has(part));
}

/** Env files under test or fixture folders usually hold dummy values for the test suite. */
function isTestEnvFile(path: string): boolean {
  return isTestFile(path) || path.split("/").some((s) => /^(__)?fixtures?(__)?$/i.test(s));
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

    if (found.every((f) => isTestEnvFile(f.path))) {
      return {
        status: "warn",
        summary: `${found.length} environment file${found.length === 1 ? " is" : "s are"} committed in test folders.`,
        files: found.map((f) => ({ path: f.path })),
        fix:
          "These look like settings for the project's automated tests, which usually hold made-up values. Ask your " +
          "developer to confirm they contain no real passwords or API keys. If any key in them is real, treat it as " +
          "leaked: create a new one with the provider and switch the old one off.",
      };
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
