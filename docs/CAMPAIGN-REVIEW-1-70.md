# Campaign review — levels 1–70, for the agent extending to 100

**Mode:** strictly read-only. No file in the worktree was created, edited, staged, committed or built.
**Where:** a checkout of branch `futa0.5-levels-31-70` (the branch that carries levels 1-70).
**Method:** file reads, `rg`, and one read-only `git status --short`. No `npm`, no `vitest`, no build.
**Uncommitted state, as observed:** `git status --short` reports three tracked modifications
(`web/e2e/lessons-3.ts`, `web/src/main.ts`, `web/src/player/glass-surface.ts`) plus untracked
`.claude/`, `.cursor/`, four `docs/screens/**/*.png` and `web/dist-live/`. That is consistent with
"another agent is working here"; nothing below depends on those files.

**How to read this document.** Anything quoted from code has a `file:line`. Anything that is a
judgement or a projection is marked **INFERRED**. Where a number is a count of `config.board.rock`
or `config.board.gold`, it is the literal array length in the level data and can be re-derived with
`rg -n "level\\(|late\\("`. Documented balance numbers (finish mix, seat splits) are quoted from
`docs/CAMPAIGN.md` and `docs/CAMPAIGN-31-70.md` and were **not** re-run; they are labelled
"documented".

---

## 0. Corrections to the brief (verify before quoting)

These four matter because the next agent will otherwise build on a wrong premise.

1. **"Bots 1–4 appear ONLY in lessons 1–9" is false as written.** Bot 4 is used at levels 9, 10 and
   **11** (`src/campaign/levels.ts:172,174,180`; the ladder is pinned in
   `tests/campaign/levels.test.ts:266-278`). Bot 4's run crosses the chapter I/II boundary. The
   correct statement is: bots 1–3 are confined to levels 1–8; bot 4 spans 9–11.

2. **"Levels 1–30 already ship point-symmetric" is false.** `src/campaign/levels-late.ts:32-33`
   claims it, and `docs/CAMPAIGN.md:414` repeats it. Counting the rock arrays: **17 of 30 boards in
   1–30 have at least one unpaired rock** (levels 3, 6, 7, 9, 10, 12, 13, 14, 16, 17, 19, 20, 21, 22,
   24, 25, 28). Gold is symmetric everywhere in 1–30; rock is not. All of 31–70 **is** symmetric
   (checked pair-by-pair). So the "symmetry" the late file relies on was a *new* convention at 31,
   not an inherited one.

3. **`docs/CAMPAIGN.md` contradicts itself on levels 4–10.** Its Chapter I table gives `Map = 2` for
   all ten (`docs/CAMPAIGN.md:185-195`), then later says "The board split is 1–3 small, 4–30 full"
   (`:312`). The code and the test agree with the latter: only levels 1–3 are radius 2
   (`src/campaign/levels.ts:155-160`; `tests/campaign/levels.test.ts:290-310`).

4. **`validate.ts` does not enforce symmetry, and no test does either.** Symmetry is a prose rule
   (`docs/CAMPAIGN-31-70.md:112-114`). This is the single most consequential fact for section 5.

Also worth knowing before authoring: **levels 59 and 60 have byte-identical rock arrays** (14 stones,
same order); only gold differs (3 vs 7). See §2.6.

---

## 1. Per-level table (all 70)

Columns: `#`, name, chapter (roman), `botLevel`, board shape, rock count, gold count, `breather`,
open hexes (`cells − rock`), stated `intent`, source line. Pressure (`rock + gold`) is used by
sections 3–4; the per-level series is given below the table.

Shapes for 31–70 are the names the code itself uses (the first token of each `intent`). Shapes for
1–30 are not named in the data; they are described from the arrays.

| # | Name | Ch | Bot | Shape | Rock | Gold | B | Open | Intent (verbatim) | Src |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | First Seed | I | 1 | open, no stone (r2) | 0 | 1 | — | 19 | Completely open, welcoming; the tutorial map. | levels.ts:155 |
| 2 | New Growth | I | 1 | open + inner gold pair (r2) | 0 | 3 | — | 19 | Another open board; a first taste of contested gold. | levels.ts:158 |
| 3 | Two Directions | I | 1 | lone edge stone (r2), unpaired | 1 | 3 | — | 18 | One harmless edge rock. | levels.ts:160 |
| 4 | The Clearing | I | 2 | open | 0 | 3 | — | 37 | Connected territory: open board, gold on the q axis. | levels.ts:162 |
| 5 | Stone in the Grass | I | 2 | mirrored flank pair | 2 | 3 | — | 35 | Tile numbers and strength: a mirrored pair away from the central routes. | levels.ts:164 |
| 6 | Branching Out | I | 3 | one off-diagonal stone, unpaired | 1 | 3 | — | 36 | Defending connected territory: one stone asks for a second direction. | levels.ts:166 |
| 7 | First Obstacle | I | 3 | two-hex cluster, left flank, unpaired | 2 | 3 | — | 35 | Cutting a connection: a small rock cluster near a flank. | levels.ts:168 |
| 8 | The Open Field | I | 3 | open, flank gold | 0 | 3 | — | 37 | Fruit: a stronger opponent and flank gold, on open ground. | levels.ts:170 |
| 9 | Around the Stone | I | 4 | three-hex wall, unpaired | 3 | 3 | — | 34 | Bloom: a short wall to paint around, room for three in a row. | levels.ts:172 |
| 10 | The First Grove | I | 4 | compact off-centre grove, unpaired | 3 | 3 | — | 34 | Chapter finale: gold and every lesson so far. | levels.ts:174 |
| 11 | Pebble Trail | II | 4 | two pebbles (mirrored pair) | 2 | 3 | — | 35 | Two pebbles beside the trail; still wide open. | levels.ts:180 |
| 12 | Split Meadow | II | 5 | short wall across the centre, unpaired | 3 | 3 | — | 34 | A split down the middle; pick a lane. | levels.ts:182 |
| 13 | The Detour | II | 5 | four-hex arc, unpaired | 4 | 3 | — | 33 | A four-hex arc to route around. | levels.ts:184 |
| 14 | Open Horizon | II | 5 | one lone stone, unpaired | 1 | 3 | — | 36 | Open ground and a clearly better bot. | levels.ts:186 |
| 15 | Twin Stones | II | 6 | twin flank pair + central pair | 4 | 3 | — | 33 | Twin flanks and a central pair. | levels.ts:188 |
| 16 | Broken Crossing | II | 6 | broken line, two gaps, unpaired | 4 | 3 | — | 33 | A broken wall with two crossings. | levels.ts:190 |
| 17 | The Long Way | II | 6 | walls on both inner flanks, unpaired | 5 | 3 | — | 32 | Both inner lanes close early; go the long way. | levels.ts:192 |
| 18 | Quiet Clearing | II | 7 | thin central pair | 2 | 3 | — | 35 | Open again: fewer stones, a sharper bot. | levels.ts:194 |
| 19 | Stone Garden | II | 7 | five scattered stones, unpaired | 5 | 3 | — | 32 | Five scattered stones, five small choices. | levels.ts:196 |
| 20 | The Broken Grove | II | 7 | broken grove round the centre, unpaired | 5 | 5 | — | 32 | Chapter finale: a broken grove, bot 7, five gold. | levels.ts:198 |
| 21 | The Passage | III | 8 | two offset walls (diagonal passage), unpaired | 4 | 3 | — | 33 | Two offset walls leave a diagonal passage. | levels.ts:204 |
| 22 | Forked Path | III | 8 | fork: central stone + four satellites, unpaired | 5 | 3 | — | 32 | Choose a fork; the flanks reopen behind it. | levels.ts:206 |
| 23 | Central Ground | III | 8 | four-stone ring round the centre gold | 4 | 3 | — | 33 | The centre is a fortress with two doors. | levels.ts:208 |
| 24 | The Side Route | III | 8 | long ridge down one axis, unpaired | 5 | 3 | — | 32 | A long ridge; take the side route. | levels.ts:210 |
| 25 | The Bottleneck | III | 9 | two blobs + neck, unpaired | 6 | 3 | — | 31 | Two blobs and a narrow neck. | levels.ts:212 |
| 26 | Four Corners | III | 9 | four outer hexes | 4 | 3 | — | 33 | The four corners are spoken for. | levels.ts:214 |
| 27 | Split Decision | III | 9 | mirrored split with two gaps | 6 | 3 | — | 31 | One split, two choices, no time to dither. | levels.ts:216 |
| 28 | Open Conflict | III | 9 | almost open (two stones), unpaired | 2 | 3 | — | 35 | Almost open; the best bot in the campaign. | levels.ts:221 |
| 29 | The Crossing | III | 9 | wall across the middle with gaps | 6 | 5 | — | 31 | Cross at the centre or around the ends. | levels.ts:223 |
| 30 | Heart of Stone | III | 9 | six-stone heart round the centre | 6 | 3 | — | 31 | The campaign finale: a stone heart round the gold centre. | levels.ts:225 |
| 31 | First Light | IV | 8 | shoulders | 4 | 3 | yes | 33 | Shoulders: gold slot through the middle; a soft re-entry after 30. | late:82 |
| 32 | The Knot | IV | 9 | pips | 4 | 3 | — | 33 | Pips: two diagonal pairs; read which lanes survive. | late:88 |
| 33 | Outliers | IV | 9 | outliers | 6 | 3 | — | 31 | Outliers: corners taken, centre open. | late:94 |
| 34 | Crosswinds | IV | 9 | cross | 6 | 5 | — | 31 | Cross: an X of lanes, gold down the arms. | late:100 |
| 35 | The Gate | IV | 9 | gate | 6 | 3 | — | 31 | Gate: two wide crossings, one diagonal. | late:106 |
| 36 | Sparrow Stones | IV | 9 | scatter | 8 | 5 | — | 29 | Scatter: eight single stones, every hex a choice. | late:112 |
| 37 | Twin Anvils | IV | 9 | anvils | 8 | 3 | — | 29 | Anvils: two blocks; route around, not through. | late:118 |
| 38 | Gold Under Grass | IV | 8 | pasture | 4 | 7 | yes | 33 | Pasture: gold almost everywhere; the fight is for value. | late:124 |
| 39 | Gated Ring | IV | 9 | ring | 8 | 5 | — | 29 | Ring: the centre is gated, not sealed. | late:130 |
| 40 | Hollow Crown | IV | 9 | crown | 10 | 5 | — | 27 | Crown: dense ring, gold spine; chapter finale. | late:136 |
| 41 | Gold Seam | V | 9 | seam | 2 | 9 | — | 35 | Seam: five gold down the middle, gold on both wings. | late:150 |
| 42 | The Rush | V | 9 | spread | 2 | 9 | — | 35 | Rush: gold across both wings; the race starts at turn one. | late:156 |
| 43 | Prospector | V | 9 | scatter | 6 | 7 | — | 31 | Prospector: scattered stone over a gold field; less gold than its neighbours. | late:162 |
| 44 | Vein | V | 9 | vein | 4 | 9 | — | 33 | Vein: gold running toward both homes, stone gates on the other axis. | late:168 |
| 45 | Two Claims | V | 9 | wings | 6 | 7 | — | 31 | Two Claims: gold on the wings, stone gates on the spine. | late:174 |
| 46 | Open Ledger | V | 8 | open | 2 | 9 | yes | 35 | Open Ledger: almost nothing on the board; pure play. | late:180 |
| 47 | The Mint | V | 9 | ring | 6 | 9 | — | 31 | Mint: a gold core ringed by stone, with doors on the axes. | late:186 |
| 48 | Paydirt | V | 9 | middle | 6 | 9 | — | 31 | Paydirt: gold on the wings, stone across the middle. | late:192 |
| 49 | Gold Line | V | 9 | alternate | 8 | 9 | — | 29 | Gold Line: gold alternating with stone along the long axis. | late:200 |
| 50 | Mother Lode | V | 9 | edges | 8 | 9 | — | 29 | Mother Lode: gold everywhere, stone round the edges; the richest board. | late:206 |
| 51 | Switchback | VI | 9 | switchback | 8 | 5 | — | 29 | an S route: the direct line is walled, the flanks are not | late:220 |
| 52 | Corridor | VI | 9 | corridor | 10 | 5 | — | 27 | one clear lane between two walls | late:225 |
| 53 | The S-Bend | VI | 9 | long switchback | 10 | 5 | — | 27 | a longer switchback: the route reverses twice | late:230 |
| 54 | Double Pass | VI | 9 | two passes | 12 | 5 | — | 25 | two passes; pick one and commit | late:235 |
| 55 | Halcyon | VI | 8 | open (breather) | 6 | 7 | yes | 31 | the breather: three stone pairs and a wide gold field | late:240 |
| 56 | Narrows | VI | 9 | narrows | 12 | 3 | — | 25 | the tightest route so far; still two hexes at every cut | late:245 |
| 57 | Hairpin | VI | 9 | hairpin | 12 | 5 | — | 25 | the route doubles back; reversing course is cheap | late:252 |
| 58 | Three Gates | VI | 9 | three gates | 12 | 5 | — | 25 | three gates, not a corridor: a real choice | late:257 |
| 59 | Maze Garden | VI | 9 | bramble | 14 | 3 | — | 23 | many small walls; every hex a small decision | late:262 |
| 60 | The Long Way | VI | 9 | corridor + crown | 14 | 7 | — | 23 | corridor plus rock crown; the chapter finale | late:267 |
| 61 | Shattered Ring | VII | 9 | broken ring | 10 | 5 | — | 27 | the ring has holes; read which gaps are worth taking | late:281 |
| 62 | Crossbones | VII | 9 | broken cross | 10 | 7 | — | 27 | two axes, both broken before they meet | late:288 |
| 63 | Ember Field | VII | 8 | scatter (breather) | 6 | 9 | yes | 31 | the breather: scattered stone over a gold-rich field | late:293 |
| 64 | Bramble | VII | 9 | bramble | 12 | 5 | — | 25 | no walls, all decisions | late:298 |
| 65 | The Sieve | VII | 9 | sieve | 12 | 7 | — | 25 | every hex is a choice | late:303 |
| 66 | Wolf Teeth | VII | 9 | teeth | 12 | 7 | — | 25 | short jabs, no wall | late:310 |
| 67 | Broken Crown | VII | 9 | crown (broken) | 14 | 7 | — | 23 | the centre is a trap | late:315 |
| 68 | Ash Lattice | VII | 9 | lattice | 12 | 9 | — | 25 | only diagonals survive | late:320 |
| 69 | The Turning | VII | 9 | lattice + teeth | 14 | 9 | — | 23 | lattice plus teeth; turn the board around | late:325 |
| 70 | Last Light | VII | 9 | composed finale | 16 | 7 | — | 21 | the campaign finale: every shape at once | late:330 |

**Totals / aggregates** (arithmetic from the table; the per-level rock counts are also pinned by
`tests/campaign/levels.test.ts:99-123`):

| Chapter | Levels | Bots used | Rock range | Gold range | Mean pressure (rock+gold) |
| --- | --- | --- | --- | --- | --- |
| I | 1–10 | 1–4 | 0–3 | 1–3 | 4.0 |
| II | 11–20 | 4–7 | 1–5 | 3–5 | 6.7 |
| III | 21–30 | 8–9 | 2–6 | 3–5 | 8.0 |
| IV | 31–40 | 8–9 | 4–10 | 3–7 | 10.6 |
| V | 41–50 | 8–9 | 2–8 | 7–9 | 13.6 |
| VI | 51–60 | 8–9 | 6–14 | 3–7 | 16.0 |
| VII | 61–70 | 8–9 | 6–16 | 5–9 | 19.0 |

Per-level pressure series (used throughout §4):

```
1-10   1  3  4  3  5  4  5  3  6  6
11-20  5  6  7  4  7  7  8  5  8 10
21-30  7  8  7  8  9  7  9  5 11  9
31-40  7  7  9 11  9 13 11 11 13 15
41-50 11 11 13 13 13 11 15 15 17 17
51-60 13 15 15 17 13 15 17 17 17 21
61-70 15 17 15 17 19 19 21 21 23 23
```

Breathers: 31, 38, 46, 55, 63 — five, all `botLevel: 8`, none consecutive
(`src/campaign/levels-late.ts:82,124,180,240,293`). Ten levels use some non-default config key? No:
**all 70 levels set only `boardRadius`, `rootStyle` and `board`** (`src/campaign/levels.ts:117-131`
and `src/campaign/levels-late.ts:52-70`). No campaign level currently varies any other engine knob.

---

## 2. Per-chapter critique

For each chapter: the stated focus (from `src/strings.ts` and the level intents), whether the boards
express it, the shape of the curve, breather placement, and the concrete weaknesses.

### 2.1 Chapter I — First Growth (1–10)

**Stated focus.** Subtitle "Ten gentle levels on the open ground." (`src/strings.ts:1104-1107`). The
intents walk a clear sequence: fully open (1), contested gold (2), first stone (3), open ground
against a better bot (4), mirrored flank pair (5), one stone that asks for a second direction (6),
first cluster (7), open field with Fruit (8), short wall for a Bloom (9), grove finale (10).

**Do the boards express it?** Yes for 1–5, and mostly for 6–10: rock never exceeds three, and every
board keeps at least 34 of 37 hexes open (levels 9–10: 34; the r2 levels: 18–19 of 19). It is the
one chapter where the rock counts themselves form a lesson rather than a difficulty dial.

**Curve.** Bot `1,1,1,2,2,3,3,3,4,4` — strictly non-decreasing, with runs of 3, 2, 3, 2. Terrain
pressure `1,3,4,3,5,4,5,3,6,6`: it falls at 4, 6 and 8. Each fall except one coincides with a bot
step-up (4: bot 2, 6: bot 3), so the perceived step is carried by the AI, not the board. The
exception is **level 8**: same bot as 7 (bot 3), two fewer stones (0 vs 2), and its intent claims
"a stronger opponent". That is a factual mismatch between the intent and `botLevel`.

**Breather placement.** Levels 4 and 8 are the open boards. Neither is flagged (the `breather` flag
is only defined for 31+, per the field comment at `levels.ts:38-42` and the test at
`levels.test.ts:242-261`). Level 4 is a well-placed relief after the first stone; level 8 is a dip
between two 2- and 3-rock levels.

**What is weak, concretely.**
- Level 8's stated "stronger opponent" is not stronger than levels 6–7 (all bot 3).
- Gold is `centre + one mirrored pair` (3 hexes) for levels 2–10; only the axis/positions change.
  Nine of ten levels carry exactly 3 gold; level 1 carries 1.
- Level 3's lone rock (`-2,0`) is the only unpaired stone in the chapter and the first board a
  player sees with terrain — it is also the only unpaired rock in the first five levels.
- Levels 9 and 10 are the only 37-hex levels with 3 rocks, and both are "wall + gold pair"; the
  finale's rock set is a 3-stone L, not visibly a "grove" beyond the name.

### 2.2 Chapter II — Broken Ground (11–20)

**Stated focus.** Subtitle "Ten levels of broken ground, with a way round."
(`src/strings.ts:1108-1111`); the code header says "rocks make decisions, not walls"
(`levels.ts:176-179`).

**Do the boards express it?** Partly. Rock counts are 2,3,4,1,4,4,5,2,5,5 — seven of ten boards carry
four stones or fewer. On a 37-hex board that is 32–36 open hexes; these are open boards with a
cluster, not broken ground. The chapter's own strongest claim — level 12 "a split down the middle"
with 3 stones and 34 open hexes — is a lane, not a split. The genuinely routed boards are 13
(four-hex arc), 16 (broken line) and 17 (both inner flanks): three of ten.

**Curve.** Bots `4,5,5,5,6,6,6,7,7,7`; pressure `5,6,7,4,7,7,8,5,8,10`. It climbs from 5 to 8 over
seven levels, drops to 5 at 18, then 8 and 10. The two dips (14, 18) are exactly the two levels
where the bot steps up (5 at 14, 7 at 18), so the dips are compensated by design.

**Breather placement.** 14 and 18, unflagged (the flag does not exist for 1–30); both are described
in the docs as "breathing space" (`docs/CAMPAIGN.md:355-359`). 14 sits immediately after the
four-hex detour; 18 sits after two 4–5-rock boards.

**What is weak, concretely.**
- Three levels (11, 14, 18) are the same board kind: open with one mirrored pair and 35–36 open
  hexes. 11 and 14 differ by one stone.
- 15 and 16 are both 4 rock / 3 gold, both built around a central pair, and adjacent.
- Gold is 3 on nine levels and 5 only at 20; the chapter introduces no new gold idea.
- Level 11 (bot 4, 2 rocks) is softer than level 10 (bot 4, 3 rocks), so the chapter opens with a
  step down in terrain at the same bot. It reads as a re-entry but is not declared as one.

### 2.3 Chapter III — Narrow Paths (21–30)

**Stated focus.** Subtitle "Ten narrow levels where space must be won."
(`src/strings.ts:1112-1115`); header: "contested hexes and corridors... no single hex decides the
game" (`levels.ts:200-203`).

**Do the boards express it?** Yes relative to II, but the absolute numbers are modest: rock 4–6,
leaving 31–35 open. No board in the chapter is near the 20-open floor. "Narrow" here means "six
stones" (25, 27, 29, 30), not a corridor. The chapter's design promise — every wall has two openings,
no single deciding hex — is enforced only for chokepoints (§5); the boards do have two routes.

**Curve.** Bots `8,8,8,8,9,9,9,9,9,9`. Pressure `7,8,7,8,9,7,9,5,11,9`. The bot ladder ends at
level 25 and never moves again for the remaining 45 levels of the campaign. Within the chapter the
terrain wobbles: 7,8,7,8,9,7,9,5,11,9. **Level 29 (11) is the peak, not level 30 (9);** level 30 is
only 4 points above the chapter's own breather (28, at 5) and 2 below its predecessor.

**Breather placement.** 28 is a breather in all but name — 2 rocks, 35 open, and the intent says
"Almost open". It is not flagged because the flag is 31+ only. It sits between 27 (9) and 29 (11),
which is exactly the right place.

**What is weak, concretely.**
- The chapter finale (30) is lighter than 29 and only 4 points above the unflagged breather at 28.
- 25's "narrow neck" is two blobs plus a neck with 31 open hexes; the short way is closed on one
  flank only.
- 27 and 30 share the same 3-gold set (`0,0`, `0,±3`) and the same rock count (6).
- Five of ten boards have asymmetric rock sets (21, 22, 24, 25, 28), so the chapter is already less
  symmetric than the design notes assume — a useful precedent for §5.

### 2.4 Chapter IV — Hollow Ground (31–40)

**Stated focus.** "can you read a large shape and find the route that still exists?"
(`docs/CAMPAIGN-31-70.md:23-27`); subtitle "Ten boards that ask you to read the route."
(`src/strings.ts:1116-1119`). Rock-led, pressure stated as 7 → 15 (`levels-late.ts:73-78`).

**Do the boards express it?** This is the strongest chapter for shape literacy: ten distinct named
shapes, one per level, and every board is point-symmetric. Rock 4→10, gold 3→7. The shapes are
recognisably different (pips vs outliers vs anvils vs pasture).

**Curve.** Pressure `7,7,9,11,9,13,11,11,13,15`. It rises 7→15 but with two non-breather dips:
34→35 (11→9) and 36→37 (13→11). So the stated "rises 7 → 15" is a trend, not a monotone ramp.

**Breather placement.** 31 (the opener, bot 8) and 38 (bot 8, gold-heavy). 31 is defensible as a
re-entry, but it is *also* the softest point of the chapter, and 32 has identical pressure (7) — so
the 31→32 step is bot-only (8→9). 38 sits between 37 (11) and 39 (13): correct placement.

**What is weak, concretely.**
- Level 33's comment says "Stones hug three corners" (`levels-late.ts:92`), but the board is
  symmetric and has six outer-ring stones covering all four corners plus two edge midpoints. The
  comment is wrong about the shape it ships.
- 31 and 32 both have pressure 7; 33 and 35 both 6 rock / 3 gold; 36 and 37 both 8 rock. Three
  adjacent pairs are near-duplicates in raw counts, differentiated only by arrangement.
- 34's intent "Cross: an X of lanes, gold down the arms" describes five gold on the arms, but the
  rock is a vertical line (`0,±3`) plus a central pair plus one diagonal pair; the resulting open
  space is not an X, it is a wide centre with a vertical incision.
- The opener is terrain-lighter than the previous finale (31 = 7, 30 = 9) and bot-lighter (8 vs 9),
  so the chapter boundary is a double step down, not a held breath after a spike.

### 2.5 Chapter V — Gold Country (41–50)

**Stated focus.** "fight over value, not space" (`docs/CAMPAIGN-31-70.md:28-30`); subtitle "Ten
boards where the ground is worth fighting for." (`src/strings.ts:1120-1123`). Gold 7–9, rock 2–8;
a test pins `gold > rock` on every board (`tests/campaign/levels.test.ts:126-145`).

**Do the boards express it?** By count, yes — this is the only chapter where gold outweighs stone on
every level. By position, much less than the counts imply. The five-hex central gold cross
`{0,0, 0,±1, ±1,0}` is a literal subset of **six of the ten** gold sets (42, 43, 44, 47, 49, 50).
Seven levels carry exactly 9 gold. So "more value" is usually "the same central cross plus a pair on
the wing", not a new geography.

**Curve.** Pressure `11,11,13,13,13,11,15,15,17,17`: a five-level plateau at 11–13, a dip at the
declared breather (46), then four levels at 15–17. Gold count is 9,9,7,9,7,9,9,9,9,9 — flat at 9 in
seven of ten.

**Breather placement.** 46 only (bot 8, 2 rock / 9 gold). Correct: it is the low point of the
chapter and sits between two 13s.

**What is weak, concretely.**
- 41 and 42 are the same board idea: 2 rock, 9 gold, gold concentrated in/near the centre.
- 43 and 45 are both 6 rock / 7 gold; 44 and 48 are both 9-gold boards with stone on the "other
  axis"; the pairs are hard to tell apart from the data.
- 47 is a finish-mode monoculture: documented 60/60 score games, zero strangles
  (`docs/CAMPAIGN.md:493-494`). Whatever its shape, the level produces one kind of ending.
- Pressure drops 40→41 (15→11) and 50→51 (17→13) without either being flagged a breather. The
  chapter is bracketed by unflagged relief.
- No board puts gold within two hexes of a home approach. Every gold cluster is centre/spine/wing;
  the "race" is always for the middle, never for your own doorstep.

### 2.6 Chapter VI — The Long Way (51–60)

**Stated focus.** "survive a board that detours you" (`docs/CAMPAIGN-31-70.md:29-30`); subtitle "Ten
boards where the short path is a trap." (`src/strings.ts:1124-1127`). Rock-heavy, gold-scarce.

**Do the boards express it?** The stone is genuinely heavier (8→14) and the open count falls to 23.
But the chapter is built from **one base wall**: the diagonal pairs `(1,1)/(-1,-1)` and
`(2,1)/(-2,-1)` plus `(1,2)/(-1,-2)` appear in levels 51, 52, 53, 54, 55, 59 and 60. Consecutive
levels mostly add or move one pair:
- 51 = base + `(±3,0)`
- 52 = 51 + `(0,±2)`
- 53 = 51 + `(0,±3)` + `(±1,∓3)`
- 54 = 53 + `(±2,0)`
- 59 = 54 + `(0,±2)`
- **60 = 59 exactly** (identical 14-stone array; gold differs 7 vs 3)

That is seven of ten levels off the same skeleton, ending with a finale that reuses the penultimate
board unchanged.

**Curve.** Pressure `13,15,15,17,13,15,17,17,17,21`. One dip, at the declared breather (55). After
55 it is a three-level plateau at 17 (56–58) then 21 at the finale. Documented strangles 7–13 per 60
(double chapter V), with 52 and 54 the peaks at 13 each (`docs/CAMPAIGN.md:540-544`).

**Breather placement.** 55 (bot 8, 6 rock / 7 gold) — the chapter's only gold-led board and the
correct mid-chapter relief.

**What is weak, concretely.**
- 59 and 60 are the same rock board; the finale's identity is four extra gold.
- Six of ten levels carry exactly 5 gold, and the same five-hex central cross is the whole gold set
  in 52, 53, 54, 57, 58 and 60 — six of ten. The chapter varies stone and keeps value constant.
- 52 and 54 are documented as the two strangle peaks and have identical gold, 27/25 open, and a
  shared wall skeleton; they are two notches apart, not two ideas.
- `docs/CAMPAIGN.md:546-548` says "25 or more open hexes" and then, in the same sentence, that the
  tightest is 23. 59 and 60 are at 23; the claim is wrong by its own next clause.

### 2.7 Chapter VII — Broken Crown (61–70)

**Stated focus.** "hold a plan when the terrain gives you nothing clean"
(`docs/CAMPAIGN-31-70.md:30-31`); subtitle "Ten boards where every shape is broken on purpose."
(`src/strings.ts:1128-1131`). Heaviest stone (10→16), gold on the axes.

**Do the boards express it?** Yes: the ring/cross/crown/lattice ideas are visibly "the old shapes with
holes", and the last board is the heaviest in the campaign (16 rock, 21 open). The chapter does what
it says.

**Curve.** Pressure `15,17,15,17,19,19,21,21,23,23`. Monotone except the declared breather dip at
63. The top is a plateau: 68, 69 and 70 are 21, 23, 23.

**Breather placement.** 63 (bot 8, 6 rock / 9 gold) sits between 62 (17) and 64 (17). Its total
pressure (15) is **identical to level 61**, so it is softer only by bot (8 vs 9). That is a thinner
breather than 38, 46 and 55, whose pressures (11) are below every neighbour.

**What is weak, concretely.**
- 70 ties 69 on total pressure (23) and leads only on stone (16 vs 14). The finale is not the peak
  on the metric the rest of the chapter is authored against, only on the rock sub-metric (which the
  test pins: `levels.test.ts:202-205`).
- 64's intent says "no walls, all decisions" but carries 12 stones — joint fourth-heaviest in the
  chapter and more than the "ring" at 61. The label describes arrangement, not weight.
- 61 (10/5) and 63 (6/9) are exactly equal on pressure, and 63 is the flagged breather.
- 68–70 are a three-level ceiling plateau (21/23/23) with three of the chapter's four 9-gold boards
  clustered in 63/68/69 — the "gold-rich breather" identity is shared with two non-breathers.

---

## 3. The bot ladder

### 3.1 What the nine configs actually do

All nine run the same `rankActions` evaluator. The differences are a small set of knobs
(`src/bots/levels.ts:17-51`), plus one code-path special case.

| Bot | Family | `mistakeRate`/`topN` | `skipGrowth` | `bloomBand` / skip | Strengthen / Fruit tier | Discard | Look-ahead | Reply search | Other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | noisy | .855 / 8 | .57 | random / .45 | 0 / 0 | greedy | 0 | 0 | whim .03, Fruit on random target .35, throws Fruit .25 |
| 2 | noisy | .765 / 7 | .51 | random / .35 | 0 / 0 | greedy | 0 | 0 | whim .03, Fruit random .30, throws Fruit .15 |
| 3 | noisy | .648 / 6 | .432 | random / .25 | 1 / 0 | greedy | 0 | 0 | Fruit random .30 |
| 4 | quick | .495 / 5 | .33 | quick | 1 / 2 | greedy | 0 | 0 | — |
| 5 | quick | .36 / 4 | .24 | quick | 2 / 2 | greedy | 0 | 0 | — |
| 6 | quick | .135 / 3 | .09 | quick | 2 / 2 | greedy | 0 | 0 | — |
| 7 | greedy | 0 / — | 0 | full | 3 / 3 | greedy | 0 | 0 | `{...base}` |
| 8 | greedy+ | .15 / 3 | 0 | full + `bloomHold` | 3 / 3 | keepHigh | 0 | 0 | — |
| 9 | planner | 0 / — | 0 | full + `bloomHold` | **4 / 4** | keepHigh + `cardDenial` | 1 | 6 hands, `replyWeight .3` | — |

The real behavioural distinctions are only these:
1. **`bloomBand`** — 1–3 pick a *random* legal Bloom and sometimes skip one; 4–6 take the best
   *quick* look; 7–9 do the full evaluation. This is the first qualitative break (at bot 4).
2. **`bloomHold`** — 8 and 9 hold a plain 3-card Bloom when the unseen cards make a Bloom of 4
   likely (`holdChance`, `levels.ts:244-258`). 1–7 never do.
3. **Discard discipline** — 8/9 use `keepHigh` (meld-aware, never throws a Fruit card); 9 adds
   `cardDenial` (give away the least useful card).
4. **Turn planning** — 9 evaluates its own best follow-up within the turn (`lookahead: 1`) and
   subtracts the imagined opponent's best reply over 6 sampled hands (`searchIterations: 6`).
5. **Tactics tiers** — 0–4 for Strengthen/Fruit; 9 is the only tier 4 (counts unseen Fruit cards).
6. **Sloppiness** — `mistakeRate` + `topN` (settle for a top-N non-best move) and `skipGrowth`
   (end the act phase early). These are scalar dials, not behaviours.

**Bot 7 is a special case in code.** `decideLevelAction` short-circuits `level === 7` to
`rankActions(v)[0]` and never reads `LEVEL_CONFIGS[7]` (`src/bots/levels.ts:218-223`). The config
exists for the ladder/tuning path only. So the campaign's bot 7 and a `chooseWithConfig(..., 7)`
run are the same by construction today, but they are not the same code path.

### 3.2 Which bots are effectively redundant

- **Bots 1, 2 and 3 are three settings of one agent.** Same bloom band, same tiers (except 3 gains
  Strengthen tier 1), same discard, same whims. Bot 2 differs from 1 only in six numbers; bot 3
  differs from 2 by the tiers and the removal of Fruit-throwing. The ladder sells these as three
  rungs; behaviourally it is roughly two (careless vs slightly tactical).
- **Bots 4, 5 and 6 are three settings of one agent.** Same bloom band, same Fruit tier, same
  discard; 5 and 6 have identical tiers. The only qualitative change is 4's switch to the quick
  bloom look, which also happens at bot 4, not 5 or 6. So there are two real rungs here, not three.
- **Bot 8 is a strict trade against 7**, not a uniform upgrade: it gains card-keeping and Bloom
  holding but takes a 15% chance of a top-3 move. The docs' own ladder note says exactly this
  (`src/bots/levels.ts:76-79`; `docs/CAMPAIGN.md:619-638`).
- **Bot 9 strictly dominates 8**: same discard style plus denial, same Bloom holding, adds search,
  and has `mistakeRate: 0` (8 has 0.15).
- Net: nine rungs = **five real behaviours** (random-Bloom noisy, quick-Bloom noisy, greedy full,
  greedy + card discipline, planner).

### 3.3 The top rung is throttled on campaign boards (important)

Every campaign level sets `config.board` (all 70; see §1). `decideWithConfig` detects that with
`const lab = v.config.board !== null && ...` and then caps bot 9's search to `LAB_ITERATIONS = 3`
imagined hands and `LAB_CANDIDATES = 4` candidates instead of 6 and 6
(`src/bots/levels.ts:206-209, 323-326`). `replyDamage` also caps non-Bloom replies at
`LAB_REPLY_CAP = 12` on board configs (`levels.ts:162-177`).

**Consequence:** the campaign's bot 9 is a *reduced* bot 9 — the same rung the ladder measures on the
classic generated board (6 hands / 6 candidates) but with roughly half the search. Any difficulty
claim that compares "campaign bot 9" to "bot 9 vs bot 9 on the classic board" is comparing two
different agents. This is not documented in `docs/CAMPAIGN.md` or `docs/LADDER.md` as far as this
review found, and it matters most for 71–100, where terrain pressure has no headroom (see §6).

### 3.4 Levels whose bot does not match the board's difficulty

These are **INFERRED** from `botLevel` + pressure + the documented measurements; there is no
per-level human data.

- **Level 8** — intent promises "a stronger opponent"; bot is 3, same as 6–7. (Factual mismatch, not
  inferred.)
- **Level 11** — bot 4 on 2 rocks, softer than level 10's bot 4 + 3 rocks; the bot does not change
  across the boundary, so the board is the only step and it steps down.
- **Level 14** — bot 5 on 1 rock (pressure 4, the lowest in II). A breather carried by the bot.
- **Level 18** — bot 7 on 2 rocks (pressure 5), immediately after two 4–5-rock boards. A second
  unflagged breather in the same chapter.
- **Level 28** — bot 9 on 2 rocks (pressure 5, the lowest in III). The chapter's hardest bot on its
  lightest board; correctly labelled "Almost open", incorrectly unflagged given the later convention.
- **Levels 41 and 42** — bot 9 on 2 rocks / 9 gold, the lightest terrain since level 28, immediately
  after level 40's 10-rock crown. The bot is at maximum and the terrain at minimum.
- **Level 47** — bot 9 on a board that never strangles in 60 games (documented). The bot is not
  mismatched; the *finish mode* is, which is a different axis of sameness.

### 3.5 Where the ladder tops out

- Bot 9 first appears at **level 25** (`levels.ts:212`) and is used on **41 of the 46 levels 25–70**
  (levels 25–30 are all bot 9; 31–70 are 35 bot 9 + the five bot-8 breathers).
- Bots 8–9 cover levels 21–70: **50 of 70 levels (71%)**. Bots 1–3 cover levels 1–8 only.
- There is nowhere to climb after 25. Levels 26–70 (45 levels, 64% of the campaign) are
  difficulty-by-terrain only, and on the top rung the terrain is capped by the 20-open floor.

---

## 4. Difficulty curve across 1–70

Everything here is terrain pressure (rock + gold), the bot rung, and the documented balance numbers.
No gameplay was re-run.

**The macro shape.** Pressure means rise every chapter: 4.0 → 6.7 → 8.0 → 10.6 → 13.6 → 16.0 → 19.0.
That is the one curve the test guarantees (`tests/campaign/levels.test.ts:311-330`). Within chapters,
the curve is mostly a sawtooth; the chapter boundaries contain the largest drops.

**Spikes (single-level jumps ≥ 2 points).**
- 28→29: 5 → 11 (+6), the largest single jump in the campaign, on the same bot. The next level drops
  back to 9, so the chapter's hardest board is penultimate.
- 33→34: 9 → 11; 35→36: 9 → 13; 37→38 is a *down* step into a breather.
- 50→51 and 54→55 are −4 drops, both unflagged/only partly flagged (55 is flagged, 51 is not).
- 60→61: 21 → 15 (−6), the largest drop between chapters, one level after the chapter VI finale.
- 62→63: 17 → 15 (breather) → 64 17.
- 69→70: 23 → 23 (no spike; a tie).

**Plateaus.**
- 21–27: seven consecutive levels at pressure 7–9, with the bot fixed at 8 (21–24) then 9 (25–27).
- 31–32 both 7; 41–42 both 11; 43–45 all 13; 47–48 both 15; 53–54 15/17; 56–58 all 17; 68–70
  21/23/23.
- The clearest plateau is the end: **the last three levels span two pressure points** (21, 23, 23)
  and the last two are equal.

**Is any bot-9 board trivial?** Not by the documented numbers. Turn counts stay 18–21 and the
documented seat splits are inside noise. The closest thing to a degenerate board is **47 (The Mint)**:
zero strangles in 60 games, i.e. one finish mode — not easy, but uniform. **41/42** are the lightest
terrain with the top bot; documented turns 18.8/19.5, so not trivial in bot-vs-bot terms, but they
offer the top bot the most open board in the late campaign. **INFERRED:** a human on an open 2-rock
board against bot 9 will experience this as a pure card game, not a terrain level.

**Is a bot-8 breather harder than the bot-9 level after it?** By pressure, **no** — every breather is
followed by an equal-or-heavier board, and 31→32 is the only equal case (bot 8→9 supplies the step).
Documented finish mix agrees: 63 (strangle 2) → 64 (strangle 13). So the answer is a clean negative,
which is worth recording: the breather placement is consistent on the available evidence.

**Where the curve is weakest, from the data only.**
1. Chapter III's peak is at 29, not 30; the finale drops 2 points.
2. Chapter IV's own "rises 7→15" has two non-breather dips (34→35, 36→37).
3. Chapter V's first two levels drop 4 points from the previous finale (40→41) with no flag, and the
   last two levels are a flat 17/17.
4. Chapter VI's finale is the same rock board as 59, so the last step is gold only.
5. Chapter VII's last two levels tie on pressure; the finale is distinguished by stone alone.
6. The top of the ladder is a reduced bot 9 on authored boards (§3.3), so the last 45 levels are
   easier in AI terms than the ladder table suggests.

---

## 5. What the validator permits that the owner wants to do (the section that matters)

The owner wants asymmetric, "unfair"-feeling boards from roughly level 40. Here is the exact state
of every relevant rule, then the minimal honest change.

### 5.1 The rules as written

**A. Point symmetry — not a rule anywhere in code.**

There is no symmetry check in `src/campaign/validate.ts`, and no test asserts it. The only statement
is prose: "Every board below is point-symmetric about the centre (mirror q,r → -q,-r), so both seats
get the same ground. Levels 1-30 already ship that way; asymmetry is a later, deliberate decision."
(`src/campaign/levels-late.ts:32-33`), repeated at `docs/CAMPAIGN-31-70.md:112-114`
("Deliberate asymmetry is allowed only where the *gold* is what differs, and then the balance report
must show no seat skew.").

**Consequence:** asymmetric boards are already legal. `validateCampaign()` will accept them today.
The prose's claim about 1–30 is also wrong (§0.2). If the owner's only ask is "asymmetric", the
answer is: author them; no validator change, no test change. The 20%-seat-skew balance flag is a
process check, not a CI gate (`docs/CAMPAIGN.md:712-713`).

**B. Homes are effectively unconstrained by the validator; the *engine* allows them anywhere.**

`validate.ts` only checks that the two homes differ, are board cells, and are not terrain:

> `const [h0, h1] = spec.homes;`
> `if (h0 === h1) fail('both homes are the same hex');`
> `if (!cellSet.has(h0) || !cellSet.has(h1)) fail('a home is not in board.cells');`
> `for (const h of spec.homes) if (rock.has(h) || gold.has(h)) fail(\`home ${h} is terrain\`);`
> — `src/campaign/validate.ts:104-107`

And `resolveConfig` returns before the root-position check whenever a board is supplied:

> `if (c.board !== null) { ... return c; }`
> `for (const p of [0, 1] as const) { if (!isOnBoard(rootCoord(p, c.rootStyle, c.boardRadius), ...)) ... }`
> — `src/engine/config.ts:115-125` and `:127-131`

So the engine will happily open a match with the two homes anywhere on the board that is not rock or
gold. What pins the homes today is a *test*:

> `expect(level.config.rootStyle, level.id).toBe('ring2');`
> `expect(board.homes, level.id).toEqual([...expectedHomes]);`
> — `tests/campaign/levels.test.ts:302-304`

`rootStyle` is decorative for authored boards for the same reason (the board path returns early).

**C. Terrain in a root zone — computed and reported, but NOT thrown; the test is the gate.**

> `const terrainInRootZone = [...spec.rock, ...spec.gold].filter((k) => rootZone.has(k));`
> — `src/campaign/validate.ts:140`

The comment above it says "Authored boards should hold to the same rule"; the value is returned in
`LevelChecks` and asserted empty by the campaign test:

> `expect(checks.get(level.id)!.terrainInRootZone, level.id).toEqual([]);`
> — `tests/campaign/levels.test.ts:84`

Note the root zone is a home **plus its immediate neighbours** (`validate.ts:133-138`), so a stone
two hexes from a home is already legal.

**D. Single-hex chokepoint — computed and reported, but NOT thrown; the test is the gate.**

> `const singleHexChokepoints = open.filter((k) => !spec.homes.includes(k) && !connectedWithout(k));`
> — `src/campaign/validate.ts:162`

The design intent is stated in the field comment (`validate.ts:40-46`: "a hex that would decide the
game by itself... a board must never have one"). The gate is:

> `expect(checks.get(level.id)!.singleHexChokepoints, level.id).toEqual([]);`
> — `tests/campaign/levels.test.ts:93`

**E. Things the validator *does* throw, which constrain unfairness structurally.**

> `if (cells.length !== expected.size || cells.some((k) => !expected.has(k))) {`
> `  fail(\`board.cells is not the ${radius}-ring hexagon ...\`);`
> — `validate.ts:88-90` (full hexagon only)

> `const minOpen = Math.min(20, cells.length - 4);`
> `if (open.length < minOpen) fail(\`only ${open.length} playable hexes — too cramped to play (need ${minOpen})\`);`
> — `validate.ts:113-114`

> `if (missing) fail(\`hex ${missing} is walled off from ${i === 0 ? 'your' : "the opponent's"} home\`);`
> — `validate.ts:120` (every open hex reachable from **both** homes)

> `if (minHomeOpenNeighbours < 3) { fail(\`a home has only ${minHomeOpenNeighbours} open neighbours (easy to surround — Strangle)\`); }`
> — `validate.ts:128-130`

> `if (h0 === h1) fail('both homes are the same hex');`
> — `validate.ts:105`

Also thrown (all from the same function): duplicate cells (`:83`), terrain not in cells (`:92`),
malformed keys (`:94-100`), a hex both rock and gold (`:103`), a home not a cell (`:106`), a home
that is terrain (`:107`).

**F. Seat fairness is not in code at all.**

`validate.ts` never looks at symmetry or seat advantage. The only instrument is the balance tool's
flag (>20% seat skew over ≥60 decided games), described at `docs/CAMPAIGN.md:712-713`; it is not run
by `npm run check`.

### 5.2 Summary table

| What the owner wants | Today's barrier | Where | Kind of barrier |
| --- | --- | --- | --- |
| **Asymmetric boards** | none | — | legal now |
| Gold asymmetry (value favouring one seat) | none; prose says "balance report must show no seat skew" | `docs/CAMPAIGN-31-70.md:112-114` | prose / process |
| A stone next to a home | test asserts `terrainInRootZone === []` | `levels.test.ts:84` | test-only |
| A one-hex gate / one deciding hex | test asserts `singleHexChokepoints === []` | `levels.test.ts:93` | test-only |
| Homes moved off the ring2 corners | test asserts exact `CAMPAIGN_HOMES` | `levels.test.ts:302-304` | test-only |
| A home with only 2 open neighbours | `validate.ts` throws | `validate.ts:128-130` | hard |
| A ragged / coastline board (missing cells) | `validate.ts` throws | `validate.ts:88-90` | hard |
| A board under 20 open hexes | `validate.ts` throws | `validate.ts:113-114` | hard |
| One home cut off from part of the board | `validate.ts` throws | `validate.ts:120` | hard |
| A deliberately seat-biased deal | none in code; balance flag only | `docs/CAMPAIGN.md:712-713` | process |

### 5.3 Minimal honest changes

**(1) Asymmetry without any change.** Author asymmetric rock and/or gold. Keep: both root zones clear
(two hexes from each home), both homes reachable, no single-hex chokepoint, ≥20 open, homes where
they are. Then measure with `npm run campaign:balance` over ≥60 deals and decide whether the skew is
the design or a defect. This is the only change that needs zero code edits. It is also the honest
reading of the current rules: `validate.ts` has no opinion on symmetry.

**(2) "Unfair" as terrain near a home.** Add one optional field to `CampaignLevel`, e.g.
`harsh?: boolean` (same pattern as `breather`), and change the test to
`expect(c.terrainInRootZone).toEqual([])` → `if (!level.harsh) expect(...).toEqual([])`, plus a
weaker invariant that still holds for every level: **each home keeps at least 3 open neighbours**
(already thrown at `validate.ts:128-130`, so no validator change is needed). Do **not** lower the 3
unless the owner accepts a one-Bloom strangle: the 19-hex experiment measured exactly that failure —
"one Bloom places three tiles — so a single Bloom against the far home ends the match"
(`docs/CAMPAIGN.md:300-302`). What breaks: nothing mechanically; a harsh board can start with a home
already pinched, and the balance tool may report short games.

**(3) A one-hex gate.** The validator already computes the list; only the test refuses it. Replace
the blanket assertion with a weaker invariant, e.g. *at most one chokepoint per level and it may not
be adjacent to either home*. That keeps the worst failure (a gate exactly at a root) out while
allowing the "one tap decides it" feeling late. What breaks: endgames become decided by a single
tile; `reachable` still guarantees both homes connect, so the board is playable, but the documented
"no single hex decides the game" promise (`docs/CAMPAIGN.md:366-368`) becomes false for flagged
levels and the docs must say so.

**(4) Moved homes.** No validator change: update the home assertion in
`tests/campaign/levels.test.ts:302-304` and, if `rootStyle` should keep meaning, leave it `'ring2'`
and treat it as documentation only. Root-zone checks recompute automatically from `spec.homes`
(`validate.ts:133-138`). What breaks: `CAMPAIGN_HOMES` / `CAMPAIGN_SMALL_HOMES` are exported
(`levels.ts:67-90`) and used by `frozen.ts:14-30` and the tests; keep the constants for levels that
still use them. The proof verifier is safe for new levels because it rebuilds from `level.config`
(`src/campaign/play.ts:10`), but see the Edge-bundle warning in §6.4. **INFERRED:** the renderer
draws from the board/terrain, so a moved home should render; this was not exercised here.

**(5) Ragged boards.** Requires relaxing `validate.ts:88-90` from "the full hexagon" to "a subset of
the radius's cells containing both homes", keeping the 20-open floor and reachability. What breaks:
`boardRadius` stops describing the board, the `expected` set assertion disappears, and the layout
code that sizes the board from `boardRadius` (**INFERRED**) may leave a hole. Highest-risk change;
not recommended for 71–100 unless the owner explicitly wants map shape as a new axis.

### 5.4 What could break when 71–100 are added (tests and build)

Not part of the owner's asymmetry ask, but the same "will bite them" category:

- `tests/campaign/levels.test.ts:29-38` expects exactly 7 chapters × 10 levels.
- `:55` expects `nextCampaignLevel(70)` to be `null`.
- `:99-123` pins the rock count of every level 1–70 as a literal array.
- `:282-288` pins the **exact** `botLevel` array of every level ≥31 as a 40-element literal — adding
  71–100 makes the filter return 70 elements and the test fails.
- `:311-330` requires chapter mean pressure to be non-decreasing, so chapter VIII's mean must be
  **≥ 19.0** (chapter VII's mean).
- `src/strings.ts:1100-1101` supplies Roman numerals only up to `X`; chapters 8–10 are exactly the
  last three available.
- `server/src/seeds/config.ts:17` caps rewards at 70 and `:30` returns `null` above it, so levels
  71–100 would pay nothing, silently.

---

## 6. Gap analysis for 71–100

### 6.1 The constraints the existing code imposes

1. **Board size cannot grow.** Radius 3, 37 cells, is pinned for every level ≥4
   (`tests/campaign/levels.test.ts:290-310`), and the 61-hex probe was rejected on tap-target
   grounds (36–37 px vs 44 px) at `docs/CAMPAIGN-31-70.md:55-63`.
2. **At most 17 rocks** (37 − 20 open; `validate.ts:113-114`). Chapter VII already uses 16.
3. **Gold is the only uncapped terrain axis.** `validate.ts` sets no gold ceiling; only the root-zone
   test and the engine's "gold must be a cell" rule apply. The documented maximum is 9, chosen by
   design, not enforced. This is the one axis with real headroom.
4. **Pressure is nearly exhausted.** Chapter VIII's mean must be ≥19.0 by the test, and the
   theoretical per-level maximum is 17 rock + 18 gold (the 20 open minus the two homes), of which a
   sane design uses maybe 9–13. Practically every new board must sit at chapter-VII density or
   heavier.
   **Pressure cannot be the differentiator for 71–100.**
5. **The bot ladder tops at 9**, and on authored boards bot 9 is already throttled (§3.3).
6. **The campaign contract says rules do not change**: "Same maxRank 9, one sprout per turn,
   strengthen on, expanded Bloom on, four Fruit cards... Only `board` (cells, rock, gold), `seed`,
   and — rarely — `fruitCardCount` vary." (`docs/CAMPAIGN-31-70.md:31-34`.)
7. **Breather cap**: `breathers <= floor(late.length / 4)` over all levels ≥31
   (`tests/campaign/levels.test.ts:260`). With late = 70 levels the cap is 17; 5 are used.

### 6.2 Axes that are actually available

| Axis | Available today? | Evidence | What it costs |
| --- | --- | --- | --- |
| **Asymmetry** (rock/gold, or homes) | yes, already legal | §5.1 A/B | balance flag + test edits if extreme |
| **Gold economics / placement** | yes, uncapped; only the 9-gold convention is self-imposed | §6.1.3 | none |
| **Unused terrain vocabulary** | yes; five named shapes in the plan never shipped | `docs/CAMPAIGN-31-70.md:91-109` lists NOTCHED WALL, TWIN HOLLOWS, LONG SHELF, DOUBLE GATE, RIDGELINE — none appear in `levels-late.ts` | none |
| **Deal / seed character** | yes, `seed` per level; but no design tool | four seed-only fixes already made for skew: 49→96249, 57→96357, 62→96762, 66→96266 (`levels-late.ts:198-199,250-251,287,309`) | measurement only |
| **`fruitCardCount`** | yes, blessed by the contract and currently 4 on all 70 | `docs/CAMPAIGN-31-70.md:31-34`; no level sets it (`levels.ts:117-131`) | a deck change; must be mirrored online or the "rehearsal" promise weakens |
| **Other `RulesConfig` knobs** (`handSize`, `maxTurnsPerPlayer`, `strengthenLimitPerGame`, `sproutsPerTurn`, `maxRank`, `bloomMustTouchNetwork`) | engine supports them | `src/engine/types.ts:13-69` | real rules changes; breaks the campaign contract |
| **Breathers** | yes, 12 more slots at 71–100 | §6.1.7 | none |
| **Bot 10+** | possible only by extending `Level` | §6.3 | see below |

Note: `rootStyle: 'corner'` is an allowed value (`src/engine/config.ts:97-99`) but is a no-op for an
authored board — the board path returns before the root-position check (`config.ts:115-125`). Moving
the homes, not `rootStyle`, is the lever.

### 6.3 Extending the bot ladder to 10 (what it touches)

`export const LEVELS = [1..9] as const; export type Level = (typeof LEVELS)[number];`
(`src/bots/levels.ts:14-15`). Adding a rung touches:

- `LEVELS`, `Level`, and `LEVEL_CONFIGS: Record<Level, LevelConfig>` (`levels.ts:58-83`) — a new
  config, and the `decideLevelAction` special case at `:218-223` if the new rung should reuse the
  greedy path.
- `botSeed` is generic; no change (`levels.ts:85-94`).
- Server guards: `server/src/seeds/verify.ts:22` (`botLevel > 9` returns `null`) and the cast at
  `:28`; `server/src/seeds/service.ts:83` (`botLevel > 9` → invalid); the router only checks integer
  (`server/src/seeds/router.ts:44-45`). The SQL column has no CHECK constraint found, so no migration
  is required, but the service guard is the effective limit.
- Client: `web/src/logic/settings.ts:7,16-17,26,57,98-99` imports `LEVELS` and maps
  easy/normal/hard → 3/7/8. A rung 10 would be selectable only if the picker is extended.
- The compiled Edge bundle embeds bot code and campaign data (`supabase/functions/duel/bundle.ts`
  contains the level array), so it must be rebuilt and redeployed.
- Ladder docs and tests (`docs/LADDER.md`, `docs/CAMPAIGN.md:616-650`) pin the sequence.
  This list is **partial** — the 1–9 range appears in many files; `rg -n "botLevel"` is the reliable
  sweep.

### 6.4 Operational facts for 71–100

- **The Edge bundle must be rebuilt.** Proof verification runs the level's opening from the bundled
  copy of `src/campaign/*` (`server/src/seeds/verify.ts:47-51`, and the level array is visible in
  `supabase/functions/duel/bundle.ts`). A level 71 win cannot verify until `npm run server:build-edge`
  and a deploy happen. Nothing about the client changes.
- **Rewards.** `CAMPAIGN_LEVEL_REWARD_MAX = 70` (`server/src/seeds/config.ts:17`) and
  `campaignSeedReward` returns `null` above it (`:30`). Chapter bonuses are keyed at 10/20/30/40/50/60/70
  (`:31`); 80/90/100 would need entries. Admin rollups read the same constant.
- **Progress and saves need no change**: `unlockedThrough` is derived from the completed list and the
  level list (`src/campaign/progress.ts:108-118`), and keys are versioned per save, not per count.
- **`ALTERNATE_OPENINGS`** (`src/campaign/frozen.ts:40-48`) exists to keep old proofs valid when a
  board changes. New levels have no history, so it is not needed for 71–100 unless an existing board
  is re-authored.
- **`docs/CAMPAIGN.md` still opens with "50 planned levels"** (`:3`) and says "As built... 1-70"
  (`:135`); both will need updating.

### 6.5 What three new chapters must do to feel new (axes, not levels)

Given §6.1, the only axes that can carry three chapters without a rules change are: **where value
sits**, **who it favours**, and **what the board asks you to read**. Suggested shaping, each tied to
an available mechanism:

1. **Chapter VIII — value asymmetry.** Use gold asymmetry as the difficulty *and* the theme: put the
   richest gold on one seat's approach (allowed: two hexes from a home, outside the root zone), so
   one player must decide whether to contest or concede. This is legal today (§5.1 A/B); it needs the
   balance tool run and a stated decision about the 20% skew flag. It is the only axis that changes
   the *feel* without touching a rule.
2. **Chapter IX — gold desert / stone garden.** The inverse of chapter V: 3–5 gold, 13–16 rock,
   forcing score-only or strangle-only endgames. This is legal and uses the existing maximum stone
   budget; the differentiator is scarcity, not pressure. Beware 47's failure mode (one finish type
   for 60/60): pick whether the chapter is *meant* to be strangle-shaped and say so in the docs.
3. **Chapter X — the last board / harsh ground.** One or two `harsh` boards using terrain in a root
   zone and/or one-hex gates, only after the test relaxation in §5.3; homes moved toward the centre
   for the finale if the owner wants a genuinely new map geometry. Keep the 3-open-neighbour floor
   unless the owner explicitly accepts instant strangles.
4. **Unused shape vocabulary** (free): NOTCHED WALL, TWIN HOLLOWS, LONG SHELF, DOUBLE GATE,
   RIDGELINE — named in the plan, never authored. Five shapes is half a chapter on its own.
5. **`fruitCardCount`** (the one blessed knob): a chapter with 6 Fruit cards changes what a hand can
   do without touching Grow/Bloom/Throw. It must be added to the online rules too, or documented as
   campaign-only, which weakens the "rehearsal" contract.
6. **Deal character**: seeds already choose the opening hands and first seat. A chapter built around
   a specific opening shape (e.g. Fruit-heavy hands) is possible, but the four seed-only skew fixes in
   §6.2 show the tooling is a sieve, not a design instrument. Do not build a chapter on it without a
   measurement pass.

**What not to do:** add a chapter that is only "more stones". The pressure test forces its mean to
≥19, but chapter VII is already there, and the last three levels already plateau at 21–23. A fourth
heavy-stone chapter would be numerically indistinguishable from the end of VII — the same trap that
produced 59 = 60.

---

## Appendix — verification notes

- Per-level counts and flags: read from `src/campaign/levels.ts:155-225` and
  `src/campaign/levels-late.ts:82-330`; rock counts cross-checked against the pinned table in
  `tests/campaign/levels.test.ts:99-123` and the doc table in `docs/CAMPAIGN-31-70.md:130-176`.
- Symmetry: checked pair-by-pair for all 70 rock and gold arrays. Result: 13/30 symmetric in 1–30
  (asymmetric: 3, 6, 7, 9, 10, 12, 13, 14, 16, 17, 19, 20, 21, 22, 24, 25, 28); 40/40 symmetric in
  31–70.
- Bot configs: `src/bots/levels.ts:58-83`; behaviour differences read from
  `decideWithConfig` (`:287-392`), `bloomBand` (`:260-280`), `holdChance` (`:244-258`), and the
  lab-board caps (`:206-209`, `:323-326`).
- Documented balance numbers are quoted from `docs/CAMPAIGN.md` and `docs/CAMPAIGN-31-70.md` and were
  not re-run (no builds/tests were executed, per the brief).
- Nothing in the worktree was modified. The only write in this task is this file, at
  `/tmp/campaign-review.md`.
