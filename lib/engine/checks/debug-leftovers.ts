import type { Check, FileRef } from "../types";
import { isSourceFile, isTestFile, lineCount } from "../util";

const LINES_PER_LOG = 200;
const MAX_TODOS = 10;

const LOG_RE = /\bconsole\.log\s*\(/g;
// Upper-case only, so words like "todos" in a to-do app aren't counted.
const TODO_RE = /\b(?:TODO|FIXME)\b/g;

// Command-line scripts print to the console on purpose.
function isScript(path: string): boolean {
  return /(^|\/)(scripts|bin)\//.test(path);
}

function count(content: string, re: RegExp): number {
  return content.match(re)?.length ?? 0;
}

/**
 * Debug logging and TODO notes are clutter, not a danger to users, so this check only ever warns
 * (the spec lists a condition, not a severity). Its low weight reflects the same thing.
 */
export const debugLeftovers: Check = {
  id: "debug-leftovers",
  category: "maintainability",
  title: "Debug leftovers",
  weight: 2,
  run(snapshot) {
    const sources = snapshot.files.filter((f) => f.content !== undefined && isSourceFile(f.path) && !isTestFile(f.path));

    if (sources.length === 0) {
      return { status: "na", summary: "No source files to check.", files: [], fix: "" };
    }

    let logLines = 0;
    let logs = 0;
    let todos = 0;
    const perFile: { path: string; logs: number; todos: number }[] = [];
    for (const f of sources) {
      const content = f.content ?? "";
      const fileTodos = count(content, TODO_RE);
      let fileLogs = 0;
      if (!isScript(f.path)) {
        logLines += lineCount(content);
        fileLogs = count(content, LOG_RE);
      }
      logs += fileLogs;
      todos += fileTodos;
      if (fileLogs > 0 || fileTodos > 0) perFile.push({ path: f.path, logs: fileLogs, todos: fileTodos });
    }

    const tooManyLogs = logs > 0 && logs * LINES_PER_LOG > logLines;
    const tooManyTodos = todos > MAX_TODOS;

    if (!tooManyLogs && !tooManyTodos) {
      return { status: "pass", summary: "Little leftover debug logging or TODO notes.", files: [], fix: "" };
    }

    const problems: string[] = [];
    const fixes: string[] = [];
    if (tooManyLogs) {
      problems.push(`${logs} \`console.log\` call${logs === 1 ? "" : "s"}`);
      fixes.push(
        "Leftover `console.log` lines clutter your logs, making real problems harder to spot, and can print " +
          "private data where anyone with access to the browser or server logs can see it. Remove the ones used " +
          "for debugging, or replace them with proper logging.",
      );
    }
    if (tooManyTodos) {
      problems.push(`${todos} TODO/FIXME notes`);
      fixes.push(
        "Lots of TODO/FIXME notes usually mean unfinished work. Go through them: fix what matters before launch, " +
          "and move the rest to your issue tracker.",
      );
    }

    const files: FileRef[] = perFile
      .filter((f) => (tooManyLogs && f.logs > 0) || (tooManyTodos && f.todos > 0))
      .map((f) => ({ ...f, score: (tooManyLogs ? f.logs : 0) + (tooManyTodos ? f.todos : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((f) => {
        const parts: string[] = [];
        if (tooManyLogs && f.logs > 0) parts.push(`${f.logs} console.log`);
        if (tooManyTodos && f.todos > 0) parts.push(`${f.todos} TODO/FIXME`);
        return { path: f.path, preview: parts.join(", ") };
      });

    return {
      status: "warn",
      summary: `Found ${problems.join(" and ")} left in the code.`,
      files,
      fix: fixes.join(" "),
    };
  },
};
