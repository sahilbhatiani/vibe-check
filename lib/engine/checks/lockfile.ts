import type { Check } from "../types";

const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"];

// Works on paths only. Only the repo root counts: that's where installs run from.
export const lockfile: Check = {
  id: "lockfile",
  category: "maintainability",
  title: "Lockfile present",
  weight: 3,
  run(snapshot) {
    const paths = new Set(snapshot.files.map((f) => f.path));

    if (!paths.has("package.json")) {
      return { status: "na", summary: "Not a JavaScript project, so no lockfile is needed.", files: [], fix: "" };
    }

    const found = LOCKFILES.find((name) => paths.has(name));
    if (found) {
      return { status: "pass", summary: `Dependency versions are pinned with \`${found}\`.`, files: [], fix: "" };
    }

    return {
      status: "fail",
      summary: "There's no lockfile, so every install can pull in different versions of your dependencies.",
      files: [{ path: "package.json" }],
      fix:
        "Without a lockfile, your app can install slightly different versions of the libraries it depends on each " +
        "time it's built. Something that worked yesterday can break in production today with no code change. Run " +
        "your package manager's install command once (for example `npm install`) and commit the lockfile it " +
        "creates (such as `package-lock.json`).",
    };
  },
};
