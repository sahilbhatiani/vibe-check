import { describe, expect, it } from "vitest";
import { findLines, isApiRoute, isSourceFile, isTestFile, lineCount, maskSecret } from "@/lib/engine/util";

describe("isSourceFile", () => {
  it.each(["app/page.tsx", "src/index.js", "lib/a.mjs", "server.cjs", "x.ts", "app.py", "main.go", "app.rb", "App.vue"])(
    "accepts %s",
    (p) => expect(isSourceFile(p)).toBe(true),
  );

  it.each([
    "README.md", "package.json", ".env", "styles.css", "types/global.d.ts", "public/jquery.min.js",
    "node_modules/react/index.js", "dist/bundle.js", ".next/server/app.js", "build/main.js", "vendor/lib.rb",
    ".eslintrc", "Makefile",
  ])("rejects %s", (p) => expect(isSourceFile(p)).toBe(false));
});

describe("isTestFile", () => {
  it.each([
    "src/a.test.ts", "b.spec.tsx", "src/__tests__/a.ts", "tests/engine.ts", "test/x.js", "spec/models/user_spec.rb",
    "test_app.py", "pkg/app_test.py", "pkg/handler_test.go",
  ])("accepts %s", (p) => expect(isTestFile(p)).toBe(true));

  it.each(["src/app.ts", "src/testing-utils.ts", "contest.ts", "latest/index.ts", "node_modules/x/a.test.js"])(
    "rejects %s",
    (p) => expect(isTestFile(p)).toBe(false),
  );
});

describe("isApiRoute", () => {
  it.each([
    "app/api/users/route.ts", "src/app/api/login/route.js", "app/webhook/route.ts",
    "pages/api/hello.ts", "src/pages/api/users/[id].ts",
    "routes/users.js", "server/routes/auth.ts", "api/send.ts",
  ])("accepts %s", (p) => expect(isApiRoute(p)).toBe(true));

  it.each([
    "app/page.tsx", "app/api/users/helpers.ts", "pages/index.tsx", "lib/api/client.ts",
    "routes/users.test.js", "routes/README.md", "node_modules/express/routes/index.js",
  ])("rejects %s", (p) => expect(isApiRoute(p)).toBe(false));
});

describe("findLines", () => {
  const content = "one\nconsole.log(1)\nthree\nconsole.log(2)";

  it("returns 1-based line numbers of matches", () => {
    expect(findLines(content, /console\.log/)).toEqual([2, 4]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(findLines(content, /eval\(/)).toEqual([]);
  });

  it("is not thrown off by a global regex", () => {
    // A shared /g regex keeps lastIndex between .test() calls and would skip matches.
    expect(findLines(content, /console/g)).toEqual([2, 4]);
  });

  it("respects other flags and handles Windows line endings", () => {
    expect(findLines("a\r\nTODO\r\nb", /todo/i)).toEqual([2]);
  });
});

describe("maskSecret", () => {
  it("shows the first 5 characters of a long secret", () => {
    expect(maskSecret("sk-abcdefghijklmnopqrstuvwxyz")).toBe("sk-ab…••••");
  });

  it("never contains the full value", () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const masked = maskSecret(secret);
    expect(masked).not.toContain(secret);
    expect(masked).not.toContain(secret.slice(5));
  });

  it("doesn't reveal the length", () => {
    expect(maskSecret("a".repeat(30))).toHaveLength(maskSecret("a".repeat(300)).length);
  });

  it("reveals less of short values and nothing of very short ones", () => {
    expect(maskSecret("abcdefgh")).toBe("ab…••••");
    expect(maskSecret("abc")).toBe("••••");
    expect(maskSecret("")).toBe("••••");
  });
});

describe("lineCount", () => {
  it.each([
    ["", 0],
    ["a", 1],
    ["a\n", 1],
    ["a\nb", 2],
    ["a\r\nb\r\n", 2],
    ["\n\n", 2],
  ])("counts %j as %i lines", (content, n) => expect(lineCount(content)).toBe(n));
});
