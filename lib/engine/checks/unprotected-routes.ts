import type { Check, FileRef } from "../types";
import { isApiRoute, isSourceFile, isTestFile } from "../util";

const MAX_FILES = 20;

// Signs that a route changes data.
const WRITE_SIGNALS: RegExp[] = [
  /export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b/, // Next.js App Router
  /export\s+const\s+(?:POST|PUT|PATCH|DELETE)\s*=/,
  /\.method\s*===?\s*["'](?:POST|PUT|PATCH|DELETE)["']/, // Pages Router / Vercel functions
  /case\s+["'](?:POST|PUT|PATCH|DELETE)["']\s*:/,
  /\b(?:router|app|api|server)\.(?:post|put|patch|delete)\s*\(/, // Express-style
  /\.(?:insert|update|upsert|delete|create|createMany|updateMany|deleteMany)\s*\(/, // database writes
];

// Anything that suggests the route checks who's calling. Deliberately broad (prefer false negatives):
// webhook signature checks and shared secrets count too.
const AUTH_REFERENCE =
  /session|auth|getuser|currentuser|clerk|token|middleware|jwt|passport|bearer|api[-_]?key|secret|signature|webhook|permission|protect/i;

// A Next.js middleware (or Next 16 `proxy`) file that references auth protects every route behind it.
const MIDDLEWARE_FILE = /^(?:src\/)?(?:middleware|proxy)\.(?:ts|js|mjs)$/;
// Express-style global auth: `app.use(requireAuth)`, `router.use(passport.authenticate(...))`.
const GLOBAL_AUTH_USE = /\.use\s*\([^)]*(?:auth|session|jwt|passport|clerk|protect)/i;

function firstWriteLine(content: string): number | null {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (WRITE_SIGNALS.some((re) => re.test(lines[i]))) return i + 1;
  }
  return null;
}

/** True if a middleware file or a global `app.use(auth…)` covers every route. */
export function hasGlobalAuth(files: { path: string; content?: string }[]): boolean {
  return files.some((f) => {
    if (MIDDLEWARE_FILE.test(f.path)) {
      // Not downloaded: we can't tell, so assume it protects routes rather than raise a false alarm.
      return f.content === undefined || AUTH_REFERENCE.test(f.content);
    }
    return f.content !== undefined && isSourceFile(f.path) && !isTestFile(f.path) && GLOBAL_AUTH_USE.test(f.content);
  });
}

// Heuristic: can only warn, never fail (CLAUDE.md).
export const unprotectedRoutes: Check = {
  id: "unprotected-routes",
  category: "security",
  title: "Unprotected API routes (heuristic)",
  weight: 6,
  run(snapshot) {
    const routes = snapshot.files.filter((f) => f.content !== undefined && isApiRoute(f.path));
    if (routes.length === 0) {
      return { status: "na", summary: "No API routes were found.", files: [], fix: "" };
    }
    if (hasGlobalAuth(snapshot.files)) {
      return { status: "pass", summary: "API routes are covered by a shared login check.", files: [], fix: "" };
    }

    const found: FileRef[] = [];
    for (const f of routes) {
      const content = f.content ?? "";
      if (AUTH_REFERENCE.test(content)) continue;
      const line = firstWriteLine(content);
      if (line !== null) found.push({ path: f.path, line });
    }

    if (found.length === 0) {
      return { status: "pass", summary: "Every API route that changes data appears to check who's calling.", files: [], fix: "" };
    }

    return {
      status: "warn",
      summary: `${found.length} API route${found.length === 1 ? "" : "s"} that change${found.length === 1 ? "s" : ""} data show${found.length === 1 ? "s" : ""} no sign of a login check.`,
      files: found.slice(0, MAX_FILES),
      fix:
        "These server endpoints create, change or delete data, but we couldn't find any check of who is making the " +
        "request. If that's true, anyone on the internet could call them directly, for example to edit or wipe other " +
        "people's data. This is an automated guess, so ask your developer to confirm each one requires a signed-in " +
        "user (or a secret, for webhooks) and add that check where it's missing.",
    };
  },
};
