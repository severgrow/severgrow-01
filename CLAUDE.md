# CLAUDE.md

- Read `docs/SPEC.md` before any work; it is the source of truth.
- TypeScript strict, Vitest, Node 20+ (20.19+, required by Vite). Run `npm run check` before finishing any task.
- `src/engine/` must stay pure and deterministic: no `Math.random`, no I/O, no timers.
- Write tests first. Never change a rule or weaken a test to make it pass.
- If the spec is ambiguous, stop and ask the user.
- Commit after each green milestone with a clear message.
