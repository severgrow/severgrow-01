# HANDOFF — the 0.75 pass (2026-11-04). Any agent can pick this up.

Read `AGENTS.md` first. This file is the live state of one owner-approved pass; update it as you go
and commit it with your work. Owner approval for everything below to go LIVE is already given
("0.75 ... goes LIVE", "Add to the same pass", "Remove the skipping growth in all levels really").

## Shipped (live at futasaku.com since 2026-11-04 21:42 UTC, build 907d0f78)

- 0.75 polish: shared space background, outline + metal keys (all menu keys identical), the board as a
  small floating planet (bent corners, no gaps), 35% stars over the game's own background, sharper
  motion, turn rim, tabular digits, game-over ease, no start-up flash, one glass. Beta 0.75.
- The egg fix (planet canvas sized in px). It was blocked from going live for hours: see "Traps".
- Level 10 on the big board; the Planet lesson window after it.

## In flight

1. **Lesson opponent** (commit 16221fd1, on /test): from level 4 its grow heads for your land; from
   level 5 it also Blooms when that keeps you ahead. Tests: `web/tests/lesson-opponent-alive.test.ts`.
2. **bots-v0.11, "no skipping growth in any level"** (the commit after 16221fd1): `src/bots/keeps-growing.ts`.
   A bot turn never ends without its grow while a grow is legal; where the level would have skipped,
   it makes a modest grow (strengthen its weakest tile at the back, lowest card; else spread one tile
   near home). `bots-v0.10` stays accepted. The page plays v0.11 (`chooseBotAction` in
   `bot.worker.ts` / `botClient.ts`). Level 9's earlier lesson-only `keepsPlaying` was folded into this.
   - Server: `SERVER_FEATURES` lists every bot version; edge bundle rebuilt. NOT DEPLOYED (needs
     `docs/CURSOR-SERVER-DEPLOY.md`, which a machine with Supabase login must run).
   - Page: `web/src/online/seed-rewards.ts` holds a v0.11 proof until the server lists `bots-v0.11`,
     so no Seeds are lost meanwhile; they pay once the server is deployed.
   - Tests: `tests/bots/keeps-growing.test.ts`, `web/tests/seed-rewards.test.ts`,
     `server/tests/seeds-verify.test.ts`.

## Next steps (do them in order; tick them off here)

- [x] `npm run check` green (4031 passed), futa04 build + `check-channel-assets` green, lesson
      suites (`futa04-lesson-9-free`, `lessons-3`, `futa04-critical`, tutorial-lock/-intel) green
      on commit 4774095b (branch `claude/focused-fermat-kq2zyf`, NOT yet on `futa0.5-online`).
- [ ] Push 4774095b (or a reworded squash of it) to `futa0.5-online` (fast-forward) and `claude/focused-fermat-kq2zyf`.
- [ ] Wait for CI on that commit (all jobs incl. WebKit) and its /test publish.
- [ ] `npm run promote -- <that sha>`, then republish: dispatch workflow `futasaku04-preview.yml` on
      `futa0.5-online` with input `promote: ''`. Confirm in the publish run's build log that
      `ROOT_SHA` is the sha.
- [ ] Tell the owner in plain English. Remind: the Cursor server deploy is still needed for level 10
      Seeds, grow-anywhere, the 50-Seed sale, and to release Seeds held for bots-v0.11 wins.

## Traps (learned the hard way)

- The publish gate needs CI GREEN on BOTH the live commit and the /test commit. One failed CI run on
  the live commit blocks every publish silently. `npm run promote -- --status` reads the `live`
  BRANCH, not the site: check the publish run's build log (`ROOT_SHA`) before saying anything is live.
- A push from `live` cannot deploy (environment policy). After a promote, always dispatch the
  republish on `futa0.5-online`.
- The pages queue keeps one pending run: do not push while a republish you need is still pending.
- `sphere-test` "no idle rendering" can flake by one frame on CI's software GPU; re-run once only.
- Browser suites rewrite `docs/screens/**`: `git checkout -- docs/screens` before committing.
- Never change a shared bot level in place: the server replays bots by version for Seeds proofs.
