"use client";

import { useState } from "react";
import { computeScore } from "@/lib/engine";
import type { Category, CheckResult, Grade, Report, Status } from "@/lib/engine/types";
import { Finding } from "./Finding";
import { gradeTone, scoreTone, TONE_FILL, TONE_SOFT_BG, TONE_TEXT, type Tone } from "./status";

const VERDICT: Record<Grade, string> = {
  A: "Ready for real users, with only small things to tidy up.",
  B: "In good shape. Fix the flagged items before you grow.",
  C: "Workable, but there are real risks to deal with before launch.",
  D: "Not ready for production yet. Important safeguards are missing.",
  F: "High risk. This needs serious work before real users rely on it.",
};

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "security", label: "Security" },
  { id: "reliability", label: "Reliability" },
  { id: "maintainability", label: "Maintainability" },
];

const STATUS_ORDER: Record<Status, number> = { fail: 0, warn: 1, pass: 2, na: 3 };

function sortChecks(checks: CheckResult[]): CheckResult[] {
  return [...checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.weight - a.weight);
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-white shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10 ${className}`}>
      {children}
    </section>
  );
}

function Hero({ report }: { report: Report }) {
  const tone = gradeTone(report.grade);
  const failed = report.checks.filter((c) => c.status === "fail").length;
  const warned = report.checks.filter((c) => c.status === "warn").length;
  const verdict = report.cappedBySecurity
    ? "A serious security problem is holding this back. Fix that first."
    : VERDICT[report.grade];

  return (
    <Card className="p-6 sm:p-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
        <div
          className={`grid size-32 shrink-0 place-items-center rounded-[2rem] ring-1 sm:size-40 ${TONE_SOFT_BG[tone]}`}
          aria-label={`Grade ${report.grade}`}
          role="img"
        >
          <span className={`text-8xl font-bold leading-none tracking-tighter sm:text-9xl ${TONE_TEXT[tone]}`}>{report.grade}</span>
        </div>
        <div className="min-w-0">
          <a
            href={`https://github.com/${report.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sm font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            github.com/{report.repo}
          </a>
          <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight text-balance text-zinc-900 sm:text-3xl dark:text-zinc-50">
            {verdict}
          </p>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
            <span>
              <span className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{report.score}</span>
              <span>/100</span>
            </span>
            <span>
              {failed} to fix · {warned} to review
            </span>
            <span>{report.scannedFiles.toLocaleString()} files scanned</span>
          </div>
        </div>
      </div>
      {(report.cappedBySecurity || report.sampled) && (
        <div className="mt-6 space-y-2 border-t border-zinc-900/5 pt-5 text-sm leading-relaxed text-zinc-600 dark:border-white/10 dark:text-zinc-400">
          {report.cappedBySecurity && (
            <p>
              The score alone would earn a higher grade, but any failed security check caps the grade at C.
            </p>
          )}
          {report.sampled && (
            <p>This is a large repo, so we checked a sample of its files. Some issues may not show up here.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function SummaryCard({ summary }: { summary: string }) {
  const paragraphs = summary.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <Card className="p-6 sm:p-10">
      <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">In plain English</h2>
      <div className="mt-3 max-w-prose space-y-4 text-[17px] leading-relaxed text-zinc-800 dark:text-zinc-200">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <p className="mt-5 text-xs text-zinc-400 dark:text-zinc-500">Written by AI from the findings below. It never sees your code.</p>
    </Card>
  );
}

function CategoryBars({ checks }: { checks: CheckResult[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {CATEGORIES.map(({ id, label }) => {
        const inCategory = checks.filter((c) => c.category === id);
        const applicable = inCategory.filter((c) => c.status !== "na");
        const score = applicable.length ? computeScore(applicable) : null;
        const tone: Tone = score === null ? "muted" : scoreTone(score);
        const issues = applicable.filter((c) => c.status === "fail" || c.status === "warn").length;
        return (
          <Card key={id} className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{label}</h3>
              <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                {score === null ? "n/a" : `${score}/100`}
              </span>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
              role="meter"
              aria-label={`${label} score`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={score ?? 0}
            >
              <div className={`h-full rounded-full ${TONE_FILL[tone]}`} style={{ width: `${score ?? 0}%` }} />
            </div>
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              {score === null
                ? "Nothing to check here."
                : issues === 0
                  ? `All ${applicable.length} checks passed`
                  : `${issues} of ${applicable.length} checks need attention`}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

function FindingGroup({ title, checks, repo }: { title: string; checks: CheckResult[]; repo: string }) {
  if (checks.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 px-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        {title} <span className="font-normal tabular-nums">({checks.length})</span>
      </h3>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-zinc-900/5 dark:divide-white/5">
          {checks.map((c) => (
            <Finding key={c.id} check={c} repo={repo} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Findings({ report }: { report: Report }) {
  const sorted = sortChecks(report.checks);
  const fails = sorted.filter((c) => c.status === "fail");
  const warns = sorted.filter((c) => c.status === "warn");
  const rest = sorted.filter((c) => c.status === "pass" || c.status === "na");
  const passCount = rest.filter((c) => c.status === "pass").length;

  return (
    <div className="space-y-8">
      <FindingGroup title="Needs fixing" checks={fails} repo={report.repo} />
      <FindingGroup title="Worth a look" checks={warns} repo={report.repo} />
      {rest.length > 0 && (
        <details className="group/passed">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-1 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="size-4 transition-transform group-open/passed:rotate-90">
              <path fillRule="evenodd" d="M7.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L10.94 10 7.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
            {passCount} passed{rest.length > passCount ? `, ${rest.length - passCount} didn't apply` : ""}
          </summary>
          <Card className="mt-3 overflow-hidden">
            <ul className="divide-y divide-zinc-900/5 dark:divide-white/5">
              {rest.map((c) => (
                <Finding key={c.id} check={c} repo={report.repo} />
              ))}
            </ul>
          </Card>
        </details>
      )}
    </div>
  );
}

function CopyLinkButton({ repo }: { repo: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/?repo=${repo}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", link);
    }
  }

  return (
    <button type="button" onClick={copy} className={SECONDARY_BUTTON}>
      <span aria-live="polite">{copied ? "Link copied" : "Copy report link"}</span>
    </button>
  );
}

const SECONDARY_BUTTON =
  "inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-900/10 transition hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-zinc-800";

export function ReportView({ report, onScanAnother }: { report: Report; onScanAnother: () => void }) {
  return (
    <div className="space-y-6 sm:space-y-8">
      {report.summary && <SummaryCard summary={report.summary} />}
      <Hero report={report} />
      <CategoryBars checks={report.checks} />
      <div className="pt-2">
        <h2 className="mb-5 px-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Findings</h2>
        <Findings report={report} />
      </div>
      <div className="flex flex-col gap-3 border-t border-zinc-900/5 pt-6 sm:flex-row dark:border-white/10">
        <button type="button" onClick={onScanAnother} className={SECONDARY_BUTTON}>
          Scan another repo
        </button>
        <CopyLinkButton repo={report.repo} />
      </div>
    </div>
  );
}
