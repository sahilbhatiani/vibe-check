import type { RepoFile, RepoSnapshot } from "@/lib/engine/types";
import type { RepoRef } from "@/lib/repo-url";
import { isApiRoute, isIgnoredPath, isSourceFile, isTestFile } from "@/lib/engine/util";

export { parseRepoUrl, type RepoRef } from "@/lib/repo-url";

export const MAX_FILES = 250;
export const MAX_FILE_BYTES = 200 * 1024;
const CONCURRENCY = 10;
const API_TIMEOUT_MS = 10_000;
const RAW_TIMEOUT_MS = 8_000;


/** A failure we can explain to the user. `status` is the HTTP status the API route should return. */
export class GitHubError extends Error {
  constructor(
    readonly status: 400 | 404 | 429 | 500,
    message: string,
    /** For rate limits: when GitHub will accept requests again. */
    readonly resetAt?: Date,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

// ---------------------------------------------------------------------------
// File selection

const ROOT_FILES = new Set(["package.json", "tsconfig.json", ".gitignore"]);
// Config files can hold hardcoded keys too. Lockfiles are huge and generated, so they're skipped.
const CONFIG_EXTENSIONS = new Set(["json", "yml", "yaml", "toml", "ini", "cfg", "conf", "properties", "xml"]);
const LOCKFILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "composer.lock"]);

function basename(path: string): string {
  return path.split("/").pop() ?? "";
}

/**
 * Download priority for a file, lower first, or null if we never download it. Essential root
 * files come first, then API routes (several checks read them), then other source, then config,
 * then tests (most checks skip test contents).
 */
export function downloadPriority(path: string, size: number): number | null {
  const name = basename(path).toLowerCase();
  // Never download env files of any kind: their existence is the finding.
  if (name.startsWith(".env")) return null;
  if (isIgnoredPath(path) || size > MAX_FILE_BYTES) return null;

  const atRoot = !path.includes("/");
  if (atRoot && (ROOT_FILES.has(name) || /^readme(\.[a-z0-9]+)?$/.test(name))) return 0;
  if (isSourceFile(path)) {
    if (isTestFile(path)) return 4;
    return isApiRoute(path) ? 1 : 2;
  }
  const dot = name.lastIndexOf(".");
  if (dot > 0 && CONFIG_EXTENSIONS.has(name.slice(dot + 1)) && !LOCKFILES.has(name) && !isTestFile(path)) return 3;
  return null;
}

function depth(path: string): number {
  return path.split("/").length;
}

/** Picks which files to download, capped at `MAX_FILES`. `sampled` is true when some were left out. */
export function selectFiles(files: { path: string; size: number }[]): { paths: string[]; sampled: boolean } {
  const candidates = files
    .map((f) => ({ path: f.path, priority: downloadPriority(f.path, f.size) }))
    .filter((c): c is { path: string; priority: number } => c.priority !== null)
    // Within a priority, shallower files first: they're more likely to be the app's core code.
    .sort((a, b) => a.priority - b.priority || depth(a.path) - depth(b.path) || a.path.localeCompare(b.path));
  return { paths: candidates.slice(0, MAX_FILES).map((c) => c.path), sampled: candidates.length > MAX_FILES };
}

// ---------------------------------------------------------------------------
// Error mapping

/** When a rate-limited response says we can try again, or null if it isn't a rate limit. */
export function rateLimitReset(res: Response, now: Date = new Date()): Date | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter !== null && /^\d+$/.test(retryAfter)) {
    return new Date(now.getTime() + Number(retryAfter) * 1000);
  }
  if (res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    return Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : new Date(now.getTime() + 60_000);
  }
  return null;
}

function formatWait(resetAt: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 60_000));
  const time = resetAt.toISOString().slice(11, 16);
  return minutes === 1 ? `in about a minute (${time} UTC)` : `in about ${minutes} minutes (${time} UTC)`;
}

/** Turns a failed GitHub API response into an error the user can act on. */
export function errorFromResponse(res: Response, now: Date = new Date()): GitHubError {
  const resetAt = rateLimitReset(res, now);
  if (resetAt) {
    return new GitHubError(429, `GitHub's rate limit was reached. Try again ${formatWait(resetAt, now)}.`, resetAt);
  }
  if (res.status === 404) return notFound();
  if (res.status === 401) {
    return new GitHubError(500, "The server's GitHub token was rejected. Please let the site owner know.");
  }
  return new GitHubError(500, `GitHub returned an unexpected error (${res.status}). Please try again in a minute.`);
}

function notFound(): GitHubError {
  return new GitHubError(404, "We couldn't find that repo. Check the URL, and make sure the repo is public.");
}

// ---------------------------------------------------------------------------
// Fetching

interface FetchOptions {
  token?: string;
  fetch?: typeof fetch;
}

interface RepoResponse {
  full_name: string;
  private: boolean;
  default_branch: string;
  language: string | null;
}

interface TreeResponse {
  truncated: boolean;
  tree: { path: string; type: string; size?: number }[];
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Fetches the file tree and the contents of the files the checks need. Throws `GitHubError`. */
export async function fetchSnapshot(ref: RepoRef, options: FetchOptions = {}): Promise<RepoSnapshot> {
  const doFetch = options.fetch ?? fetch;
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "vibe-check",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const api = async (path: string): Promise<Response> => {
    try {
      return await doFetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    } catch {
      throw new GitHubError(500, "We couldn't reach GitHub. Please try again in a minute.");
    }
  };

  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  const repoRes = await api(base);
  if (!repoRes.ok) throw errorFromResponse(repoRes);
  const repo = (await repoRes.json()) as RepoResponse;
  if (repo.private) throw notFound();

  const treeRes = await api(`${base}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`);
  if (treeRes.status === 409 || treeRes.status === 404) {
    // 409 is GitHub's answer for a repo with no commits.
    throw new GitHubError(400, "This repo is empty, so there's nothing to scan.");
  }
  if (!treeRes.ok) throw errorFromResponse(treeRes);
  const tree = (await treeRes.json()) as TreeResponse;

  const blobs = tree.tree
    .filter((e) => e.type === "blob")
    .map((e) => ({ path: e.path, size: e.size ?? 0 }));
  const { paths, sampled } = selectFiles(blobs);

  const rawBase = `https://raw.githubusercontent.com/${encodePath(repo.full_name)}/${encodePath(repo.default_branch)}/`;
  const contents = await mapWithConcurrency(paths, CONCURRENCY, async (path) => {
    try {
      const res = await doFetch(rawBase + encodePath(path), { signal: AbortSignal.timeout(RAW_TIMEOUT_MS) });
      if (!res.ok) return undefined;
      const text = await res.text();
      // Binary files that slipped through (e.g. a .json that isn't) aren't useful to any check.
      return text.includes("\u0000") ? undefined : text;
    } catch {
      // One unreadable file shouldn't fail the scan; the checks just won't see its contents.
      return undefined;
    }
  });
  const downloaded = new Map(paths.map((p, i) => [p, contents[i]]));

  const files: RepoFile[] = blobs.map((b) => {
    const content = downloaded.get(b.path);
    return content === undefined ? b : { ...b, content };
  });

  return {
    files,
    meta: {
      repo: repo.full_name,
      defaultBranch: repo.default_branch,
      language: repo.language,
      sampled: sampled || tree.truncated,
    },
  };
}
