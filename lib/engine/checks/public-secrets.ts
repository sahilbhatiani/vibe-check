import type { Check, FileRef } from "../types";
import { isIgnoredPath, isSourceFile, isTestFile } from "../util";

// Variables with these prefixes are bundled into the JavaScript sent to every visitor's browser.
// (`PUBLIC_` alone, used by SvelteKit/Astro, is left out: too common as a plain name elsewhere.)
const PUBLIC_VAR = /\b(?:NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)[A-Z0-9_]+\b/g;

// Words that mean "this must stay on the server" no matter which provider it's for.
const ALWAYS_SECRET = ["SECRET", "PRIVATE", "SERVICE_ROLE"];

// Providers whose keys are server-only: anyone holding one can spend your money or read your data.
// Providers with browser-safe keys (Supabase anon, Stripe publishable, Firebase, Clerk publishable,
// PostHog, Google Maps…) are deliberately absent.
const SERVER_ONLY_PROVIDERS = new Set([
  "OPENAI", "ANTHROPIC", "CLAUDE", "GROQ", "REPLICATE", "GEMINI", "MISTRAL", "COHERE", "DEEPSEEK",
  "PERPLEXITY", "ELEVENLABS", "HUGGINGFACE", "PINECONE", "SENDGRID", "RESEND", "MAILGUN", "POSTMARK",
  "TWILIO", "AWS", "DATABASE", "DB",
]);

const MAX_FILES = 20;

/** True if a browser-visible variable name looks like it holds a server-only secret. */
export function isExposedSecretName(name: string): boolean {
  const rest = name.replace(/^(?:NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)/, "");
  if (ALWAYS_SECRET.some((w) => rest.includes(w))) return true;
  const parts = rest.split("_");
  const hasKey = parts.some((p) => p === "KEY" || p === "APIKEY" || p === "KEYS");
  return hasKey && parts.some((p) => SERVER_ONLY_PROVIDERS.has(p));
}

function isScannable(path: string): boolean {
  if (isIgnoredPath(path) || isTestFile(path)) return false;
  const name = path.split("/").pop() ?? "";
  // Env templates like `.env.example` hold variable names only; real `.env` files are never downloaded.
  return isSourceFile(path) || name.startsWith(".env");
}

export const publicSecrets: Check = {
  id: "public-secrets",
  category: "security",
  title: "Secrets exposed to the browser",
  weight: 8,
  run(snapshot) {
    const scanned = snapshot.files.filter((f) => f.content !== undefined && isScannable(f.path));
    if (scanned.length === 0) {
      return { status: "na", summary: "No source files were available to check.", files: [], fix: "" };
    }

    // One entry per variable per file (its first use), so the list stays readable.
    const found: FileRef[] = [];
    const names = new Set<string>();
    for (const file of scanned) {
      const seen = new Set<string>();
      (file.content ?? "").split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(PUBLIC_VAR)) {
          const name = m[0];
          if (seen.has(name) || !isExposedSecretName(name)) continue;
          seen.add(name);
          names.add(name);
          // Variable names aren't secrets, so the name itself is a safe preview.
          found.push({ path: file.path, line: i + 1, preview: name });
        }
      });
    }

    if (found.length === 0) {
      return { status: "pass", summary: "No secret keys are set up to be sent to the browser.", files: [], fix: "" };
    }

    const list = [...names];
    const shown = list.slice(0, 3).join(", ") + (list.length > 3 ? ", …" : "");
    return {
      status: "fail",
      summary: `${list.length} secret-looking variable${list.length === 1 ? " is" : "s are"} exposed to the browser (${shown}).`,
      files: found.slice(0, MAX_FILES),
      fix:
        "Variables starting with NEXT_PUBLIC_, VITE_, REACT_APP_ or EXPO_PUBLIC_ are copied into the website itself, " +
        "so any visitor can read them. These names suggest secret keys, which would let anyone use your paid " +
        "accounts or reach your database. Treat these keys as leaked and create new ones with each provider. Then " +
        "rename the variables without the public prefix and only use them in server code (API routes or server " +
        "actions), with the browser calling your server instead of the provider directly.",
    };
  },
};
