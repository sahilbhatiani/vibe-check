import type { Grade, Status } from "@/lib/engine/types";

/** Red, amber and green are reserved for status. Everything else in the UI is neutral. */
export type Tone = "good" | "ok" | "bad" | "muted";

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  ok: "text-amber-700 dark:text-amber-400",
  bad: "text-red-700 dark:text-red-400",
  muted: "text-zinc-500 dark:text-zinc-400",
};

export const TONE_SOFT_BG: Record<Tone, string> = {
  good: "bg-emerald-50 ring-emerald-600/15 dark:bg-emerald-400/10 dark:ring-emerald-400/20",
  ok: "bg-amber-50 ring-amber-600/15 dark:bg-amber-400/10 dark:ring-amber-400/20",
  bad: "bg-red-50 ring-red-600/15 dark:bg-red-400/10 dark:ring-red-400/20",
  muted: "bg-zinc-100 ring-zinc-900/5 dark:bg-zinc-800 dark:ring-white/10",
};

export const TONE_FILL: Record<Tone, string> = {
  good: "bg-emerald-500",
  ok: "bg-amber-500",
  bad: "bg-red-500",
  muted: "bg-zinc-400 dark:bg-zinc-600",
};

export const STATUS_TONE: Record<Status, Tone> = { pass: "good", warn: "ok", fail: "bad", na: "muted" };

export function gradeTone(grade: Grade): Tone {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "F") return "bad";
  return "ok";
}

export function scoreTone(score: number): Tone {
  if (score >= 80) return "good";
  if (score >= 50) return "ok";
  return "bad";
}

export function StatusIcon({ status, className = "size-5" }: { status: Status; className?: string }) {
  const tone = STATUS_TONE[status];
  const common = {
    className: `${className} shrink-0 ${TONE_TEXT[tone]}`,
    viewBox: "0 0 20 20",
    fill: "currentColor",
    "aria-hidden": true,
  } as const;
  switch (status) {
    case "pass":
      return (
        <svg {...common}>
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.86-9.86a.75.75 0 0 0-1.22-.88l-3.24 4.5-1.6-1.6a.75.75 0 1 0-1.06 1.06l2.22 2.22a.75.75 0 0 0 1.14-.09l3.76-5.21Z" clipRule="evenodd" />
        </svg>
      );
    case "warn":
      return (
        <svg {...common}>
          <path fillRule="evenodd" d="M8.48 2.88a1.75 1.75 0 0 1 3.04 0l6.28 10.97A1.75 1.75 0 0 1 16.28 16.5H3.72a1.75 1.75 0 0 1-1.52-2.65L8.48 2.88ZM10 6.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6.5Zm0 7.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
        </svg>
      );
    case "fail":
      return (
        <svg {...common}>
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM7.53 6.47a.75.75 0 0 0-1.06 1.06L8.94 10l-2.47 2.47a.75.75 0 1 0 1.06 1.06L10 11.06l2.47 2.47a.75.75 0 1 0 1.06-1.06L11.06 10l2.47-2.47a.75.75 0 0 0-1.06-1.06L10 8.94 7.53 6.47Z" clipRule="evenodd" />
        </svg>
      );
    case "na":
      return (
        <svg {...common}>
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM6.75 9.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
        </svg>
      );
  }
}
