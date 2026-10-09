import { describe, expect, it } from "vitest";
import { checks } from "@/lib/engine/checks";
import { runChecks } from "@/lib/engine";
import { makeSnapshot } from "../helpers";

// Weights from the SPEC.md checks table, in order.
const SPEC: [id: string, category: string, weight: number][] = [
  ["env-files", "security", 10],
  ["hardcoded-secrets", "security", 10],
  ["public-secrets", "security", 8],
  ["gitignore-env", "security", 5],
  ["sql-injection", "security", 8],
  ["dangerous-code", "security", 5],
  ["unprotected-routes", "security", 6],
  ["tests-exist", "reliability", 8],
  ["test-script", "reliability", 3],
  ["ci-configured", "reliability", 4],
  ["error-handling", "reliability", 6],
  ["input-validation", "reliability", 5],
  ["rate-limiting", "reliability", 3],
  ["lockfile", "maintainability", 3],
  ["type-safety", "maintainability", 4],
  ["giant-files", "maintainability", 4],
  ["debug-leftovers", "maintainability", 2],
  ["readme-docs", "maintainability", 3],
];

describe("check registry", () => {
  it("registers all 18 checks from the spec with matching category and weight", () => {
    expect(checks.map((c) => [c.id, c.category, c.weight])).toEqual(SPEC);
  });

  it("has unique ids", () => {
    expect(new Set(checks.map((c) => c.id)).size).toBe(checks.length);
  });

  it("runs every check on an empty repo without crashing", () => {
    const report = runChecks(makeSnapshot({}), checks);
    expect(report.checks).toHaveLength(18);
    expect(report.checks.every((r) => r.summary.length > 0)).toBe(true);
  });

  it("never leaks a secret value anywhere in a full report", () => {
    const stripe = ["sk", "live", "51HxYzQ8aBcDeFgHiJkLmNoPqRsTuV"].join("_");
    const openai = "sk-" + "proj" + "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z";
    const report = runChecks(
      makeSnapshot({
        "lib/pay.ts": `const stripe = new Stripe("${stripe}");\nconst ai = "${openai}";`,
        ".env": null,
      }),
      checks,
    );
    const json = JSON.stringify(report);
    expect(report.checks.find((c) => c.id === "hardcoded-secrets")?.status).toBe("fail");
    expect(json).not.toContain(stripe);
    expect(json).not.toContain(openai);
  });

  it("scores a messy repo low and caps it on a security failure", () => {
    const report = runChecks(
      makeSnapshot({
        ".env": null,
        "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
        "app/api/users/route.ts": "export async function POST(req) { const b = await req.json(); await db.insert(b); }",
      }),
      checks,
    );
    expect(["D", "F"]).toContain(report.grade);
  });
});
