import { describe, expect, it } from "vitest";
import { envFiles, isEnvFile } from "@/lib/engine/checks/env-files";
import { makeSnapshot } from "../helpers";

describe("env-files", () => {
  it("passes when no env files are committed", () => {
    const result = envFiles.run(makeSnapshot({ "app/page.tsx": "export default 1", ".gitignore": ".env*" }));
    expect(result.status).toBe("pass");
    expect(result.files).toEqual([]);
  });

  it("passes when only template env files are committed", () => {
    const result = envFiles.run(makeSnapshot({ ".env.example": "API_KEY=", "apps/web/.env.sample": "X=" }));
    expect(result.status).toBe("pass");
  });

  it("passes on multi-part templates and dotenv-vault's encrypted file", () => {
    const result = envFiles.run(
      makeSnapshot({ ".env.local.example": "X=", ".env.development.sample": "X=", ".env.vault": null }),
    );
    expect(result.status).toBe("pass");
  });

  it("only warns when the env files are in test or fixture folders", () => {
    const result = envFiles.run(makeSnapshot({ "tests/fixtures/.env": null, "src/__fixtures__/.env.test": null }));
    expect(result.status).toBe("warn");
    expect(result.files.map((f) => f.path)).toEqual(["tests/fixtures/.env", "src/__fixtures__/.env.test"]);
  });

  it("still fails when a real env file sits next to test ones", () => {
    const result = envFiles.run(makeSnapshot({ "tests/fixtures/.env": null, ".env.local": null }));
    expect(result.status).toBe("fail");
  });

  it("fails on a committed .env file", () => {
    const result = envFiles.run(makeSnapshot({ ".env": null, "index.ts": "" }));
    expect(result.status).toBe("fail");
    expect(result.files).toEqual([{ path: ".env" }]);
    expect(result.fix).not.toBe("");
  });

  it("lists every env file, including nested ones", () => {
    const result = envFiles.run(
      makeSnapshot({ ".env.local": null, "apps/api/.env.production": null, ".env.example": "" }),
    );
    expect(result.status).toBe("fail");
    expect(result.files.map((f) => f.path)).toEqual([".env.local", "apps/api/.env.production"]);
    expect(result.summary).toContain("2 environment files");
  });

  it("ignores env files inside dependencies", () => {
    expect(envFiles.run(makeSnapshot({ "node_modules/some-pkg/.env": null })).status).toBe("pass");
  });

  it("never includes file contents in the result", () => {
    const secret = "sk_live_51HxYzABCDEFGHIJKLMNOP";
    const result = envFiles.run(makeSnapshot({ ".env": `STRIPE_KEY=${secret}` }));
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe("isEnvFile", () => {
  it.each([".env", ".env.local", ".env.production", ".env.development.local", "config/.env"])("matches %s", (p) =>
    expect(isEnvFile(p)).toBe(true),
  );

  it.each([".env.example", ".env.EXAMPLE", ".env.sample", ".env.template", "env.ts", ".envrc", "lib/env.js", "x.env"])(
    "doesn't match %s",
    (p) => expect(isEnvFile(p)).toBe(false),
  );
});
