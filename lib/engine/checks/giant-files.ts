import type { Check } from "../types";
import { isSourceFile, isTestFile, lineCount } from "../util";

const WARN_LINES = 600;
const FAIL_LINES = 1000;

/** Machine-written files nobody edits by hand, so their size doesn't matter. */
function isGenerated(path: string): boolean {
  const lower = path.toLowerCase();
  if (/(^|\/)(__generated__|generated)\//.test(lower)) return true;
  const name = lower.split("/").pop() ?? "";
  return /\.(generated|gen|pb)\./.test(name) || /_pb2?\.py$/.test(name);
}

export const giantFiles: Check = {
  id: "giant-files",
  category: "maintainability",
  title: "Giant files",
  weight: 4,
  run(snapshot) {
    const sources = snapshot.files.filter(
      (f) => f.content !== undefined && isSourceFile(f.path) && !isTestFile(f.path) && !isGenerated(f.path),
    );

    if (sources.length === 0) {
      return { status: "na", summary: "No source files to measure.", files: [], fix: "" };
    }

    const big = sources
      .map((f) => ({ path: f.path, lines: lineCount(f.content ?? "") }))
      .filter((f) => f.lines > WARN_LINES)
      .sort((a, b) => b.lines - a.lines);

    if (big.length === 0) {
      return { status: "pass", summary: `No source file is over ${WARN_LINES} lines.`, files: [], fix: "" };
    }

    const huge = big.filter((f) => f.lines > FAIL_LINES).length;
    const status = huge > 0 ? "fail" : "warn";
    const summary =
      huge > 0
        ? `${huge} source file${huge === 1 ? " is" : "s are"} over ${FAIL_LINES.toLocaleString("en-US")} lines` +
          (big.length > huge ? `, and ${big.length - huge} more over ${WARN_LINES}.` : ".")
        : `${big.length} source file${big.length === 1 ? " is" : "s are"} over ${WARN_LINES} lines.`;

    return {
      status,
      summary,
      files: big.map((f) => ({ path: f.path, preview: `${f.lines.toLocaleString("en-US")} lines` })),
      fix:
        "Very long files are hard for people (and AI tools) to understand, so changes in them are more likely to " +
        "break something by accident. Split each listed file into smaller pieces that each do one job, starting " +
        "with the biggest.",
    };
  },
};
