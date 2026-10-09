import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/scan/route";

function post(body: string): Request {
  return new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/scan", () => {
  it.each(["not json", "{}", '{"url": 42}', '{"url": "https://gitlab.com/a/b"}', "null", '"https://github.com/a/b"'])(
    "returns 400 for %s",
    async (body) => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toEqual(expect.any(String));
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("returns a report for a real-looking repo", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/app")) {
        return Response.json({ full_name: "acme/app", private: false, default_branch: "main", language: "TypeScript" });
      }
      if (url.includes("/git/trees/")) {
        return Response.json({ truncated: false, tree: [{ path: "README.md", type: "blob", size: 5 }] });
      }
      return new Response("Hello");
    });
    const res = await POST(post('{"url": "https://github.com/acme/app"}'));
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.repo).toBe("acme/app");
    expect(report.scannedFiles).toBe(1);
    expect(report.checks).toHaveLength(18);
  });

  it("returns 429 with the reset time when GitHub rate-limits us", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } }),
    );
    const res = await POST(post('{"url": "acme/app"}'));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toEqual(expect.any(String));
    const body = await res.json();
    expect(body.resetAt).toBe(new Date(reset * 1000).toISOString());
    expect(body.error).toMatch(/rate limit/);
  });

  it("returns 404 for a missing repo", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    const res = await POST(post('{"url": "acme/missing"}'));
    expect(res.status).toBe(404);
  });
});
