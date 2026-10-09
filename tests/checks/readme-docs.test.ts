import { describe, expect, it } from "vitest";
import { readmeDocs } from "@/lib/engine/checks/readme-docs";
import { makeSnapshot } from "../helpers";

const goodReadme = "# My app\n\n" + "This app does useful things. ".repeat(15);

describe("readme-docs", () => {
  it("passes with a real README and no env usage", () => {
    const result = readmeDocs.run(makeSnapshot({ "README.md": goodReadme, "a.ts": "export const x = 1;" }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it("passes when env vars are documented in an env template", () => {
    const result = readmeDocs.run(
      makeSnapshot({ "README.md": goodReadme, ".env.local.example": null, "a.ts": "const k = process.env.API_KEY;" }),
    );
    expect(result.status).toBe("pass");
  });

  it("fails when the README is missing", () => {
    const result = readmeDocs.run(makeSnapshot({ "a.ts": "1", "docs/README.md": goodReadme }));
    expect(result.status).toBe("fail");
    expect(result.summary).toContain("no README");
    expect(result.fix).not.toBe("");
  });

  it("fails when the README is under 300 characters", () => {
    const result = readmeDocs.run(makeSnapshot({ "readme.md": "# app\n\n" + "x".repeat(250) + "\n\n\n" }));
    expect(result.status).toBe("fail");
    expect(result.files).toEqual([{ path: "readme.md" }]);
  });

  it("treats a README that wasn't downloaded as fine", () => {
    expect(readmeDocs.run(makeSnapshot({ README: null })).status).toBe("pass");
  });

  it("fails when code reads env vars but there's no .env.example", () => {
    const result = readmeDocs.run(
      makeSnapshot({ "README.md": goodReadme, "lib/db.ts": "import x from 'y';\nconst url = process.env.DATABASE_URL;" }),
    );
    expect(result.status).toBe("fail");
    expect(result.summary).toContain(".env.example");
    expect(result.files).toEqual([{ path: "lib/db.ts", line: 2, preview: "DATABASE_URL" }]);
  });

  it.each([
    ["app.py", "import os\nkey = os.environ['KEY']"],
    ["app.py", "key = os.getenv('KEY')"],
    ["main.go", "k := os.Getenv(\"KEY\")"],
    ["app.rb", "k = ENV['KEY']"],
    ["src/main.ts", "const k = import.meta.env.VITE_KEY;"],
  ])("detects env reads in %s", (path, code) => {
    expect(readmeDocs.run(makeSnapshot({ "README.md": goodReadme, [path]: code })).status).toBe("fail");
  });

  it("ignores NODE_ENV and other built-in variables", () => {
    const code = 'if (process.env.NODE_ENV === "production") {}\nif (import.meta.env.DEV) {}';
    expect(readmeDocs.run(makeSnapshot({ "README.md": goodReadme, "a.ts": code })).status).toBe("pass");
  });

  it("ignores env reads in tests", () => {
    const result = readmeDocs.run(makeSnapshot({ "README.md": goodReadme, "a.test.ts": "process.env.API_KEY" }));
    expect(result.status).toBe("pass");
  });

  it("reports both problems at once", () => {
    const result = readmeDocs.run(makeSnapshot({ "a.ts": "process.env.SECRET_KEY" }));
    expect(result.status).toBe("fail");
    expect(result.summary).toContain("no README");
    expect(result.summary).toContain(".env.example");
  });
});
