# Start here

1. `git fetch origin && git checkout futa0.4 && git pull --ff-only origin futa0.4` (for a `TEST:`
   task: `futa-test` instead). Run `git status --short` and keep any work that is already there.
2. Read `AGENTS.md`, then `docs/SPEC.md`.
3. `npm ci`, then `npm run check` to prove the starting point is green.
4. Do the task by the strict flow (or the quick flow for `TEST:`), as `AGENTS.md` describes.
5. Report to the owner in plain English: what changed, which checks ran and passed, what is uncertain.
