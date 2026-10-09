import { describe, expect, it } from "vitest";
import { computeScore, gradeFor, runChecks } from "@/lib/engine";
import type { Category, Check, Status } from "@/lib/engine/types";
import { makeSnapshot } from "./helpers";

function fakeCheck(id: string, status: Status, weight: number, category: Category = "reliability"): Check {
  return {
    id,
    category,
    title: id,
    weight,
    run: () => ({ status, summary: status, files: [], fix: "" }),
  };
}

const empty = makeSnapshot({});

describe("computeScore", () => {
  it("scores pass as 1, warn as 0.5, fail as 0, weighted", () => {
    expect(computeScore([{ status: "pass", weight: 10 }, { status: "fail", weight: 10 }])).toBe(50);
    expect(computeScore([{ status: "warn", weight: 4 }])).toBe(50);
    expect(computeScore([{ status: "pass", weight: 3 }, { status: "fail", weight: 1 }])).toBe(75);
  });

  it("leaves na checks out of the total", () => {
    expect(computeScore([{ status: "pass", weight: 5 }, { status: "na", weight: 100 }])).toBe(100);
  });

  it("rounds to the nearest whole number", () => {
    // 2/3 = 66.67
    expect(computeScore([{ status: "pass", weight: 2 }, { status: "fail", weight: 1 }])).toBe(67);
  });

  it("gives 100 when nothing applies", () => {
    expect(computeScore([{ status: "na", weight: 5 }])).toBe(100);
    expect(computeScore([])).toBe(100);
  });
});

describe("gradeFor", () => {
  it.each([
    [100, "A"], [90, "A"], [89, "B"], [80, "B"], [79, "C"], [65, "C"],
    [64, "D"], [50, "D"], [49, "F"], [0, "F"],
  ] as const)("%i → %s", (score, grade) => {
    expect(gradeFor(score)).toBe(grade);
  });
});

describe("runChecks", () => {
  it("builds a report with score, grade and full check results", () => {
    const report = runChecks(empty, [fakeCheck("a", "pass", 8), fakeCheck("b", "warn", 2)]);
    expect(report.score).toBe(90);
    expect(report.grade).toBe("A");
    expect(report.cappedBySecurity).toBe(false);
    expect(report.repo).toBe("test/repo");
    expect(report.checks[1]).toMatchObject({ id: "b", category: "reliability", title: "b", weight: 2, status: "warn" });
  });

  it("counts only downloaded files as scanned and passes the sampled flag through", () => {
    const snap = makeSnapshot({ "a.ts": "x", "b.ts": "y", ".env": null }, { sampled: true });
    const report = runChecks(snap, []);
    expect(report.scannedFiles).toBe(2);
    expect(report.sampled).toBe(true);
  });

  it("treats a check that throws as na instead of crashing the report", () => {
    const broken: Check = { ...fakeCheck("broken", "pass", 50), run: () => { throw new Error("bug"); } };
    const report = runChecks(empty, [broken, fakeCheck("ok", "pass", 1)]);
    expect(report.checks[0].status).toBe("na");
    expect(report.score).toBe(100);
  });
});

describe("security cap", () => {
  it("caps an A at C when a security check fails", () => {
    const report = runChecks(empty, [fakeCheck("sec", "fail", 1, "security"), fakeCheck("big", "pass", 99)]);
    expect(report.score).toBe(99);
    expect(report.grade).toBe("C");
    expect(report.cappedBySecurity).toBe(true);
  });

  it("caps a B at C", () => {
    const report = runChecks(empty, [fakeCheck("sec", "fail", 15, "security"), fakeCheck("big", "pass", 85)]);
    expect(report.score).toBe(85);
    expect(report.grade).toBe("C");
  });

  it("doesn't lift a grade that is already below C", () => {
    const report = runChecks(empty, [fakeCheck("sec", "fail", 60, "security"), fakeCheck("ok", "pass", 40)]);
    expect(report.grade).toBe("F");
    expect(report.cappedBySecurity).toBe(false);
  });

  it("doesn't cap for a security warning", () => {
    const report = runChecks(empty, [fakeCheck("sec", "warn", 1, "security"), fakeCheck("big", "pass", 99)]);
    expect(report.grade).toBe("A");
    expect(report.cappedBySecurity).toBe(false);
  });

  it("doesn't cap for a failure in another category", () => {
    const report = runChecks(empty, [fakeCheck("rel", "fail", 1, "reliability"), fakeCheck("big", "pass", 99)]);
    expect(report.grade).toBe("A");
  });
});
