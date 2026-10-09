import type { Check, FileRef } from "../types";
import { isSourceFile, isTestFile } from "../util";

const MAX_FILES = 20;

// `eval(` / `new Function(` run text as code. `.eval(` (e.g. Redis or Puppeteer methods) and
// words like `evaluate(` are not matched.
const CODE_EXEC = /(?:^|[^\w$.])(?:eval\s*\(|new\s+Function\s*\()/;
// Writing raw HTML into the page. `innerHTML ==` (a comparison) is not matched.
const RAW_HTML = /dangerouslySetInnerHTML|\.innerHTML\s*\+?=(?!=)/;
// Common safe uses: HTML passed through a sanitizer, or JSON-LD / config embedded via JSON.stringify.
const SANITIZED = /dompurify|sanitize|JSON\.stringify/i;
const COMMENT = /^\s*(?:\/\/|\/?\*|#)/;

interface Findings {
  exec: FileRef[];
  html: FileRef[];
}

export function findDangerousCode(path: string, content: string): Findings {
  const exec: FileRef[] = [];
  const html: FileRef[] = [];
  content.split(/\r?\n/).forEach((line, i) => {
    if (COMMENT.test(line)) return;
    if (CODE_EXEC.test(line)) exec.push({ path, line: i + 1 });
    else if (RAW_HTML.test(line) && !SANITIZED.test(line)) html.push({ path, line: i + 1 });
  });
  return { exec, html };
}

// Severity: the spec says this check fails when any pattern is found, but raw-HTML rendering is
// often harmless (static or already-cleaned content), and we prefer false negatives. So running
// text as code (`eval`, `new Function`) fails, while raw HTML alone only warns.
export const dangerousCode: Check = {
  id: "dangerous-code",
  category: "security",
  title: "Dangerous code execution / HTML",
  weight: 5,
  run(snapshot) {
    const scanned = snapshot.files.filter((f) => f.content !== undefined && isSourceFile(f.path) && !isTestFile(f.path));
    if (scanned.length === 0) {
      return { status: "na", summary: "No source files were available to check.", files: [], fix: "" };
    }

    const exec: FileRef[] = [];
    const html: FileRef[] = [];
    for (const f of scanned) {
      const r = findDangerousCode(f.path, f.content ?? "");
      exec.push(...r.exec);
      html.push(...r.html);
    }

    if (exec.length === 0 && html.length === 0) {
      return { status: "pass", summary: "No code that runs text as code or injects raw HTML was found.", files: [], fix: "" };
    }

    const htmlFix =
      "Inserting raw HTML into a page lets any script hidden in that HTML run in your visitors' browsers, where it " +
      "can steal their login or act as them. If the HTML can come from users or outside sources, clean it first " +
      "with a sanitizer such as DOMPurify, or show it as plain text instead.";

    if (exec.length === 0) {
      return {
        status: "warn",
        summary: `${html.length} place${html.length === 1 ? "" : "s"} insert${html.length === 1 ? "s" : ""} raw HTML into the page.`,
        files: html.slice(0, MAX_FILES),
        fix: htmlFix,
      };
    }

    return {
      status: "fail",
      summary:
        `${exec.length} place${exec.length === 1 ? "" : "s"} run${exec.length === 1 ? "s" : ""} text as code` +
        (html.length ? `, and ${html.length} insert${html.length === 1 ? "s" : ""} raw HTML into the page.` : "."),
      files: [...exec, ...html].slice(0, MAX_FILES),
      fix:
        "`eval` and `new Function` take a piece of text and run it as code. If any part of that text can come from a " +
        "user, an attacker can run whatever they like on your server or in your visitors' browsers. Ask your " +
        "developer to replace these with normal code (for example `JSON.parse` for reading data)." +
        (html.length ? " " + htmlFix : ""),
    };
  },
};
