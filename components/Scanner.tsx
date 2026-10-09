"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Report } from "@/lib/engine/types";
import { parseRepoUrl } from "@/lib/repo-url";
import { Landing } from "./Landing";
import { LoadingSteps } from "./LoadingSteps";
import { ReportView } from "./ReportView";
import { ScanForm } from "./ScanForm";

type Outcome = { kind: "report"; report: Report } | { kind: "error"; message: string };

async function scan(repo: string, signal: AbortSignal): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `https://github.com/${repo}` }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    return { kind: "error", message: "We couldn't reach the scanner. Check your connection and try again." };
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok && data && typeof data === "object" && "checks" in data) return { kind: "report", report: data as Report };
  const message =
    data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : "Something went wrong while scanning this repo. Please try again.";
  return { kind: "error", message };
}

/**
 * The URL is the source of truth: `/?repo=owner/name` runs a scan, so every report has a shareable
 * link and the back button works.
 */
export function Scanner() {
  const router = useRouter();
  const param = useSearchParams().get("repo");
  const ref = param ? parseRepoUrl(param) : null;
  const repo = ref ? `${ref.owner}/${ref.repo}` : null;

  // Bumped to re-run a scan of the same repo ("Try again", or submitting the repo already shown).
  const [attempt, setAttempt] = useState(0);
  const key = repo ? `${repo}#${attempt}` : null;
  const [result, setResult] = useState<{ key: string; outcome: Outcome } | null>(null);

  useEffect(() => {
    if (!key || !repo) return;
    const controller = new AbortController();
    scan(repo, controller.signal).then(
      (outcome) => setResult({ key, outcome }),
      () => {}, // Aborted: a newer scan replaced this one.
    );
    return () => controller.abort();
  }, [key, repo]);

  function start(next: string) {
    if (next === repo) setAttempt((n) => n + 1);
    else router.push(`/?repo=${next}`);
  }

  if (param !== null && !repo) {
    return (
      <Landing onScan={start}>
        <p role="alert" className="text-red-700 dark:text-red-400">
          That link doesn&apos;t point to a GitHub repo. Paste one like github.com/owner/repo.
        </p>
      </Landing>
    );
  }
  if (!repo) return <Landing onScan={start} />;

  const outcome = result?.key === key ? result.outcome : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <ScanForm key={repo} initialValue={repo} onScan={start} busy={!outcome} size="compact" />
      {!outcome && <LoadingSteps key={key} repo={repo} />}
      {outcome?.kind === "error" && (
        <section role="alert" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-900/5 sm:p-10 dark:bg-zinc-900 dark:ring-white/10">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Couldn&apos;t scan {repo}</p>
          <p className="mt-2 text-xl font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{outcome.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-6 inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Try again
          </button>
        </section>
      )}
      {outcome?.kind === "report" && <ReportView report={outcome.report} onScanAnother={() => router.push("/")} />}
    </div>
  );
}
