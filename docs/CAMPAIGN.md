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

One object in `CAMPAIGN_LEVELS` (`src/campaign/levels.ts`), using the local `board(rock, gold)`
helper for an authored board. Then:

1. `npx vitest run tests/campaign` — the validation test plays every level's board through
   `validateCampaign()` and asserts the campaign's shape (unique, contiguous ids/numbers).
2. `npm run campaign:balance -- --games=20` — check the new level is not lop-sided or dull (below).
3. If it opens a new chapter, add its title/subtitle to `CAMPAIGN.chapters` in `src/strings.ts`.

No UI change is needed: the campaign screen is drawn from the level data, so levels 11-50 need no
restructuring. (Chapter II+ will appear as soon as those levels exist.)

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
| 4 | The Clearing | 2 | 0 | centre + pair | 3 | Open board, slightly better bot |
| 5 | Stone in the Grass | 2 | 2 | centre + pair | 3 | Scattered rocks away from central routes |
| 6 | Branching Out | 2 | 1 | centre + pair | 3 | Encourage multiple directions |
| 7 | First Obstacle | 2 | 2 | centre + pair | 3 | Small rock cluster near a flank |
| 8 | The Open Field | 3 | 0 | centre + flank pair | 3 | Stronger opponent, forgiving terrain |
| 9 | Around the Stone | 3 | 3 | centre + pair (other axis) | 3 | A short detour around blocked hexes |
| 10 | The First Grove | 3 | 3 | centre + pair | 3 | Chapter finale testing the fundamentals |

Every level's rock count and AI matches the design pack exactly. Two adjustments were made for
legality, neither of which changed a level's intent: **level 9's rich pair moved from the `q` axis to
the `r` axis** (the design's three-hex wall sits on the `q` axis, so `-2,0` would have been both rock
and gold), and **level 3's single edge rock moved from `-3,0` to `-2,0`** when the level moved to the
radius-2 map (`-3,0` is not on that board).

### The 2026-10-16 refinement

Two changes, both owner direction, both terrain-only:

- **Gold in every level (levels 2, 4, 8 changed).** Those three levels previously carried only the
  centre gold; each now carries one mirrored gold pair as well, on an axis no rock occupies. Gold is
  the campaign's second difficulty lever — a rich hex scores 2 instead of 1, so both players are
  pulled toward the same fights — and the first pass barely used it. Level 1 is deliberately left with
  a single gold centre: it is the first board a player ever sees. No rock count, level name, seed or
  bot level changed.
- **Levels 1-3 moved onto the tutorial's small map** (radius 2 → 19 hexes, `TUTORIAL_BOARD_RADIUS`).
  They are the first three levels ever and the tutorial's own ground, so the opening chapter stays
  small, quick and legible. A smaller board is *less* forgiving in one respect (fewer places to grow)
  and *more* forgiving in another (the two homes are closer, the whole map is visible at once), so the
  level 3 rock was re-placed and every board re-validated; the boards keep 19, 19 and 18 open hexes of
  19. Levels 4-30 stay on the product hexagon.

## Chapter II — Broken Ground (levels 11-20)

Theme: **learn to navigate.** Rocks create choices, not walls. Every board keeps a wide open middle or
a credible side route, so Bloom and networks stay meaningful; the step up from Chapter I is the
terrain the player has to read and the better bots behind it.

| Lv | Name | AI | Rocks | Gold | Open hexes | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | Pebble Trail | 3 | 2 | 3 | 35 | A mirrored pebble pair beside the trail; still wide open |
| 12 | Split Meadow | 3 | 3 | 3 | 34 | A short wall across the centre; two lanes to pick |
| 13 | The Detour | 3 | 4 | 3 | 33 | A four-hex arc to route around |
| 14 | Open Horizon | 4 | 1 | 3 | 36 | Breathing space: one lone stone, a clearly better bot |
| 15 | Twin Stones | 4 | 4 | 3 | 33 | Twin wings plus a central pair: two threats at once |
| 16 | Broken Crossing | 4 | 4 | 3 | 33 | A broken wall with two crossings |
| 17 | The Long Way | 4 | 5 | 3 | 32 | Both inner lanes close early; go the long way |
| 18 | Quiet Clearing | 4 | 2 | 3 | 35 | Breathing space: fewer stones, a sharper bot |
| 19 | Stone Garden | 4 | 5 | 3 | 32 | Five scattered stones, five small choices |
| 20 | The Broken Grove | 5 | 5 | 5 | 32 | Chapter finale: bot 5 and five gold |

## Chapter III — Narrow Paths (levels 21-30)

Theme: **fight for space.** Contested hexes and corridors — but no level leaves a single hex that
decides the game: every wall here has at least two openings, and a defensive route exists alongside
the attack, so the board narrows the choice rather than dictating it.

| Lv | Name | AI | Rocks | Gold | Open hexes | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| 21 | The Passage | 4 | 4 | 3 | 33 | Two offset walls leave one diagonal passage |
| 22 | Forked Path | 4 | 5 | 3 | 32 | Choose a fork; the wings reopen behind it |
| 23 | Central Ground | 5 | 4 | 3 | 33 | The centre is a fortress with two doors |
| 24 | The Side Route | 5 | 5 | 3 | 32 | A long ridge; the short way is walled, the side route is not |
| 25 | The Bottleneck | 5 | 6 | 3 | 31 | Two blobs with a narrow neck between them |
| 26 | Four Corners | 5 | 4 | 3 | 33 | The four outer corners are spoken for |
| 27 | Split Decision | 5 | 6 | 3 | 31 | One split, two choices, no time to dither |
| 28 | Open Conflict | 6 | 2 | 3 | 35 | Breathing space with the sharpest bot in the campaign |
| 29 | The Crossing | 6 | 6 | 5 | 31 | Cross at the centre or round the ends; gold on both |
| 30 | Heart of Stone | 6 | 6 | 3 | 31 | The finale: a stone heart round the gold centre |

Both chapters are built **entirely from authored boards** (`config.board`): the generator places
point-symmetric pairs only, so it cannot make a fork, a corridor or a ridge. Rock counts and AI levels
match the design pack exactly. **Gold is used as the second difficulty lever**: two boundaries carry a
second rich pair — level 20 and the level 29 crossing, five gold each — while levels 2 and 16 put
their pair right beside the centre and levels 8 and 23 put it on the wings, both of which pull the two
players toward the same fights. The curve is deliberately not "one more rock each time": 14, 18 and 28
are the breathing-space levels, each more open than its neighbours but against a stronger bot.

## Progress and saving

- Level 1 is open by default. **Winning** a level unlocks the next. A loss removes nothing. A
  completed level stays replayable. Restarting a level reproduces the intended fixed start (the seed
  is never rerolled).
- Progress is its own record, `severgrow.campaign.progress.v1`: highest unlocked, the completed ids,
  and the best attempt per level. Classic's `severgrow.stats.v1` (`winsByLevel`, a length-9 array) is
  never migrated or reshaped.
- A campaign match is saved under its **own** key (`severgrow.campaign.save.v1`, wrapped with the
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

## Tests

| File | Proves |
| --- | --- |
| `tests/campaign/levels.test.ts` | every level's board is legal and playable; the campaign is well formed; design rock counts; each level is reproducible (same id → same terrain, homes, deal); the unlock rule (1 open, win unlocks next, loss removes nothing, replayable) |
| `tests/campaign/isolation.test.ts` | the shared rules version has no board; `src/engine/`, `server/src/` and `web/src/online/` never read a campaign level |
| `web/tests/campaign-seam.test.ts` | only a campaign level produces overrides; the online client cannot build a match from a config; campaign saves never share the classic key |
| `web/tests/campaign-save.test.ts` | progress saves/restores; an unfinished campaign match resumes as its level; existing classic (and legacy) saves still decode |
| `web/e2e/campaign-shots.ts` | the browser flow at 360x640 and 390x844: menu → campaign → level on its own seed and board → resume on reload → win unlocks the next → tile states, reading sizes, no clipping, screenshots |
