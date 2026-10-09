import type { Check, FileRef, RepoFile } from "../types";
import { isIgnoredPath, isSourceFile, isTestFile, maskSecret } from "../util";

// Config-like text files that sometimes hold keys (service-account JSON, CI YAML, TOML settings).
const CONFIG_EXTENSIONS = new Set(["json", "yml", "yaml", "toml", "ini", "cfg", "conf", "properties", "xml"]);
const LOCKFILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "composer.lock"]);
const MAX_FILES = 20;

/** Files worth scanning: hand-written source and config, never env files (templates hold placeholders). */
export function isScannable(path: string): boolean {
  if (isIgnoredPath(path) || isTestFile(path)) return false;
  const name = (path.split("/").pop() ?? "").toLowerCase();
  if (name.startsWith(".env") || LOCKFILES.has(name)) return false;
  if (isSourceFile(path)) return true;
  const dot = name.lastIndexOf(".");
  return dot > 0 && CONFIG_EXTENSIONS.has(name.slice(dot + 1));
}

const PLACEHOLDER_WORDS = ["xxxx", "your", "example", "placeholder", "...", "dummy", "fake", "sample", "redacted", "insert", "replace", "<", ">"];

/** True for values that are obviously not real keys, like `sk-your-key-here` or `AKIA0000000000000000`. */
export function isPlaceholder(token: string): boolean {
  const lower = token.toLowerCase();
  if (PLACEHOLDER_WORDS.some((w) => lower.includes(w))) return true;
  return /(.)\1{5,}/.test(token); // long runs of one character: "aaaaaa", "000000"
}

function hasMixedChars(token: string): boolean {
  return /[a-z]/.test(token) && /[A-Z]/.test(token) && /[0-9]/.test(token);
}

function decodeBase64Url(part: string): string {
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  } catch {
    return "";
  }
}

interface Pattern {
  label: string;
  regex: RegExp;
  /** Extra sanity check on the matched token, to avoid false alarms. */
  accept?: (token: string, line: string) => boolean;
}

const PATTERNS: Pattern[] = [
  {
    // OpenAI (`sk-…`, `sk-proj-…`) and Anthropic (`sk-ant-…`) keys. Real keys mix case and digits,
    // which rules out CSS class names like `sk-loading-spinner-wrapper`.
    label: "AI provider key",
    regex: /\bsk-[A-Za-z0-9_-]{20,}/g,
    accept: (t) => hasMixedChars(t),
  },
  { label: "Stripe secret key", regex: /\b[sr]k_live_[A-Za-z0-9]{20,}/g },
  { label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { label: "Slack token", regex: /\bxox[bp]-[A-Za-z0-9-]{20,}/g, accept: (t) => /[0-9]{6,}/.test(t) },
  {
    // Only a JWT that is a Supabase service_role key: either its payload says so, or the line names it.
    label: "Supabase service_role key",
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    accept: (t, line) => /service_role/i.test(line) || decodeBase64Url(t.split(".")[1] ?? "").includes("service_role"),
  },
];

// A private key header followed by real key material, on the same line (JSON's `\n`) or the next one.
// A bare header string (e.g. in PEM-parsing code) isn't flagged.
const PRIVATE_KEY_HEADER = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/;
const KEY_MATERIAL = /^(?:\\n|\s|["'`])*[A-Za-z0-9+/]{40,}/;
const PRIVATE_KEY_PREVIEW = "-----BEGIN…••••";

interface Finding extends FileRef {
  label: string;
}

export function findSecrets(file: RepoFile): Finding[] {
  const content = file.content ?? "";
  const lines = content.split(/\r?\n/);
  const findings: Finding[] = [];

  lines.forEach((line, i) => {
    for (const p of PATTERNS) {
      for (const m of line.matchAll(p.regex)) {
        const token = m[0];
        if (isPlaceholder(token)) continue;
        if (p.accept && !p.accept(token, line)) continue;
        findings.push({ path: file.path, line: i + 1, preview: maskSecret(token), label: p.label });
      }
    }
    const header = PRIVATE_KEY_HEADER.exec(line);
    if (header) {
      const rest = line.slice(header.index + header[0].length);
      if (KEY_MATERIAL.test(rest) || KEY_MATERIAL.test(lines[i + 1] ?? "")) {
        findings.push({ path: file.path, line: i + 1, preview: PRIVATE_KEY_PREVIEW, label: "private key" });
      }
    }
  });
  return findings;
}

export const hardcodedSecrets: Check = {
  id: "hardcoded-secrets",
  category: "security",
  title: "Hardcoded secrets",
  weight: 10,
  run(snapshot) {
    const scanned = snapshot.files.filter((f) => f.content !== undefined && isScannable(f.path));
    if (scanned.length === 0) {
      return { status: "na", summary: "No source or config files were available to check for secrets.", files: [], fix: "" };
    }

    const findings = scanned.flatMap(findSecrets);
    if (findings.length === 0) {
      return { status: "pass", summary: "No API keys or passwords were found written into the code.", files: [], fix: "" };
    }

    const fileCount = new Set(findings.map((f) => f.path)).size;
    const kinds = [...new Set(findings.map((f) => f.label))].join(", ");
    return {
      status: "fail",
      summary:
        `Found ${findings.length} likely secret${findings.length === 1 ? "" : "s"} written into the code ` +
        `in ${fileCount} file${fileCount === 1 ? "" : "s"} (${kinds}).`,
      files: findings.slice(0, MAX_FILES).map(({ path, line, preview }) => ({ path, line, preview })),
      fix:
        "These look like real keys or passwords saved directly in the code. Because this repo is public, anyone can " +
        "copy them and use your accounts, which can run up bills or expose your users' data. Treat each one as leaked: " +
        "create a new key with the provider and switch the old one off. Then remove the key from the code and load it " +
        "from an environment variable set in your hosting provider instead. Deleting it from the code isn't enough on " +
        "its own, because it stays in the project's history.",
    };
  },
};
