# Codex: start here

Do these in order when you open the repository.

1. **Get on the right branch.** Work only on `Main2.0`. Never touch `main`.
   ```bash
   git fetch origin
   git checkout Main2.0            # or: git checkout -b Main2.0 origin/Main2.0
   git pull --ff-only origin Main2.0
   git status                      # must be clean
   ```

2. **Read** `AGENTS.md` (rules, architecture, risks), then `MAIN2_PROGRESS.md` (state and open
   decisions), then `CLAUDE.md` and `docs/SPEC.md` (the rules of the game).

3. **Install and prove the baseline** (Node >= 20.19):
   ```bash
   npm ci
   npm run typecheck
   npm test                                  # about 6-7 minutes
   npm run web:build                         # live channel
   CHANNEL=test npm run web:build            # test channel
   ```
   Record the results in `MAIN2_PROGRESS.md` → TEST RESULTS. If a step fails for an
   environment reason (no network, EPERM, no Chromium), write that down as a limit, not a pass.

4. **See what `dev` has that `Main2.0` lacks** (`dev` keeps moving; pin the SHA you use):
   ```bash
   git log --oneline Main2.0..origin/dev
   git rev-parse origin/dev
   ```

5. **Continue with the first open item** under IN PROGRESS in `MAIN2_PROGRESS.md`.
   - If it is the merge, then:
     - `git merge --no-ff origin/dev`, with the pinned `dev` SHA in the commit message;
     - resolve conflicts keeping `main`'s fixes;
     - re-run step 3;
     - build both channels and check that the live `web/dist` has no Lab, DESIGN or bake-off code.

6. **Put the open DECISIONS NEEDED to the owner in one short message**, with your recommendation
   for each, and keep working on everything that doesn't depend on them.

7. **After each milestone:**
   - commit (one logical change, clear message);
   - push `Main2.0`;
   - update `MAIN2_PROGRESS.md`;
   - report in plain English.

Never: push to `main` or `dev`, run the Pages deploy, change gameplay or balance without asking,
or weaken a test.
