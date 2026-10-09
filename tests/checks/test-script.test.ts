import { describe, expect, it } from "vitest";
import { testScript } from "@/lib/engine/checks/test-script";
import { makeSnapshot } from "../helpers";

const pkg = (scripts?: Record<string, string>) => JSON.stringify(scripts ? { name: "x", scripts } : { name: "x" });

describe("test-script", () => {
  it("passes with a real test script", () => {
    const result = testScript.run(makeSnapshot({ "package.json": pkg({ test: "vitest run" }) }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("fails on the npm placeholder", () => {
    const result = testScript.run(
      makeSnapshot({ "package.json": pkg({ test: 'echo "Error: no test specified" && exit 1' }) }),
    );
    expect(result.status).toBe("fail");
    expect(result.summary).toContain("placeholder");
    expect(result.files).toEqual([{ path: "package.json" }]);
  });

  it("fails when there is no test script", () => {
    expect(testScript.run(makeSnapshot({ "package.json": pkg({ build: "tsc" }) })).status).toBe("fail");
    expect(testScript.run(makeSnapshot({ "package.json": pkg() })).status).toBe("fail");
  });

  it("only looks at the root package.json", () => {
    const result = testScript.run(makeSnapshot({ "apps/web/package.json": pkg({ test: "jest" }) }));
    expect(result.status).toBe("na");
  });

  it("is na without a readable package.json", () => {
    expect(testScript.run(makeSnapshot({ "main.py": "" })).status).toBe("na");
    expect(testScript.run(makeSnapshot({ "package.json": null })).status).toBe("na");
    expect(testScript.run(makeSnapshot({ "package.json": "{ not json" })).status).toBe("na");
    expect(testScript.run(makeSnapshot({ "package.json": "null" })).status).toBe("na");
  });
});
