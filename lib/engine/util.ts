const SOURCE_EXTENSIONS = new Set([
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts",
  "vue", "svelte", "astro",
  "py", "rb", "go",
]);

const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".next", "vendor", "coverage", "out"]);

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function basename(path: string): string {
  const parts = segments(path);
  return parts[parts.length - 1] ?? "";
}

/** True if the path is inside a dependency or build-output folder. */
export function isIgnoredPath(path: string): boolean {
  return segments(path).some((s) => IGNORED_DIRS.has(s));
}

/** Hand-written code we can meaningfully check. Excludes type declarations, minified files and build output. */
export function isSourceFile(path: string): boolean {
  if (isIgnoredPath(path)) return false;
  const name = basename(path).toLowerCase();
  if (name.endsWith(".d.ts") || name.endsWith(".min.js")) return false;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return SOURCE_EXTENSIONS.has(name.slice(dot + 1));
}

const TEST_DIRS = new Set(["__tests__", "tests", "test", "spec"]);

export function isTestFile(path: string): boolean {
  if (isIgnoredPath(path)) return false;
  const parts = segments(path);
  const name = (parts[parts.length - 1] ?? "").toLowerCase();
  if (/\.(test|spec)\.[a-z0-9]+$/.test(name)) return true;
  if (/^test_.*\.py$/.test(name) || /_test\.py$/.test(name)) return true;
  if (/_test\.go$/.test(name)) return true;
  if (/_spec\.rb$/.test(name)) return true;
  return parts.slice(0, -1).some((s) => TEST_DIRS.has(s.toLowerCase()));
}

/**
 * Files that handle HTTP requests on the server:
 * - Next.js App Router: `app/**\/route.ts` (optionally under `src/`)
 * - Next.js Pages Router: `pages/api/**` (optionally under `src/`)
 * - Express-style: anything in a `routes/` folder, or a top-level `api/` folder (Vercel functions)
 */
export function isApiRoute(path: string): boolean {
  if (!isSourceFile(path) || isTestFile(path)) return false;
  const parts = segments(path);
  const name = parts[parts.length - 1];
  const dirs = parts.slice(0, -1);
  const root = dirs[0] === "src" ? dirs.slice(1) : dirs;

  if (root[0] === "app" && /^route\.[a-z]+$/.test(name)) return true;
  if (root[0] === "pages" && root[1] === "api") return true;
  if (root[0] === "api") return true;
  return dirs.includes("routes");
}

/** 1-based line numbers where `regex` matches. Flags other than `g`/`y` are respected. */
export function findLines(content: string, regex: RegExp): number[] {
  const re = new RegExp(regex.source, regex.flags.replace(/[gy]/g, ""));
  const lines = content.split(/\r?\n/);
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (re.test(line)) hits.push(i + 1);
  });
  return hits;
}

/** Number of lines in a file, not counting a trailing newline. */
export function lineCount(content: string): number {
  if (content === "") return 0;
  const lines = content.split(/\r?\n/);
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

/**
 * Masks a secret for display: at most the first 5 characters (fewer for short values), then a
 * fixed-length mask so the real length isn't revealed. `maskSecret("sk-abc123…")` → `"sk-ab…••••"`.
 */
export function maskSecret(value: string): string {
  const visible = Math.min(5, Math.floor(value.length / 4));
  return visible > 0 ? `${value.slice(0, visible)}…••••` : "••••";
}
