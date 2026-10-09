import { describe, expect, it } from "vitest";
import { giantFiles } from "@/lib/engine/checks/giant-files";
import { makeSnapshot } from "../helpers";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `const a${i} = ${i};`).join("\n") + "\n";

describe("giant-files", () => {
  it("is n/a when no source file contents were downloaded", () => {
    expect(giantFiles.run(makeSnapshot({ "README.md": "hi", "a.ts": null })).status).toBe("na");
  });

  it("passes at exactly 600 lines", () => {
    const result = giantFiles.run(makeSnapshot({ "a.ts": lines(600) }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("warns at 601 lines", () => {
    const result = giantFiles.run(makeSnapshot({ "a.ts": lines(601) }));
    expect(result.status).toBe("warn");
    expect(result.files).toEqual([{ path: "a.ts", preview: "601 lines" }]);
    expect(result.fix).not.toBe("");
  });

  it("warns (not fails) at exactly 1,000 lines", () => {
    expect(giantFiles.run(makeSnapshot({ "a.ts": lines(1000) })).status).toBe("warn");
  });

  it("fails at 1,001 lines and lists biggest first", () => {
    const result = giantFiles.run(makeSnapshot({ "small.ts": lines(10), "mid.py": lines(700), "big.tsx": lines(1204) }));
    expect(result.status).toBe("fail");
    expect(result.files).toEqual([
      { path: "big.tsx", preview: "1,204 lines" },
      { path: "mid.py", preview: "700 lines" },
    ]);
    expect(result.summary).toBe("1 source file is over 1,000 lines, and 1 more over 600.");
  });

  it("ignores tests, generated files and non-source files", () => {
    const result = giantFiles.run(
      makeSnapshot({
        "a.ts": lines(5),
        "a.test.ts": lines(2000),
        "src/schema.generated.ts": lines(2000),
        "src/__generated__/types.ts": lines(2000),
        "data.json": lines(2000),
        "package-lock.json": lines(5000),
      }),
    );
    expect(result.status).toBe("pass");
  });
});
