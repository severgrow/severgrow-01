# Campaign levels 31-70 — design and implementation plan

**Branch:** `futa0.5-levels-31-70`, cut from `origin/futa0.5-online` (`8bdfbeb`).
**Status:** All four chapters — IV (31-40), V (41-50), VI (51-60), VII (61-70) — are BUILT and tested. Levels 31-70 are complete.

**Decisions taken 2026-10-18 (owner):**
1. **Board size:** stay on radius 3 (37 hexes) for 31-70; terrain is the only axis. A 61-hex board
   was probed and works, but at 360 px it gives ~36 px hexes — under the 44 px tap target.
2. **Breathers:** bot 8 is allowed on levels flagged `breather: true`, never twice in a row, at most a
   quarter of the extension. The 1-30 ladder keeps its original rule.
3. **Economy:** extend the Seeds cap to 70; 25 per first clear from 41; chapter bonuses at 60 (150)
   and 70 (200). Implemented in `server/src/seeds/config.ts`, with one shared constant for the cap.

This plan extends the campaign from 30 to 70 levels. Levels 1-30 are untouched. The other
active line (`futa0.5-onboarding`, published at `/2`, and the from-scratch rework at `/3`)
must not be edited from here; see *Parallel work* below for how the files are kept apart.

---

## 1. What 31-70 is for

Levels 1-30 teach the game, then close on a straight difficulty climb. 31-70 is the **long
game**: the rules stop changing and the **board** becomes the opponent's co-author. Each
chapter asks a different question with terrain instead of with a stronger AI:

1. Can you read a large shape and find the route that still exists?
2. Can you fight over value rather than space?
3. Can you survive a board that only lets you go the long way?
4. Can you hold a plan together when the terrain gives you nothing clean?

**The rules do not change.** Same maxRank 9, one sprout per turn, strengthen on, expanded
Bloom on, four Fruit cards. A player who learns the game in the campaign must meet exactly
that game online. Only `board` (cells, rock, gold), `seed`, and — rarely — `fruitCardCount`
vary. This is the same contract levels 1-30 keep.

**Bots:** bot 9 almost everywhere; bot 8 on a handful of deliberate breathers (§5). The
difficulty curve is carried by terrain pressure, not by an AI the game does not have above 9.

---

## 2. The engine's real limits (measured, not assumed)

These are hard constraints from `src/campaign/validate.ts` and `src/engine/config.ts`:

| Constraint | Value | Consequence |
| --- | --- | --- |
| Open hexes floor | 20 (radius 3: 37 cells) | **At most 17 rocks** (37 − 20); in practice 6–14, since gold needs open cells too |
| Home open neighbours | ≥ 3 | A home's neighbour ring stays clear (root zone rule) |
| Rock/gold in a root zone | forbidden | Never within 1 hex of either home |
| Reachability | every open hex reachable from **both** homes | No sealed pockets, no one-sided maze |
| Single-hex chokepoint | none allowed | Every "gate" must be ≥ 2 hexes, or there must be two ways round |
| Rock count parity | only the `rockCount` *knob* (must be even); authored `board.rock` is free | Odd counts are fine when the board is authored |
| Deck size | ≥ 2 × handSize + 2 | Not a risk here |

I probed radius-4 boards (61 hexes) on this branch: they validate cleanly (6 open neighbours
per home, no chokepoints) and a bot-9 vs bot-9 game finishes in ~1.5 s. So a bigger map is
*technically* available.

**DECIDE 1 — board size.** Recommendation: **stay on radius 3 (37 hexes) for all of 31-70**
and make terrain the only axis. A radius-4 board is 9 hex columns across, which on a 360 px
phone gives roughly 36-37 px hexes — below the 44 px tap target the cockpit itself uses, and
the campaign is phone-first. Radius 4 could become chapter VI's hook only after a real
tap-target/zoom pass; that is a separate piece of work, not a level-data change.

---

## 3. Chapter map

Four chapters of ten. Player-facing titles are proposals (the owner renames freely); ids are
stable and must not change once published.

| Chapter | Levels | id | Title (proposal) | The question it asks | Terrain budget (rocks + gold) |
| --- | --- | --- | --- | --- | --- |
| IV | 31-40 | `hollow-ground` | Hollow Ground | read a big shape, find the route | ~9-14 |
| V | 41-50 | `gold-country` | Gold Country | fight over value, not space | ~10-17 |
| VI | 51-60 | `the-long-way` | The Long Way | survive a board that detours you | ~12-18 |
| VII | 61-70 | `broken-crown` | Broken Crown | hold a plan when nothing is clean | ~15-23 |

The escalation is **total terrain pressure**, deliberately composed differently per chapter:
IV is rock-led, V is gold-led, VI is rock-heavy and gold-light, VII is both. That keeps the
late game from feeling like the same level with more stones.

---

## 4. Terrain vocabulary (the "funky" part)

Every shape below is symmetric about the centre unless marked, keeps both root zones clear,
and leaves two routes. Names are for the code comments and this document.

```
NOTCHED WALL     ▓▓▓▓ · ▓▓▓▓      one wide notch; both flanks open
TWIN HOLLOWS     ▓▓ · ▓▓ · ▓▓     two mirrored pockets, three lanes
LONG SHELF       ▓▓▓▓▓▓          rocks along one edge only: an asymmetric-feeling
                                 but mirror-symmetric shelf, gold on the far side
DOUBLE GATE      ▓▓▓ ▓▓ ▓▓▓      two 2-hex gates through a broken wall
ANVIL            ▓▓▓             a heavy cluster off-centre; the short way is closed
RIDGELINE        ▓▓▓▓▓▓          a diagonal ridge with two passes, one wide
HOLLOW CROWN     ring with 3 gaps: the centre is valuable and reachable three ways
GOLD SEAM        ····◆◆◆◆···      a line of gold between the homes
THE MINT         ring of rock around a gold core, four doors
GOLD LINE        ◆·◆·◆·◆         alternating gold and open: a race, not a wall
SWITCHBACK      ▓▓ ▓▓▓ ▓▓        alternating walls that force an S route
CORRIDOR         ▓▓▓▓▓▓▓▓        parallel walls; the width is the lesson
THREE GATES      wall with three 2-hex gaps: which gate do you commit to?
SIEVE            scattered singles   thirteen stones, no walls: every hex is a decision
BRAMBLE          clusters of 2-3   many small decisions, no single chokepoint
ASH LATTICE      criss-cross       a lattice that only leaves diagonals
```

Rules of thumb for authoring:

- **Mirror symmetry** (rotate 180° about the centre) is the default: both seats get the same
  board. Deliberate asymmetry is allowed only where the *gold* is what differs, and then the
  balance report must show no seat skew.
- **Never a single-hex gate.** Two-hex gates or two routes. The validator enforces this, but
  the intent is that no level is decided by one tap.
- **Rock near a home is banned**, so "defend your corner" levels are made by shaping the
  middle, not by walling the roots.
- Gold is *value*, rock is *space*. A level should lean on one of them, not both equally; the
  mix is what makes chapters feel different.

---

## 5. The 40 levels

Bot column: `9` unless marked. `B` = breather (bot 8). Rock/gold are authored counts; the
exact hexes are the implementation. Seeds are `96 031` … `96 070` (unused range; 1-30 use
95001-95059).

| # | Name (proposal) | Bot | Rock | Gold | Shape | Intent |
| --- | --- | --- | --- | --- | --- | --- |
| **IV — Hollow Ground** (BUILT) | | | | | | |
| 31 | First Light | **8** | 4 | 3 | shoulders | gold slot through the middle; soft re-entry after 30 |
| 32 | The Knot | 9 | 4 | 3 | pips | two diagonal pairs; polar lanes stay open |
| 33 | Outliers | 9 | 6 | 3 | outliers | corners taken, centre open |
| 34 | Crosswinds | 9 | 6 | 5 | cross | an X of lanes, gold down the arms |
| 35 | The Gate | 9 | 6 | 3 | gate | two wide crossings, one diagonal |
| 36 | Sparrow Stones | 9 | 8 | 5 | scatter | eight single stones, every hex a choice |
| 37 | Twin Anvils | 9 | 8 | 3 | anvils | two blocks; route around, not through |
| 38 | Gold Under Grass | **8** | 4 | 7 | pasture | gold almost everywhere; fight for value |
| 39 | Gated Ring | 9 | 8 | 5 | ring | the centre is gated, not sealed |
| 40 | Hollow Crown | 9 | 10 | 5 | crown | dense ring, gold spine; chapter finale |
| **V — Gold Country** (BUILT) | | | | | | |
| 41 | Gold Seam | 9 | 2 | 9 | seam | gold down the middle, gold on both wings |
| 42 | The Rush | 9 | 2 | 9 | spread | gold across both wings; the race starts at once |
| 43 | Prospector | 9 | 6 | 7 | scatter | scattered stone, and less gold than its neighbours |
| 44 | Vein | 9 | 4 | 9 | vein | gold toward both homes, gated on the other axis |
| 45 | Two Claims | 9 | 6 | 7 | wings | gold on the wings, stone gates on the spine |
| 46 | Open Ledger | **8** | 2 | 9 | open | almost nothing; pure play (breather) |
| 47 | The Mint | 9 | 6 | 9 | ring | a gold core ringed by stone, doors on the axes |
| 48 | Paydirt | 9 | 6 | 9 | middle | gold on the wings, stone across the middle |
| 49 | Gold Line | 9 | 8 | 9 | alternate | gold alternating with stone, long axis |
| 50 | Mother Lode | 9 | 8 | 9 | edges | gold everywhere, stone round the edges |
| **VI — The Long Way** (BUILT) | | | | | | |
| 51 | Switchback | 9 | 8 | 5 | switchback | the direct line is walled, the flanks are not |
| 52 | Corridor | 9 | 10 | 5 | corridor | one clear lane between two walls |
| 53 | The S-Bend | 9 | 10 | 5 | long switchback | the route reverses twice |
| 54 | Double Pass | 9 | 12 | 5 | two passes | pick one and commit |
| 55 | Halcyon | **8** | 6 | 7 | open | breather before the squeeze |
| 56 | Narrows | 9 | 12 | 3 | narrows | the tightest route so far |
| 57 | Hairpin | 9 | 12 | 5 | hairpin | the route doubles back |
| 58 | Three Gates | 9 | 12 | 5 | three gates | a real choice, not a corridor |
| 59 | Maze Garden | 9 | 14 | 3 | bramble | many small walls, no long one |
| 60 | The Long Way | 9 | 14 | 7 | corridor + crown | chapter finale |
| **VII — Broken Crown** (BUILT) | | | | | | |
| 61 | Shattered Ring | 9 | 10 | 5 | broken ring | the ring has holes |
| 62 | Crossbones | 9 | 10 | 7 | broken cross | two axes, both broken |
| 63 | Ember Field | **8** | 6 | 9 | scattered, gold-rich | breather (gold-led, like all breathers) |
| 64 | Bramble | 9 | 12 | 5 | bramble | no walls, all decisions |
| 65 | The Sieve | 9 | 12 | 7 | sieve | every hex is a choice |
| 66 | Wolf Teeth | 9 | 12 | 7 | teeth | short jabs, no wall |
| 67 | Broken Crown | 9 | 14 | 7 | crown, broken | the centre is a trap |
| 68 | Ash Lattice | 9 | 12 | 9 | lattice | only diagonals survive |
| 69 | The Turning | 9 | 14 | 9 | lattice + teeth | turn the board around |
| 70 | Last Light | 9 | 16 | 7 | composed finale | the campaign's hardest board |

Point symmetry forces even stone counts, so the plan's odd numbers (11, 13) could not be authored
as written; the drawn shapes are even and the intent (a heavier stone budget than chapter VI) holds.

Breathers: **31, 38, 46, 55, 63** — all five, never two consecutive; each sits where the previous
level spiked. A breather is also the one board in a rock-led chapter allowed to be gold-led, so it
plays as relief rather than another squeeze.

**Authoring note learned while building IV:** point symmetry forces even rock counts (every shape is a
pair), while gold is naturally odd because it is the centre plus pairs. The plan's original counts for
chapter IV were odd in places and were adjusted to the drawn shapes; the design intent (pressure rising
7 → 15) held.

### Chapter IV — measured, not assumed

60 deals per level, bot 9 in both seats, the level's own board:

| Lv | seat 0 | seat 1 | draws | avg turns |
| --- | --- | --- | --- | --- |
| 31 | 32 | 28 | 0 | 19.8 |
| 32 | 32 | 27 | 1 | 19.1 |
| 33 | 34 | 26 | 0 | 19.4 |
| 34 | 28 | 32 | 0 | 18.6 |
| 35 | 25 | 35 | 0 | 18.9 |
| 36 | 33 | 27 | 0 | 18.9 |
| 37 | 27 | 33 | 0 | 18.3 |
| 38 | 32 | 28 | 0 | 20.3 |
| 39 | 36 | 24 | 0 | 19.4 |
| 40 | 27 | 33 | 0 | 18.8 |

No level is visibly one-sided: the widest split is 36/60 (60%), inside the noise of a 60-game sample.
Average length is 18-20 turns, i.e. the deck runs out at about the same pace across the chapter, so the
boards vary the *shape* of the game rather than its length. Finish mix is mostly score (deck
exhaustion) with a strangle in roughly one game in eight; bot 9 defends well, which is what makes the
terrain matter.

A versus-reference read (this bot against bot 7, seats swapped) showed bot 9 winning most levels from
both seats. One level (37) lost both at a single sample; re-measured over 12 deals per seat it is
6/12 and 6/12, so that was noise, not a broken board. **Do not treat a one-game versus-reference
result as evidence** — the 24-deal table above is the one to read.

### Chapter V — measured, not assumed

60 deals per level, the level's bot in both seats, the level's own board:

| Lv | seat 0 | seat 1 | avg turns | finishes |
| --- | --- | --- | --- | --- |
| 41 | 28 | 32 | 18.8 | score 53, strangle 7 |
| 42 | 34 | 26 | 19.5 | score 55, strangle 5 |
| 43 | 32 | 28 | 19.1 | score 50, strangle 10 |
| 44 | 30 | 30 | 18.5 | score 52, strangle 8 |
| 45 | 30 | 30 | 18.9 | score 51, strangle 9 |
| 46 | 27 | 33 | 20.7 | score 56, strangle 4 |
| 47 | 32 | 27 | 19.6 | score 60, strangle 0 |
| 48 | 25 | 35 | 19.5 | score 53, strangle 7 |
| 49 | 23 | 37 | 19.2 | score 53, strangle 7 |
| 50 | 26 | 33 | 20.0 | score 54, strangle 6 |

The chapter is even (widest split 34/26 except level 49). Level 49 tripped the tool's 20% skew flag,
so it was re-measured over eight independent 60-deal sweeps — 28/32, 33/27, 26/34, 31/29, 28/32,
33/27, and the flagged 23/37 — which says the board is even and that one seed series was unlucky. Its
seed is now 96249 (33/27, 10%) so the tool does not report a phantom defect; the board is unchanged.

The intent is visible in the finish mix: strangles run 5-10 per 60 (chapter IV was about 7-8) because
gold pulls both players onto the same ground, while **The Mint (47) never strangles** — 60 of 60
score games — because its stone ring plus gold core is defensible from either side.

### Chapter VI — measured, not assumed

| Lv | seat 0 | seat 1 | avg turns | finishes |
| --- | --- | --- | --- | --- |
| 51 | 35 | 25 | 19.7 | score 55, strangle 5 |
| 52 | 33 | 26 | 17.7 | score 47, strangle 13 |
| 53 | 35 | 25 | 18.9 | score 53, strangle 7 |
| 54 | 35 | 25 | 18.4 | score 47, strangle 13 |
| 55 | 29 | 30 | 20.3 | score 57, strangle 3 |
| 56 | 24 | 36 | 19.2 | score 51, strangle 9 |
| 57 | 23 | 37 | 19.3 | score 53, strangle 7 |
| 58 | 30 | 30 | 19.2 | score 53, strangle 7 |
| 59 | 32 | 28 | 19.4 | score 52, strangle 8 |
| 60 | 26 | 34 | 18.9 | score 48, strangle 12 |

Level 57 tripped the skew flag at 23%, so it was re-measured over eight independent sweeps (23/37,
35/24, 30/30, 29/31, 28/32, 28/32): the board is even, one series was unlucky. Its seed is now
96357 (31/29) so the tool reports no phantom defect. Same failure mode as level 49 — re-measure
before redesigning.

Strangles roughly double against chapter V (7-13 per 60 against 5-10): a walled route punishes
over-extension with a cutoff. Levels 52 and 54 are the peaks (they have two routes that meet), and
Halcyon (55) is the floor at 3.

Found during the browser pass, NOT fixed here (it is released-line behaviour, and the `/3` rework may
touch the same entry point): the menu entry shows `LEVEL <current>` (here LEVEL 40) but tapping it
resumes an unfinished match from an earlier level (here 31), because `enterCampaign()` prefers
`campaignResume()` without saying so. With 40+ levels that mismatch is easier to hit. Proposed fix:
when a save exists, label the entry with the saved level, or show "Resume" as the label.

---

## 6. Difficulty rule, and the test that will pin it

The existing test asserts the bot ladder never decreases and matches a fixed sequence for
1-30. Bots 8 at 31/38/46/55/63 break that. **DECIDE 2:** accept breathers and replace the
rule for 31-70, or use bot 9 throughout (simplest, but flat).

Recommendation: accept them, and replace the rule with something stricter than "it may drop":

- 1-30 keep their exact approved sequence, unchanged.
- 31-70: bot ∈ {8, 9}; a level may use 8 **only** if it is flagged `breather: true` in level
  data; `breather` may never be true twice in a row; at most 6 in total.
- That makes "occasionally 8" a reviewed design decision in the data, not an invisible drift.

`CampaignLevel` gains one optional field:

```ts
/** A deliberate easier level (bot 8) placed where the terrain spikes. Never two in a row. */
breather?: boolean;
```

---

## 7. Rewards — needs an economy decision

`server/src/seeds/config.ts` currently **caps paid campaign levels at 50** and only pays a
chapter bonus at 10/20/30/40/50:

```ts
if (!Number.isInteger(level) || level < 1 || level > 50) return null;
const firstWin = level <= 3 ? 50 : level <= 20 ? 15 : level <= 40 ? 20 : 25;
const chapter = ({ 10: 50, 20: 60, 30: 75, 40: 90, 50: 125 })[level] ?? 0;
```

So levels **51-70 would pay nothing** — silently, and `null` reads as "no reward" rather than
an error. This is server-side and it is the owner's economy, not a level-data detail.

**DECIDE 3** — pick one:

- **A (recommended):** raise the cap to 70; first-win 25 for 41-70; chapter bonuses 60: 150,
  70: 200. Requires an Edge bundle rebuild + deploy and updates to the seeds tests.
- **B:** cap stays 50; 51-70 are "for the journey" and pay nothing. Then the finish card must
  NOT show a Seeds line for them, which needs an explicit check, or it will look broken.
- **C:** pay 51-70 like Training does. Not recommended: it makes story levels farmable.

---

## 8. Engineering

**File split (matters for parallel work).** The `/3` agent is rebuilding onboarding and will
edit `src/campaign/levels.ts`. To keep that collision to a single line:

- New file `src/campaign/levels-late.ts` holds chapters IV-VII and exports `LATE_LEVELS`.
- `levels.ts` keeps levels 1-30 and appends: `export const CAMPAIGN_LEVELS = [...EARLY_LEVELS, ...LATE_LEVELS]`.
- Chapters array extends with four entries; `src/strings.ts` gains four `CAMPAIGN.chapters`
  entries (`hollow-ground`, `gold-country`, `the-long-way`, `broken-crown`) with a title and
  one-line subtitle each. Roman numerals already support VII.

**No schema change beyond `breather?`.** No new action, card, currency or rule. The
`campaign:c<chapter>-<level>` id shape (`c4-31` … `c7-70`) already matches the seed-reward
parser and the proof verifier; new ids are new proofs, so nothing already earned changes.

**Tests to update (all deliberate, none weakened):**

| File | Change |
| --- | --- |
| `tests/campaign/levels.test.ts` | 30 → 70 levels; 3 → 7 chapters (contiguous, 10 each); rock/gold table extended to 70; bot rule split at 30 (§6); uniqueness of id/seed/board; radius 3 for 31-70 |
| same file | new: per-chapter terrain budget is non-decreasing (IV ≤ V ≤ VI ≤ VII) |
| same file | new: a `breather` is never followed by a `breather`, and at most 6 exist |
| `server/tests/**` seeds | only if DECIDE 3 = A |
| `docs/CAMPAIGN.md` | chapter tables, ladder, "how to add a level" now points at `levels-late.ts` |

**Verification sequence** (in order, all before review):

1. `validateCampaign()` — every new board legal, no chokepoints, no terrain in a root zone.
2. `npm run campaign:balance -- --games=20` — per level: seat split across deals (layout
   fairness), game length, and finish mix (strangle vs score). Flag anything over 40 turns or
   visibly one-sided.
3. A new **terrain pressure** read from the same report: rocks+gold per level, so the chapter
   escalation in §3 is evidence, not intent.
4. Browser pass at 360×640 and 390×844 on a sample (31, 40, 50, 60, 70): board renders,
   hexes tappable, 7 chapters scroll in the level list, finish card correct.
5. `npm run check`, then `CHANNEL=futa04 npm run web:build` + asset check.

---

## 9. Parallel work / branch safety

- This branch is cut from `origin/futa0.5-online` and touches: `levels-late.ts` (new),
  `levels.ts` (one import + one spread), `strings.ts` (four chapter entries), tests, docs.
- `futa0.5-onboarding` (published at `/2`) and the `/3` rework are **not** touched. The
  `levels-late.ts` split exists precisely so their edits to `levels.ts` merge cleanly.
- No deploy of `/2` or `/3` from here. No merge until the owner asks.

---

## 10. Order of work

1. **Answer DECIDE 1-3** (board size, breathers, rewards).
2. Write `levels-late.ts` chapter IV only (31-40) + tests + balance run. Review the feel on a
   phone before authoring 30 more boards — authoring is cheap, renaming 30 published levels is
   not.
3. Chapter V, then VI, then VII, each with its own balance pass.
4. Docs, then the full verification sweep in §8.
5. Commit per chapter (five coherent commits), not one 40-level blob.

**What this plan deliberately does not do:** change any rule, add a new mechanic, raise the
bot above 9, or touch levels 1-30.
