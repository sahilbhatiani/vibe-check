import type { Check } from "../types";
import { isApiRoute } from "../util";

/** Loose signs that a file handles errors somewhere. Generous on purpose: we'd rather miss a problem than invent one. */
export function hasErrorHandling(content: string): boolean {
  if (/\btry\s*\{/.test(content) && /\bcatch\b/.test(content)) return true; // JS/TS
  if (/\.catch\s*\(/.test(content)) return true; // promises
  if (/\btry\s*:/.test(content) && /\bexcept\b/.test(content)) return true; // Python
  if (/\brescue\b/.test(content)) return true; // Ruby
  if (/\berr\s*!=\s*nil\b/.test(content)) return true; // Go
  return false;
}

export const errorHandling: Check = {
  id: "error-handling",
  category: "reliability",
  title: "Error handling in API routes",
  weight: 6,
  run(snapshot) {
    const routes = snapshot.files.filter((f) => f.content !== undefined && isApiRoute(f.path));
    if (routes.length === 0) {
      return { status: "na", summary: "No API routes were found to check.", files: [], fix: "" };
    }

    const missing = routes.filter((f) => !hasErrorHandling(f.content ?? ""));
    const handled = routes.length - missing.length;
    const ratio = handled / routes.length;
    const summary = `${handled} of ${routes.length} API route file${routes.length === 1 ? "" : "s"} handle errors.`;

    if (ratio >= 0.5) {
      return { status: "pass", summary, files: [], fix: "" };
    }

    return {
      status: ratio >= 0.2 ? "warn" : "fail",
      summary,
      files: missing.map((f) => ({ path: f.path })),
      fix:
        "When something goes wrong in these parts of your server (a database hiccup, a bad request, a service being " +
        "down), there's nothing to catch the problem, so users may see a crash or a confusing blank error and you may " +
        "never find out why. Ask your developer to wrap the work in each of these files in error handling that logs " +
        "the problem and sends back a clear, friendly error message.",
    };
  },
};
