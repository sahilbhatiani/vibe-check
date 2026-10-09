import { describe, expect, it } from "vitest";
import { gitignoreEnv, ignoredNames } from "@/lib/engine/checks/gitignore-env";
import { makeSnapshot } from "../helpers";

const run = (gitignore: string | null) => gitignoreEnv.run(makeSnapshot({ ".gitignore": gitignore, "index.ts": "" }));

describe("gitignore-env", () => {
  it.each([".env*", "node_modules\n.env\n.env.*", "/.env*\n!.env.example", ".env\n.env*.local", "**/.env*", "*.env\n.env.local"])(
    "passes with %j",
    (g) => {
      const result = run(g);
      expect(result.status).toBe("pass");
      expect(result.files).toEqual([]);
      expect(result.fix).toBe("");
    },
  );

  it("fails when there is no .gitignore", () => {
    const result = gitignoreEnv.run(makeSnapshot({ "index.ts": "", "apps/web/.gitignore": ".env*" }));
    expect(result.status).toBe("fail");
    expect(result.fix).not.toBe("");
  });

  it("fails when env files aren't ignored", () => {
    const result = run("node_modules\n.next\n# .env\n.envrc\nconfig/.env\n.env/");
    expect(result.status).toBe("fail");
    expect(result.files).toEqual([{ path: ".gitignore" }]);
  });

  it("warns when only some env files are covered", () => {
    expect(run(".env.local").status).toBe("warn");
    const result = run("node_modules\n.env*.local");
    expect(result.status).toBe("warn");
    expect(result.summary).toContain("`.env`");
    expect(run(".env").status).toBe("warn");
  });

  it("respects a later negation", () => {
    expect(run(".env*\n!.env").status).toBe("warn");
  });

  it("is na when .gitignore wasn't downloaded", () => {
    expect(run(null).status).toBe("na");
  });
});

describe("ignoredNames", () => {
  it("handles wildcards, comments and negations", () => {
    expect([...ignoredNames("# comment\n.env*\n!.env.example", [".env", ".env.local", ".env.example"])]).toEqual([
      ".env",
      ".env.local",
    ]);
  });
});
