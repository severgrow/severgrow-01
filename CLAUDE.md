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
