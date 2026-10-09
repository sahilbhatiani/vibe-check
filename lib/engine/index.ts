import type { Check, CheckResult, Grade, Report, RepoSnapshot, Status } from "./types";

const STATUS_VALUE: Record<Exclude<Status, "na">, number> = { pass: 1, warn: 0.5, fail: 0 };

const GRADES: [min: number, grade: Grade][] = [
  [90, "A"],
  [80, "B"],
  [65, "C"],
  [50, "D"],
];

export function gradeFor(score: number): Grade {
  return GRADES.find(([min]) => score >= min)?.[1] ?? "F";
}

/** Weighted average of applicable checks, 0–100. With nothing applicable there is nothing to mark down. */
export function computeScore(results: Pick<CheckResult, "status" | "weight">[]): number {
  let total = 0;
  let earned = 0;
  for (const r of results) {
    if (r.status === "na") continue;
    total += r.weight;
    earned += r.weight * STATUS_VALUE[r.status];
  }
  return total === 0 ? 100 : Math.round((100 * earned) / total);
}

function runOne(check: Check, snapshot: RepoSnapshot): CheckResult {
  const { id, category, title, weight } = check;
  try {
    return { id, category, title, weight, ...check.run(snapshot) };
  } catch {
    // A bug in one check shouldn't sink the whole report, and shouldn't count against the repo.
    return { id, category, title, weight, status: "na", summary: "This check couldn't run on this repo.", files: [], fix: "" };
  }
}

export function runChecks(snapshot: RepoSnapshot, checks: Check[]): Report {
  const results = checks.map((c) => runOne(c, snapshot));
  const score = computeScore(results);
  const uncapped = gradeFor(score);
  const securityFailed = results.some((r) => r.category === "security" && r.status === "fail");
  const cappedBySecurity = securityFailed && (uncapped === "A" || uncapped === "B");

  return {
    repo: snapshot.meta.repo,
    scannedFiles: snapshot.files.filter((f) => f.content !== undefined).length,
    sampled: snapshot.meta.sampled,
    score,
    grade: cappedBySecurity ? "C" : uncapped,
    cappedBySecurity,
    checks: results,
  };
}
