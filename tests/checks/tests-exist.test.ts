import { describe, expect, it } from "vitest";
import { testsExist } from "@/lib/engine/checks/tests-exist";
import { makeSnapshot } from "../helpers";

describe("tests-exist", () => {
  it("passes when test files exist, and counts them", () => {
    const result = testsExist.run(
      makeSnapshot({ "src/app.ts": "", "src/app.test.ts": null, "tests/db.ts": null, "pkg/x_test.go": null }),
    );
    expect(result.status).toBe("pass");
    expect(result.summary).toContain("3 test files");
    expect(result.fix).toBe("");
  });

  it("passes for Python-style tests", () => {
    expect(testsExist.run(makeSnapshot({ "main.py": "", "test_main.py": null })).status).toBe("pass");
  });

  it("fails when there is code but no tests", () => {
    const result = testsExist.run(makeSnapshot({ "src/app.ts": "", "README.md": "" }));
    expect(result.status).toBe("fail");
    expect(result.fix).not.toBe("");
  });

  it("ignores tests inside dependencies", () => {
    const result = testsExist.run(makeSnapshot({ "index.js": "", "node_modules/lib/index.test.js": null }));
    expect(result.status).toBe("fail");
  });

  it("is na when there is no code at all", () => {
    const result = testsExist.run(makeSnapshot({ "README.md": "# hi", "docs/guide.md": "" }));
    expect(result.status).toBe("na");
    expect(result.fix).toBe("");
  });
});
