import { describe, expect, it } from "vitest";
import { lockfile } from "@/lib/engine/checks/lockfile";
import { makeSnapshot } from "../helpers";

describe("lockfile", () => {
  it("is n/a when there's no root package.json", () => {
    const result = lockfile.run(makeSnapshot({ "main.py": "print(1)", "web/package.json": "{}" }));
    expect(result.status).toBe("na");
    expect(result.fix).toBe("");
  });

  it.each(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"])("passes with %s", (name) => {
    const result = lockfile.run(makeSnapshot({ "package.json": "{}", [name]: null }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("fails when a JS project has no lockfile", () => {
    const result = lockfile.run(makeSnapshot({ "package.json": "{}", "index.js": "" }));
    expect(result.status).toBe("fail");
    expect(result.files).toEqual([{ path: "package.json" }]);
    expect(result.fix).not.toBe("");
  });

  it("only counts a lockfile at the root", () => {
    const result = lockfile.run(makeSnapshot({ "package.json": "{}", "packages/a/package-lock.json": null }));
    expect(result.status).toBe("fail");
  });
});
