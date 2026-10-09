"use client";

import { useState, type FormEvent } from "react";
import { parseRepoUrl } from "@/lib/repo-url";

interface Props {
  initialValue?: string;
  /** Called with "owner/name" once the input parses as a GitHub repo. */
  onScan?: (repo: string) => void;
  busy?: boolean;
  size?: "large" | "compact";
}

export function ScanForm({ initialValue = "", onScan, busy = false, size = "large" }: Props) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const large = size === "large";

  function submit(e: FormEvent) {
    e.preventDefault();
    const ref = parseRepoUrl(value);
    if (!ref) {
      setError("Paste a public GitHub repo link, like github.com/owner/repo.");
      return;
    }
    setError(null);
    onScan?.(`${ref.owner}/${ref.repo}`);
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <div
        className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0 sm:rounded-2xl sm:bg-white sm:p-1.5 sm:shadow-sm sm:ring-1 sm:ring-zinc-900/10 sm:focus-within:ring-2 sm:focus-within:ring-zinc-900 dark:sm:bg-zinc-900 dark:sm:ring-white/10 dark:sm:focus-within:ring-zinc-100`}
      >
        <label htmlFor="repo-url" className="sr-only">
          GitHub repo link
        </label>
        <input
          id="repo-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="github.com/owner/repo"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "repo-url-error" : undefined}
          className={`w-full min-w-0 rounded-xl sm:flex-1 bg-white px-4 text-zinc-900 shadow-sm ring-1 ring-zinc-900/10 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900 sm:bg-transparent sm:shadow-none sm:ring-0 sm:focus:ring-0 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10 dark:placeholder:text-zinc-500 dark:focus:ring-zinc-100 sm:dark:bg-transparent ${large ? "h-14 text-lg" : "h-11 text-base"}`}
        />
        <button
          type="submit"
          disabled={busy}
          className={`shrink-0 rounded-xl bg-zinc-900 px-6 font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:focus-visible:outline-zinc-100 ${large ? "h-14 text-base sm:h-12" : "h-11 text-sm sm:h-9"}`}
        >
          {busy ? "Scanning…" : "Check my repo"}
        </button>
      </div>
      {error && (
        <p id="repo-url-error" role="alert" className="mt-2 px-1 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
