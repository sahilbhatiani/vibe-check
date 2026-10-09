import type { Check, FileRef } from "../types";
import { isSourceFile, isTestFile } from "../util";

const MAX_FILES = 20;

// Words that show a string is really SQL, so `execute(\`git ${cmd}\`)` or a GraphQL query isn't flagged.
const SQL_WORDS = /\b(?:select|insert|update|delete|from|where|into|values|set|drop|order by)\b/i;

// The call names we look at. `(?:^|[^\w$])` stands in for a lookbehind: `useQuery(` and `$queryRaw(` don't match.
// Tagged templates (sql`…`, prisma.$queryRaw`…`) have no `(`, so they're never matched: they're the safe form.
const CALL = String.raw`(?:^|[^\w$])(query|execute|raw|\$queryRawUnsafe|\$executeRawUnsafe)\s*\(\s*`;
const UNSAFE_CALLS = new Set(["$queryRawUnsafe", "$executeRawUnsafe"]);

// query(`SELECT … ${id}`): a template literal with an interpolation, possibly over several lines.
const TEMPLATE = new RegExp(CALL + "(`[^`]*\\$\\{[^`]*`)", "g");
// query("SELECT … " + id) or query('…' + id)
const CONCAT = new RegExp(CALL + `("[^"\\n]*"|'[^'\\n]*')\\s*\\+`, "g");
// Python: cursor.execute(f"SELECT … {id}") or cursor.execute("SELECT … %s" % id)
const PY_FSTRING = new RegExp(CALL + `(f"[^"\\n]*\\{[^"\\n]*"|f'[^'\\n]*\\{[^'\\n]*')`, "g");
const PY_PERCENT = new RegExp(CALL + `("[^"\\n]*"|'[^'\\n]*')\\s*%\\s*[\\w(]`, "g");

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/** Line numbers in `content` where a database call is built by pasting values into the SQL text. */
export function findSqlInjection(content: string): number[] {
  const lines = new Set<number>();
  for (const re of [TEMPLATE, CONCAT, PY_FSTRING, PY_PERCENT]) {
    for (const m of content.matchAll(re)) {
      const [whole, call, str] = m;
      if (!UNSAFE_CALLS.has(call) && !SQL_WORDS.test(str)) continue;
      // Point at the line with the call name, not the character before it.
      lines.add(lineAt(content, (m.index ?? 0) + whole.indexOf(call)));
    }
  }
  return [...lines].sort((a, b) => a - b);
}

export const sqlInjection: Check = {
  id: "sql-injection",
  category: "security",
  title: "SQL injection risk",
  weight: 8,
  run(snapshot) {
    const scanned = snapshot.files.filter((f) => f.content !== undefined && isSourceFile(f.path) && !isTestFile(f.path));
    if (scanned.length === 0) {
      return { status: "na", summary: "No source files were available to check.", files: [], fix: "" };
    }

    const found: FileRef[] = scanned.flatMap((f) => findSqlInjection(f.content ?? "").map((line) => ({ path: f.path, line })));
    if (found.length === 0) {
      return { status: "pass", summary: "No database queries built from pasted-in text were found.", files: [], fix: "" };
    }

    const fileCount = new Set(found.map((f) => f.path)).size;
    return {
      status: "fail",
      summary: `${found.length} database ${found.length === 1 ? "query is" : "queries are"} built by pasting values into the SQL text, in ${fileCount} file${fileCount === 1 ? "" : "s"}.`,
      files: found.slice(0, MAX_FILES),
      fix:
        "These database queries are put together by gluing user-supplied values straight into the query text. An " +
        "attacker can type specially crafted input that changes what the query does, for example to read every " +
        "user's data or delete tables. Ask your developer to switch these to parameterized queries (placeholders " +
        "like `$1` or `?` with the values passed separately), or your database library's safe `sql` template tag.",
    };
  },
};
