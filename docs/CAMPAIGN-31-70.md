# Campaign levels 31-70 — design and implementation plan

**Branch:** `futa0.5-levels-31-70`, cut from `origin/futa0.5-online` (`8bdfbeb`).
**Status:** PLAN. No level data written yet. Decisions marked **DECIDE** need an owner answer.

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
| **IV — Hollow Ground** | | | | | | |
| 31 | First Light | **8** | 4 | 3 | Notched wall | welcoming re-entry; new scale, no new pressure |
| 32 | The Notch | 9 | 5 | 3 | Notched wall, wider | read the gap |
| 33 | Twin Hollows | 9 | 6 | 3 | Twin hollows | choose a lane early |
| 34 | Long Shelf | 9 | 6 | 5 | Long shelf | one side is richer |
| 35 | The Gate | 9 | 7 | 3 | Double gate | commit to a gate |
| 36 | Sparrow Stones | 9 | 7 | 5 | scattered pairs | many small decisions |
| 37 | The Anvil | 9 | 8 | 3 | anvil | the short way is closed |
| 38 | Gold Under Grass | **8** | 4 | 7 | scattered, gold-heavy | breather: value over space |
| 39 | Ridgeline | 9 | 8 | 5 | ridgeline | two passes, one wide |
| 40 | Hollow Crown | 9 | 9 | 5 | hollow crown | chapter finale: three ways in |
| **V — Gold Country** | | | | | | |
| 41 | Gold Seam | 9 | 3 | 7 | gold seam | first pure economy board |
| 42 | The Rush | 9 | 2 | 9 | open, nine gold | almost no rock; greed |
| 43 | Prospector | 9 | 5 | 7 | scattered + seam | reach vs hold |
| 44 | Vein | 9 | 4 | 8 | diagonal gold line | the race is the level |
| 45 | Two Claims | 9 | 6 | 7 | two mirror gold clusters | which claim do you defend |
| 46 | Open Ledger | **8** | 2 | 5 | near-empty | breather: pure play |
| 47 | The Mint | 9 | 6 | 9 | mint | four doors to nine gold |
| 48 | Paydirt | 9 | 5 | 8 | clustered gold | convert position into value |
| 49 | Gold Line | 9 | 7 | 7 | alternating line | greed vs connection |
| 50 | Mother Lode | 9 | 8 | 9 | dense gold + rock | chapter finale: richest board |
| **VI — The Long Way** | | | | | | |
| 51 | Switchback | 9 | 8 | 4 | switchback | the S route |
| 52 | Corridor | 9 | 9 | 4 | corridor | width is the lesson |
| 53 | The S-Bend | 9 | 10 | 3 | long switchback | patience |
| 54 | Double Pass | 9 | 10 | 5 | two passes | pick your pass |
| 55 | Halcyon | **8** | 5 | 6 | open | breather before the squeeze |
| 56 | Narrows | 9 | 11 | 4 | narrows | space is scarce |
| 57 | Hairpin | 9 | 11 | 5 | hairpin | reverse course cheaply |
| 58 | Three Gates | 9 | 12 | 4 | three gates | a real choice, not a corridor |
| 59 | Maze Garden | 9 | 12 | 5 | bramble | many small decisions |
| 60 | The Long Way | 9 | 12 | 6 | corridor + crown | chapter finale |
| **VII — Broken Crown** | | | | | | |
| 61 | Shattered Ring | 9 | 10 | 5 | broken ring | the ring has holes |
| 62 | Crossbones | 9 | 11 | 5 | cross | two axes, both broken |
| 63 | Ember Field | **8** | 8 | 7 | scattered, gold-rich | breather |
| 64 | Bramble | 9 | 12 | 5 | bramble | no walls, all decisions |
| 65 | The Sieve | 9 | 13 | 5 | sieve | every hex is a choice |
| 66 | Wolf Teeth | 9 | 12 | 6 | teeth | short jabs, no wall |
| 67 | Broken Crown | 9 | 13 | 7 | crown, broken | the centre is a trap |
| 68 | Ash Lattice | 9 | 14 | 5 | lattice | only diagonals survive |
| 69 | The Turning | 9 | 14 | 7 | lattice + teeth | turn the board around |
| 70 | Last Light | 9 | 14 | 9 | composed finale | the campaign's hardest board |

Breathers: **31, 38, 46, 55, 63** (five of forty). No two consecutive; each sits where the
previous level spiked, and each introduces or consolidates something rather than being filler.

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
