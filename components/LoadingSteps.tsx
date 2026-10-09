"use client";

import { useEffect, useState } from "react";

// The API doesn't stream progress, so these advance on a timer that roughly matches a typical scan.
const STEPS: [afterMs: number, label: string][] = [
  [0, "Finding the repo on GitHub"],
  [1200, "Reading the list of files"],
  [2600, "Downloading the code"],
  [5500, "Running the checks"],
  [9000, "Adding up the score"],
];

export function LoadingSteps({ repo }: { repo: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timers = STEPS.slice(1).map(([after], i) => setTimeout(() => setCurrent(i + 1), after));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-900/5 sm:p-10 dark:bg-zinc-900 dark:ring-white/10"
    >
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Scanning</p>
      <h2 className="mt-1 break-all text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">{repo}</h2>
      <ol className="mt-8 space-y-4">
        {STEPS.map(([, label], i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={label} className="flex items-center gap-3">
              <span className="grid size-6 place-items-center" aria-hidden>
                {state === "done" && (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-5 text-zinc-900 dark:text-zinc-100">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                  </svg>
                )}
                {state === "active" && (
                  <span className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                )}
                {state === "todo" && <span className="size-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />}
              </span>
              <span
                className={
                  state === "todo"
                    ? "text-zinc-400 dark:text-zinc-600"
                    : state === "active"
                      ? "font-medium text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-600 dark:text-zinc-400"
                }
              >
                {label}
                {state === "active" && <span className="sr-only"> (in progress)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">This usually takes 5 to 15 seconds.</p>
    </section>
  );
}
