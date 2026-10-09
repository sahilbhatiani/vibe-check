import type { RepoMeta, RepoSnapshot } from "@/lib/engine/types";

/**
 * Builds a fake repo from `{ path: content }`. Pass `null` for a file that exists but wasn't
 * downloaded (e.g. a `.env` file, or something over the size limit).
 */
export function makeSnapshot(files: Record<string, string | null>, meta: Partial<RepoMeta> = {}): RepoSnapshot {
  return {
    files: Object.entries(files).map(([path, content]) =>
      content === null ? { path, size: 100 } : { path, size: content.length, content },
    ),
    meta: { repo: "test/repo", defaultBranch: "main", language: "TypeScript", sampled: false, ...meta },
  };
}
