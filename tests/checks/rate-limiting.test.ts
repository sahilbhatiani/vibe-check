import { describe, expect, it } from "vitest";
import { rateLimiting } from "@/lib/engine/checks/rate-limiting";
import { makeSnapshot } from "../helpers";

const route = { "app/api/chat/route.ts": "export async function POST() { return Response.json({}); }" };

describe("rate-limiting", () => {
  it("passes when package.json has a rate-limit dependency", () => {
    const pkg = JSON.stringify({ dependencies: { "@upstash/ratelimit": "^2" } });
    const result = rateLimiting.run(makeSnapshot({ ...route, "package.json": pkg }));
    expect(result.status).toBe("pass");
    expect(result.fix).toBe("");
  });

  it.each([
    'import rateLimit from "express-rate-limit";',
    "const limiter = new Bottleneck();",
    "from slowapi import Limiter",
    "RATE_LIMIT = 10",
    "@Throttle(5, 60)",
  ])("passes when source references rate limiting: %s", (src) => {
    expect(rateLimiting.run(makeSnapshot({ ...route, "middleware.ts": src })).status).toBe("pass");
  });

  it("warns (never fails) when nothing references rate limiting", () => {
    const result = rateLimiting.run(
      makeSnapshot({ ...route, "package.json": JSON.stringify({ dependencies: { next: "16" } }) }),
    );
    expect(result.status).toBe("warn");
    expect(result.fix).not.toBe("");
  });

  it("ignores mentions in non-code files", () => {
    expect(rateLimiting.run(makeSnapshot({ ...route, "README.md": "TODO: add rate limiting" })).status).toBe("warn");
  });

  it("is na without API routes", () => {
    expect(rateLimiting.run(makeSnapshot({ "app/page.tsx": "export default 1" })).status).toBe("na");
  });
});
