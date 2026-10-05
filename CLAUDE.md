# CLAUDE.md

- Read `docs/SPEC.md` before any work; it is the source of truth.
- TypeScript strict, Vitest, Node 20+ (20.19+, required by Vite). Run `npm run check` before finishing any task.
- `src/engine/` must stay pure and deterministic: no `Math.random`, no I/O, no timers.
- Write tests first. Never change a rule or weaken a test to make it pass.
- If the spec is ambiguous, stop and ask the user.
- Commit after each green milestone with a clear message.

## TEST (lite) mode

A task that starts with "TEST:" is a quick experiment for the test copy (the `dev` branch,
published at `/test/`). For those tasks only:

- Work only on `dev` and commit straight to it. No pull request. Never touch `main`, any
  `releases/` folder, a beta tag or a frozen copy.
- Do all steps in order without stopping to ask. If something is unclear, pick the quickest
  sensible option, write one line about it in `docs/DECISIONS.md`, and keep going.
- Skip unit tests, adversarial tests, simulations, ladders, screenshot rounds, self-critique
  loops and golden-test regeneration. Do not run the full test suite or `npm run check`.
- The only requirements: the build succeeds, the page loads with no console errors, and the
  "Classic" preset plays a normal game against the opponent (`web/e2e/lab-smoke.ts`).
- Tests that break because of the work stay broken: list them in `docs/LAB-KNOWN-BREAKAGE.md`.
- Lab code lives in `web/src/lab-mode/` and only loads in the test build (the CHANNEL build
  constant). The default game's rules, look and behaviour never change. The test copy uses its
  own storage prefix.

Every change made in the test copy goes onto `docs/WAITLIST.md` ("Waiting for the locked
beta"): its name, date, commit, "in test only", and what must be checked before locking in.

"Lock it in": first show the user the waitlist and ask which items to include. Then switch back
to the strict flow for those items: run the full `npm run check`, fix every failure
(including the ones in `docs/LAB-KNOWN-BREAKAGE.md`), regenerate goldens only where the rules
change on purpose, keep the guards (the Lab stays out of the live build), and ask the user for
the go-ahead before anything reaches `main`. Tick each item off the waitlist when it lands.
