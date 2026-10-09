import type { Check } from "../types";
import { isApiRoute, isSourceFile } from "../util";

// Covers ratelimit / rate-limit / rate_limit / rateLimit, @upstash/ratelimit, express-rate-limit, limiter,
// throttle(r), slowapi. Broad on purpose: a false "pass" is better than a false alarm.
const RATE_LIMIT = /rate[-_ ]?limit|limiter|throttl|slowapi/i;

// Heuristic check: it can only warn, never fail.
export const rateLimiting: Check = {
  id: "rate-limiting",
  category: "reliability",
  title: "Rate limiting",
  weight: 3,
  run(snapshot) {
    if (!snapshot.files.some((f) => isApiRoute(f.path))) {
      return { status: "na", summary: "No API routes were found, so rate limiting doesn't apply.", files: [], fix: "" };
    }

    const found = snapshot.files.some(
      (f) =>
        f.content !== undefined &&
        (f.path === "package.json" || isSourceFile(f.path)) &&
        RATE_LIMIT.test(f.content),
    );
    if (found) {
      return { status: "pass", summary: "The code mentions rate limiting.", files: [], fix: "" };
    }

    return {
      status: "warn",
      summary: "No sign of rate limiting on the API routes.",
      files: [],
      fix:
        "Nothing seems to stop someone from hitting your server thousands of times a minute. That can rack up big " +
        "bills (especially for AI or email features), let bots guess passwords, or knock the app over. Ask your " +
        "developer to add rate limiting, which caps how many requests one person can make in a short time, at least " +
        "on login, sign-up and anything that costs you money.",
    };
  },
};
