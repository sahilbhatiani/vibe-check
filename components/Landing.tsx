import Link from "next/link";
import type { ReactNode } from "react";
import { ScanForm } from "./ScanForm";

const EXAMPLES = ["vercel/next-learn", "shadcn-ui/taxonomy", "t3-oss/create-t3-app"];

const POINTS: [title: string, body: string][] = [
  ["Security", "Leaked keys, exposed secrets, open endpoints and injection risks."],
  ["Reliability", "Tests, CI, error handling, input checks and rate limits."],
  ["Maintainability", "Lockfiles, type safety, giant files and leftover debug code."],
];

/** The empty state. Also rendered as the Suspense fallback, so it must not read the URL. */
export function Landing({ onScan, children }: { onScan?: (repo: string) => void; children?: ReactNode }) {
  return (
    <div className="pt-6 sm:pt-16">
      <h1 className="max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight text-balance text-zinc-900 sm:text-6xl dark:text-zinc-50">
        Is your app ready for real users?
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        Paste a public GitHub repo. In about ten seconds you&apos;ll get a grade and a plain-English list of what could
        break in production, and how to fix it.
      </p>
      <div className="mt-10 max-w-2xl">
        <ScanForm onScan={onScan} />
        {children && <div className="mt-3 px-1 text-sm">{children}</div>}
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-1 text-sm text-zinc-500 dark:text-zinc-400">
          <span>Try</span>
          {EXAMPLES.map((repo) => (
            <Link
              key={repo}
              href={`/?repo=${repo}`}
              className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900 dark:text-zinc-300 dark:decoration-zinc-700 dark:hover:decoration-zinc-100"
            >
              {repo}
            </Link>
          ))}
        </p>
      </div>
      <dl className="mt-20 grid gap-8 border-t border-zinc-900/10 pt-10 sm:grid-cols-3 dark:border-white/10">
        {POINTS.map(([title, body]) => (
          <div key={title}>
            <dt className="font-semibold text-zinc-900 dark:text-zinc-50">{title}</dt>
            <dd className="mt-1.5 leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
