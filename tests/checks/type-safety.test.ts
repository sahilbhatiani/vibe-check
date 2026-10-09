import { describe, expect, it } from "vitest";
import { parseJsonc, typeSafety } from "@/lib/engine/checks/type-safety";
import { makeSnapshot } from "../helpers";

const strictConfig = JSON.stringify({ compilerOptions: { strict: true } });
const clean = (n: number) => Array.from({ length: n }, (_, i) => `const v${i}: number = ${i};`).join("\n");

describe("type-safety", () => {
  it("is n/a for a project with no TypeScript", () => {
    expect(typeSafety.run(makeSnapshot({ "index.js": "1", "package.json": "{}" })).status).toBe("na");
  });

  it("passes with strict on and little any", () => {
    const result = typeSafety.run(makeSnapshot({ "tsconfig.json": strictConfig, "src/a.ts": clean(100) }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("fails when strict is off", () => {
    const result = typeSafety.run(
      makeSnapshot({ "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2020" } }), "a.ts": clean(10) }),
    );
    expect(result.status).toBe("fail");
    expect(result.summary).toContain("strict mode is off");
    expect(result.files).toEqual([{ path: "tsconfig.json" }]);
    expect(result.fix).not.toBe("");
  });

  it("fails when strict is explicitly false", () => {
    const result = typeSafety.run(
      makeSnapshot({ "tsconfig.json": '{ "compilerOptions": { "strict": false } }', "a.ts": "" }),
    );
    expect(result.status).toBe("fail");
  });

  it("reads tsconfig with comments, trailing commas and // inside strings", () => {
    const tsconfig = `{
      // Visit https://aka.ms/tsconfig to read more
      "$schema": "https://json.schemastore.org/tsconfig",
      "compilerOptions": {
        /* type checking */
        "strict": true, // keep this on
        "paths": { "@/*": ["./*"], },
      },
      "include": ["**/*.ts", "src/**/*"],
    }`;
    const result = typeSafety.run(makeSnapshot({ "tsconfig.json": tsconfig, "a.ts": clean(10) }));
    expect(result.status).toBe("pass");
  });

  it("doesn't fail on strict when it extends a base config it can't see", () => {
    const result = typeSafety.run(
      makeSnapshot({ "tsconfig.json": '{ "extends": "@tsconfig/next/tsconfig.json" }', "a.ts": clean(10) }),
    );
    expect(result.status).toBe("pass");
  });

  it("skips the strict part when tsconfig wasn't downloaded or can't be parsed", () => {
    expect(typeSafety.run(makeSnapshot({ "tsconfig.json": null, "a.ts": clean(10) })).status).toBe("pass");
    expect(typeSafety.run(makeSnapshot({ "tsconfig.json": "{ nope", "a.ts": clean(10) })).status).toBe("pass");
  });

  it("fails on heavy any use", () => {
    const code = [
      "function f(x: any) {}",
      "const y = z as any;",
      "const w = <any>q;",
      "const list: any[] = [];",
      "let v: any = 1;",
      clean(15),
    ].join("\n");
    const result = typeSafety.run(makeSnapshot({ "tsconfig.json": strictConfig, "src/bad.ts": code }));
    expect(result.status).toBe("fail");
    expect(result.summary).toContain("`any` is used 5 times in 20 lines");
    expect(result.files).toEqual([{ path: "src/bad.ts", preview: "5 × any" }]);
  });

  it("passes when any use is at the 1-per-50-lines limit", () => {
    const code = [Array.from({ length: 5 }, () => "let v: any = 1;").join("\n"), clean(245)].join("\n");
    expect(typeSafety.run(makeSnapshot({ "tsconfig.json": strictConfig, "a.ts": code })).status).toBe("pass");
    const more = [code, "let w: any = 1;"].join("\n"); // 6 in 251 lines
    expect(typeSafety.run(makeSnapshot({ "tsconfig.json": strictConfig, "a.ts": more })).status).toBe("fail");
  });

  it("doesn't count words like many or company", () => {
    const code = Array.from({ length: 10 }, () => "const company = many.filter(anyway); // any of them").join("\n");
    expect(typeSafety.run(makeSnapshot({ "tsconfig.json": strictConfig, "a.ts": code })).status).toBe("pass");
  });

  it("ignores any in test files and type declarations", () => {
    const code = Array.from({ length: 10 }, () => "let v: any = 1;").join("\n");
    const result = typeSafety.run(
      makeSnapshot({ "tsconfig.json": strictConfig, "a.test.ts": code, "types.d.ts": code, "tests/x.ts": code }),
    );
    expect(result.status).toBe("pass");
  });

  it("reports both problems together", () => {
    const code = Array.from({ length: 10 }, () => "let v: any = 1;").join("\n");
    const result = typeSafety.run(makeSnapshot({ "tsconfig.json": "{}", "a.ts": code }));
    expect(result.status).toBe("fail");
    expect(result.summary).toContain("strict mode is off");
    expect(result.summary).toContain("`any` is used 10 times");
  });
});

describe("parseJsonc", () => {
  it("keeps // and /* inside strings", () => {
    expect(parseJsonc('{ "a": "http://x/*y*/", "b": [1,], }')).toEqual({ a: "http://x/*y*/", b: [1] });
  });

  it("handles escaped quotes in strings", () => {
    expect(parseJsonc('{ "a": "say \\"hi\\" // not a comment" }')).toEqual({ a: 'say "hi" // not a comment' });
  });

  it("returns undefined on invalid input", () => {
    expect(parseJsonc("{ a: 1 }")).toBeUndefined();
  });
});
