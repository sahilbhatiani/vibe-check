import { afterEach, describe, expect, it, vi } from "vitest";
import { runChecks } from "@/lib/engine";
import { checks } from "@/lib/engine/checks";
import { buildSummaryPrompt, generateSummary } from "@/lib/summary";
import { makeSnapshot } from "./helpers";

// Split so GitHub push protection doesn't flag this fake key.
const SECRET = "sk_" + "live_" + "51HxQz8KfakeFAKEfake9876543210abcdef";
const SOURCE_MARKER = "veryDistinctiveFunctionName_q7z";

const messySnapshot = makeSnapshot({
  ".env": null,
  "package.json": JSON.stringify({ name: "app", dependencies: { next: "15.0.0" } }),
  "lib/pay.ts": `const stripe = "${SECRET}";\nexport function ${SOURCE_MARKER}() { return eval(input); }\n`,
  "app/api/users/route.ts": `export async function POST(req) { const b = await req.json(); console.log(b); return db.query("SELECT * FROM users WHERE id = " + b.id); }\n`,
});
const messyReport = runChecks(messySnapshot, checks);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buildSummaryPrompt", () => {
  it("includes the findings", () => {
    const prompt = buildSummaryPrompt(messyReport);
    expect(prompt).toContain(`grade ${messyReport.grade}`);
    const failed = messyReport.checks.find((c) => c.status === "fail");
    expect(failed).toBeDefined();
    expect(prompt).toContain(failed!.title);
    expect(prompt).toContain(failed!.summary);
  });

  it("never includes file contents, secrets, previews or paths", () => {
    const prompt = buildSummaryPrompt(messyReport);
    for (const file of messySnapshot.files) {
      if (!file.content) continue;
      for (const line of file.content.split("\n").filter((l) => l.trim().length > 10)) {
        expect(prompt).not.toContain(line);
      }
      // Check text may name generic files like "package.json"; repo-specific paths must not appear.
      if (file.path.includes("/")) expect(prompt).not.toContain(file.path);
    }
    expect(prompt).not.toContain(SECRET);
    expect(prompt).not.toContain(SECRET.slice(0, 12));
    expect(prompt).not.toContain(SOURCE_MARKER);
    for (const ref of messyReport.checks.flatMap((c) => c.files)) {
      if (ref.preview) expect(prompt).not.toContain(ref.preview);
    }
  });
});

describe("generateSummary", () => {
  it("returns null without calling the network when there is no API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await generateSummary(messyReport)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when the API call fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }), { status: 500 }));
    expect(await generateSummary(messyReport)).toBeNull();
  });
});
