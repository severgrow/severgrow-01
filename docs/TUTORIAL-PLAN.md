# FUTASAKU tutorial "Pro" overhaul — plan

> **Current structure (tutorial v3, 2026-10).** `TUTORIAL_CORE` and `TUTORIAL_EXTRAS` in
> `web/src/logic/tutorial-script.ts`:
> - **Full tutorial** (16 steps to the free turn, then a 3-button tour): your home, each turn, Draw, Grow
>   (the card number is the tile strength), rock and gold (points), » to go on to Throw (also skips Grow),
>   Throw, their turn; then the other uses of Grow: Strengthen, take over, Bomb; then Bloom (examples on a
>   glass panel) with a Throw pile Draw, and Blast as Bloom's twin; then close the ring to win, a free turn
>   with one line per step, and the Undo, Bulb and Display buttons.
> - **Menu:** New game, How to, Settings (Continue when there is a saved game). How to unfolds Full tutorial
>   and the separate lessons: Strengthen, Bomb & Blast, Bloom, Skip & last round, Buttons.
> - Board changes in the tutorial fade through black (160ms in, 240ms out).
> - One word list in all tutorial copy: Draw pile, Throw pile, Grow, Bloom, Bomb, Blast, points. No tile colours.
> - Saves from tutorial v2 restart their chapter.
>
> The plan below is the earlier overhaul, kept for the record.

Test channel only (`CHANNEL=futa-test`). Branch `futa0.4`. No engine or rule changes. The tutorial only arranges positions and card order; all rules still come from `apply` / `legalActions`.

## Files read before changing anything

| File | Role |
| --- | --- |
| `CLAUDE.md` | Branch, checks, engine purity |
| `docs/SPEC.md` | Rules source of truth (Grow / Bloom / Bomb / Blast / win) |
| `docs/DECISIONS.md` | UX and naming decisions |
| `docs/UX.md` | Look and feel |
| `docs/WAITLIST.md` | Test-only change log |
| `docs/RELEASES.md` | Channel layout |
| `src/strings.ts` | Player-facing copy (`WELCOME`, `BLOOM`, `HOME`, …) |
| `src/playtest/coach.ts` | Coach tips / `COACH_STEPS` / `TUTORIAL_SEED` |
| `web/src/logic/tutorial-script.ts` | Current 10 chapters, specs, gating |
| `web/src/logic/tips.ts` | First-time tip sheets |
| `web/src/player/glass-surface.ts` | Match Intel glass + tutorial focus layer |
| `web/src/main.ts` | `renderTutorial` / `startTutorial` / `advanceTutorialChapter` / `tutorialAfterPlay` |
| Tests that mention the tutorial (must stay green or be updated honestly): | |
| `web/tests/tutorial-intel.test.ts` | Authored chapters + Match Intel |
| `web/tests/drag.test.ts` | Drag uses tutorial chapter positions |
| `web/e2e/futa04-tutorial-intel.ts` | Full tutorial + intel browser pass |
| `web/e2e/smoke.ts` | Menu / tutorial smoke |
| `web/e2e/overhaul.ts` | Overhaul suite opens tutorial |
| `web/e2e/futa04-quality.ts` | Quality / arrow follow |
| `web/e2e/futa04-information.ts` | Information suite uses tutorial |
| `web/e2e/futa04-living-display.ts` | Listed; no tutorial string today |
| `web/e2e/typography-audit.ts` | Listed; no tutorial string today |

## Current chapters (10)

| # | Lesson ids | What it teaches |
| --- | --- | --- |
| 1 | draw, grow, connection, throw, opponent | First turn: Draw → Grow → Throw, watch them |
| 2 | strength, strength-done, strength-throw | Strengthen a tile with a higher card |
| 3 | skip, skip-throw | Skip Grow |
| 4 | cut, cut-after, cut-throw | Cut a link so tiles wither |
| 5 | bloom, bloom-after, bloom-throw | Three connected cards bloom |
| 6 | bomb, bomb-after, bomb-throw | One Bomb removes an enemy tile |
| 7 | mega, mega-after, mega-throw | Two Bombs → Blast |
| 8 | discard-draw, discard-bloom, discard-after, discard-throw | Throw pile finishes a bloom |
| 9 | final, final-throw, final-opponent | Fair last turn when the deck is empty |
| 10 | free | Free turn, then done |

## What is wrong today

1. **Spotlight** is a plain axis-aligned rectangle (box + 5px) around hexes and rotated fan cards — crooked; "throw one" lights every card.
2. **Tracking** only repositions on window resize — lags behind camera moves, card lifts, tile pops.
3. **Arrow** is a thin 1.5px line with a 4px head; fades from chapter 5; gone from chapter 9.
4. **Caption** sits in the bottom dock far from the target, 13px, letter-spaced capitals.
5. **Missing teaching:** Bloom (set vs run, 3–6) never really explained; buttons never explained; winning (surround home, most tiles, 30-turn limit) never taught.
6. **Copy:** commands without reasons; blocked taps say nothing.
7. **Wrong numbers:** welcome says "15 moves" (really 10 chapters); `BLOOM.howto` / How to play say "three or four" (rule is 3–6).
8. **No chapter menu, skip, or replay** — only Continue tutorial and restart.

## New chapter list (13)

| # | Id | Source | Teaching |
| --- | --- | --- | --- |
| 1 | `goal` | **NEW** | Homes: your tree, their volcano, surround to win |
| 2 | `turn` | old ch.1 | Draw / Grow / Throw / their turn (+ three-step icons) |
| 3 | `bloom` | **NEW** merge old bloom | Explainer (set + run + counter-examples) → play set → play run |
| 4 | `strengthen` | old ch.2 | Higher card strengthens |
| 5 | `cut` | old ch.4 | Break a link; watch wither + score |
| 6 | `skip` | old ch.3 | Skip Grow (short) |
| 7 | `buttons` | **NEW** | What each control is (skippable) |
| 8 | `bomb` | old ch.6 | Bomb removes enemy tile; needs your touch |
| 9 | `blast` | old ch.7 | Two Bombs → Blast; homes safe; free Grow |
| 10 | `throw-pile` | old ch.8 | Throw pile can finish a bloom |
| 11 | `win` | **NEW** | How you win + scripted Strangle finish |
| 12 | `final` | old ch.9 | Fair last turn |
| 13 | `free` | old ch.10 | Unguided turn + recap + Play / Replay |

## Design (one glass window + focus layer)

- All tutorial text and buttons live in **one** `#futasaku-glass` Match Intel-style window (progress dots, instruction ≤6 words, why ≤12 words, Show me / Skip / Chapters).
- Focus layer: one soft glow shaped like the real target, chunky pointer every chapter, `requestAnimationFrame` tracking with lerp, dim does not block taps.
- Feedback: praise burst on correct tap; shake + gentle hint on wrong; idle 6s → harder bob + Show me.
- Bloom helper bracket also in the real game (settings toggle, legal blooms only).
- Progress migration: old `{chapter,step}` maps by lesson id to the start of the matching new chapter; garbage restarts safely. Keep `severgrow.*` keys.

## Phases

1. This plan + failing tests for the new behaviour.
2. Focus layer rebuild.
3. Glass window + strings.
4. Feedback (rewards, mistakes, idle).
5. Chapters, menu, skip, replay, migration.
6. Bloom hint + text fixes.
7. Full browser run, screenshots, self-review, WAITLIST entry.

## Out of scope

Rule or engine changes, mascot, new art files, world map, accounts, locked build, renaming the game.
