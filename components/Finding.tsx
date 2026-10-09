import type { CheckResult } from "@/lib/engine/types";
import { StatusIcon } from "./status";

const CATEGORY_LABEL: Record<CheckResult["category"], string> = {
  security: "Security",
  reliability: "Reliability",
  maintainability: "Maintainability",
};

const MAX_FILES_SHOWN = 20;

function fileUrl(repo: string, path: string, line?: number): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repo}/blob/HEAD/${encoded}${line ? `#L${line}` : ""}`;
}

function Heading({ check }: { check: CheckResult }) {
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      <StatusIcon status={check.status} className="mt-0.5 size-5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-50">{check.title}</h4>
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {CATEGORY_LABEL[check.category]}
          </span>
        </div>
        <p className="mt-1 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">{check.summary}</p>
      </div>
    </div>
  );
}

export function Finding({ check, repo }: { check: CheckResult; repo: string }) {
  const expandable = check.fix !== "" || check.files.length > 0;
  if (!expandable) {
    return (
      <li className="px-5 py-4 sm:px-6">
        <Heading check={check} />
      </li>
    );
  }

  const shown = check.files.slice(0, MAX_FILES_SHOWN);
  const hidden = check.files.length - shown.length;

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 transition hover:bg-zinc-50 sm:px-6 dark:hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
          <Heading check={check} />
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
          >
            <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </summary>
        <div className="space-y-5 px-5 pb-6 pl-13 sm:px-6 sm:pl-14">
          {check.fix && (
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">What to do</h5>
              <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">{check.fix}</p>
            </div>
          )}
          {shown.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {check.files.length === 1 ? "Where" : `Where (${check.files.length})`}
              </h5>
              <ul className="mt-2 divide-y divide-zinc-900/5 overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-900/5 dark:divide-white/5 dark:bg-zinc-950 dark:ring-white/10">
                {shown.map((f, i) => (
                  <li key={`${f.path}:${f.line ?? ""}:${i}`} className="px-3 py-2 font-mono text-[13px]">
                    <a
                      href={fileUrl(repo, f.path, f.line)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-zinc-800 underline-offset-2 hover:underline dark:text-zinc-200"
                    >
                      {f.path}
                      {f.line !== undefined && <span className="text-zinc-500">:{f.line}</span>}
                    </a>
                    {f.preview && <div className="mt-0.5 break-all text-zinc-500 dark:text-zinc-400">{f.preview}</div>}
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  And {hidden} more {hidden === 1 ? "place" : "places"}.
                </p>
              )}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
