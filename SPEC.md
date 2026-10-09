# Vibe Check: production-readiness report for GitHub repos

## Problem

Non-technical founders are building apps with AI tools ("vibe coding"). The apps demo well but break in production: leaked API keys, no tests, no error handling, unprotected endpoints. The founder can't tell how bad it is, because they can't read the code.

## What it does

1. User pastes a public GitHub repo URL.
2. The app fetches the repo, runs ~18 automated checks, and scores it 0–100 with a letter grade.
3. It shows a report: the score, each finding grouped by category, the files involved, and a plain-English "what this means and how to fix it" for each one.
4. Optionally, an AI-written summary for a non-technical reader: "Here's what a senior engineer would tell you about this codebase."

**Who it's for:** a non-technical founder (the report) and an engineer or agency triaging a cleanup job (the file-level detail).

## Non-goals (v1)

- Private repos or GitHub sign-in
- Running the code, installing dependencies, or deep static analysis (no ASTs, regex and file heuristics only)
- Saving reports, user accounts, history
- Languages beyond JS/TS as first class (Python, Ruby and Go get the language-neutral checks)

## The checks

Each check returns `pass`, `warn`, `fail`, or `na` (not applicable), a weight, a one-line summary, the files involved, and a fix suggestion.

| # | Category | Check | Fails when | Weight |
|---|---|---|---|---|
| 1 | Security | Committed env files | `.env`, `.env.local`, `.env.production` etc. in the repo (`.env.example` is fine) | 10 |
| 2 | Security | Hardcoded secrets | Source matches known key patterns: `sk-`, `sk_live_`, `AKIA`, `ghp_`, `xox[bp]-`, `-----BEGIN ... PRIVATE KEY-----`, JWT-shaped `service_role` keys | 10 |
| 3 | Security | Secrets exposed to the browser | `NEXT_PUBLIC_` / `VITE_` / `REACT_APP_` var names containing SECRET, PRIVATE, SERVICE_ROLE, or KEY with a server-only provider | 8 |
| 4 | Security | .gitignore covers env files | No `.gitignore`, or it doesn't ignore `.env*` | 5 |
| 5 | Security | SQL injection risk | Template literals or string concatenation inside `query(`, `execute(`, `raw(`, `$queryRawUnsafe` | 8 |
| 6 | Security | Dangerous code execution / HTML | `eval(`, `new Function(`, `dangerouslySetInnerHTML`, `innerHTML =` | 5 |
| 7 | Security | Unprotected API routes (heuristic) | API route files that write data (`POST`/`PUT`/`DELETE`, insert/update/delete calls) with no auth reference (session, auth, getUser, clerk, token, middleware). **Warn only**, never fail | 6 |
| 8 | Reliability | Tests exist | No `*.test.*`, `*.spec.*`, `__tests__/`, `tests/`, `test_*.py`, `*_test.go`, `spec/` | 8 |
| 9 | Reliability | Test script is real | `package.json` test script missing or is the npm placeholder | 3 |
| 10 | Reliability | CI configured | No `.github/workflows/*`, `.gitlab-ci.yml`, or `.circleci/` | 4 |
| 11 | Reliability | Error handling in API routes | Under 50% of API route files contain `try`/`catch` or `.catch(` (warn), under 20% (fail) | 6 |
| 12 | Reliability | Input validation | API routes exist but no validation library (zod, yup, joi, valibot, class-validator, pydantic) is referenced | 5 |
| 13 | Reliability | Rate limiting | API routes exist and nothing references rate limiting. **Warn only** | 3 |
| 14 | Maintainability | Lockfile present | A JS project with no `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb` | 3 |
| 15 | Maintainability | Type safety | A TS project with `strict` not on in `tsconfig.json`, or heavy `any` use (> 1 per 50 lines) | 4 |
| 16 | Maintainability | Giant files | Any source file over 600 lines (warn) or over 1,000 lines (fail) | 4 |
| 17 | Maintainability | Debug leftovers | More than 1 `console.log` per 200 source lines, or more than 10 TODO/FIXME | 2 |
| 18 | Maintainability | README / env documentation | README missing or under 300 chars, or code reads env vars but there's no `.env.example` | 3 |

**Never display a secret's value.** Findings show the file, line number, and a masked preview (`sk-ab…••••`).

## Scoring

- pass = 1, warn = 0.5, fail = 0, na = excluded
- score = round(100 × Σ(weight × value) / Σ(weight of applicable checks))
- Any failed **Security** check caps the grade at C, whatever the score
- Grades: A ≥ 90, B ≥ 80, C ≥ 65, D ≥ 50, F < 50

## Architecture

```
app/page.tsx              Form + report UI (client component)
app/api/scan/route.ts     POST { url } → Report JSON
lib/github.ts             URL parsing, fetching the tree and file contents
lib/engine/types.ts       RepoSnapshot, CheckResult, Report
lib/engine/checks/*.ts    One file per check, each a pure function
lib/engine/index.ts       runChecks(snapshot) → Report (scoring + grade)
lib/summary.ts            Optional AI summary (Anthropic API)
tests/                    Vitest, using in-memory fake repos
```

**Key rule:** the engine is pure. `runChecks(snapshot)` takes a `RepoSnapshot` (`{ files: { path, size, content? }[], meta }`) and never touches the network. This makes every check testable with tiny fake repos written inline in the test.

### Fetching (lib/github.ts)

1. Parse `github.com/owner/repo` (also accept `.git`, trailing slashes, `/tree/branch`).
2. `GET /repos/{owner}/{repo}` for the default branch, size, and language. Reject private repos and 404s with a clear message.
3. `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` for every path and size.
4. Download contents from `raw.githubusercontent.com` (not counted against the API rate limit) only for files the checks need: source files under 200 KB, plus `package.json`, `tsconfig.json`, `.gitignore`, `README*`. Skip `node_modules`, `dist`, `build`, `.next`, `vendor`, and `*.min.js`. **Never download `.env` files**: their existence is enough.
5. Cap at 250 files, fetched with concurrency of ~10. If the repo is bigger, note in the report that it was sampled.
6. Use `GITHUB_TOKEN` if set (60 → 5,000 API requests/hour).

### AI summary (lib/summary.ts)

- Only if `ANTHROPIC_API_KEY` is set. The report must work fully without it.
- Send only the findings (no source code, no secret values) and ask for 3 short paragraphs for a non-technical founder: overall verdict, the top 3 risks in plain language, what to fix first.
- Model from `ANTHROPIC_MODEL`, defaulting to a current Sonnet model.
- 15 second timeout. On failure, show the report without the summary.

## API contract

`POST /api/scan` with `{ "url": "https://github.com/owner/repo" }`

- 200 → `Report`: `{ repo, scannedFiles, sampled, score, grade, cappedBySecurity, checks: CheckResult[], summary? }`
- 400 → bad URL; 404 → repo not found or private; 429 → GitHub rate limit (say when it resets); 500 → anything else, with a human message

## The report UI

- Hero: big grade letter + score, repo name, files scanned, one-line verdict
- Category bars: Security / Reliability / Maintainability
- Findings list sorted fail → warn → pass, each expandable to show files and line numbers, and the fix
- AI summary card at the top when available
- "Scan another repo" and "Copy report link" (`/?repo=owner/name` re-runs the scan)
- Loading state that shows progress steps, since a scan takes 5–15 seconds
- Looks good on mobile; light and dark mode

## Acceptance criteria

- [ ] Every check has at least one passing test and one failing test using inline fake repos
- [ ] `npm test`, `npm run build`, and `npm run lint` all pass
- [ ] Scanning a clean, well-known repo gives A or B; scanning a deliberately messy repo gives D or F
- [ ] No secret value ever appears in the API response or UI
- [ ] Works with no `ANTHROPIC_API_KEY` set
- [ ] Deployed on Vercel with a public URL

## Demo script (2 minutes)

1. The problem: vibe-coded apps fall over in production, and founders can't tell (15 s)
2. Scan a clean, well-known repo → good grade (20 s)
3. Scan a messy vibe-coded repo → bad grade, open the leaked-key and no-tests findings, show the plain-English summary (60 s)
4. How it's built: pure check engine, tested with fake repos, built with Claude Code in an hour (20 s)
5. What's next: deeper analysis, "fix it for me" PRs, a lead form for a cleanup quote (5 s)
