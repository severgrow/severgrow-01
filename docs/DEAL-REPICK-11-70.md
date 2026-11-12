# Deal re-pick, levels 11–70 (Tier 2 of `docs/CAMPAIGN-71-100.md` §B)

Measured 2026-11-12 on branch `deal-repick-11-70` (worktree `sg-deal-repick`, cut from
`gh/claude/campaign-71-100` @ `7c407f6a`). Tool: `src/sim/deal-design.ts`, unmodified.

**This report is the deliverable. No level data has been changed.** Section 5 explains why applying
the picks needs an owner decision first: the current frozen-alternate record cannot express a
seed-only difference, so a seed change would currently invalidate every already-earned Campaign Seed
proof for that level.

---

## 1. What was run, and what it does and does not decide

```sh
npx tsx src/sim/deal-design.ts -- --from=11 --to=70 --tries=40
```

For each level the tool plays full games on the level's own board with **bot 7 in the player's seat**
against **the level's own bot**, over candidate seeds `seed + k·1009` (`k = 0..39`), and returns the
first candidate whose shipped game fits the level's role:

| Role | Band used (unchanged) |
| --- | --- |
| early (bot ≤ 7) | margin ≥ −2, turns ≥ 16, not strangled |
| breather | margin ≥ +3, turns ≥ 16 |
| level | margin in [−6, +2], turns ≥ 16, not strangled |
| finale | margin in [−8, −1], turns ≥ 16, not strangled |

`kept: true` (k = 0) means the shipped seed already fits and is left alone. No board, bot, band,
`inBand` rule or difficulty flag was touched, and nothing outside 11–70 was examined. Bot 7 is a
stand-in, not a human: read these numbers as the *shape* of the shipped game, not as a win rate.

To make the before/after readable, the shipped deal of every level was also replayed through the same
harness (bot 7 in seat 0 vs the level's bot). That is the "shipped today" column.

## 2. Headline

- **60 levels examined (11–70).**
- **42 would change seed. 18 are kept as they are. 0 found no in-band candidate within 40 tries.**
- **9 shipped deals are wipe-outs (under 16 turns).** All nine are replaced; the re-pick leaves
  **zero** sub-16-turn games and **zero** strangled stand-ins across 11–70.
- 11 shipped deals strangle the stand-in; all 11 are replaced.
- The changes **cluster in the late chapters**: chapters II and IV are mostly fine, chapters V–VII are
  almost entirely re-picked. That is the signature of a *systematic* problem (seeds were never chosen
  for difficulty, see §A2 of `CAMPAIGN-71-100.md`), not of individual unlucky deals.

| Chapter | Levels | Changed | Kept | No candidate |
| --- | --- | --- | --- | --- |
| II — Broken Ground (11–20) | 10 | 2 | 8 | 0 |
| III — Narrow Paths (21–30) | 10 | 7 | 3 | 0 |
| IV — Hollow Ground (31–40) | 10 | 6 | 4 | 0 |
| V — Gold Country (41–50) | 10 | 9 | 1 | 0 |
| VI — The Long Way (51–60) | 10 | 8 | 2 | 0 |
| VII — Broken Crown (61–70) | 10 | 10 | 0 | 0 |
| **Total** | **60** | **42** | **18** | **0** |

## 3. The plan, level by level

"Shipped today" and "Proposed" are the same proxy game: stand-in score minus bot score, and turns.
**wipe-out** = under 16 turns. **(strangled)** = the bot won by strangling the stand-in.

### Chapter II — Broken Ground (11–20)

| # | Level | Role | Bot | Shipped today (margin / turns) | Seed | Proposed (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | Pebble Trail | early | 4 | 20 / 22 | 95011 | 20 / 22 | keep |
| 12 | Split Meadow | early | 5 | 16 / 22 | 95012 | 16 / 22 | keep |
| 13 | The Detour | early | 5 | 18 / 24 | 95013 | 18 / 24 | keep |
| 14 | Open Horizon | early | 5 | 20 / 26 | 95014 | 20 / 26 | keep |
| 15 | Twin Stones | early | 6 | 22 / 22 | 95015 | 22 / 22 | keep |
| 16 | Broken Crossing | early | 6 | 25 / 17 | 95016 | 25 / 17 | keep |
| 17 | The Long Way | early | 6 | 2 / 16 | 95017 | 2 / 16 | keep |
| 18 | Quiet Clearing | early | 7 | 0 / 18 | 95018 | 0 / 18 | keep |
| 19 | Stone Garden | early | 7 | −21 / 16 | 95019 → **98046** | 3 / 20 | change |
| 20 | The Broken Grove | early | 7 | −11 / 22 | 95020 → **97038** | 11 / 22 | change |

### Chapter III — Narrow Paths (21–30)

| # | Level | Role | Bot | Shipped today (margin / turns) | Seed | Proposed (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 21 | The Passage | level | 8 | 16 / 20 | 95021 → **97039** | −2 / 18 | change |
| 22 | Forked Path | level | 8 | 7 / 18 | 95022 → **100067** | 1 / 16 | change |
| 23 | Central Ground | level | 8 | −1 / 22 | 95023 | −1 / 22 | keep |
| 24 | The Side Route | level | 8 | −19 / 12 **wipe-out** (strangled) | 95024 → **98051** | −5 / 16 | change |
| 25 | The Bottleneck | level | 9 | 10 / 18 | 95025 → **96034** | −5 / 20 | change |
| 26 | Four Corners | level | 9 | −17 / 11 **wipe-out** (strangled) | 95026 → **98053** | −3 / 22 | change |
| 27 | Split Decision | level | 9 | 7 / 18 | 95027 → **97045** | −5 / 22 | change |
| 28 | Open Conflict | level | 9 | −2 / 18 | 95059 | −2 / 18 | keep |
| 29 | The Crossing | level | 9 | −4 / 22 | 95029 | −4 / 22 | keep |
| 30 | Heart of Stone | finale | 9 | −19 / 18 (strangled) | 95030 → **97048** | −2 / 18 | change |

### Chapter IV — Hollow Ground (31–40)

| # | Level | Role | Bot | Shipped today (margin / turns) | Seed | Proposed (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 31 | First Light | breather | 8 (breather) | −17 / 20 | 96031 → **98049** | 3 / 20 | change |
| 32 | The Knot | level | 9 | −13 / 20 | 96032 → **98050** | −2 / 20 | change |
| 33 | Outliers | level | 9 | −8 / 22 | 96033 → **98051** | −5 / 20 | change |
| 34 | Crosswinds | level | 9 | −5 / 16 | 96034 | −5 / 16 | keep |
| 35 | The Gate | level | 9 | −17 / 13 **wipe-out** (strangled) | 96035 → **98053** | −4 / 20 | change |
| 36 | Sparrow Stones | level | 9 | −7 / 24 | 96036 → **102090** | −5 / 20 | change |
| 37 | Twin Anvils | level | 9 | 1 / 20 | 96037 | 1 / 20 | keep |
| 38 | Gold Under Grass | breather | 8 (breather) | 12 / 20 | 96038 | 12 / 20 | keep |
| 39 | Gated Ring | level | 9 | −4 / 18 | 96039 | −4 / 18 | keep |
| 40 | Hollow Crown | finale | 9 | −10 / 18 | 96040 → **98058** | −1 / 18 | change |

### Chapter V — Gold Country (41–50)

| # | Level | Role | Bot | Shipped today (margin / turns) | Seed | Proposed (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 41 | Gold Seam | level | 9 | −12 / 20 | 96041 → **102095** | −6 / 20 | change |
| 42 | The Rush | level | 9 | −19 / 11 **wipe-out** (strangled) | 96042 → **103105** | 0 / 22 | change |
| 43 | Prospector | level | 9 | −13 / 22 | 96043 → **97052** | −4 / 22 | change |
| 44 | Vein | level | 9 | −13 / 10 **wipe-out** (strangled) | 96044 → **97053** | 2 / 20 | change |
| 45 | Two Claims | level | 9 | 13 / 20 | 96045 → **100081** | −3 / 22 | change |
| 46 | Open Ledger | breather | 8 (breather) | 8 / 18 | 96046 | 8 / 18 | keep |
| 47 | The Mint | level | 9 | −14 / 18 | 96047 → **98065** | 2 / 20 | change |
| 48 | Paydirt | level | 9 | −9 / 22 | 96048 → **113201** | −1 / 22 | change |
| 49 | Gold Line | level | 9 | 6 / 18 | 96249 → **106339** | −5 / 20 | change |
| 50 | Mother Lode | finale | 9 | −14 / 18 | 96050 → **97059** | −6 / 18 | change |

### Chapter VI — The Long Way (51–60)

| # | Level | Role | Bot | Shipped today (margin / turns) | Seed | Proposed (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 51 | Switchback | level | 9 | −17 / 11 **wipe-out** (strangled) | 96051 → **100087** | −3 / 20 | change |
| 52 | Corridor | level | 9 | 1 / 18 | 96052 | 1 / 18 | keep |
| 53 | The S-Bend | level | 9 | −8 / 22 | 96053 → **99080** | −6 / 20 | change |
| 54 | Double Pass | level | 9 | 12 / 18 | 96054 → **99081** | −6 / 20 | change |
| 55 | Halcyon | breather | 8 (breather) | 16 / 22 | 96055 | 16 / 22 | keep |
| 56 | Narrows | level | 9 | −7 / 20 | 96056 → **97065** | −2 / 22 | change |
| 57 | Hairpin | level | 9 | −9 / 20 | 96357 → **101402** | −1 / 16 | change |
| 58 | Three Gates | level | 9 | −18 / 20 | 96058 → **100094** | −4 / 20 | change |
| 59 | Maze Garden | level | 9 | 7 / 18 | 96059 → **102113** | −1 / 18 | change |
| 60 | The Long Way | finale | 9 | −16 / 14 **wipe-out** (strangled) | 96060 → **102114** | −8 / 20 | change |

### Chapter VII — Broken Crown (61–70)

| # | Level | Role | Bot | Shipped today (margin / turns) | Seed | Proposed (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 61 | Shattered Ring | level | 9 | −20 / 20 | 96061 → **98079** | 0 / 20 | change |
| 62 | Crossbones | level | 9 | −11 / 22 | 96762 → **104834** | 1 / 22 | change |
| 63 | Ember Field | breather | 8 (breather) | 1 / 24 | 96063 → **97072** | 7 / 18 | change |
| 64 | Bramble | level | 9 | 11 / 20 | 96064 → **98082** | 2 / 20 | change |
| 65 | The Sieve | level | 9 | −14 / 17 (strangled) | 96065 → **101110** | 1 / 18 | change |
| 66 | Wolf Teeth | level | 9 | −10 / 20 | 96266 → **99293** | 1 / 20 | change |
| 67 | Broken Crown | level | 9 | −23 / 9 **wipe-out** (strangled) | 96067 → **97076** | −3 / 18 | change |
| 68 | Ash Lattice | level | 9 | −8 / 16 | 96068 → **98086** | −4 / 18 | change |
| 69 | The Turning | level | 9 | −10 / 22 | 96069 → **110195** | −1 / 16 | change |
| 70 | Last Light | finale | 9 | −20 / 15 **wipe-out** (strangled) | 96070 → **99097** | −5 / 16 | change |

## 4. What the table says

**Wipe-outs are real and they are concentrated in the mid/late chapters.** Nine shipped deals end in
under 16 turns, every one of them with the stand-in losing by 13–23:

| # | Level | Shipped deal |
| --- | --- | --- |
| 24 | The Side Route | −19 in 12, strangled |
| 26 | Four Corners | −17 in 11, strangled |
| 35 | The Gate | −17 in 13, strangled |
| 42 | The Rush | −19 in 11, strangled |
| 44 | Vein | −13 in 10, strangled |
| 51 | Switchback | −17 in 11, strangled |
| 60 | The Long Way | −16 in 14, strangled |
| 67 | Broken Crown | −23 in 9, strangled (worst in the game) |
| 70 | Last Light | −20 in 15, strangled |

This matches the five examples already recorded in `CAMPAIGN-71-100.md` §A2 (26, 42, 44, 51, 67) and
finds four more (24, 35, 60, 70). The re-pick removes all nine.

**Two early "teaching" levels are wipe-outs in margin, not in length.** 19 (Stone Garden) ships at
−21 over 16 turns and 20 (The Broken Grove) at −11; both are bot-7 levels meant to be *winnable for a
stand-in*. They become 3 / 20 and 11 / 22.

**Breathers: two of the five are fine, one is not a breather.** 38 (+12), 46 (+8) and 55 (+16) already
breathe and are kept. 31 (First Light) ships at −17, which is a wall at the start of chapter IV; it
becomes +3. 63 (Ember Field) ships at +1 over 24 turns — a long grind, not a rest — and becomes +7
over 18.

**The re-pick also makes nine levels harder, by design of the bands.** Nine "level"-role deals
currently hand the stand-in a comfortable win and therefore sit outside the band: 21 (+16), 22 (+7),
25 (+10), 27 (+7), 45 (+13), 49 (+6), 54 (+12), 59 (+7), 64 (+11). They become proper
bot-slightly-ahead games (−2, +1, −5, −5, −3, −5, −6, −1, +2). This is the intended reading of
"the shipped deal should follow the curve", but it is a *difficulty increase* for a player who had
those deals on their side, so it should be an explicit part of the decision, not a side effect.

**Clustering.** Chapter VII changes on all ten levels, V on nine, VI on eight. Chapter II changes only
on 19–20. So the late chapters are not "a few unlucky seeds"; nowhere in V–VII has the shipped deal
been chosen against a difficulty target. That is a data-selection problem, which a seed pass fixes
without touching a single board.

**No level lacked an in-band candidate.** All 60 found a fit within 40 tries; the worst search was
level 48 at k = 17 (seed 113201) and level 69 at k = 14 (seed 110195), both still inside the budget.
Nothing here needs a board or band change to fit.

## 5. Why this was NOT applied (owner decision required)

`docs/CAMPAIGN-71-100.md` §E.2 asks for "frozen alternates for old proofs", and the standing rule in
`docs/CAMPAIGN.md` ("Two boards for the same levels") is: *add the old opening to `ALTERNATE_OPENINGS`
and rebuild the Edge bundle*. That rule is written for **terrain** changes. It does not work for a
**seed** change today, because the alternate record has no seed:

```ts
// src/campaign/frozen.ts:19
export type AlternateOpening = { boardRadius: number; board: BoardSpec };
```

and the verifier's fallback rebuilds the opening from the level's *current* seed:

```ts
// server/src/seeds/verify.ts:51-53
const alternate = ALTERNATE_OPENINGS[level.id];
if (!alternate) return null;
return verifyOfflineMatch(newMatch(level.seed, { ...level.config, ...alternate }), level.botLevel, { actions, botVersion });
```

Reproduced on level 24 (`ALTERNATE_OPENINGS` has no entry for it), with a proof generated on the
shipped opening:

```
old opening itself verifies:                                    true
old proof vs NEW seed (after the re-pick):                      false   <- the break
fallback with a same-board alternate replays OLD deal today:    false   <- no seed to give it
hypothetical alternate WITH the old seed:                       true    <- the missing piece
```

So a seed change is **not** freezable with the mechanism as shipped: every already-earned Campaign
Seed proof for a re-picked level would be refused, and proofs from a cached client bundle built
before the change would be refused too. The fix is small but it is not "seeds only":

1. give `AlternateOpening` an optional `seed` (and make the board part optional, since a seed-only
   alternate keeps the same board) — `src/campaign/frozen.ts`;
2. have `verifyCampaignProof` rebuild the alternate with `alternate.seed ?? level.seed` —
   `server/src/seeds/verify.ts`;
3. add 42 alternate entries (one per changed level) and update `docs/CAMPAIGN.md`;
4. rebuild and deploy the Edge bundle **before** the page, per the deploy order in §D — otherwise the
   new page's proofs are refused;
5. relax `tests/campaign/alternate-openings.test.ts:39-41`, which pins `ALTERNATE_OPENINGS` to exactly
   the seven `/2/` levels — that is a meaningful guard test and should only be widened deliberately.

None of that is a seed change, and steps 1–2 and 4 are a server-schema and deploy-order decision.
That is why this branch stops here: the analysis and the plan are ready, the application is not.

**If the owner approves, the sequence is:** land the verifier extension (server first), add the 42
frozen alternates, change the 42 seeds in `src/campaign/levels.ts` / `levels-late.ts`, and run
`tests/campaign/alternate-openings.test.ts` plus a new test that replays an old-seed proof through
`verifyCampaignProof` after the change.

## 6. Reproduction

```sh
# the picks (60 JSON lines, one per level)
npx tsx src/sim/deal-design.ts -- --from=11 --to=70 --tries=40
```

The shipped deal of each level was replayed through the same harness (bot 7 in seat 0 vs the level's
bot): `/tmp/sims/deal-design-11-70.jsonl` (picks) and `/tmp/sims/current-deals.jsonl` (shipped deals)
from the 2026-11-12 run. The tool is read-only: it prints picks and never edits level data.

## 7. Checks on this branch

This branch changes one markdown file and no code, so it cannot alter any result. For the record:

- `npm run typecheck` — passes (engine, web, admin).
- `npx vitest run tests/campaign server/tests` — 47 files passed, 485 tests passed, 0 failed.
- `npm run check` — **2 pre-existing failures**, both in web tests inherited from
  `gh/claude/campaign-71-100`, unrelated to this report: `web/tests/persist-v7.test.ts:97`
  ("an unknown level becomes 7", got 12) and the same case in `web/tests/levels-ui.test.ts`.
  Cause: `isBotLevel` now accepts the new rival levels 10–12, so the classic save decoder
  (`web/src/logic/persist.ts:44`) treats `level: 12` as valid instead of falling back to 7. The
  branch's 230 other test files (2357 tests) pass. It should be fixed on the campaign branch, not
  from here: it is a classic-save compatibility question about rivals, outside a seeds-only task.
