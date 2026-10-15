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
- the board is **playable**: at least 20 open hexes, every open hex reachable from *both* homes (no
  walled-off pocket), and each home has at least 3 open neighbours (so it cannot be strangled at
  once);
- ids are unique, numbers run 1..n, chapters are contiguous.

`resolveConfig` alone checks that rock/gold are never on a home, and `rootZone` already protects both
roots and their neighbours in the generated terrain.

## Hand-authored boards

The generator (`generateTerrain`) places **point-symmetric pairs** only, so it can never make the
one-rock and three-rock boards the design asks for, nor a ridge, a chokepoint or a maze. Chapter I
therefore uses `config.board`, and the same route is open to every later chapter.

Notes when authoring:

- With `board` set, `rockCount` / `richCount` are ignored for terrain (the board carries its own).
  They stay at their defaults; `resolveConfig` still requires `rockCount` even and `richCount` odd.
- Keep stones off the home-to-home diagonal (the central routes) and outside both root zones unless
  the level is *meant* to squeeze a flank.
- `boardRadius: 3` is set on every Chapter I level so layout, naming and camera code use the same
  radius as Classic.

## Chapter I

`AI` = the existing bot level. `Rocks` = the authored rock count. `Gold` = authored rich hexes.

| Lv | Name | AI | Rocks | Gold | Intent |
| --- | --- | --- | --- | --- | --- |
| 1 | First Seed | 1 | 0 | centre | Completely open, welcoming |
| 2 | New Growth | 1 | 0 | centre | Another open board; reinforce the basics |
| 3 | Two Directions | 1 | 1 | centre + pair | One harmless edge rock |
| 4 | The Clearing | 2 | 0 | centre | Open board, slightly better bot |
| 5 | Stone in the Grass | 2 | 2 | centre + pair | Scattered rocks away from central routes |
| 6 | Branching Out | 2 | 1 | centre + pair | Encourage multiple directions |
| 7 | First Obstacle | 2 | 2 | centre + pair | Small rock cluster near a flank |
| 8 | The Open Field | 3 | 0 | centre | Stronger opponent, forgiving terrain |
| 9 | Around the Stone | 3 | 3 | centre + pair (other axis) | A short detour around blocked hexes |
| 10 | The First Grove | 3 | 3 | centre + pair | Chapter finale testing the fundamentals |

Every level's rock count and AI matches the design pack exactly. One adjustment was made for
legality: **level 9's rich pair moved from the `q` axis to the `r` axis**, because the design's
three-hex wall sits on the `q` axis (`-2,0` would have been both rock and gold). Nothing about the
level's intent or difficulty changed.

The two "open" rock levels (1, 2, 4, 8) carry only the centre gold. Levels with stones carry the
centre plus one mirrored rich pair — the same shape Classic's generated terrain takes.

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
npm run campaign:balance                              # 30 alternate seeds per level
npm run campaign:balance -- --games=20 --ref-games=6  # faster
npm run campaign:balance -- --json=/tmp/balance.json  # raw results
```

For each level it plays:

- **the published level** — its own fixed seed, one game. The only run that speaks about the level as
  shipped.
- **an alternate-seed sweep** — the same board and the same AI, the deal varied. This is evidence
  about the **layout**: is one seat favoured? It is explicitly *not* a change to the published level;
  a sweep never touches a level's seed.
- **the level's bot vs a reference bot (level 7)**, seats swapped, so the difficulty progression can
  be read off.

It flags measurable problems only: a seat skew > 20% over ≥ 20 decided games, one seat winning 80%+
with the same AI both sides, a very short or very long average game, or a level whose opening is not
reproducible.

Two honest limits, stated in the tool's own output: when both seats run the same AI a seat *swap*
changes nothing, so the layout question is measured by the seat split across many **deals** (plus how
often the starting seat wins); and **bot-vs-bot results are evidence, not proof of human difficulty**
— a bot plays a different game from a person.

## Tests

| File | Proves |
| --- | --- |
| `tests/campaign/levels.test.ts` | every level's board is legal and playable; the campaign is well formed; design rock counts; each level is reproducible (same id → same terrain, homes, deal); the unlock rule (1 open, win unlocks next, loss removes nothing, replayable) |
| `tests/campaign/isolation.test.ts` | the shared rules version has no board; `src/engine/`, `server/src/` and `web/src/online/` never read a campaign level |
| `web/tests/campaign-seam.test.ts` | only a campaign level produces overrides; the online client cannot build a match from a config; campaign saves never share the classic key |
| `web/tests/campaign-save.test.ts` | progress saves/restores; an unfinished campaign match resumes as its level; existing classic (and legacy) saves still decode |
| `web/e2e/campaign-shots.ts` | the browser flow at 360x640 and 390x844: menu → campaign → level on its own seed and board → resume on reload → win unlocks the next → tile states, reading sizes, no clipping, screenshots |
