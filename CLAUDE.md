# CLAUDE.md

- Read `docs/SPEC.md` before any work; it is the source of truth for **Futasaku 0.4**.
- **0.4** product work lands on branch **`futa0.4`** (not `Futasaku0.3` / `main`). The **0.5 online**
  line (online duels + live duels, shipped as `/futa0.5/`) lands on **`futa0.5-online`** — start at
  `docs/ONLINE.md`. Neither line touches `main` / `dev`.
- TypeScript strict, Vitest, Node 20+ (20.19+, required by Vite). Run `npm run check` before finishing any task.
- `src/engine/` must stay pure and deterministic: no `Math.random`, no I/O, no timers.
- Player names: Grow / Bomb / Blast / FUTASAKU. Engine ids `Sprout` / `PlayFruit` / `MegaBomb` stay for compatibility.
- Write tests first. Never change a rule or weaken a test to make it pass.
- If the spec is ambiguous, stop and ask the user.
- Commit after each green milestone with a clear message.
- Product build: `CHANNEL=futa04 npm run web:build` (also the default). 0.5 preview: `CHANNEL=futa05`.
  Experiment copy: `CHANNEL=futa-test`.
- Pre-cleanup archive: `archive/futa0.4-before-cleanup`.

## How futasaku.com is published (as of 2026-10-20)

- **`futa0.5-online` IS the live site.** A push there runs `.github/workflows/futasaku04-preview.yml`
  (the name is historic), which builds `futa0.5-online` as the root of futasaku.com, plus `/2/`
  (`futa0.5-onboarding`) and `/3/` (`futa0.5-onboarding-3`), and deploys GitHub Pages.
- That deploy first **waits for CI (`ci.yml`) to pass on the same commit**; red CI publishes nothing.
  Never push to `futa0.5-online` without the owner's go-ahead; work on a branch, let CI go green,
  then fast-forward.
- CI's browser suites include `lessons-3` (levels 1-10, the tutorial), `cut-severe` and
  `futa04-motion`. A change that breaks them must be fixed, never skipped.
- Feel and motion values that must not drift live in `PINNED` (`web/src/logic/motion.ts`), asserted
  by `web/tests/motion.test.ts`; the throw has two (`throw` = the step's wait, `throwFlight` = the card).
