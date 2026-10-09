import Link from "next/link";
import { Suspense } from "react";
import { Landing } from "@/components/Landing";
import { Scanner } from "@/components/Scanner";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 sm:px-8">
      <header className="flex h-16 items-center sm:h-20">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          <span className="grid size-7 place-items-center rounded-lg bg-zinc-900 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
            V
          </span>
          Vibe Check
        </Link>
      </header>
      <main className="flex-1 pb-20">
        <Suspense fallback={<Landing />}>
          <Scanner />
        </Suspense>
      </main>
      <footer className="border-t border-zinc-900/5 py-6 text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
        Automated checks, not a full audit. Public repos only. We never show or store secret values.
      </footer>
    </div>
  );
}
