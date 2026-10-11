# CLAUDE.md

- Read `AGENTS.md` (branches, the strict flow, `TEST:` mode, checks, code map) and `docs/SPEC.md`
  (the rules, the source of truth) before any work.
- All normal work is on `futa0.4`. `TEST:` tasks go only to `futa-test`. Never change `main`, `dev`,
  `Main2.0`, `Futasaku0.3`, `futa0.3` or `archive/*`.
- TypeScript strict, Vitest, Node 20.19+. Run `npm run check` before finishing any normal task.
- `src/engine/` must stay pure and deterministic: no `Math.random`, no I/O, no timers.
- Write tests first. Never change a rule or weaken a test to make it pass.
- If the spec is ambiguous, stop and ask the owner.
- Commit after each green milestone with a clear message.
- Player text says "opponent", never "bot", and uses Grow, Bomb, Blast, Bloom, Strengthen, home.
- Never commit secrets; for anything needing an account, key or paid plan, stop and tell the owner
  exactly what to click. If a permission is blocked, say so; don't work around it.
