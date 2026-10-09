import Anthropic from "@anthropic-ai/sdk";
import type { CheckResult, Report } from "@/lib/engine/types";

const DEFAULT_MODEL = "claude-sonnet-5-5";
const TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are a senior software engineer reviewing an automated production-readiness report for a non-technical founder. You only see the report's findings, not the code.

Write exactly three short paragraphs of plain prose, no headings, no lists, no markdown:
1. The overall verdict: is this app ready for real users, and how worried should they be?
2. The top three risks, in plain language: what could actually go wrong for the business or its users.
3. What to fix first, and why that order.

Be direct and calm. No jargon; if a technical term is unavoidable, explain it in a few words. Don't invent problems that aren't in the findings, and don't repeat the score back unless it helps. Keep the whole thing under 200 words.`;

const STATUS_LABEL: Record<CheckResult["status"], string> = {
  fail: "FAIL",
  warn: "WARNING",
  pass: "PASS",
  na: "NOT APPLICABLE",
};

function describeCheck(c: CheckResult): string {
  const lines = [`- [${STATUS_LABEL[c.status]}] ${c.title} (${c.category}): ${c.summary}`];
  if (c.fix) lines.push(`  Suggested fix: ${c.fix}`);
  if (c.files.length > 0) lines.push(`  Found in ${c.files.length} place${c.files.length === 1 ? "" : "s"}.`);
  return lines.join("\n");
}

/**
 * Builds the user message for the summary. Only the findings go in: check titles, statuses,
 * summaries and fixes. File paths, line numbers and previews are deliberately left out, so no
 * source code or (even masked) secret ever reaches the model.
 */
export function buildSummaryPrompt(report: Report): string {
  const issues = report.checks.filter((c) => c.status === "fail" || c.status === "warn");
  const passed = report.checks.filter((c) => c.status === "pass");
  const header = [
    `Repo: ${report.repo}`,
    `Score: ${report.score}/100, grade ${report.grade}${report.cappedBySecurity ? " (capped at C because a security check failed)" : ""}`,
    report.sampled ? "Note: this is a large repo, so only a sample of files was checked." : "",
  ].filter(Boolean);

  return [
    ...header,
    "",
    issues.length > 0 ? "Problems found:" : "No problems were found.",
    ...issues.map(describeCheck),
    "",
    `Passed: ${passed.length > 0 ? passed.map((c) => c.title).join(", ") : "none"}.`,
  ].join("\n");
}

/**
 * Asks Claude for a plain-English summary of the report. Returns null when there's no API key,
 * or on any failure or timeout, so the report always works without it.
 */
export async function generateSummary(report: Report): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const response = await client.beta.messages.create({
      model,
      max_tokens: 1024,
      output_config: { effort: "low" },
      // On a safety decline, let the API re-run the request on a fallback model. The "default"
      // routing is only valid for the default model, so a custom ANTHROPIC_MODEL runs without it.
      ...(model === DEFAULT_MODEL ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildSummaryPrompt(report) }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.error("Summary failed:", err instanceof Error ? err.message : "unknown error");
    return null;
  }
}
