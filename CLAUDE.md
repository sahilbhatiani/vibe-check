# Vibe Check

Scans a public GitHub repo and gives it a production-readiness score with a plain-English report. Full spec: `SPEC.md`. Build plan and current phase: `PLAN.md`.

## Stack

- Next.js (App Router) + TypeScript (strict) + Tailwind
- Vitest for tests
- No database, no auth
- Deployed on Vercel

## Commands

- `npm run dev`: local server
- `npm test`: run all tests (must pass before any commit)
- `npm run build`: production build (must pass before any commit)
- `npm run lint`

## Architecture rules

- `lib/engine/` is **pure**: no `fetch`, no `process.env`, no Next.js imports. It takes a `RepoSnapshot` and returns a `Report`.
- One check per file in `lib/engine/checks/`. Each exports a `Check` object: `{ id, category, title, weight, run(snapshot) => CheckResult }`. Register it in `lib/engine/checks/index.ts`.
- All network access lives in `lib/github.ts` and `lib/summary.ts`.
- The API route only wires things together: validate input → fetch snapshot → run checks → optional summary → respond.

## Conventions

- Every check gets tests in `tests/checks/<id>.test.ts` with at least one pass and one fail case, using inline fake repos built with the `makeSnapshot()` helper in `tests/helpers.ts`. No network in tests.
- Fix suggestions are written for a non-technical reader: say what the risk is and what to do, without jargon.
- Prefer false negatives over false positives. A check that cries wolf damages trust in the whole report. Heuristic checks (unprotected routes, rate limiting) can only `warn`, never `fail`.
- Don't add dependencies unless they save real work. Ask first.

## Hard rules

- **Never put a secret's value in a response, log, or UI.** Show the file, line, and a masked preview only (use `maskSecret()` in `lib/engine/util.ts`).
- Never download `.env` files from a scanned repo. Their existence is the finding.
- Never send source code to the AI summary, only the findings.
- The app must work fully with no `ANTHROPIC_API_KEY`.

## Workflow

- Work one phase of `PLAN.md` at a time. Don't start the next phase until the current one's "done when" is true.
- `main` is protected: no direct pushes, no force pushes. All changes go through a PR.
- Start each phase on a new branch (e.g. `phase-1-engine`). When the phase is done: run `npm test && npm run build`, commit with a message naming the phase, push the branch, and open a PR with `gh pr create`.
- CI (`.github/workflows/ci.yml`) runs lint, tests, and build on every PR. The PR can only merge when CI passes and the branch is up to date with `main`. Merge with `gh pr merge --squash --delete-branch`.
- Merging to `main` deploys to production on Vercel. PRs get preview deploys.
- If something in the spec seems wrong or ambiguous, say so instead of guessing.
