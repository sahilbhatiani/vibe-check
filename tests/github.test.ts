import { describe, expect, it } from "vitest";
import {
  downloadPriority,
  errorFromResponse,
  fetchSnapshot,
  GitHubError,
  MAX_FILE_BYTES,
  MAX_FILES,
  parseRepoUrl,
  rateLimitReset,
  selectFiles,
} from "@/lib/github";

describe("parseRepoUrl", () => {
  const ok = { owner: "vercel", repo: "next-learn" };

  it.each([
    "https://github.com/vercel/next-learn",
    "http://github.com/vercel/next-learn",
    "https://www.github.com/vercel/next-learn",
    "github.com/vercel/next-learn",
    "www.github.com/vercel/next-learn",
    "vercel/next-learn",
    "https://github.com/vercel/next-learn/",
    "https://github.com/vercel/next-learn//",
    "https://github.com/vercel/next-learn.git",
    "https://github.com/vercel/next-learn.git/",
    "https://github.com/vercel/next-learn/tree/main",
    "https://github.com/vercel/next-learn/tree/feature/some-branch",
    "https://github.com/vercel/next-learn/blob/main/README.md",
    "https://github.com/vercel/next-learn?tab=readme-ov-file",
    "https://github.com/vercel/next-learn#readme",
    "  https://github.com/vercel/next-learn  ",
    "HTTPS://GITHUB.COM/vercel/next-learn",
    "git@github.com:vercel/next-learn.git",
  ])("parses %s", (input) => {
    expect(parseRepoUrl(input)).toEqual(ok);
  });

  it("keeps dots, underscores and case in repo names", () => {
    expect(parseRepoUrl("https://github.com/Some-Org/my_repo.js")).toEqual({ owner: "Some-Org", repo: "my_repo.js" });
  });

  it.each([
    "",
    "   ",
    "not a url",
    "vercel",
    "https://github.com",
    "https://github.com/",
    "https://github.com/vercel",
    "https://gitlab.com/vercel/next-learn",
    "https://github.com.evil.com/vercel/next-learn",
    "https://evil.com/github.com/vercel/next-learn",
    "https://user:pass@github.com/vercel/next-learn",
    "https://github.com:8080/vercel/next-learn",
    "ftp://github.com/vercel/next-learn",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://github.com/-bad/repo",
    "https://github.com/bad_owner/repo",
    "https://github.com/vercel/..",
    "https://github.com/vercel/.git",
    "https://github.com/vercel/repo%20name",
    `https://github.com/vercel/${"a".repeat(101)}`,
    `https://github.com/${"a".repeat(40)}/repo`,
    `https://github.com/vercel/next-learn?${"x".repeat(600)}`,
  ])("rejects %s", (input) => {
    expect(parseRepoUrl(input)).toBeNull();
  });
});

describe("downloadPriority", () => {
  it("never downloads env files of any kind", () => {
    for (const path of [".env", ".env.local", ".env.production", ".env.example", "apps/web/.env", ".ENV"]) {
      expect(downloadPriority(path, 10)).toBeNull();
    }
  });

  it("skips dependency and build folders, and minified files", () => {
    for (const path of ["node_modules/x/index.js", "dist/app.js", "build/a.js", ".next/server.js", "vendor/lib.rb", "public/app.min.js"]) {
      expect(downloadPriority(path, 10)).toBeNull();
    }
  });

  it("skips files over 200 KB", () => {
    expect(downloadPriority("src/big.ts", MAX_FILE_BYTES + 1)).toBeNull();
    expect(downloadPriority("src/ok.ts", MAX_FILE_BYTES)).not.toBeNull();
  });

  it("skips images, lockfiles and other files no check reads", () => {
    for (const path of ["logo.png", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "LICENSE", "styles.css"]) {
      expect(downloadPriority(path, 10)).toBeNull();
    }
  });

  it("ranks root config first, then API routes, source, config, tests", () => {
    expect(downloadPriority("package.json", 10)).toBe(0);
    expect(downloadPriority("tsconfig.json", 10)).toBe(0);
    expect(downloadPriority(".gitignore", 10)).toBe(0);
    expect(downloadPriority("README.md", 10)).toBe(0);
    expect(downloadPriority("app/api/users/route.ts", 10)).toBe(1);
    expect(downloadPriority("src/lib/db.ts", 10)).toBe(2);
    expect(downloadPriority("config/settings.yml", 10)).toBe(3);
    expect(downloadPriority("apps/web/package.json", 10)).toBe(3);
    expect(downloadPriority("src/db.test.ts", 10)).toBe(4);
  });
});

describe("selectFiles", () => {
  it("selects candidates in priority order and skips the rest", () => {
    const { paths, sampled } = selectFiles([
      { path: "src/z.test.ts", size: 10 },
      { path: "src/lib/deep.ts", size: 10 },
      { path: "src/a.ts", size: 10 },
      { path: ".env", size: 10 },
      { path: "pages/api/login.ts", size: 10 },
      { path: "package.json", size: 10 },
      { path: "logo.png", size: 10 },
    ]);
    expect(paths).toEqual(["package.json", "pages/api/login.ts", "src/a.ts", "src/lib/deep.ts", "src/z.test.ts"]);
    expect(sampled).toBe(false);
  });

  it(`caps at ${MAX_FILES} files and marks the scan as sampled`, () => {
    const files = Array.from({ length: MAX_FILES + 50 }, (_, i) => ({ path: `src/f${i}.ts`, size: 10 }));
    files.push({ path: "package.json", size: 10 }, { path: "app/api/x/route.ts", size: 10 });
    const { paths, sampled } = selectFiles(files);
    expect(paths).toHaveLength(MAX_FILES);
    expect(sampled).toBe(true);
    // The important files survive the cap.
    expect(paths.slice(0, 2)).toEqual(["package.json", "app/api/x/route.ts"]);
  });

  it("is not sampled at exactly the cap", () => {
    const files = Array.from({ length: MAX_FILES }, (_, i) => ({ path: `src/f${i}.ts`, size: 10 }));
    expect(selectFiles(files).sampled).toBe(false);
  });
});

describe("error mapping", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("maps 404 to a not-found error", () => {
    const err = errorFromResponse(new Response("", { status: 404 }), now);
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/public/);
  });

  it("maps an exhausted primary rate limit to 429 with the reset time", () => {
    const reset = Math.floor(now.getTime() / 1000) + 25 * 60;
    const res = new Response("", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
    });
    const err = errorFromResponse(res, now);
    expect(err.status).toBe(429);
    expect(err.resetAt?.toISOString()).toBe("2026-01-01T12:25:00.000Z");
    expect(err.message).toContain("25 minutes");
    expect(err.message).toContain("12:25 UTC");
  });

  it("maps a secondary rate limit with retry-after to 429", () => {
    const res = new Response("", { status: 429, headers: { "retry-after": "60" } });
    expect(rateLimitReset(res, now)?.toISOString()).toBe("2026-01-01T12:01:00.000Z");
    expect(errorFromResponse(res, now).status).toBe(429);
  });

  it("treats a 403 that isn't a rate limit as a server error", () => {
    const res = new Response("", { status: 403, headers: { "x-ratelimit-remaining": "42" } });
    expect(rateLimitReset(res, now)).toBeNull();
    expect(errorFromResponse(res, now).status).toBe(500);
  });

  it("maps other failures to 500", () => {
    expect(errorFromResponse(new Response("", { status: 502 }), now).status).toBe(500);
    expect(errorFromResponse(new Response("", { status: 401 }), now).status).toBe(500);
  });
});

/** A fake `fetch` serving a tiny repo, recording every URL requested. No network. */
function fakeGitHub(opts: {
  repo?: Partial<{ private: boolean; default_branch: string }>;
  tree?: { path: string; type?: string; size?: number }[];
  truncated?: boolean;
  files?: Record<string, string>;
  repoStatus?: number;
  treeStatus?: number;
  failRaw?: string[];
}) {
  const requested: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    if (url === "https://api.github.com/repos/acme/app") {
      if (opts.repoStatus) return new Response("", { status: opts.repoStatus });
      return Response.json({ full_name: "acme/app", private: false, default_branch: "main", language: "TypeScript", ...opts.repo });
    }
    if (url.startsWith("https://api.github.com/repos/acme/app/git/trees/")) {
      if (opts.treeStatus) return new Response("", { status: opts.treeStatus });
      return Response.json({
        truncated: opts.truncated ?? false,
        tree: (opts.tree ?? []).map((e) => ({ type: "blob", size: 10, ...e })),
      });
    }
    const prefix = "https://raw.githubusercontent.com/acme/app/main/";
    if (url.startsWith(prefix)) {
      const path = decodeURIComponent(url.slice(prefix.length));
      if (opts.failRaw?.includes(path)) throw new TypeError("network down");
      const content = opts.files?.[path];
      return content === undefined ? new Response("", { status: 404 }) : new Response(content);
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
  return { fetchFn, requested };
}

describe("fetchSnapshot", () => {
  const ref = { owner: "acme", repo: "app" };

  it("builds a snapshot with every path and the contents of selected files", async () => {
    const { fetchFn, requested } = fakeGitHub({
      tree: [
        { path: "package.json" },
        { path: "src/index.ts" },
        { path: "src", type: "tree" },
        { path: ".env", size: 30 },
        { path: "logo.png", size: 5000 },
      ],
      files: { "package.json": "{}", "src/index.ts": "export {}", ".env": "SECRET=shh" },
    });
    const snapshot = await fetchSnapshot(ref, { fetch: fetchFn, token: "" });

    expect(snapshot.meta).toEqual({ repo: "acme/app", defaultBranch: "main", language: "TypeScript", sampled: false });
    expect(snapshot.files).toEqual([
      { path: "package.json", size: 10, content: "{}" },
      { path: "src/index.ts", size: 10, content: "export {}" },
      { path: ".env", size: 30 },
      { path: "logo.png", size: 5000 },
    ]);
    expect(requested.some((u) => u.includes(".env"))).toBe(false);
  });

  it("sends the token to the GitHub API when one is set", async () => {
    const seen: (string | null)[] = [];
    const { fetchFn } = fakeGitHub({ tree: [] });
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("https://api.github.com")) seen.push(new Headers(init?.headers).get("authorization"));
      return fetchFn(input, init);
    }) as typeof fetch;
    await fetchSnapshot(ref, { fetch: spy, token: "tok123" });
    expect(seen).toEqual(["Bearer tok123", "Bearer tok123"]);
  });

  it("marks the snapshot as sampled when GitHub truncates the tree", async () => {
    const { fetchFn } = fakeGitHub({ tree: [{ path: "a.ts" }], truncated: true, files: { "a.ts": "" } });
    expect((await fetchSnapshot(ref, { fetch: fetchFn, token: "" })).meta.sampled).toBe(true);
  });

  it("keeps going when a single file can't be downloaded", async () => {
    const { fetchFn } = fakeGitHub({
      tree: [{ path: "a.ts" }, { path: "b.ts" }],
      files: { "a.ts": "ok", "b.ts": "ok" },
      failRaw: ["b.ts"],
    });
    const snapshot = await fetchSnapshot(ref, { fetch: fetchFn, token: "" });
    expect(snapshot.files).toEqual([{ path: "a.ts", size: 10, content: "ok" }, { path: "b.ts", size: 10 }]);
  });

  it("drops binary content", async () => {
    const { fetchFn } = fakeGitHub({ tree: [{ path: "data.json" }], files: { "data.json": "\u0000\u0001" } });
    const snapshot = await fetchSnapshot(ref, { fetch: fetchFn, token: "" });
    expect(snapshot.files[0].content).toBeUndefined();
  });

  it("rejects missing repos with 404", async () => {
    const { fetchFn } = fakeGitHub({ repoStatus: 404 });
    await expect(fetchSnapshot(ref, { fetch: fetchFn, token: "" })).rejects.toMatchObject({ status: 404 });
  });

  it("rejects private repos with 404", async () => {
    const { fetchFn, requested } = fakeGitHub({ repo: { private: true } });
    await expect(fetchSnapshot(ref, { fetch: fetchFn, token: "" })).rejects.toMatchObject({ status: 404 });
    expect(requested).toHaveLength(1);
  });

  it("rejects empty repos with 400", async () => {
    const { fetchFn } = fakeGitHub({ treeStatus: 409 });
    await expect(fetchSnapshot(ref, { fetch: fetchFn, token: "" })).rejects.toMatchObject({ status: 400 });
  });

  it("turns network failures into a GitHubError", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const err = await fetchSnapshot(ref, { fetch: failing, token: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(500);
  });
});
