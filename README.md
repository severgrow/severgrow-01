# FUTASAKU 0.4

Grow a living network. Keep it connected. Cut theirs.

Rules live in `src/engine/` (pure, deterministic). The browser client lives in `web/`.
**Source of truth:** [`docs/SPEC.md`](docs/SPEC.md).

---

## THIS BRANCH: `futa0.5-onboarding-3` — levels 1-10 as the tutorial (/3/). Handoff notes

**Read this section first if you are picking up this branch.** Then read `CLAUDE.md`, `docs/SPEC.md`,
[`docs/LESSON-SCRIPTS.md`](docs/LESSON-SCRIPTS.md) and the top section of [`docs/CAMPAIGN.md`](docs/CAMPAIGN.md)
("Levels 1-10 are the tutorial").

### What it is

Owner brief "FUTASAKU /3 — LEVELS 1-10 ARE THE TUTORIAL" (2026-10-18): levels 1-10 are rebuilt as ten
short authored lessons, one idea each, each ending in a real win. Level 11 is the first 37-hex level.

- **Live:** https://www.futasaku.com/3/
  - Published by `.github/workflows/futasaku04-preview.yml` on every push to this branch.
  - The owner added this branch to Settings → Environments → github-pages → deployment branches.
- **Unchanged:** the root (`futa0.5-online`) and `/2/` (`futa0.5-onboarding`).
- **Branched from** `origin/futa0.5-onboarding`, with `origin/futa0.5-online` merged in.
  - The online line's revert of the small-map teaching (`1a16077`) was recorded with `-s ours` so it did not undo this line's work. See "Why the small-map teaching was reverted" below.

### Hard rules for this branch (from the owner; do not break them)

**Never change:**
- No rule, scoring, card-count or legal-move change. `src/engine/` stays pure and deterministic.
- Do not touch `web/src/online/*`, `duel-hud.ts`, `online-css.ts` or the header (another agent owns them). Never use the header for guidance.
- Territory, online match rules and the menu design stay as they are.

**Never do without the owner's approval:**
- Do not merge.
- Do not deploy Edge Functions. Do not apply migrations.
- Do not push to other branches.

**How to work:**
- Tests first. Never weaken a test.
- `npm run check` before finishing. Commit after each green milestone.

**Words:**
- NO TEXT ON THE MAP: words go only in the glass window or the LED; the map gets only glow, pulse or ring.
- One word list: Draw pile, Throw pile, Grow, Bloom, Bomb, Blast, points. Your **home** (never "tree"); "cut"/"disconnect" (never "take over"). At the end, points = how many tiles you hold (gold = 2); the numbers on tiles do not count.
  - Never "set"/"run" for a Bloom, never "Fruit" (it is Bomb), never "Campaign", never "bot", no tile colours.
- Instruction ≤ 6 words, reason fits two lines on the smallest phone (owner, 2026-10-19), never "tree" (it is your home), never "take over". New strings go in the `LESSON` section of `src/strings.ts`.

**Other:**
- Keep the old Tutorial (menu entry untouched); it is "still available, to be retired later". Keep the Boobsie easter egg for now.
- Never commit secrets. Never force-push. No model names in commits.

### What is done (commits on this branch, newest last)

| Commit | What |
|---|---|
| `a115fa2` | Branch + merge of the online line |
| `e142bfe` | Lesson core: `web/src/lessons/` (authored openings, scripted opponent, beats, wrong-tap answers), `src/campaign/small-board.ts` (shared radius, so the levels don't depend on the Tutorial), `LESSON` strings; `web/tests/lessons.test.ts` with three automated players |
| `8a7f49a` | **Tap the Throw pile to throw** the picked card, in every mode (a change to normal play; `web/src/logic/throw-pile.ts`, `web/tests/throw-pile-tap.test.ts`) |
| `7db0c2d` | UI wiring in `web/src/main.ts`, lesson focus shapes in `web/src/player/glass-surface.ts`, /3 storage prefix (`web/src/channel.ts`), /3 service-worker cache (`web/public/futa04-sw.js`) |
| `96e593d` | Fixes found in the browser, the /3 preview step (`scripts/compose-lessons3.mjs` + workflow), docs, words test, server test for level 11, e2e `web/e2e/lessons-3.ts` |

What the player gets:

- **Levels 1-10 open from authored positions** (`web/src/lessons/authored.ts`):
  - real engine cards, 19-hex map;
  - a short stacked Draw pile as the lesson's clock;
  - cards a lesson does not name are simply out of play (no rule change).
- **Opponent:** a gentle deterministic scripted opponent (`opponent.ts`) for levels 1-9; level 10 plays bot level 1.
- **Guidance comes from the live state** (`lessons.ts` → `lessonBeat`), shown in the Tutorial's glass window:
  - the LED shows the instruction, with the reason line under it;
  - the lit target is outlined as a hex, a fanned card or a pill, with a strong dim and a chunky pointer.
  - Explanation beats move on with a tap anywhere / NEXT.
  - Idle 6 s gives a harder bob plus "Show me".
  - RESTART LEVEL appears when the goal can no longer happen.
  - The hints-off switch is the existing Settings → Step guidance.
- **Wrong taps** are answered from the engine's own reasons (`answer.ts`), in the glass (or the LED with hints off), plus a ring at the spot.
  - Levels 1-3 are locked: a non-lit tap never reaches the game.
  - From level 4 any legal move is played and the light adapts.
- **The old on-map "tap why" plate now goes to the LED in every mode** (`sayWhyAtPoint` in `main.ts`).
- **Finish card:** the lesson's own title and one line, with **no Seeds line**. No Seeds proof is sent for levels 1-10.
- **Saves:** the seen explanations and the lesson `version` (currently 2) are saved in `severgrow.lesson.meta.v1`; per-action mastery lives in `severgrow.lesson.mastery.v1`, keyed to that version. A save from another lesson version restarts the level. The campaign moved to `.v3` keys on 2026-10-19, so old progress is intentionally unread.
- **/3 storage:** /3 uses its own prefix `futa05-3:` and SW cache `futa05lessons3-`, so it never touches root or /2 data.

**Verified:**
- `npm run check` passes (2315 tests).
- The browser e2e passes (`web/e2e/lessons-3.ts`, served at `/3/`):
  - the lit-only tapper clears levels 1-10 in a row with **0 wrong taps** (L1 in about 16 s);
  - level 11 is 37 hexes with no lesson;
  - /3 never writes root or /2 keys;
  - random taps: every tap on a game element either acts or is answered, and the level still finishes;
  - the rock tapped 5 times always gives the same answer;
  - cards tapped before drawing are answered;
  - refresh mid-level resumes the same position;
  - hints off still plays to a win.
- Screenshots checked at 320×568, 360×640, 390×844, 844×390, 820×1180 and 1280×800.
- **Not verified:** that real beginners understand it. That needs real new players.

### How to run and test

```sh
npm ci
npm run check
npx vitest run web/tests/lessons.test.ts web/tests/lesson-*.test.ts web/tests/throw-pile-tap.test.ts
# the /3 build (the futa05 channel needs online config; local dummies are fine for offline play):
CHANNEL=futa05 VITE_DUEL_API_URL=http://127.0.0.1:9 VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/lessons-3.ts     # ONLY=run | robust, SHOTS=<dir>
```

- `scripts/check-channel-assets.mjs` fails with dummy URLs: it wants a real-shaped duel URL. That is expected locally; CI has the real variables.
- Test hooks in the page:
  - `window.__severgrow.lesson()` gives the beat, the answer showing, and the seen explanations;
  - `window.__severgrow.lessonMove()` gives the move the light points at.

### Where things are

| What | File |
|---|---|
| Lesson data (positions, goals, opponent script, finish) + beats + suggested move | `web/src/lessons/lessons.ts` |
| Authored openings | `web/src/lessons/authored.ts` |
| Scripted opponent | `web/src/lessons/opponent.ts` |
| Wrong-tap answers | `web/src/lessons/answer.ts` |
| Light → selectors/shape; DOM tap → lesson tap | `web/src/lessons/lesson-view.ts` |
| Lesson save meta + versioning | `web/src/lessons/lesson-save.ts` |
| Wiring (search `levels 1-10: the lessons`, `lessonActive`, `renderLessonGuide`, `lessonCapture`) | `web/src/main.ts` |
| Focus layer shapes (`lesson` option, `hexOutline`, `cardOutline`) | `web/src/player/glass-surface.ts` |
| Words | `src/strings.ts` → `LESSON` |
| Scripts (must match the code) | `docs/LESSON-SCRIPTS.md` |
| /3 compose step | `scripts/compose-lessons3.mjs` + `.github/workflows/futasaku04-preview.yml` |

**Changing a lesson:** keep it one idea, and author the position so the moment must happen.
1. Bump its `version`.
2. Update `LESSON-SCRIPTS.md`.
3. Re-run `lessons.test.ts`. It checks turn counts, the win, "no accidental Bloom in L1-4", and "a lit Grow never uses a card the game opens as a Bloom".
4. Re-run the browser e2e.

The authored hands and decks were found by small search scripts. Recreate one if a test breaks after a data change.

### What still has to be done

**1. Keep /3 alive across other deploys — needs owner approval.** Every publish recomposes the whole site, so a push to `futa0.5-online` or `futa0.5-onboarding` without the /3 step removes /3.
- One-file commits are ready **locally only** (not pushed), each changing only the workflow file:
  - branch `futa0.5-online-add-3-preview` (`a050004`)
  - branch `futa0.5-onboarding-add-3-preview` (`9090e93`)
- If those local branches are gone, re-create them: apply this branch's diff of `.github/workflows/futasaku04-preview.yml` to each branch. Their workflow file was identical to this branch's before the change.
- `futa0.4` has an older workflow with no /2 step either. A push there already drops /2. It was left alone; ask the owner.

**2. Levels 11-20 hint fading (brief §9) — not done.** Levels 11+ are unchanged and have no lesson guidance; only the LED tap answers apply. Wanted:
- 11-15: contextual hints only for a new situation or repeated confusion.
- 16-20: hints only after long idle, repeated invalid actions, or an explicit request.
- Also check the 10→11 and 20→21 difficulty jumps (bigger board plus the opponent; don't combine new things).

**3. Small phones.**
- At 320×568 the lesson map's hexes are about 34 px; at 360×640 about 43 px. The glass plus the cockpit leave a narrow band.
- Options: a more compact glass on short screens (drop the "LEVEL n" kicker, tighter padding), or another layout idea. Keep the cockpit structure (owner rule).

**4. The pointer on fanned cards.** On phones the pointer often has no room beside the fan (`pointerPose` in `glass-surface.ts` refuses positions overlapping the hand). The card glow shows, but the pointer doesn't.

**5. Show me** only nudges the light and bobs harder. Consider whether it should demonstrate more (it must never play the move for the player without asking).

**6. Level 10 timing.** Its hints are idle-only by design, so it is slow for the automated tapper (about 4 min). Check with real players that it isn't confusing.

**7. Four review passes (brief §14):**
- Done: functional, visual, regression.
- The "clueless beginner" pass was only the random-tap e2e. Do a real pass, and ideally test with new players.

**8. iPhone checks:** Safari and the Home Screen app on a real device. Steps are in the owner report below.

### Going live (beyond the /3 preview) — what must happen first

**Seeds for levels 1-10.**
- The server verifier (`server/src/seeds/verify.ts`) replays a proof from `campaignOpening(level)` against the real bot. It cannot replay an authored lesson against the scripted opponent.
- Paying levels 1-10 needs:
  - a server change: verify from the lesson opening, with the scripted opponent as a pure function the server can run;
  - an Edge deploy;
  - keeping already-earned proofs payable (`src/campaign/frozen.ts` `ALTERNATE_OPENINGS`).
- Until then payouts stay off in /3, by owner decision. Note: the level-10 chapter bonus (50) is also not paid in /3.
- Levels 11+ are unaffected; `server/tests/seeds-verify.test.ts` proves a level-11 win still verifies.

**Storage on the root.**
- /3 uses its own prefix. Shipping at the root means the root's existing level 1-10 progress and saves meet the lessons.
- Completed levels stay completed. Unfinished level 1-10 saves restart, because there is no lesson meta or the version differs.
- Decide whether that's acceptable.

**The rest:** merging into `futa0.5-online` needs the owner's approval, then real-player testing. The Edge bundle (`supabase/functions/duel/bundle.ts`) was rebuilt from source here but never deployed.

### Why the small-map teaching was reverted on the online line (owner asked)

- `1a16077` on `futa0.5-online` only says "This reverts 59811c2".
- The reason is in the commits around it. The same day, the owner decided the root keeps the released game and the teaching work moves to `/2/` (`4334a1f`). So it was taken off the root line and published at /2.
- Later, on the /2 line, `ef0b41a` measured that on the 19-hex map a corner home has only 3 sides. One Bloom can surround it, so levels ended in 3-4 turns, and /2 moved levels 4-10 back to 37 hexes.
- /3 handles that by authoring every position and never lighting an early surround outside level 6. The tests check it.

### Other plans and ideas from the owner (not started)

- Retire the old Tutorial later. The levels no longer depend on it: shared pieces are `src/campaign/small-board.ts` and `web/src/player/glass-surface.ts`.
- Delete the Boobsie easter egg later (keep it for now).
- The header will become menu + logo only (another agent). Never put guidance there.

---

**Branch map.** The locked **0.4** product line lands on **`futa0.4`**. The **0.5 online** line
(online duels + live duels, shipped as `/futa0.5/`) lands on **`futa0.5-online`** — start at
[`docs/ONLINE.md`](docs/ONLINE.md). Never deploy `main` or `dev` for this work.

```sh
npm ci
npm run check
npm run web:build                    # CHANNEL=futa04 by default
CHANNEL=futa04 npm run web:dev
CHANNEL=futa-test npm run web:build  # experiment copy → /futa-test/
CHANNEL=futa05 npm run web:build     # /futa0.5/ preview: online duels + live duels
```

Live preview: `https://severgrow.github.io/severgrow-01/futa0.5/` (the merged FUTASAKU 0.5 build:
online duels, the polish pass, and live duels) · `…/futa0.4/` (the locked product build)  
Pre-cleanup archive branch: `archive/futa0.4-before-cleanup`

| Area | Home |
| --- | --- |
| Rules, actions, state, replay | `src/engine/` |
| Computer player | `src/bots/` |
| Browser wiring and input | `web/src/main.ts`, `web/src/logic/` |
| Futa04 presentation | `web/src/player/` |
| Board, cards, effects, audio | `web/src/ui/` |
| Save / settings / channels | `web/src/logic/persist.ts`, `web/src/channel.ts` |
| Online duels + live duels (0.5) | `web/src/online/`, `server/` (see [`docs/ONLINE.md`](docs/ONLINE.md); backend [`docs/BACKEND.md`](docs/BACKEND.md)) |
| Spec | `docs/SPEC.md` |
| Checks | `tests/`, `web/tests/`, `web/e2e/` |

Player names: **Grow**, **Bomb**, **Blast**, **Bloom**. Engine ids `Sprout` / `PlayFruit` / `MegaBomb` remain for saves and tests.
