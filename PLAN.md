# Build plan: Vibe Check in 60 minutes

## How to work with the agents

**You are the architect and product owner. Claude writes the code.** Your job is to make decisions, keep scope tight, and check the work. That's also exactly what Launch Assembly is hiring for, so the way you build this is part of the demo.

The loop for every phase:

1. **Plan.** Paste the phase prompt in plan mode. Read the plan. Push back on anything that drifts from `SPEC.md`. This is where your judgment shows.
2. **Build.** Approve and let it run. Don't micromanage individual lines.
3. **Verify.** Tests and build must pass. Then look at the actual result yourself: run it, click it, read the diff summary.
4. **Commit.** One commit per phase. Git is your undo button: if a phase goes sideways, reset and re-prompt rather than patching a mess.
5. **Clear.** Start the next phase with fresh context (`/clear`). `CLAUDE.md`, `SPEC.md` and `PLAN.md` carry everything over.

**Use subagents for work that splits cleanly.** The 18 checks are independent once the types and helpers exist, so phase 2 fans them out in parallel. Don't parallelise anything that touches shared files.

**Use a fresh-eyes reviewer at the end.** A subagent that didn't write the code reviews it against the spec. It catches what the builder can't see.

**Rules of thumb:**
- If you've corrected the same thing twice, put the rule in `CLAUDE.md`.
- If a prompt produces something wrong, improve the prompt and redo it. Don't argue with the output.
- Keep a running note of decisions and timestamps. "Spec at 3:40, deployed at 4:38" is a great line in your application.

---

## Phase 0: Setup (5 min)

Do by hand:

```bash
npx create-next-app@latest vibe-check --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm
cd vibe-check
# copy SPEC.md, CLAUDE.md, PLAN.md into this folder
npm i -D vitest
git add -A && git commit -m "Phase 0: scaffold + spec"
```

Create a GitHub repo, push, and import it into Vercel now, so every later push deploys automatically. Add a `GITHUB_TOKEN` env var in Vercel (a fine-grained token with public repo read access only).

**Done when:** the starter page is live on a Vercel URL.

---

## Phase 1: Engine core (10 min)

> Read SPEC.md and CLAUDE.md. Build the pure engine foundation, with no checks yet:
> - `lib/engine/types.ts`: RepoSnapshot, Check, CheckResult, Report, exactly as described in the spec
> - `lib/engine/util.ts`: helpers the checks will share: `isSourceFile`, `isTestFile`, `isApiRoute` (Next.js app and pages routers, Express-style routes folders), `findLines(content, regex)` returning line numbers, and `maskSecret`
> - `lib/engine/index.ts`: `runChecks(snapshot, checks)` with scoring, grades and the security cap from the spec
> - `tests/helpers.ts`: `makeSnapshot({ "path": "content", ... })` for building fake repos inline
> - Vitest config, an `npm test` script, and tests for scoring, the security cap, every util, and `maskSecret`
> - One example check, `env-files` (check #1), with its tests, to set the pattern the others will copy

**Done when:** `npm test` passes and the example check shows the pattern clearly. Read `env-files.ts` yourself: every other check will copy it, so fix anything you don't like now.

---

## Phase 2: All the checks, in parallel (12 min)

> Implement the remaining 17 checks from the SPEC.md table, following the pattern in `lib/engine/checks/env-files.ts` exactly. Use subagents to work in parallel: split them into three groups (Security #2–7, Reliability #8–13, Maintainability #14–18), one subagent per group. Each subagent writes only its own check files and test files. Don't let them edit shared files. Once they're all done, register every check in `lib/engine/checks/index.ts` yourself, then run the full test suite and fix any failures.
>
> Each check needs a pass test, a fail test, and an `na` test where applicable. For the secrets check, add a test proving the raw secret value never appears anywhere in the result.

**Done when:** 18 checks registered, all tests green. Spot-check two or three fix messages: would a non-technical founder understand them?

---

## Phase 3: GitHub fetching + API route (8 min)

> Implement `lib/github.ts` and `app/api/scan/route.ts` per the "Fetching" and "API contract" sections of SPEC.md. Keep fetching separate from the engine. Test URL parsing thoroughly (all the formats in the spec, plus junk input). Test the file-selection logic (which files to download, skipping, the 250 cap) as pure functions. Map GitHub errors to the right status codes, and include the reset time for rate limits.

**Then verify by hand:**
```bash
npm run dev
curl -s -X POST localhost:3000/api/scan -H 'content-type: application/json' \
  -d '{"url":"https://github.com/vercel/next-learn"}' | head -c 1500
```

**Done when:** a real repo scan returns a sensible report in under 15 seconds, and a bad URL returns a clean 400.

---

## Phase 4: The report UI (12 min)

> Build the UI described in "The report UI" section of SPEC.md in `app/page.tsx` and components under `components/`. Aim for something that looks like a real product a founder would trust: clean, confident, generous spacing, a strong grade display. Not a generic dashboard template. Use colour carefully: red, amber and green for status only. Support `?repo=owner/name` to auto-run a scan. Show staged loading messages while scanning. It must work on mobile and in dark mode.

**Then:** open it on your phone. Scan 3 repos. Fix whatever feels off with short, specific prompts ("the grade is too small on mobile", "findings need more breathing room").

**Done when:** you'd be happy to show it to the founder.

---

## Phase 5: AI summary (5 min)

> Implement `lib/summary.ts` per the "AI summary" section of SPEC.md and show it as a card at the top of the report. Send only the findings, never code or secret values. Add a test that the prompt builder never includes file contents. The app must still work with no API key.

Add `ANTHROPIC_API_KEY` in Vercel.

**Done when:** the summary reads like a senior engineer talking to a founder, and the app still works with the key removed.

---

## Phase 6: Review, ship, demo (8 min)

> Use a subagent that hasn't seen this code to review the whole repo against SPEC.md and CLAUDE.md. It should look for: spec gaps, any path where a secret value could leak, false-positive risks in the checks, and missing error handling. Report findings only. Don't fix anything yet.

Fix only the real issues. Then:

1. Write a short README: what it is, a screenshot, how it's built, how to run it.
2. Push and confirm the Vercel deploy.
3. Find your demo repos: one clean, one messy. If you can't find a good messy one, have Claude vibe-code a deliberately sloppy app in a separate repo (fake keys only!).
4. Record the 2-minute demo following the script at the end of SPEC.md.

**Done when:** live URL + GitHub repo + demo video. That's your application.

---

## If you're running behind

Cut in this order: Phase 5 (AI summary) → rate-limit and unprotected-route checks → the copy-link feature. Never cut tests on the security checks. They're the credibility of the whole product.
