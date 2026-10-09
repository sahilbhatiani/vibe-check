import type { Check } from "../types";
import { isSourceFile, isTestFile } from "../util";

// Works on paths only, so it doesn't depend on which files were downloaded.
export const testsExist: Check = {
  id: "tests-exist",
  category: "reliability",
  title: "Tests exist",
  weight: 8,
  run(snapshot) {
    // isTestFile already skips dependency and build folders.
    const tests = snapshot.files.filter((f) => isTestFile(f.path));

    if (tests.length > 0) {
      return {
        status: "pass",
        summary: `Found ${tests.length} test file${tests.length === 1 ? "" : "s"}.`,
        files: [],
        fix: "",
      };
    }

    if (!snapshot.files.some((f) => isSourceFile(f.path))) {
      return { status: "na", summary: "No code files found, so there's nothing to test.", files: [], fix: "" };
    }

    return {
      status: "fail",
      summary: "No automated tests were found.",
      files: [],
      fix:
        "Without tests, every change is a gamble: something that worked yesterday can quietly break and you'll only " +
        "hear about it from a user. Start small: ask your developer (or your AI coding tool) to write tests for the " +
        "few things that would hurt most if they broke, like sign-up, login and payments, and run them before every release.",
    };
  },
};
