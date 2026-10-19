# Campaign mode

Campaign mode is the primary **offline** experience: 50 planned levels, played in chapters, against
the bots that already exist. **Chapter I (levels 1-10) is built and playable end to end.** Classic vs
AI keeps the old difficulty picker, unchanged, as a secondary menu entry.

The campaign invents nothing. There is no new card type, currency, ability, XP, star or life. A level
is *data*: a fixed seed, an existing bot level, and existing `RulesConfig` overrides — including a
hand-authored board. The campaign is about mastering the game that is already there.

- Level data: `src/campaign/levels.ts`
- Validation: `src/campaign/validate.ts`
- Progress + the campaign's own save: `src/campaign/progress.ts`
- The web seam (the only production caller that passes terrain): `web/src/logic/campaign.ts`
- Player-facing wording: `src/strings.ts` → `CAMPAIGN` (level *names* are level data, exactly as the
  tutorial's lesson lines live in `web/src/logic/tutorial-script.ts`)
- Balance tool: `src/sim/campaign-balance.ts` → `npm run campaign:balance`

## Levels 1-10 are the tutorial (the /3/ line, 2026-10-18)

**This is the current design** on the `futa0.5-onboarding-3` branch, published for testing at
**https://www.futasaku.com/3/**. The root and `/2/` are unchanged. The `/2/` "goal-first" onboarding
described further down ("The 2026-10-17 onboarding pass") is **not current** for this line: it told
players "surround their home to win", while most real games end when the Draw pile runs out. /3
teaches that first.

**What it is.** Levels 1-10 are ten short authored lessons, one idea each, every one ending in a real
win. Level 11 is the first 37-hex level and has no lesson. Level ids, Seeds rules and chapter bonuses
are unchanged. The full script of each lesson (beats, words, wrong-tap answers, finish lines) is in
**[LESSON-SCRIPTS.md](LESSON-SCRIPTS.md)**. It must match the code.

| Level | Teaches | Ends |
|---|---|---|
| 1 | Draw, Grow, Throw; most points when the Draw pile runs out wins | on points |
| 2 | tile numbers: Strengthen, then take a weaker tile | on points |
| 3 | rocks block; gold counts double | on points (gold decides) |
| 4 | cutting a link: cut-off tiles wither | on points |
| 5 | Bloom (same number, or counting up) | on points |
| 6 | knock-out: surround their home | by surround |
| 7 | Bomb | on points |
| 8 | Blast (two Bombs) and its free Grow | on points |
| 9 | the Throw pile can finish a Bloom; skip the Grow | on points |
| 10 | a normal game against the gentlest bot | on points (or surround) |

**How a lesson is authored** (`web/src/lessons/`):

- `authored.ts` builds the exact opening from real engine cards on the 19-hex map:
  - terrain, tiles already grown;
  - both hands, the Draw pile order and the Throw pile.
  - Cards the lesson does not name are out of play. That is how a lesson gets a short Draw pile (its clock) **without any rule change**.
- `opponent.ts` is the gentle scripted opponent:
  - legal moves only;
  - grows only on its script's turns;
  - never takes your home's last open side;
  - always draws from the Draw pile, so the authored Throw pile stays as set.
  - Level 10 uses the existing level-1 bot.
- `lessons.ts` holds the lesson data. It derives each beat (what is lit, the instruction and reason) from the **live** game state, never from a step counter, so any legal alternative keeps working.
- `answer.ts` answers a wrong tap from the engine's own reasons (`claimBlocker`, `fruitTargetBlocker`, `legalActions`, the Bloom shapes).

**Guidance by level.**

| Levels | Guidance |
|---|---|
| 1-3 | Locked: only the lit thing reacts. Every other tap is answered in the glass or the LED, with a small ring at the spot. |
| 4-9 | Every legal move is played; the light adapts. The one-word hint stays on screen. |
| 10 | No guidance unless idle for 6 s (or Show me); one LAST TURN beat. |
| 11-30 | The existing levels, unchanged. No lesson. |

- **No text on the map.** In every mode the old on-board "tap why" plate now goes to the LED; the map only gets a ring.
- **Hints off.** Settings → Step guidance off turns the light and the glass off in the levels too.

**Storage and versioning.** The root, `/2/` and `/3/` share one origin:

- `/3/` uses its own storage prefix, `futa05-3:` (`web/src/channel.ts`, by path), and its own service-worker cache, `futa05lessons3-`. Nothing in /3 reads or writes the root's or /2's progress, saves or hints.
- Each lesson has a `version` (currently **2**). The seen explanations and that version are saved beside the level's match (`severgrow.lesson.meta.v1`). A saved match from another lesson version restarts the level cleanly.
- Per-action mastery (Draw / Grow / Throw / Cut / Take over / Bloom / Bomb / Blast / Strengthen / Surround) is saved in `severgrow.lesson.mastery.v1`, keyed to that lesson version. A version bump starts the fade cleanly.
- **v3 reset (2026-10-19):** the onboarding polish changed lesson versions and several authored boards, so progress and the unfinished match moved to `.v3`. Old `.v2` (and `.v1`) keys stay in the browser, unread; every player starts the campaign at level 1 again. Completed levels therefore stay completed only within the current `.v3` record.

**Seeds.** Levels 1-10 pay **no Seeds in /3** and their finish card has no Seeds line:

- The server's verifier replays a proof from `campaignOpening(level)` against the real bot. An authored lesson against the scripted opponent cannot be replayed that way without a server change, which this line does not make.
- Levels 11+ are untouched: same openings, same proofs, same payouts.
- Clearing 1-10 locally only unlocks the next level on the device. Nothing in a level-11+ proof depends on it.

**Engine rules: unchanged.** No rule, scoring, card-count or legal-move change. Draw/Grow/Throw, Bloom, Bomb, Blast and the strangle are the engine's own; the tests check this.

**How to add or change a lesson without bringing confusion back:**

1. One idea per level.
2. Author the position so the moment *must* happen (a stacked Draw pile, a hand that holds the cards). If a lesson cannot happen naturally, change the position, never a rule.
3. Words go in the `LESSON` section of `src/strings.ts`: instruction ≤ 6 words, reason fits two lines on the smallest phone (owner, 2026-10-19), never "tree" (it is your home), never "take over", one word list (Draw pile, Throw pile, Grow, Bloom, Bomb, Blast, points), never "set"/"run", no tile colours.
4. Bump the lesson's `version`.
5. Update LESSON-SCRIPTS.md.
6. Run `web/tests/lessons.test.ts`, which has the three automated players, and the browser run `web/e2e/lessons-3.ts`.

**How to test the beginner experience:**

- Automated:
  - `npx vitest run web/tests/lessons.test.ts web/tests/lesson-*.test.ts`;
  - then build the futa05 channel and run `npx tsx web/e2e/lessons-3.ts`: the lit-only tapper through levels 1-10, random taps, refresh, hints off, level 11.
- These prove the levels can always be finished. They do **not** prove a beginner understands them; that needs real new players.

**The old Tutorial** (menu entry unchanged) is **still available, to be retired later**. The levels do not depend on it:

- the shared small-map radius lives in `src/campaign/small-board.ts`;
- the glass window and focus layer live in `web/src/player/glass-surface.ts`;
- the lesson's title and its one action (NEXT) live in the game's top row
  (`web/src/lessons/lesson-bar.ts`, `#lesson-hud`), so the window has no head and no `LEVEL n`
  kicker in levels 1-10. Every other screen keeps its own chrome.

## The level schema

```ts
type CampaignLevel = {
  id: string;          // stable, never reused: 'c1-07'
  number: number;      // 1-based campaign position = the unlock order
  chapter: number;     // 1-based
  name: string;        // player-facing
  intent: string;      // one line for the docs and the balance report (shown nowhere in game)
  seed: number;        // fixed: the same level always deals the same hands, terrain and first seat
  botLevel: Level;     // the existing bot (1-9)
  config: Partial<RulesConfig>;  // engine overrides; `config.board` is the hand-authored board
};
```

## How to add a level

One object in `CAMPAIGN_LEVELS` (`src/campaign/levels.ts`), using the local `board(rock, gold)` helper
for an authored board. Then:

1. `npx vitest run tests/campaign` — the validation test plays every level's board through
   `validateCampaign()` and asserts the campaign's shape (unique, contiguous ids/numbers).
2. `npm run campaign:balance -- --games=20` — check the new level is not lop-sided or dull (below).
3. If it opens a new chapter, add its title/subtitle to `CAMPAIGN.chapters` in `src/strings.ts`.

No UI change is needed: the campaign screen is drawn from the level data, so further levels need no
restructuring.

**As built:** Chapters I-VII — levels 1-70 — the campaign is complete. Every board is hand-authored
(`config.board`); `boardRadius` is 2 (the small map) for levels 1-3 and 3 for the rest, so only the
three discovery levels use the small map and every real match runs on the full hexagon. Levels 31-70
were built one chapter at a time; the plan and its measurements are in `docs/CAMPAIGN-31-70.md`.

## Validation rules

`validateCampaign()` runs in the tests and fails LOUDLY, naming the level and the problem:

- the bot level exists and the seed is a non-negative safe integer;
- `resolveConfig` accepts the config — the engine's own authority (`INVALID_BOARD`,
  `TERRAIN_INFEASIBLE`, `ROOT_OFF_BOARD`, unknown keys, bad numbers). A `ConfigError` is wrapped in a
  `CampaignError` that names the level, never swallowed;
- an authored board is legal: `cells` unique, `rock`/`gold` are a subset of `cells`, no hex is both,
  the two homes differ, homes are cells and never terrain;
- an authored board is the **full hexagon of its declared radius** (37 hexes at radius 3, the
  tutorial's 19 at radius 2), so `boardRadius` and `board.cells` can never drift apart;
- the board is **playable**: enough open hexes (20 on the product board; on a smaller board, the
  board size minus four — a 19-hex map may lose at most four hexes to rock), every open hex reachable
  from *both* homes (no walled-off pocket), and each home has at least 3 open neighbours (so it
  cannot be strangled at once);
- no authored rock or gold sits inside a **root zone** (a home or a home's neighbour) — the same rule
  the generator obeys. `validateLevel` reports those hexes and the campaign tests assert none;
- ids are unique, numbers run 1..n, chapters are contiguous, and every chapter has levels.

`resolveConfig` alone checks that rock/gold are never on a home, and `rootZone` already protects both
roots and their neighbours in the generated terrain.

## Hand-authored boards

The generator (`generateTerrain`) places **point-symmetric pairs** only, so it can never make the
one-rock and three-rock boards the design asks for, nor a ridge, a chokepoint or a maze. Chapter I
therefore uses `config.board`, and the same route is open to every later chapter — Chapters II and
III are built entirely from authored boards for exactly this reason.

Notes when authoring:

- With `board` set, `rockCount` / `richCount` are ignored for terrain (the board carries its own).
  They stay at their defaults; `resolveConfig` still requires `rockCount` even and `richCount` odd.
- Keep stones off the home-to-home diagonal (the central routes) and outside both root zones unless
  the level is *meant* to squeeze a flank.
- Levels 1-3 play on the **tutorial's small map** (`config.boardRadius: TUTORIAL_BOARD_RADIUS`, a
  radius-2 hexagon of 19 hexes, imported from `web/src/logic/tutorial-script.ts` so there is one
  source of truth for that size). Levels 4-30 use the product radius 3 (37 hexes).

## Chapter I

`AI` = the existing bot level. `Rocks` = the authored rock count. `Gold` = authored rich hexes.
`Map` = the board radius (2 = the tutorial's small map, 19 hexes).

| Lv | Name | AI | Rocks | Gold | Map | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | First Seed | 1 | 0 | centre | 2 | Completely open, welcoming; the tutorial's own opening |
| 2 | New Growth | 1 | 0 | centre + inner pair | 2 | Reinforce the basics; a first taste of contested gold |
| 3 | Two Directions | 1 | 1 | centre + pair | 2 | One harmless edge rock |
| 4 | The Clearing | 2 | 0 | centre + pair | 2 | Connected territory: open ground, gold on one axis |
| 5 | Stone in the Grass | 2 | 2 | centre + pair | 2 | Tile numbers and strength: a mirrored pair to grow across |
| 6 | Branching Out | 3 | 1 | centre + pair | 2 | Defending connected territory: one stone splits the middle |
| 7 | First Obstacle | 3 | 2 | centre + pair (other axis) | 2 | Cutting a connection: a small cluster near a flank |
| 8 | The Open Field | 3 | 0 | centre + pair (other axis) | 2 | Fruit: an open field where the networks can touch early |
| 9 | Around the Stone | 4 | 3 | centre + pair (other axis) | 2 | Bloom: a short wall to paint around, room for three in a row |
| 10 | The First Grove | 4 | 3 | centre + pair | 2 | Chapter finale on the small map: every lesson so far |

Every level's rock count matches the design pack exactly; the bot (`AI`) column is the approved
difficulty ladder (see *The bot ladder* below), not the design pack's original suggestion. Two terrain
adjustments were made for legality, neither of which changed a level's intent: **level 9's rich pair moved from the `q` axis to
the `r` axis** (the design's three-hex wall sits on the `q` axis, so `-2,0` would have been both rock
and gold), and **level 3's single edge rock moved from `-3,0` to `-2,0`** when the level moved to the
radius-2 map (`-3,0` is not on that board).

### The 2026-10-17 onboarding pass (/2/ — not current for /3/)

**Where it ships:** this line is published at **https://www.futasaku.com/2/**, beside the released
game at the root (owner direction, 2026-10-17). The root keeps the pre-onboarding campaign; `/2/` is
where this work is played and iterated. A push to `futa0.5-onboarding` rebuilds `/2/` automatically —
the preview workflow checks this branch out, builds it and composes it into the Pages site. `/2/` is
never merged into the root build without an explicit decision.

Owner brief (2026-10-17): the Campaign is the game's tutorial, so the first ten levels teach on the
small map and Level 11 is where the board grows. Terrain-only change, plus the guidance work below.

#### How the first ten levels teach (2026-10-17, second pass)

The campaign borrows the **Tutorial's own top window** — the same panel, the same LED type, the same
pill that points at a control — rather than adding a second overlay. `logic/onboarding.ts` decides
what it says, from the live position only:

| Levels | Intensity | What the window does |
| --- | --- | --- |
| 1-2 | very high | **the objective first**: level 1 "THE GOAL — Surround their home to win. Tap the Draw pile."; level 2 "HOW TO WIN — Surround their home, or hold more ground." Then the turn: draw → pick a card → tap a lit tile → throw |
| 3 | very high | the turn, with "TWO WAYS" when more than one place works; guidance fades after the opening turns |
| 4-7 | medium | the level's new idea on the player's first acting turn (connected, strength, defend, cut), then silence |
| 8-10 | targeted | Fruit only when a Fruit card is playable, Bloom only when a Bloom is legal, gold once on the first turn |

**Why the objective needed its own step (beta feedback, 2026-10-17).** Testers said they could not
tell how to win or what the point was, even after playing: the only explanation lived in the Help
sheet, which nobody opens. Level 1 and level 2 now spend their opening draw on it — the decisive win
first, then both routes — while the window still points at the Draw pile, so knowing *why* never
hides *what to press*.

**The win is also taught where it is actionable.** Whenever one legal move would surround the
opponent's home, the window says **YOU CAN WIN — Surround their home now and it is over.** This is
the one line that makes a promise, so it is not re-derived by hand: the page plays each candidate
move on a copy of the state and asks the engine (`isStrangled`). That matters because a move does not
simply "fill" sides — a Bloom overgrows and severs, and can leave a hex empty; their own tiles around
their home do not count as blocked. `web/tests/win-moment.test.ts` proves the promise on every level
where it fires: it plays the offered move, finishes the turn, and requires a real strangle win.
(Nine of the ten guided levels produce the moment for a strong player; level 4 legitimately ends on
score instead.)

Supporting rules, all from the same pass:

- **The board shows the moves.** With nothing picked, every hex a card could grow on gets a quiet
  dashed ring (`.available`); the coach's suggested hex keeps its stronger ring. Picking a card turns
  them into the card's real targets, and the suggested one — when the picked card can actually use it —
  gets a soft pool of light under a heavier ring, so one tile is the obvious one to tap.
- **The interface reveals itself by level** (`html[data-onboard="1|2|3"]`): levels 1-3 quiet sort,
  replay and history; 4-7 bring sort back; 8-10 are the normal game. Nothing legal is ever removed.
- **No lottery** on a campaign level: the seed fixes who starts, so the player is in the game
  immediately. Classic and online keep the draw.
- **The player can switch it off**: Settings → Step guidance → Off silences the window
  (`severgrow-guide` in local storage), exactly as it does in the Tutorial.

Second clarity pass (2026-10-17, after the objective landed):

- The window carries a quiet **LEVEL n** line above the instruction, and says the same in its
  `aria-label`, so a player always knows where they are in the journey.
- The goal beat **points at the opponent's home** while it says "surround their home" — the word is
  useless without a referent. The Draw pile haloes itself at that step, so the next touch is still
  obvious.
- When the only thing left is to finish the turn, the window **points at the end-turn control**.
  In the throw phase it points at the **hand**, because the line says "tap a card twice"; once a card
  waits for its second tap the line becomes "tap the same card again".
- A dead tap is answered everywhere it can happen: a hex (rock, connection, wrong phase) *and* a card
  before the draw ("Draw a card first"), placed at the tapped thing.
- A round cockpit button with no action is invisible on the guided levels instead of blank — a
  control that looks live but does nothing is worse than an absent one.
- Winning a guided level ends with **what it taught** ("Draw · Grow · Throw", "Numbers are strength",
  "Three in a row: Bloom", …). A normal match's finish card is unchanged.

Tests: `web/tests/onboarding.test.ts` pins the curve and the silence; `web/e2e/onboarding.ts` drives
Level 1 on a 390×844 phone and a 1280×800 desktop (window content, level kicker, board padding, lit
hexes, quieted controls, no lottery); `web/e2e/campaign-levels.ts` plays 1-10 through the menu and
checks the recap after each win.

**Where the Fruit/Strengthen "first tip" went.** The dock tip stays inside the Help sheet, as it
always did: lifting it onto the game surface passed its own check but broke the smart-cockpit layout
suite in a way nobody could explain, so it was put back. The guided levels do not depend on it — Fruit
and Bloom are taught in the top window at the moment they can be played, and Strengthen is the level-5
lesson. The sheet's "Learn to play" page still carries the long explanations.

#### Played end to end, and what that exposed (2026-10-17)

`web/e2e/campaign-levels.ts` plays **levels 1-10 through the real menu**, one after another, with the
engine's own strongest chooser on the player's side: every level opens, every level finishes with a
win, the finish card offers "Next level", and **level 11 carries on the 37-hex board with no guidance**.
That is the whole onboarding journey, proved on the product channel and on `/2`.

Playing them found two things that a unit test cannot see:

1. **Guidance was keyed to match turn 1, but the opponent opens on levels 2, 4 and 8.** A lesson shown
   only on "turn 1 ACT" therefore never appeared on those levels. It is now keyed to the player's first
   acting turn (the first two match turns, since turns alternate strictly), and the opponent's opening
   move is captioned on levels 1-7 so an inert board is never a mystery.
2. **A strong player wins every small-board level by strangle, in 3-16 turns.** On the tutorial map the
   homes sit in corners with exactly three neighbours, and one Bloom places three tiles — so a single
   Bloom against the far home ends the match. Measured with a level-9 player: L5, L6 and L9 finish in
   3 turns; L8 in 4. None of this is exploitable by a beginner (a random player sees the Fruit lesson
   in 193/200 playouts and the Bloom lesson in 200/200), but it does mean the small board cannot carry
   a *strategic* match, and it is why level 8's Fruit lesson can be missed by a competent player: the
   game ends before the networks touch.

   This needs an owner decision before more tuning: keep 1-10 on the 19-hex map and accept short
   strangles, or return levels 4-10 to the 37-hex board (where the corner home has more neighbours) as
   the pre-onboarding build had. Rules are not changed either way — only the map each level plays on.

- **The board split is 1-3 small, 4-30 full.** The ten-level small-map experiment was reverted after
  playing it: on the 19-hex map a corner home has three neighbours and one Bloom places three tiles,
  so a single Bloom strangulates it (measured: L5, L6 and L9 in three turns, L8 in four). Levels 4-10
  are back on the 37-hex board, where they run 7-30 turns instead — and level 8's Fruit lesson now
  genuinely surfaces, because the networks have time to touch. Because `/2` and the root publish the
  same levels again, the temporary alternate-opening fallback was removed with it.
- **The first ten levels keep the game's existing guidance language**, and nothing new competes with
  it: the draw/throw piles halo at their step, playable cards are outlined in the hand, and a picked
  card lights its legal hexes on the board. The cockpit's LED still owns the turn's word (GROW!,
  THROW!, WAIT), so the board carries no second instruction plate.
- **An invalid tap answers where the finger landed** ("Blocked by rock", "Connect to your tree",
  "Draw a card first", "Pick a card", "Not this hex"). Every reason is read from the engine's own
  state — terrain, phase, legal actions — never a second rule book, and repeated taps on the same
  reason stay quiet for 4.5 s.
- **The in-play first-time tip stays in the Help sheet.** Lifting `#first-tip` onto the game surface
  passed its own check but broke the smart-cockpit layout suite, so it was put back; the guided levels
  teach Fruit and Bloom in the top window instead.

### The 2026-10-16 refinement

Two changes, both owner direction, both terrain-only:

- **Gold in every level (levels 2, 4, 8 changed).** Those three levels previously carried only the
  centre gold; each now carries one mirrored gold pair as well, on an axis no rock occupies. Gold is
  the campaign's second difficulty lever — a rich hex scores 2 instead of 1, so both players are
  pulled toward the same fights — and the first pass barely used it. Level 1 is deliberately left with
  a single gold centre: it is the first board a player ever sees. No rock count, level name, seed or
  bot level changed.
- **Levels 1-3 moved onto the tutorial's small map** (radius 2 → 19 hexes, `TUTORIAL_BOARD_RADIUS`).  They are the first three levels ever and the tutorial's own ground, so the opening chapter stays
  small, quick and legible. A smaller board is *less* forgiving in one respect (fewer places to grow)
  and *more* forgiving in another (the two homes are closer, the whole map is visible at once), so the
  level 3 rock was re-placed and every board re-validated; the boards keep 19, 19 and 18 open hexes of
  19. Levels 4-10 later joined them (2026-10-17, above); levels 11-30 stay on the product hexagon.

## Chapter II — Broken Ground (levels 11-20)

Theme: **learn to navigate.** Rocks create choices, not walls. Every board keeps a wide open middle or
a credible side route, so Bloom and networks stay meaningful; the step up from Chapter I is the
terrain the player has to read and the better bots behind it.

| Lv | Name | AI | Rocks | Gold | Open hexes | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | Pebble Trail | 4 | 2 | 3 | 35 | A mirrored pebble pair beside the trail; still wide open |
| 12 | Split Meadow | 5 | 3 | 3 | 34 | A short wall across the centre; two lanes to pick |
| 13 | The Detour | 5 | 4 | 3 | 33 | A four-hex arc to route around |
| 14 | Open Horizon | 5 | 1 | 3 | 36 | Breathing space: one lone stone, a clearly better bot |
| 15 | Twin Stones | 6 | 4 | 3 | 33 | Twin wings plus a central pair: two threats at once |
| 16 | Broken Crossing | 6 | 4 | 3 | 33 | A broken wall with two crossings |
| 17 | The Long Way | 6 | 5 | 3 | 32 | Both inner lanes close early; go the long way |
| 18 | Quiet Clearing | 7 | 2 | 3 | 35 | Breathing space: fewer stones, a sharper bot |
| 19 | Stone Garden | 7 | 5 | 3 | 32 | Five scattered stones, five small choices |
| 20 | The Broken Grove | 7 | 5 | 5 | 32 | Chapter finale: bot 7 and five gold |

## Chapter III — Narrow Paths (levels 21-30)

Theme: **fight for space.** Contested hexes and corridors — but no level leaves a single hex that
decides the game: every wall here has at least two openings, and a defensive route exists alongside
the attack, so the board narrows the choice rather than dictating it.

| Lv | Name | AI | Rocks | Gold | Open hexes | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 21 | The Passage | 8 | 4 | 3 | 33 | Two offset walls leave one diagonal passage |
| 22 | Forked Path | 8 | 5 | 3 | 32 | Choose a fork; the wings reopen behind it |
| 23 | Central Ground | 8 | 4 | 3 | 33 | The centre is a fortress with two doors |
| 24 | The Side Route | 8 | 5 | 3 | 32 | A long ridge; the short way is walled, the side route is not |
| 25 | The Bottleneck | 9 | 6 | 3 | 31 | Two blobs with a narrow neck between them |
| 26 | Four Corners | 9 | 4 | 3 | 33 | The four outer corners are spoken for |
| 27 | Split Decision | 9 | 6 | 3 | 31 | One split, two choices, no time to dither |
| 28 | Open Conflict | 9 | 2 | 3 | 35 | Breathing space with the sharpest bot in the campaign |
| 29 | The Crossing | 9 | 6 | 5 | 31 | Cross at the centre or round the ends; gold on both |
| 30 | Heart of Stone | 9 | 6 | 3 | 31 | The finale: a stone heart round the gold centre |

Both chapters are built **entirely from authored boards** (`config.board`): the generator places
point-symmetric pairs only, so it cannot make a fork, a corridor or a ridge. Rock counts match the
design pack exactly; the bots come from the approved difficulty ladder (*The bot ladder*, below).
**Gold is used as the second difficulty lever**: two boundaries carry a
second rich pair — level 20 and the level 29 crossing, five gold each — while levels 2 and 16 put
their pair right beside the centre and levels 8 and 23 put it on the wings, both of which pull the two
players toward the same fights. The curve is deliberately not "one more rock each time": 14, 18 and 28
are the breathing-space levels, each more open than its neighbours but against a stronger bot.

## Chapter IV — Hollow Ground (levels 31-40)

The teaching chapters (1-30) use the bot ladder to raise difficulty, and it tops out at 9. There is no
stronger AI, so **31-70 put the difficulty in the board**. Rules are unchanged — same maxRank 9, one
sprout, strengthen and expanded Bloom on, four Fruit cards — and only terrain, gold and the seed vary.

Chapter IV's question: *can you read a large shape and find the route that still exists?* Terrain
pressure rises from 7 to 15 (rocks + gold) and is authored in named shapes rather than scattered stones.

| Lv | Name | Bot | Rocks | Gold | Shape | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 31 | First Light | **8** | 4 | 3 | shoulders | gold slot through the middle; soft re-entry after 30 |
| 32 | The Knot | 9 | 4 | 3 | pips | two diagonal pairs; read which lanes survive |
| 33 | Outliers | 9 | 6 | 3 | outliers | corners taken, centre open |
| 34 | Crosswinds | 9 | 6 | 5 | cross | an X of lanes, gold down the arms |
| 35 | The Gate | 9 | 6 | 3 | gate | two wide crossings, one diagonal |
| 36 | Sparrow Stones | 9 | 8 | 5 | scatter | eight single stones, every hex a choice |
| 37 | Twin Anvils | 9 | 8 | 3 | anvils | two blocks; route around, not through |
| 38 | Gold Under Grass | **8** | 4 | 7 | pasture | gold almost everywhere; fight for value |
| 39 | Gated Ring | 9 | 8 | 5 | ring | the centre is gated, not sealed |
| 40 | Hollow Crown | 9 | 10 | 5 | crown | dense ring, gold spine; chapter finale |

Every board is **point-symmetric** (mirror `q,r → -q,-r`), so both seats get the same ground. Mirror
symmetry is also why rock counts are even and gold counts odd: gold is the centre plus pairs.

**The bot rule changes from 31 on.** Bot 9 everywhere except deliberate **breathers**, flagged in the
data (`breather: true`) so the choice is reviewed rather than an invisible curve: 31 (re-entry after
the level-30 finale) and 38 (the gold-heavy breather). The tests allow bot 8 only on a flagged
breather, never twice in a row, and never on more than a quarter of the extension. The 1-30 ladder
keeps its original "never decreases" rule, unchanged.

**Two terrains, two jobs.** Rock takes space; gold creates value. A chapter leans on one, which is
what makes IV (rock-led), V (planned: gold-led), VI (rock-heavy, gold-light) and VII (both) feel
different rather than like the same board with more stones.

Balance evidence for this chapter (24 deals per level plus a versus-reference read) is in the commit
that added it; the seat split is re-measured over 60 deals per level before 41-50 are authored.

## Chapter V — Gold Country (levels 41-50)

Where chapter IV takes space away, this one hands out **value**. Stone stays light (2-8) and gold
carries 7-9, so the question changes from *"where can I go?"* to *"what is it worth?"* Every board
still carries the centre gold, as every level from 2 on does.

| Lv | Name | Bot | Rocks | Gold | Shape | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 41 | Gold Seam | 9 | 2 | 9 | seam | five gold down the middle, gold on both wings |
| 42 | The Rush | 9 | 2 | 9 | spread | gold across both wings; the race starts at turn one |
| 43 | Prospector | 9 | 6 | 7 | scatter | scattered stone, and less gold than its neighbours |
| 44 | Vein | 9 | 4 | 9 | vein | gold running toward both homes, gated on the other axis |
| 45 | Two Claims | 9 | 6 | 7 | wings | gold on the wings, stone gates on the spine |
| 46 | Open Ledger | **8** | 2 | 9 | open | almost nothing on the board; pure play (breather) |
| 47 | The Mint | 9 | 6 | 9 | ring | a gold core ringed by stone, with doors on the axes |
| 48 | Paydirt | 9 | 6 | 9 | middle | gold on the wings, stone across the middle |
| 49 | Gold Line | 9 | 8 | 9 | alternate | gold alternating with stone along the long axis |
| 50 | Mother Lode | 9 | 8 | 9 | edges | gold everywhere, stone round the edges |

The chapter deliberately varies **which** resource is scarce rather than only how much is on the
board: 43 and 45 cut gold to seven and add stone, so "more gold" is not simply the same as "later".
A test pins that every chapter V board carries more gold than stone, so a later edit cannot quietly
turn it into another rock chapter.
Pressure still climbs (11, 11, 13, 13, 13, 11, 15, 15, 17, 17), and the one dip is the declared
breather at 46.

### Gold is a different kind of difficulty

Rock removes options; gold adds a reason to take a risk. Two consequences worth knowing:

- **Games can be shorter** on a gold-heavy board: a rich hex is worth 2, so the score race resolves
  sooner and a player who over-extends for value can be cut off while doing it.
- **The finish mix shifts.** Chapter IV was mostly score (deck exhaustion) with a strangle in about
  one game in eight; a gold-led chapter should show more strangles, because both players are pulled
  into the same contested ground.

### Chapter V — measured, not assumed

60 alternate deals per level, the level's bot in both seats, the level's own board:

| Lv | seat 0 / seat 1 | start wins | avg turns | finishes | flags |
| --- | --- | --- | --- | --- | --- |
| 41 Gold Seam | 28 / 32 | 34 | 18.8 | score 53, strangle 7 | — |
| 42 The Rush | 34 / 26 | 28 | 19.5 | score 55, strangle 5 | — |
| 43 Prospector | 32 / 28 | 31 | 19.1 | score 50, strangle 10 | — |
| 44 Vein | 30 / 30 | 27 | 18.5 | score 52, strangle 8 | — |
| 45 Two Claims | 30 / 30 | 19 | 18.9 | score 51, strangle 9 | — |
| 46 Open Ledger | 27 / 33 | 29 | 20.7 | score 56, strangle 4 | — |
| 47 The Mint | 32 / 27 | 24 | 19.6 | score 60, strangle 0 | — |
| 48 Paydirt | 25 / 35 | 28 | 19.5 | score 53, strangle 7 | — |
| 49 Gold Line | 23 / 37 | 24 | 19.2 | score 53, strangle 7 | SKEW 23% (seed, see below) |
| 50 Mother Lode | 26 / 33 | 24 | 20.0 | score 54, strangle 6 | — |

Nine of the ten are inside noise. Level 49 was flagged at 23%, so it was re-measured over **eight
independent 60-deal sweeps** (two seed steps, four seed starts): 28/32, 33/27, 26/34, 31/29, 28/32,
33/27, and the flagged 23/37 — i.e. the layout is even and one deal series was unlucky. Because the
seed only chooses the deal, level 49 now ships with seed **96249**, whose series reads 33/27 (10%),
so the balance tool does not raise a false alarm. The board itself is unchanged.

Two things this chapter does differently from chapter IV:

- **Strangles are more common, as intended** — 5-10 per 60 here against roughly 7-8 in chapter IV —
  because a richer board pulls both players onto the same contested hexes.
- **The Mint (47) never strangles at all** (60 of 60 score games): its stone ring plus gold core is
  defensible from either side, so it is a pure conversion board. Worth keeping as the chapter's
  "no cheap finish" level.

## Chapter VI — The Long Way (levels 51-60)

Chapter V handed out value; this one takes the **straight line** away. Stone is heavy (6-14) and gold
scarce (3-7), and it sits where the route slows down, so the chapter is about patience: the short path
is walled and the long one is safe.

| Lv | Name | Bot | Rocks | Gold | Shape | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 51 | Switchback | 9 | 8 | 5 | S route | the direct line is walled, the flanks are not |
| 52 | Corridor | 9 | 10 | 5 | lane | one clear lane between two walls |
| 53 | The S-Bend | 9 | 10 | 5 | long S | the route reverses twice |
| 54 | Double Pass | 9 | 12 | 5 | two passes | pick one and commit |
| 55 | Halcyon | **8** | 6 | 7 | open | the breather before the squeeze |
| 56 | Narrows | 9 | 12 | 3 | narrows | the tightest route so far |
| 57 | Hairpin | 9 | 12 | 5 | hairpin | the route doubles back |
| 58 | Three Gates | 9 | 12 | 5 | three gates | a real choice, not a corridor |
| 59 | Maze Garden | 9 | 14 | 3 | maze | many small walls, no long one |
| 60 | The Long Way | 9 | 14 | 7 | corridor + crown | chapter finale |

### Chapter VI — measured, not assumed

60 alternate deals per level, the level's bot in both seats:

| Lv | seat 0 / seat 1 | start wins | avg turns | finishes | flags |
| --- | --- | --- | --- | --- | --- |
| 51 Switchback | 35 / 25 | 22 | 19.7 | score 55, strangle 5 | — |
| 52 Corridor | 33 / 26 | 19 | 17.7 | score 47, strangle 13 | — |
| 53 The S-Bend | 35 / 25 | 28 | 18.9 | score 53, strangle 7 | — |
| 54 Double Pass | 35 / 25 | 34 | 18.4 | score 47, strangle 13 | — |
| 55 Halcyon | 29 / 30 | 34 | 20.3 | score 57, strangle 3 | — |
| 56 Narrows | 24 / 36 | 28 | 19.2 | score 51, strangle 9 | — |
| 57 Hairpin | 23 / 37 | 29 | 19.3 | score 53, strangle 7 | SKEW 23% (seed, see below) |
| 58 Three Gates | 30 / 30 | 27 | 19.2 | score 53, strangle 7 | — |
| 59 Maze Garden | 32 / 28 | 24 | 19.4 | score 52, strangle 8 | — |
| 60 The Long Way | 26 / 34 | 35 | 18.9 | score 48, strangle 12 | — |

Nine of ten sit inside noise. Level 57 was flagged at 23%, so it was re-measured over **eight
independent 60-deal sweeps**: 23/37 (the flagged series), 35/24, 30/30, 29/31, 28/32 and 28/32 —
the layout is even and one deal series was unlucky. Its seed is now **96357** (31/29, 3%) so the
balance tool does not report a phantom defect; the board is unchanged. **This is the same failure
mode as level 49**, and it is worth remembering: a first flag is a reason to re-measure, not to
redesign.

What the chapter is doing, in numbers: **strangles roughly double** against chapter V (7-13 per 60
against 5-10), because a walled route punishes over-extension with a cutoff rather than a lost race.
Levels 52 and 54 are the peaks (13 each) — both are boards where two routes meet, so a player who
commits to the wrong pass can be sealed. Halcyon (55) is the floor (3), which is what a breather
should look like.

Every board in the chapter still passes the mechanical guarantees that matter most: 25 or more open
hexes, no single hex whose removal disconnects the homes, and nothing authored inside either root
zone. The tightest is the finale at 23 open, two above the floor of 20.

## Chapter VII — Broken Crown (levels 61-70)

The finale takes every shape the extension built and **breaks it**: the ring has holes, the cross is
snapped, the crown has a breach, the lattice leaves only diagonals. Stone is the heaviest in the
campaign and gold sits on the axes, so the centre is always contested.

| Lv | Name | Bot | Rocks | Gold | Shape | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 61 | Shattered Ring | 9 | 10 | 5 | broken ring | the ring has holes; read which gaps are worth taking |
| 62 | Crossbones | 9 | 10 | 7 | broken cross | two axes, both broken before they meet |
| 63 | Ember Field | **8** | 6 | 9 | scatter | the breather: scattered stone, gold-rich |
| 64 | Bramble | 9 | 12 | 5 | bramble | no walls, all decisions |
| 65 | The Sieve | 9 | 12 | 7 | sieve | every hex is a choice |
| 66 | Wolf Teeth | 9 | 12 | 7 | teeth | short jabs, no wall |
| 67 | Broken Crown | 9 | 14 | 7 | crown | the centre pays, but it is ringed: a trap |
| 68 | Ash Lattice | 9 | 12 | 9 | lattice | only diagonals survive |
| 69 | The Turning | 9 | 14 | 9 | lattice + teeth | read the board from both ends |
| 70 | Last Light | 9 | 16 | 7 | composed | the campaign's hardest board |

The last board is the stiffest in the whole campaign: **16 stone, 21 open hexes**, which is the most
terrain any level carries and only one hex above the playability floor of 20. Pressure runs 15 → 23
and only dips at the declared breather (63), which is gold-led like every other breather.

Both of the extension's mechanical traps showed up again while authoring this chapter, and both are
now cheap to catch because the harness prints the board:

- **Pockets.** Removing the wrong pair can seal two hexes off from a home even though the board looks
  fine at a glance. Every refusal in this chapter was of that kind (levels 61, 67, 68, 69, 70 on the
  first pass), and each was fixed by freeing the pair that closed the pocket, not by weakening the
  check.
- **Breathers must be gold-led.** The plan's first numbers for Ember Field were 8 stone / 7 gold,
  which reads as another squeeze rather than relief. It ships at 6 / 9 with the same pressure, and a
  test now pins that every breather in the extension is gold-led.

### Chapter VII — measured, not assumed

60 alternate deals per level, the level's bot in both seats:

| Lv | seat 0 / seat 1 | start wins | avg turns | finishes | flags |
| --- | --- | --- | --- | --- | --- |
| 61 Shattered Ring | 35 / 25 | 21 | 19.5 | score 55, strangle 5 | — |
| 62 Crossbones | 37 / 23 | 24 | 19.5 | score 56, strangle 4 | SKEW 23% (seed, see below) |
| 63 Ember Field | 35 / 25 | 20 | 20.8 | score 58, strangle 2 | — |
| 64 Bramble | 26 / 34 | 20 | 19.2 | score 47, strangle 13 | — |
| 65 The Sieve | 31 / 29 | 27 | 19.2 | score 50, strangle 10 | — |
| 66 Wolf Teeth | 38 / 22 | 32 | 18.2 | score 50, strangle 10 | SKEW 27% (seed, see below) |
| 67 Broken Crown | 25 / 35 | 27 | 18.9 | score 50, strangle 10 | — |
| 68 Ash Lattice | 27 / 33 | 38 | 19.0 | score 53, strangle 7 | — |
| 69 The Turning | 31 / 29 | 25 | 19.2 | score 51, strangle 9 | — |
| 70 Last Light | 32 / 28 | 26 | 19.3 | score 49, strangle 11 | — |

Two levels tripped the skew flag on the first sweep, and **both turned out to be deal series rather
than layouts.** The tell is direction: a biased layout favours the same seat every time, while 62 read
37/23 on one start and 24/36 on another, and 66 read 38/22, 33/27, 32/28 and 25/35 across four starts.
Seeds changed, boards did not: 62 → **96762** (29/31) and 66 → **96266** (31/29).

This is the **third and fourth** time in the extension that a first flag was noise (49, 57, 62, 66).
The pattern is now established enough to write down as a rule: **a 60-deal flag is a prompt to
re-measure across seed starts, never a prompt to redesign.**

What the finale does in numbers: strangles run 4-13 per 60, the widest spread of any chapter, which is
what "every shape at once" should look like. Bramble (64) is the high end at 13 — its clumps invite
bluffs — and Ember Field (63) the low at 2, because a gold-rich breather rewards racing rather than
cutting. Turn counts stay 18-21, so the extra stone changes the *decision*, not the length.


### The bot ladder (2026-10-16 rebalance)

Owner-approved difficulty ladder, applied as a **data-only** change to each level's `botLevel`. No
board, seed, name or id moved, and no bot was retuned — a level only names a different existing bot.
Beta feedback was that levels 4-10 "felt like we were not playing against anyone", and the campaign
never used bots 7-9 at all. Each rung is a large step (one bot beats its neighbour roughly 63-72% of
the time; level 7 beats level 1 in 99.4%), so the ladder climbs in short runs rather than one step per
level:

| Levels | Bot |
| --- | --- |
| 1-3 | 1 |
| 4-5 | 2 |
| 6-8 | 3 |
| 9-11 | 4 |
| 12-14 | 5 |
| 15-17 | 6 |
| 18-20 | 7 |
| 21-24 | 8 |
| 25-30 | 9 |

Full sequence: `1,1,1, 2,2, 3,3,3, 4,4,4, 5,5,5, 6,6,6, 7,7,7, 8,8,8,8, 9,9,9,9,9,9`.

The ladder is pinned by a **guard test**, not a comment: `tests/campaign/levels.test.ts` asserts the
bot level never decreases as the level number rises **through the teaching chapters (1-30)**, that it
starts at 1 and ends at 9, and the exact sequence above. The old curve rose to bot 5 at level 20 then
dropped back to bot 4 at level 21, and nothing caught it, because the previous test allowed a one-step
fall. Existing player progress is untouched — campaign progress is stored per level **id**, and no id
changed.

**From 31 the rule changes, deliberately.** There is no bot above 9, so the late campaign raises
difficulty through terrain and allows an occasional bot 8 as a *breather*. That is a reviewed design
choice, so it is declared in the data (`breather: true`) and the test is stricter than "it may drop":
bot 8 is legal only on a flagged breather, never twice in a row, and never on more than a quarter of
the extension. The 1-30 rule above is unchanged.

## Two boards for the same levels (the /2/ onboarding line)

Since 2026-10-17 the site publishes the game twice: the root (`www.futasaku.com`) keeps the released
campaign, and `/2/` carries the onboarding work. Levels 4-10 are played on the **37-hex** map at the
root and on the **19-hex** tutorial map in `/2/`. Both submit Seed proofs to one Edge function, so
`src/campaign/frozen.ts` records the `/2/` opening for each of those levels and
`verifyCampaignProof` tries the level's current opening and then that alternate. A win on either board
pays.

This is also the rule for any future terrain change: **add the old opening to
`ALTERNATE_OPENINGS` and rebuild the Edge bundle** (`npm run server:build-edge`). A proof queued on a
device, or produced by a bundle built before the change, must never be refused because a level moved.

## Progress and saving

- **Strict order (owner, 2026-10-19).** Level 1 is open by default. **Winning** a level opens the next,
  and it is the only thing that does: access is derived from the completed list, so level *n* is
  playable only once **every** level before it has been won. The stored `unlocked` counter is
  recomputed from that list and never trusted, which means a gap cannot be skipped over (**win 69 of
  70 levels and miss one: nothing past the gap opens**) and a save cannot be edited into a shortcut.
  A loss removes nothing. A completed level stays replayable. Restarting a level reproduces the
  intended fixed start (the seed is never rerolled).
- Progress is its own record, `severgrow.campaign.progress.v3`: the completed ids, the best attempt
  per level, and the derived unlocked count. Classic's `severgrow.stats.v1` (`winsByLevel`, a length-9
  array) is never migrated or reshaped.
- A campaign match is saved under its **own** key (`severgrow.campaign.save.v3`, wrapped with the
  level id around the normal offline save), so the classic save
  (`severgrow.save.v7`) is never overwritten by a campaign game. `severgrow.lastmode.v1` records
  which offline match was played last, and **Continue** resumes that one. An unfinished campaign
  match resumes as the level it is: the save carries the level's opening as its replay base, so the
  authored board comes back exactly.
- **Online is untouched.** The campaign config can reach a board only through
  `overridesForMatch(campaign, isTest, labOverrides)` in `web/src/logic/campaign.ts`, called once
  from the offline `startGame`. The online client never builds a match from a config (its board comes
  from the server), and the shared rules version carries no board. Pinned by
  `tests/campaign/isolation.test.ts` and `web/tests/campaign-seam.test.ts`.

## The balance tool

```sh
npm run campaign:balance                                          # 30 alternate seeds per level
npm run campaign:balance -- --games=16 --ref-games=4              # faster
npm run campaign:balance -- --games=16 --baseline-games=16        # plus the classic-board baseline
npm run campaign:balance -- --json=/tmp/balance.json              # raw results
```

For each level it plays:

- **the published level** — its own fixed seed, one game. The only run that speaks about the level as
  shipped.
- **an alternate-seed sweep** — the same board and the same AI, the deal varied. This is evidence
  about the **layout**: is one seat favoured? It is explicitly *not* a change to the published level;
  a sweep never touches a level's seed.
- **the level's bot vs a reference bot (level 7)**, seats swapped, so the difficulty progression can
  be read off.

It also runs a **classic-board baseline**: the same same-AI sweep on the default generated board for
each bot level the campaign uses. The spec deals player 0 first and does not balance hands, so a
level's seat split must be read against that baseline, not on its own.

It flags measurable problems only: a seat skew > 20% over ≥ 60 decided games, one seat winning 80%+
with the same AI both sides, a very short or very long average game, or a level whose opening is not
reproducible. Below 60 decided games a big skew is reported as a **small-sample note**, never as a
defect.

Two honest limits, stated in the tool's own output: when both seats run the same AI a seat *swap*
changes nothing, so the layout question is measured by the seat split across many **deals** (plus how
often the starting seat wins); and **bot-vs-bot results are evidence, not proof of human difficulty**
— a bot plays a different game from a person.

### Chapter I results (2026-10-15)

`npm run campaign:balance -- --games=16 --ref-games=4 --baseline-games=16`. 16 alternating deals per
level (small sample — read it as directional, not significant).

| Lv | Published seed | Sweep seat0 / seat1 | Sweep avg turns | vs L7 (seats swapped) | Flags |
| --- | --- | --- | --- | --- | --- |
| 1 | seat 0, 60 turns, 10–3 | 8 / 8 | 56.9 (21–60) | 0–8 | LONG |
| 2 | seat 1, 60 turns, 4–7 | 11 / 5 | 58.5 (40–60) | 0–8 | small-sample skew note; LONG |
| 3 | seat 1, 60 turns, 4–22 | 7 / 9 | 59.4 (52–60) | 1–7 | LONG |
| 4 | seat 1, 48 turns, 8–11 | 8 / 8 | 51.8 | 0–8 | — |
| 5 | seat 0, 60 turns, 13–7 | 8 / 8 | 54.2 | 0–8 | — |
| 6 | seat 1, 52 turns, 12–14 | 9 / 7 | 53.1 | 0–8 | — |
| 7 | seat 1, 48 turns, 8–11 | 7 / 9 | 51.1 | 0–8 | — |
| 8 | seat 1, 34 turns, 8–21 | 9 / 7 | 43.9 | 0–8 | — |
| 9 | seat 0, 36 turns, 19–5 | 8 / 8 | 44.4 | 1–7 | — |
| 10 | seat 0, 48 turns, 19–9 | 10 / 6 | 44.9 | 0–8 | — |

Classic-board baseline (same AI both seats): bot 1 → 7/9, 58.1 turns; bot 2 → 8/8, 53.4; bot 3 →
10/6, 41.5.

Reading:

- **Nothing is invalid**: all ten boards validate, all ten are reproducible, and every seat split is
  inside the classic board's own spread at this sample size (bot 3 on the *classic* board already
  splits 10/6). No level is biased by this evidence.
- **Levels 1-3 run long in bot-vs-bot play** (57-59 turns, i.e. to the 30-turn cap). That is the
  existing bot level 1's behaviour, not the campaign's: the classic baseline for bot 1 is 58.1 turns.
  A person finishes far sooner — the browser e2e beats level 1 with a plain beginner policy in about
  30 turns at 10–3.
- **The AI progression is real**: the level bot loses to level 7 almost every game (0–8), and the
  Chapter I games get shorter as the AI improves (57 → 44 turns), which is the intended ramp.
- **No rock count or AI value was changed.** The only adjustment to the design pack was level 9's
  rich pair moving to the `r` axis, for legality.

### Chapters I-III results (2026-10-16, before the bot rebalance)

> **Historical — measured on the OLD bot ladder (Chapter I tops at bot 3, II at 5, III at 6).** These
> figures describe the campaign *before* the 2026-10-16 bot rebalance above. The re-measured numbers
> for the shipped ladder follow in the next subsection; do not read these as current.

`npm run campaign:balance -- --games=6 --ref-games=1 --baseline-games=6` — all 30 levels, six
alternate deals each. A deliberately small, bounded run (the machine was shared); read it as
directional, not significant. **No level was flagged with a defect.** The only flags were five
small-sample seat-skew notes (six decided games — noise; the tool says so itself), and nothing was
flagged LONG, SHORT, ONE-SIDED or NOT REPRODUCIBLE.

| Chapter | Bots | Rocks | Gold | Sweep avg turns | Start-seat wins | vs L7 (seats swapped) |
| --- | --- | --- | --- | --- | --- | --- |
| I (1-10) | 1-3 | 0-3 | 1-3 | 46.4 | 24/60 (40%) | **0-20** |
| II (11-20) | 3-5 | 1-5 | 3-5 | 33.5 | 31/60 (52%) | 5-15 |
| III (21-30) | 4-6 | 2-6 | 3-5 | 27.4 | 30/60 (50%) | 5-15 |

Classic-board baseline (same AI both seats, 6 deals): bot 1 → 4/2, 55.0 turns; bot 2 → 4/2, 52.7;
bot 3 → 3/3, 42.2; bot 4 → 5/1, 30.3; bot 5 → 4/2, 26.0; bot 6 → 3/3, 19.3.

Reading:

- **Every board is legal, reproducible and inside the classic board's own seat spread** (bot 4 on the
  *classic* board splits 5/1 all by itself, which is the same shape as the notes the tool raised).
- **The AI ramp is real and measurable.** The Chapter I bots lose to the reference bot in every one of
  their 20 games (0-20). The Chapter II and III bots win 5 of 20 each. The same-AI games also get
  shorter as the bot improves (46 → 33 → 27 turns), matching the classic baseline's own 55 → 19 turns.
- **A player-proxy probe (`npx tsx scripts/campaign-difficulty-probe.ts`, not part of the balance
  tool)** makes the step up concrete: a fixed bot (level 4, the top of the EASY training tier) playing
  each level from both seats wins **90% of Chapter I** games, **70% of Chapter II** and **40% of
  Chapter III**. Chapter II is where it starts to lose games outright (15, 16, 22, 23, 24, 26, 28,
  29). This mixes the board and the bot, which is exactly what a player meets — but it is bot-vs-bot
  evidence, not proof of human difficulty.
- **Review screenshots** come from `npx tsx scripts/campaign-chapter-shots.ts` (a Chapter I board, a
  Chapter II board and a Chapter III board at 360x640 and 390x844, in `docs/screens/campaign/`).
- **One seed was changed after measuring.** Level 28's shipped deal with seed 95028 is a four-turn
  Strangle — verified identical on the *classic* board, so it is the deal and not this board — which
  is not the open fight that level is for. It now uses 95059, which ships a close 24-turn game.
- **Not measured here:** no level has been played by a human, and the 6-deal sweep is too small to
  call any single level balanced. The larger 16-deal sweeps are worth re-running when the machine is
  free.

### Chapters I-III results after the bot rebalance (2026-10-16)

The ladder above was **re-measured** with the same small, bounded run: `npm run campaign:balance --
--games=6 --ref-games=1 --baseline-games=6` (six alternate deals per level, plus the classic-board
baseline below). Directional, not significant. **No level was flagged with a defect — no LONG, SHORT,
ONE-SIDED or NOT REPRODUCIBLE.** The only flags were nine small-sample seat-skew notes (L3, L7, L13,
L15, L20, L23, L24, L25, L26 — six decided games, so noise; the tool says so itself).

| Chapter | Bots | Rocks | Gold | Sweep avg turns | Start-seat wins | vs L7 (seats swapped) |
| --- | --- | --- | --- | --- | --- | --- |
| I (1-10) | 1-4 | 0-3 | 1-3 | 41.8 | 26/60 (43%) | **0-20** |
| II (11-20) | 4-7 | 1-5 | 3-5 | 22.7 | 29/60 (48%) | 3-20 |
| III (21-30) | 8-9 | 2-6 | 3-5 | 19.7 | 31/60 (52%) | 14-20 |

Classic-board baseline (same AI both seats, 6 deals): bot 1 → 4/2, 55.0 turns; bot 2 → 4/2, 52.7;
bot 3 → 3/3, 42.2; bot 4 → 5/1, 30.3; bot 5 → 4/2, 26.0; bot 6 → 3/3, 19.3; bot 7 → 3/3, 19.7;
bot 8 → 4/2, 19.5; bot 9 → 4/2, 18.7.

Reading:

- **The ramp is real, steep and now reaches the top of the ladder.** The Chapter I bots lose to the
  reference bot in every one of their 20 games (0-20), Chapter II wins 3 of 20, and Chapter III wins
  14 of 20 — bots 8-9 now beat the level-7 reference most of the time, exactly the ceiling the old
  campaign never used.
- **Same-AI games shorten as the bot rises** (42 → 23 → 20 turns), matching the classic baseline's own
  55 → 19 turns. No level stuck LONG as the old levels 1-3 did.
- **Every board stays legal, reproducible and inside the classic board's own seat spread** (bot 4 on
  the *classic* board splits 5/1 all by itself, the same shape as the notes the tool raised).
- **Player-proxy probe** (`npx tsx scripts/campaign-difficulty-probe.ts`; a fixed bot level 4 — the top
  of the EASY training tier — playing each level from both seats): wins **85% of Chapter I** games,
  **15% of Chapter II** and **15% of Chapter III** (20 games each). The flip is deliberate: with the
  ladder, bot 4 is the Chapter I ceiling but below every Chapter II and III opponent, so the proxy
  loses most of the later games. This mixes board and bot, which is what a player meets — but it is
  bot-vs-bot evidence, not proof of human difficulty. (Before the rebalance the same probe read
  90/70/40; that figure is **stale** and described the old ladder.)
- **Still not measured:** no human has played the rebalanced campaign, and the 6-deal sweep is too
  small to call any single level balanced.

## Tests

| File | Proves |
| --- | --- |
| `tests/campaign/levels.test.ts` | every level's board is legal and playable; the campaign is well formed across every chapter built; the authored rock counts (1-70) and the per-level board radius (2 for levels 1-3, 3 for the rest); **the 1-30 bot ladder never decreases and matches the approved sequence exactly**; from 31 a bot-8 dip is allowed only on a flagged `breather`, never twice in a row, and at most a quarter of the extension; **terrain pressure (rocks + gold) does not fall chapter by chapter**; no rock or gold in a root zone; no single hex that decides the game; each level is reproducible (same id → same terrain, homes, deal); **the strict order rule** (access derived from the completed list, a gap opens nothing past it, an edited unlocked counter grants nothing, 69 of 70 leaves the campaign unfinished, a replay opens nothing new) |
| `tests/campaign/isolation.test.ts` | the shared rules version has no board; `src/engine/`, `server/src/` and `web/src/online/` never read a campaign level |
| `web/tests/campaign-seam.test.ts` | only a campaign level produces overrides; the online client cannot build a match from a config; campaign saves never share the classic key |
| `web/tests/campaign-save.test.ts` | progress saves/restores; an unfinished campaign match resumes as its level; existing classic (and legacy) saves still decode |
| `web/e2e/campaign-shots.ts` | the browser flow at 360x640 and 390x844: menu → campaign → level on its own seed and board → resume on reload → win unlocks the next → tile states, reading sizes, no clipping, screenshots |
