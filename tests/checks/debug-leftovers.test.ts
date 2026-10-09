import { describe, expect, it } from "vitest";
import { debugLeftovers } from "@/lib/engine/checks/debug-leftovers";
import { makeSnapshot } from "../helpers";

const filler = (n: number) => Array.from({ length: n }, (_, i) => `const a${i} = ${i};`).join("\n");

describe("debug-leftovers", () => {
  it("is n/a with no source contents", () => {
    expect(debugLeftovers.run(makeSnapshot({ "README.md": "TODO TODO", "a.ts": null })).status).toBe("na");
  });

  it("passes with occasional logging and few TODOs", () => {
    const code = ['console.log("started");', "// TODO: tidy", filler(398)].join("\n"); // 1 log in 400 lines
    const result = debugLeftovers.run(makeSnapshot({ "a.ts": code }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("passes at exactly 1 console.log per 200 lines", () => {
    const code = ['console.log("x");', filler(199)].join("\n");
    expect(debugLeftovers.run(makeSnapshot({ "a.ts": code })).status).toBe("pass");
  });

  it("warns on too many console.log calls", () => {
    const code = ['console.log("a");', 'console.log ("b");', filler(98)].join("\n");
    const result = debugLeftovers.run(makeSnapshot({ "src/a.ts": code }));
    expect(result.status).toBe("warn");
    expect(result.summary).toContain("2 `console.log` calls");
    expect(result.files).toEqual([{ path: "src/a.ts", preview: "2 console.log" }]);
    expect(result.fix).not.toBe("");
  });

  it("warns on more than 10 TODO/FIXME notes", () => {
    const code = [...Array.from({ length: 6 }, () => "// TODO later"), ...Array.from({ length: 5 }, () => "# FIXME"), filler(10)];
    const result = debugLeftovers.run(makeSnapshot({ "a.py": code.join("\n") }));
    expect(result.status).toBe("warn");
    expect(result.summary).toContain("11 TODO/FIXME notes");
  });

  it("allows exactly 10 TODOs and ignores lowercase 'todos'", () => {
    const code = [...Array.from({ length: 10 }, () => "// TODO"), "const todos = []; // todo list", filler(5)];
    expect(debugLeftovers.run(makeSnapshot({ "a.ts": code.join("\n") })).status).toBe("pass");
  });

  it("ignores test files and scripts", () => {
    const noisy = Array.from({ length: 20 }, () => 'console.log("x");').join("\n");
    const result = debugLeftovers.run(
      makeSnapshot({ "a.ts": filler(10), "a.test.ts": noisy, "scripts/seed.ts": noisy, "bin/cli.js": noisy }),
    );
    expect(result.status).toBe("pass");
  });
});
