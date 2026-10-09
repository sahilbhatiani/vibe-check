import { describe, expect, it } from "vitest";
import { errorHandling, hasErrorHandling } from "@/lib/engine/checks/error-handling";
import { makeSnapshot } from "../helpers";

const handled = "export async function GET() {\n  try {\n    return Response.json(await load());\n  } catch (e) {\n    return new Response('error', { status: 500 });\n  }\n}";
const unhandled = "export async function GET() {\n  return Response.json(await load());\n}";

/** `n` route files, the first `ok` of which handle errors. */
function routes(n: number, ok: number): Record<string, string> {
  const files: Record<string, string> = {};
  for (let i = 0; i < n; i++) files[`app/api/r${i}/route.ts`] = i < ok ? handled : unhandled;
  return files;
}

describe("error-handling", () => {
  it("passes when most routes handle errors", () => {
    const result = errorHandling.run(makeSnapshot(routes(4, 3)));
    expect(result.status).toBe("pass");
    expect(result.summary).toContain("3 of 4");
    expect(result.fix).toBe("");
  });

  it("passes at exactly 50%", () => {
    expect(errorHandling.run(makeSnapshot(routes(4, 2))).status).toBe("pass");
  });

  it("warns between 20% and 50%, and lists routes without handling", () => {
    const result = errorHandling.run(makeSnapshot(routes(3, 1)));
    expect(result.status).toBe("warn");
    expect(result.files.map((f) => f.path)).toEqual(["app/api/r1/route.ts", "app/api/r2/route.ts"]);
    expect(result.fix).not.toBe("");
  });

  it("warns at exactly 20%", () => {
    expect(errorHandling.run(makeSnapshot(routes(5, 1))).status).toBe("warn");
  });

  it("fails under 20%", () => {
    const result = errorHandling.run(makeSnapshot(routes(6, 1)));
    expect(result.status).toBe("fail");
    expect(result.files).toHaveLength(5);
  });

  it("only counts route files with content", () => {
    const result = errorHandling.run(makeSnapshot({ "app/api/a/route.ts": handled, "app/api/b/route.ts": null }));
    expect(result.status).toBe("pass");
    expect(result.summary).toContain("1 of 1");
  });

  it("ignores non-route files", () => {
    const result = errorHandling.run(makeSnapshot({ "lib/db.ts": unhandled, "pages/api/x.ts": handled }));
    expect(result.status).toBe("pass");
  });

  it("is na without API routes that have content", () => {
    expect(errorHandling.run(makeSnapshot({ "app/page.tsx": unhandled })).status).toBe("na");
    expect(errorHandling.run(makeSnapshot({ "app/api/x/route.ts": null })).status).toBe("na");
  });
});

describe("hasErrorHandling", () => {
  it.each([
    "try { a() } catch (e) {}",
    "try{a()}catch{}",
    "fetch(x).catch(() => null)",
    "try:\n    a()\nexcept Exception:\n    pass",
    "begin\n  a\nrescue => e\nend",
    "if err != nil {\n  return err\n}",
  ])("detects %j", (src) => expect(hasErrorHandling(src)).toBe(true));

  it.each(["return Response.json(data)", "const retry = 1; // catch later", "try { a() } finally { b() }"])(
    "doesn't detect %j",
    (src) => expect(hasErrorHandling(src)).toBe(false),
  );
});
