import type { Check } from "../types";

interface PackageJson {
  scripts?: Record<string, unknown>;
}

function parsePackageJson(content: string | undefined): PackageJson | null {
  if (content === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as PackageJson) : null;
  } catch {
    return null;
  }
}

export const testScript: Check = {
  id: "test-script",
  category: "reliability",
  title: "Test script is real",
  weight: 3,
  run(snapshot) {
    const file = snapshot.files.find((f) => f.path === "package.json");
    const pkg = parsePackageJson(file?.content);
    if (!file || !pkg) {
      return { status: "na", summary: "No readable package.json at the root of the repo.", files: [], fix: "" };
    }

    const scripts = pkg.scripts !== null && typeof pkg.scripts === "object" ? pkg.scripts : {};
    const test = scripts.test;

    if (typeof test === "string" && test.trim() !== "" && !/no test specified/i.test(test)) {
      return { status: "pass", summary: "package.json has a real test command.", files: [], fix: "" };
    }

    const placeholder = typeof test === "string" && /no test specified/i.test(test);
    return {
      status: "fail",
      summary: placeholder
        ? "The test command in package.json is still the empty placeholder."
        : "package.json has no test command.",
      files: [{ path: "package.json" }],
      fix:
        "There's no standard way to run this project's tests, so they're easy to skip and automated checks can't run " +
        "them. Add a `test` entry under `scripts` in package.json that runs your test tool (for example `vitest run` " +
        "or `jest`), so anyone can run all the tests with `npm test`.",
    };
  },
};
