# Deal re-pick, levels 11–70 — analysis only

Measured 2026-11-12 on branch `deal-repick-11-70` (worktree `/Users/patryk/sg-deal-repick`), from
commit **`7c407f6a`** — *feat(sim): per-level fairness sweep for the uneven boards* — which is the
tooling the run used. Tool: `src/sim/deal-design.ts`, unmodified.

**Status: report only. Nothing has been applied.** No seed was changed, no `ALTERNATE_OPENINGS` entry
was added, and no level file was touched. This commit contains this markdown file and nothing else.

| | |
| --- | --- |
| Levels analysed | 60 (11–70) |
| Kept as shipped | 18 |
| Would change seed | 42 |
| No candidate found in 40 tries | **0** |

Sources copied into this report:

- `/tmp/sims/deal-design-11-70.jsonl` — 60 lines, one per level: the pick (`seed`, `k`, `margin`,
  `turns`, `kept`). This is the run's raw output.
- `/tmp/sims/current-deals.jsonl` — 60 lines, the **shipped** deal of each level replayed through the
  same harness (same bot-7 stand-in), used only for the "Today" column.

---

## 1. What the tool measures

```sh
npx tsx src/sim/deal-design.ts -- --from=11 --to=70 --tries=40
```

For each level it plays full games on the level's own board with **bot 7 in the player's seat** against
**the level's own bot**, over candidate seeds `seed + k·1009` (`k = 0..39`), and stops at the first
candidate that fits the level's role. `k = 0` means the shipped seed already fits and is kept.

Roles come from `roleOf()` (`src/sim/deal-design.ts:22`): bot ≤ 7 → `early`; a `breather` flag →
`breather`; number ending in 0 → `finale`; otherwise `level`. The bands (`inBand`,
`src/sim/deal-design.ts:25-31`) are unchanged:

| Role | Band applied | Two-sided? |
| --- | --- | --- |
| `early` (bot ≤ 7) | margin ≥ −2, turns ≥ 16, stand-in not strangled | **no — floor only** |
| `breather` | margin ≥ +3, turns ≥ 16 | no — floor only |
| `level` | margin ∈ [−6, +2], turns ≥ 16, stand-in not strangled | yes |
| `finale` | margin ∈ [−8, −1], turns ≥ 16, stand-in not strangled | yes |

`margin` is stand-in score minus bot score; `turns` is the length of the game. Bot 7 is a **stand-in,
not a human**: these numbers describe the *shape* of the shipped game (no wipe-outs, breathers that
breathe), not a human win rate. The seed fixes the deal — opening hands, draw order and who starts;
the board is the level's authored config.

The one-sided `early` band is the subject of §4.

---

## 2. The full table

`Margin` and `Turns` are for the **proposed** seed. `Today` is the shipped deal replayed through the
same harness; `(strangled)` means the bot won by cutting the stand-in off, not by score.

### Chapter II — Broken Ground (11–20)

| # | Level | Role | Current seed | Proposed seed | k | Margin | Turns | Today (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | Pebble Trail | early | 95011 | 95011 | 0 | +20 | 22 | +20 / 22 | kept |
| 12 | Split Meadow | early | 95012 | 95012 | 0 | +16 | 22 | +16 / 22 | kept |
| 13 | The Detour | early | 95013 | 95013 | 0 | +18 | 24 | +18 / 24 | kept |
| 14 | Open Horizon | early | 95014 | 95014 | 0 | +20 | 26 | +20 / 26 | kept |
| 15 | Twin Stones | early | 95015 | 95015 | 0 | +22 | 22 | +22 / 22 | kept |
| 16 | Broken Crossing | early | 95016 | 95016 | 0 | +25 | 17 | +25 / 17 | kept |
| 17 | The Long Way | early | 95017 | 95017 | 0 | +2 | 16 | +2 / 16 | kept |
| 18 | Quiet Clearing | early | 95018 | 95018 | 0 | 0 | 18 | 0 / 18 | kept |
| 19 | Stone Garden | early | 95019 | **98046** | 3 | +3 | 20 | −21 / 16 | change |
| 20 | The Broken Grove | early | 95020 | **97038** | 2 | +11 | 22 | −11 / 22 | change |

### Chapter III — Narrow Paths (21–30)

| # | Level | Role | Current seed | Proposed seed | k | Margin | Turns | Today (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 21 | The Passage | level | 95021 | **97039** | 2 | −2 | 18 | +16 / 20 | change |
| 22 | Forked Path | level | 95022 | **100067** | 5 | +1 | 16 | +7 / 18 | change |
| 23 | Central Ground | level | 95023 | 95023 | 0 | −1 | 22 | −1 / 22 | kept |
| 24 | The Side Route | level | 95024 | **98051** | 3 | −5 | 16 | −19 / 12 (strangled) | change |
| 25 | The Bottleneck | level | 95025 | **96034** | 1 | −5 | 20 | +10 / 18 | change |
| 26 | Four Corners | level | 95026 | **98053** | 3 | −3 | 22 | −17 / 11 (strangled) | change |
| 27 | Split Decision | level | 95027 | **97045** | 2 | −5 | 22 | +7 / 18 | change |
| 28 | Open Conflict | level | 95059 | 95059 | 0 | −2 | 18 | −2 / 18 | kept |
| 29 | The Crossing | level | 95029 | 95029 | 0 | −4 | 22 | −4 / 22 | kept |
| 30 | Heart of Stone | finale | 95030 | **97048** | 2 | −2 | 18 | −19 / 18 (strangled) | change |

### Chapter IV — Hollow Ground (31–40)

| # | Level | Role | Current seed | Proposed seed | k | Margin | Turns | Today (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 31 | First Light | breather | 96031 | **98049** | 2 | +3 | 20 | −17 / 20 | change |
| 32 | The Knot | level | 96032 | **98050** | 2 | −2 | 20 | −13 / 20 | change |
| 33 | Outliers | level | 96033 | **98051** | 2 | −5 | 20 | −8 / 22 | change |
| 34 | Crosswinds | level | 96034 | 96034 | 0 | −5 | 16 | −5 / 16 | kept |
| 35 | The Gate | level | 96035 | **98053** | 2 | −4 | 20 | −17 / 13 (strangled) | change |
| 36 | Sparrow Stones | level | 96036 | **102090** | 6 | −5 | 20 | −7 / 24 | change |
| 37 | Twin Anvils | level | 96037 | 96037 | 0 | +1 | 20 | +1 / 20 | kept |
| 38 | Gold Under Grass | breather | 96038 | 96038 | 0 | +12 | 20 | +12 / 20 | kept |
| 39 | Gated Ring | level | 96039 | 96039 | 0 | −4 | 18 | −4 / 18 | kept |
| 40 | Hollow Crown | finale | 96040 | **98058** | 2 | −1 | 18 | −10 / 18 | change |

### Chapter V — Gold Country (41–50)

| # | Level | Role | Current seed | Proposed seed | k | Margin | Turns | Today (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 41 | Gold Seam | level | 96041 | **102095** | 6 | −6 | 20 | −12 / 20 | change |
| 42 | The Rush | level | 96042 | **103105** | 7 | 0 | 22 | −19 / 11 (strangled) | change |
| 43 | Prospector | level | 96043 | **97052** | 1 | −4 | 22 | −13 / 22 | change |
| 44 | Vein | level | 96044 | **97053** | 1 | +2 | 20 | −13 / 10 (strangled) | change |
| 45 | Two Claims | level | 96045 | **100081** | 4 | −3 | 22 | +13 / 20 | change |
| 46 | Open Ledger | breather | 96046 | 96046 | 0 | +8 | 18 | +8 / 18 | kept |
| 47 | The Mint | level | 96047 | **98065** | 2 | +2 | 20 | −14 / 18 | change |
| 48 | Paydirt | level | 96048 | **113201** | 17 | −1 | 22 | −9 / 22 | change |
| 49 | Gold Line | level | 96249 | **106339** | 10 | −5 | 20 | +6 / 18 | change |
| 50 | Mother Lode | finale | 96050 | **97059** | 1 | −6 | 18 | −14 / 18 | change |

### Chapter VI — The Long Way (51–60)

| # | Level | Role | Current seed | Proposed seed | k | Margin | Turns | Today (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 51 | Switchback | level | 96051 | **100087** | 4 | −3 | 20 | −17 / 11 (strangled) | change |
| 52 | Corridor | level | 96052 | 96052 | 0 | +1 | 18 | +1 / 18 | kept |
| 53 | The S-Bend | level | 96053 | **99080** | 3 | −6 | 20 | −8 / 22 | change |
| 54 | Double Pass | level | 96054 | **99081** | 3 | −6 | 20 | +12 / 18 | change |
| 55 | Halcyon | breather | 96055 | 96055 | 0 | +16 | 22 | +16 / 22 | kept |
| 56 | Narrows | level | 96056 | **97065** | 1 | −2 | 22 | −7 / 20 | change |
| 57 | Hairpin | level | 96357 | **101402** | 5 | −1 | 16 | −9 / 20 | change |
| 58 | Three Gates | level | 96058 | **100094** | 4 | −4 | 20 | −18 / 20 | change |
| 59 | Maze Garden | level | 96059 | **102113** | 6 | −1 | 18 | +7 / 18 | change |
| 60 | The Long Way | finale | 96060 | **102114** | 6 | −8 | 20 | −16 / 14 (strangled) | change |

### Chapter VII — Broken Crown (61–70)

| # | Level | Role | Current seed | Proposed seed | k | Margin | Turns | Today (margin / turns) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 61 | Shattered Ring | level | 96061 | **98079** | 2 | 0 | 20 | −20 / 20 | change |
| 62 | Crossbones | level | 96762 | **104834** | 8 | +1 | 22 | −11 / 22 | change |
| 63 | Ember Field | breather | 96063 | **97072** | 1 | +7 | 18 | +1 / 24 | change |
| 64 | Bramble | level | 96064 | **98082** | 2 | +2 | 20 | +11 / 20 | change |
| 65 | The Sieve | level | 96065 | **101110** | 5 | +1 | 18 | −14 / 17 (strangled) | change |
| 66 | Wolf Teeth | level | 96266 | **99293** | 3 | +1 | 20 | −10 / 20 | change |
| 67 | Broken Crown | level | 96067 | **97076** | 1 | −3 | 18 | −23 / 9 (strangled) | change |
| 68 | Ash Lattice | level | 96068 | **98086** | 2 | −4 | 18 | −8 / 16 | change |
| 69 | The Turning | level | 96069 | **110195** | 14 | −1 | 16 | −10 / 22 | change |
| 70 | Last Light | finale | 96070 | **99097** | 3 | −5 | 16 | −20 / 15 (strangled) | change |

---

## 3. Counts

### By role

| Role | Levels | Kept | Would change |
| --- | --- | --- | --- |
| `early` | 10 | 8 | 2 |
| `breather` | 5 | 3 | 2 |
| `level` | 40 | 7 | 33 |
| `finale` | 5 | 0 | 5 |
| **Total** | **60** | **18** | **42** |

The `level` role carries the problem: 33 of 40 would move. Every finale moves.

### By chapter

| Chapter | Levels | Kept | Would change |
| --- | --- | --- | --- |
| II — Broken Ground (11–20) | 10 | 8 | 2 |
| III — Narrow Paths (21–30) | 10 | 3 | 7 |
| IV — Hollow Ground (31–40) | 10 | 4 | 6 |
| V — Gold Country (41–50) | 10 | 1 | 9 |
| VI — The Long Way (51–60) | 10 | 2 | 8 |
| VII — Broken Crown (61–70) | 10 | 0 | 10 |
| **Total** | **60** | **18** | **42** |

The kept count is exactly the 18 levels whose shipped deal `fits` in `current-deals.jsonl`; the two
artifacts agree level for level.

**No level failed to find a candidate.** All 60 found an in-band seed within the 40-try budget
(worst case `k = 17`, well inside it), so none of this needs a board change or a band change to fit.
Every proposed deal is ≥ 16 turns and none strangles the stand-in — the re-pick would introduce
**zero** new wipe-outs by the tool's own definition.

---

## 4. Open question: the `early` band has no upper bound

`inBand()` for early levels is a floor only:

```ts
// src/sim/deal-design.ts:28
if (role === 'early') return margin >= -2 && !strangledStandIn;
```

There is no ceiling on `margin`. So "in band" for levels 11–20 means "the stand-in did not lose and
was not strangled" — it does not mean the level was a game. The result is that six intro levels are
currently kept while the stand-in **wins by 16 to 25 points**:

| # | Level | Margin | Turns |
| --- | --- | --- | --- |
| 11 | Pebble Trail | +20 | 22 |
| 12 | Split Meadow | +16 | 22 |
| 13 | The Detour | +18 | 24 |
| 14 | Open Horizon | +20 | 26 |
| 15 | Twin Stones | +22 | 22 |
| 16 | Broken Crossing | +25 | 17 |

These pass because the only hard limit is the 16-turn floor — and they clear it, at 17–26 turns,
while being blowouts in the player's favour. By contrast L17 (+2 / 16) and L18 (0 / 18) look like the
intended intro shape.

The band is asymmetric by design elsewhere: `level` and `finale` have ceilings, `early` and
`breather` do not. That is defensible for a breather (a rest is allowed to be easy, though even
L55 at +16 is a walkover), but for 11–16 it means "winnable" was read as "anything up to a rout".

This also affects the proposal, not just the current state: the first-fit rule picks the earliest
in-band candidate, so **L20 would be re-seeded from −11 to +11** — swapping an intro wipe-out for a
new +11 walkover, because the band accepts it. A ceiling would change some picks, not merely relabel
them; L19 (+3) looks fine, L20 would not.

**The question, for the owner — not answered here and not changed here:** is a +16 to +25 walkover
acceptable for intro levels 11–16, or does `early` need an upper bound (for example +8)? Two
consequences either way:

- If a walkover is acceptable for the first levels after the tutorial (confidence, teaching), the
  band is correct and the 18 kept include 11–16 honestly.
- If it is not, the band must gain a ceiling **and the run must be redone**: the 18 kept is a property
  of the one-sided band, and L20's proposal would change too. Do not freeze anything based on this
  run until that is decided.

No band, threshold or level was changed in this report.

---

## 5. The cost of applying: 42 frozen alternates

### Why a seed change is not free

A Campaign Seed is a **proof**: the client submits the action log, and the server replays it against
the level's opening before settling a reward.

- The opening is derived from the seed: `campaignOpening` is
  `newMatch(level.seed, level.config)` (`src/campaign/play.ts:10`).
- The verifier replays the log against that opening with the real deterministic bot
  (`server/src/seeds/verify.ts:15-41`), and the service refuses the reward if it does not reproduce:
  *"That Campaign result could not be verified."* (`server/src/seeds/service.ts:74-75`), otherwise
  settling `campaign:<levelId>` (`service.ts:77`).
- On a seed change, every action log recorded against the old deal stops replaying, because the
  engine shuffles a different deal from the new seed.

That is precisely the failure the frozen-alternate mechanism exists to prevent. Its own header says
a proof *"already earned (queued on a device, or produced by a bundle built before the change)"* must
never be refused (`src/campaign/frozen.ts:11-12`), and `docs/CAMPAIGN.md:661-663` states the standing
rule for any opening move: add the old opening to `ALTERNATE_OPENINGS` and rebuild the Edge bundle.

### Why the mechanism cannot express this today

`ALTERNATE_OPENINGS` records a *board*, not a deal:

```ts
// src/campaign/frozen.ts:19
export type AlternateOpening = { boardRadius: number; board: BoardSpec };
```

There is no seed field. The verifier's fallback therefore rebuilds the alternate from the level's
**current** seed:

```ts
// server/src/seeds/verify.ts:51-53
const alternate = ALTERNATE_OPENINGS[level.id];
if (!alternate) return null;
return verifyOfflineMatch(newMatch(level.seed, { ...level.config, ...alternate }), level.botLevel, { actions, botVersion });
```

`newMatch(level.seed, …)` is the *new* deal even when the alternate supplies an old board. A seed-only
alternate given the same board would replay the new deal, so the old proof would still fail. The
existing seven entries work only because the /2/ line differs by board (19-hex vs 37-hex) and shares
the seed (`frozen.ts:39-46`).

### What applying 42 changes would actually require

1. **Extend the record** — give `AlternateOpening` an optional `seed` (and make the board optional,
   since a seed-only alternate keeps the board) in `src/campaign/frozen.ts`.
2. **Extend the verifier** — `alternate.seed ?? level.seed` in `server/src/seeds/verify.ts:53`.
3. **42 entries** — one per changed level, each carrying the old seed and its board.
4. **42 proof tests** — the pattern exists (`tests/campaign/alternate-openings.test.ts:54-78`): play a
   full deterministic game on the old opening, then assert `verifyCampaignProof` still pays it. Doing
   that 42 times means 42 extra full games in the suite and 42 fixtures that must keep passing.
5. **Widen a deliberate guard** — `tests/campaign/alternate-openings.test.ts:38-49` pins the key set to
   exactly the seven `/2/` levels and asserts each alternate has `boardRadius === 2` and 19 cells. Four
   dozen seed-only alternates violate both assertions; the test must be relaxed on purpose, not by
   accident.
6. **Deploy order** — rebuild the Edge bundle with the new levels **before** the page. Server first is
   only safe because the frozen alternates keep accepting old-bundle and queued proofs; without them,
   anyone mid-level on the old page gets "could not be verified" after the swap.

Steps 1–2 and 6 are a server-schema and deploy decision, not a seed edit. That is the real cost: the
alternates are not paperwork, they are the compatibility layer for 42 levels and they stay forever.

---

## 6. Recommendation

**Apply a subset — the genuinely broken deals — not all 42, and not none.**

The evidence supports two different claims, and they should not be conflated. First, the late
chapters were never selected against a difficulty target, so most of the chapter is off-shape; that
is a systemic fact. Second, a much smaller set is *broken* rather than merely off-shape: it produces
wipe-outs or lock-outs that a player experiences as unfair. Fix the second now; schedule the first.

### What I would apply first: 13 levels

`19, 20, 24, 26, 30, 35, 42, 44, 51, 60, 65, 67, 70`

That is every deal that ends under 16 turns (24, 26, 35, 42, 44, 51, 60, 67, 70 — nine levels),
every deal that strangles the stand-in (24, 26, 30, 35, 42, 44, 51, 60, 65, 67, 70 — eleven levels,
which adds 30 and 65), plus the two intro levels lost by margin (19 at −21, 20 at −11). The union is
13.

Optionally add **31** (−17 at the chapter IV opener — a wall where a breather was promised) and
**63** (+1 over 24 turns — a grind, not a rest) for **15**. Those are role violations, not
wipe-outs, and they are the strongest cases outside the 13.

### What I would defer

The remaining 27-29 changes are levels that are *out of band but complete games* — e.g. 58 at −18 over
20 turns, 61 at −20 over 20, 21 at +16 over 20, 45 at +13. They are too easy or too hard against the
target curve, but they do not break. Re-seed them as one scheduled batch at a release boundary, when
the whole chapter can move at once.

### Why not all 42 now

1. The mechanism does not exist yet (§5). Applying seeds without it silently breaks old proofs, which
   the product promises not to do.
2. 42 of 60 is 70% of the chapter. That is a re-authoring of the deal layer, not a tuning pass, and it
   should be a version-level decision with release notes.
3. The measurement is a bot-7 stand-in and a first-fit search, not a human calibration. It is a good
   shape filter; it is not a difficulty oracle, and each pick is "the first deal that fits", not "the
   best deal".
4. The `early` target is unresolved (§4). If a ceiling is added, the run changes and L20's pick changes
   with it. Freezing 42 alternates for picks that are about to move is wasted work.

### Why not none

The wipe-outs are real defects. A 9-turn, −23 loss in the campaign finale (67), a −19 at 12 turns (24),
and eleven strangles are not "hard levels" — they are deals the player cannot play. The fix is
seed-only and touches no board, no bot and no rule. Leaving them is choosing a known bad experience.

### The mid-playthrough risk, stated plainly

Progress itself is safe: `severgrow.campaign.progress.v1` stores completed ids, so a player who has
beaten a level keeps it, and rewards already settled under `campaign:<id>` are not revoked by a seed
change. What changes is the *game*: a player who learned L30's opening — its first hand, who moves
first, which lane the gold falls on — would face a different one on replay. At 42 of 60, most of the
chapter they know is different; at 13, the levels they replay are the ones that were broken anyway.
Anyone mid-attempt on an old page also loses that attempt (their win is refused until they reload).
That is a real cost, and it is the main reason I would not take all 42 in one unannounced cut. If the
owner does choose all 42, do it **once**, with the verifier change first, and say it in the release
notes — never incrementally.

---

## 7. Where the change is largest (highest `k`)

`k` is how many alternate deals were tried before the first in-band one — i.e. how far the level's
shipped deal family sits from its intended shape. It is not a difficulty measure.

| # | Level | k | Current seed | Proposed seed |
| --- | --- | --- | --- | --- |
| 48 | Paydirt | 17 | 96048 | 113201 |
| 69 | The Turning | 14 | 96069 | 110195 |
| 49 | Gold Line | 10 | 96249 | 106339 |
| 62 | Crossbones | 8 | 96762 | 104834 |
| 42 | The Rush | 7 | 96042 | 103105 |
| 36 | Sparrow Stones | 6 | 96036 | 102090 |
| 41 | Gold Seam | 6 | 96041 | 102095 |
| 59 | Maze Garden | 6 | 96059 | 102113 |
| 60 | The Long Way | 6 | 96060 | 102114 |
| 22 | Forked Path | 5 | 95022 | 100067 |
| 57 | Hairpin | 5 | 96357 | 101402 |
| 65 | The Sieve | 5 | 96065 | 101110 |
| 45 | Two Claims | 4 | 96045 | 100081 |
| 51 | Switchback | 4 | 96051 | 100087 |
| 58 | Three Gates | 4 | 96058 | 100094 |

15 levels needed `k ≥ 4`. Levels 48 and 69 are the outliers: 17 and 14 candidate deals respectively
before one fit, both still inside the 40-try budget. If any level's deal is furthest from the authored
intent, it is 48, then 69, then 49.

---

## 8. Reproduction and checks

```sh
# the picks (60 JSON lines, one per level)
npx tsx src/sim/deal-design.ts -- --from=11 --to=70 --tries=40
```

The shipped-deal column comes from replaying each level's current opening through the same harness
(bot 7 in seat 0 vs the level's own bot), stored as `/tmp/sims/current-deals.jsonl` by the same
2026-11-12 analysis run. Both files are read-only inputs; the tool prints picks and never edits level
data.

This change is one markdown file. No `npm run check` was run for it, by instruction; the file was
checked to be valid markdown (balanced tables and fences, no stray artifacts), and `git status` shows
this file as the only change on the branch.
