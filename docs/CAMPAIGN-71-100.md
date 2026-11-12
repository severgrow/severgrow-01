# Campaign 71–100: review findings, decisions and plan

Base: `futa0.5-levels-31-70` @ 5daa8ea, branch `claude/campaign-71-100`. Decisions taken 2026-11-12 (owner), section E.
Read alongside `docs/CAMPAIGN-REVIEW-1-70.md` (origin/docs/campaign-review); this adds what that
review did not measure: **route geometry** and **difficulty from the player's side**.

---

## A. Two findings the existing review does not have

### A1. Every board from level 4 to 70 has the same spine

Shortest home-to-home route is **4 steps on all 67 radius-3 boards**, and it always runs
`home → (-1,1) → (0,0) → (1,-1) → home`. Proof: those are the *only* 4-step routes (the two
middle hexes sit in the protected root zones, and their only common neighbour is the centre),
and the centre is gold by test (`levels.test.ts:217`). So no stone ever lengthens the race.
"The Long Way", "Corridor", "S-Bend", "Hairpin" all keep the straight 4-step diagonal through
the gold centre; the stone only fills the two corners away from both homes.

Also uniform: vertex-disjoint routes between the homes = **3 on 33 of the 40 boards 31–70**.
Nearest gold = 2 steps from each home on **every** board.

This is why VI–VII feel alike beyond the duplicate arrays: every level is the same race to the
same hex. **The single biggest lever for 71–100 is stone on the centre**, which only needs the
centre-gold test scoped to ≤ 70.

### A2. Difficulty is set by the bot, not the terrain, and the curve is a cliff then a plateau

Bot 7 stood in for a strong player against each level's own bot: the shipped deal plus 12 other
deals × both seats (25 games/level).

| Levels | Bot | Stand-in win rate |
| --- | --- | --- |
| 11–14 | 4–5 | 83–92% |
| 15–17 | 6 | 50–75% |
| 21–24 | 8 | 13–46% |
| 25–30 | 9 | 13–38% (mean 23%) |
| 31–40 | 9 | mean 23% |
| 41–50 | 9 | mean 21% |
| 51–60 | 9 | mean 19% |
| 61–70 | 9 | mean 15% |

- The real difficulty cliff is **21–25**, not 30–40. After that, terrain only drifts it
  from about 23% to 15% over 45 levels.
- **The breathers don't give the player a rest.** Bot-8 levels (31, 38, 46, 55, 63) score 21–33%,
  about what bot-9 levels score.
- **The shipped deal decides a lot, and nobody chose it for difficulty.** Seeds were picked for
  bot-vs-bot seat evenness. Some shipped deals are wipe-outs (26: 0–17 in 11 turns; 42: 0–19 in 11;
  44: 0–13 in 10; 51: 0–17 in 11; 67: 0–23 in 9), while level 45, the hardest by the sweep (8%),
  ships an easy 19–6 deal. **The seed is a difficulty dial we are not using.**

Caveat: bot 7 is not a human. The numbers rank levels relative to each other; they are not
human win rates.

Reproduce: play bot 7 in both seats against `level.botLevel` on `level.config`, seeds `level.seed + 7919·i` (i = 1..12), plus the shipped seed with bot 7 in seat 0.

---

## B. Proposed improvements to 11–70 (owner picks a tier)

| Tier | What | Cost |
| --- | --- | --- |
| 0 | Nothing; docs only | none |
| 1 (recommended) | Dedupe and text fixes: 60 ≠ 59 (new finale board), 70 ≠ 69, 68 ≠ 66, level 8 intent, 33/34 comments | changed boards need `ALTERNATE_OPENINGS` entries so old proofs stay valid |
| 2 | Tier 1 + **deal design**: re-pick shipped seeds so the shipped deal follows the curve (no 9–11-turn wipe-outs mid-chapter; breathers get a friendlier deal) | seed changes need frozen alternates; measurable with the proxy run |
| 3 | Tier 2 + real breathers (bot 7 instead of 8 on the five breathers) and a smoother 21–30 ramp | test sequence for 1–30 is pinned; owner sign-off |

Not recommended: un-throttling bot 9 on the existing levels. They are already the hardest
stretch, and it would change the existing bot behaviour, which means a bot-version break for
outstanding tickets. Full-strength search goes into the new rivals only (section D).

---

## C. Levels 71–100: the final arc

The rules stay the same; levels only vary the board, the seed and the rival. Each chapter has its
own rival bot, which also gives the future per-chapter enemy skin a natural key (a `rival` id on the chapter).

### VIII — The Bridges (71–80) · rival: Ironwood (defensive, bot 10)

The centre is stone for the first time. A river runs along a full hex line (`q=0` column or `r=0`
row, 7 cells, touching neither home zone) with 2–3 one-hex fords. **Two separate fords means no
single hex cuts the homes apart**, so it is legal, yet every crossing is tight. Prototype checked
against the real validator: path 4 → 6, 2 crossings, 0 chokepoints.

| # | Name | Idea |
| --- | --- | --- |
| 71 | First Crossing | row river, 3 fords, gold on the far bank (entry, bot 9) |
| 72 | Two Fords | column river, fords by each home: hold yours, take theirs |
| 73 | Toll Bridge | the fords are gold: crossing pays, holding pays more |
| 74 | Midstream | Ironwood debut; fords beside the stone centre, the fight is mid-river |
| 75 | Stepping Stones | a gold islet mid-river: a two-step crossing |
| 76 | Low Water | breather (bot 9): wide fords, rich home banks |
| 77 | Islands | both rivers: four fords, two 3-hex gold islets, nobody's land |
| 78 | Drawbridge | fords at the far edges only: the long way, both ways |
| 79 | Broken Bridge | 3 fords, one sits near the bot: first taste of "unfair" |
| 80 | The Last Bridge | finale: islands + toll fords, Ironwood |

### IX — Uneven Ground (81–90) · rival: Strangler Fig (aggressive, bot 11)

Deliberately unfair boards. Each declares `uneven: 'bot' | 'player'` in data, and the balance tool
must show the declared seat ahead by a bounded margin (proposal: bot-9 vs bot-9, favoured seat
wins 55–70%) instead of the usual ~50%. "Every open hex reachable from both homes" and
"≥ 3 open home neighbours" are kept.

New symmetry kind: **the side-keeping mirror** `(q,r) → (r,q)`. It swaps the two homes but keeps
each flank on its own side, so the board is fair while one flank is all stone and the other all gold,
and both players race up the same side. (Point symmetry, used by 31–70, swaps the flanks too.) It looks lopsided and plays fair: a good opener for an "uneven" chapter.

| # | Name | Idea |
| --- | --- | --- |
| 81 | Lopsided | axis-mirror: one flank stone, the other gold; fair, but you both race the same side |
| 82 | Downhill | the bot has gold on its doorstep; you get the extra route |
| 83 | Pinched | Strangler Fig debut; your approaches pinched at distance 2, its home wide open |
| 84 | Fair Wind | breather (bot 9): symmetric, open, gold-led |
| 85 | High Ground | a stone shelf boxes your home; the gold lies behind the bot |
| 86 | Head Start | favours you: the gold is yours, the Fig comes for your home |
| 87 | Long Shelf | (unused vocabulary) one-sided shelf, gold on its far side |
| 88 | Ridgeline | (unused vocabulary) diagonal ridge, the wide pass on the bot's side |
| 89 | One Door | stone in your home zone (flagged exception, 3 open neighbours kept): survive the opening |
| 90 | Underdog | finale: everything favours the bot; win anyway |

### X — The Last Garden (91–100) · rival: Night Bloom (patient, bot 12) + all three

Callbacks: each level re-asks one earlier chapter's question with the late-game tools (stone
centre, rivers, asymmetry). The last three are one rival each.

| # | Name | Idea |
| --- | --- | --- |
| 91 | The Clearing, Again | open board vs Night Bloom: pure card play, it waits for you to overreach |
| 92 | Broken Ground, Again | ch. II scatter with the centre stoned |
| 93 | Still Water | breather (bot 9) |
| 94 | Gold Country, Again | gold-led and uneven |
| 95 | Narrow Paths, Again | river + corridor |
| 96 | Crown of Stone | ring around a stone centre, gold outside it: everything inverted |
| 97 | Twin Hollows | (unused vocabulary) two pockets, three lanes, islands |
| 98 | The Held Bridge | Ironwood on its best board |
| 99 | Overgrown | Strangler Fig on its best board |
| 100 | The Last Garden | Night Bloom on a composed finale |

Breathers in the arc use **bot 9**, not 8, because the rivals sit above it: 76, 84, 93.

---

## D. Three rivals above bot 9

Bot levels 10/11/12. The names are internal only; players never see them. All three use **full**
bot-9 search on campaign boards (no Lab throttle), plus a style:

| Rival | Style | How (data-level knobs + one new eval term each) |
| --- | --- | --- |
| **Strangler Fig** (aggressive) | grows toward your home and tries to Strangle | new term: siege pressure (its tiles on/next to your root ring, its distance to your root); spends Fruit to open your ring; accepts more exposure |
| **Night Bloom** (patient) | holds cards, waits, then plays a big turn | stronger Bloom holding (holds for 4, sometimes past 1 turn), keeps Fruit for a Sever or a Strangle finish; deeper reply search; counts the deck to time a last-turns burst |
| **Ironwood** (defensive) | compact, unbreakable, wins on score | high exposure weight; strengthens cut points and chokepoints; uses Fruit on your tiles next to its root; blocks the hexes your network needs to reach gold |

**Acceptance, measured before any level uses them:**
- Strength: each beats full bot 9 in ≥ 55% of 400 games on campaign boards, seats swapped.
- Style: a style metric shows the difference: Fig's wins include more strangles; Ironwood is
  strangled least and has the fewest severed tiles; Night Bloom plays more 4-card Blooms and
  late Fruit.
- Speed: time per move within the existing phone budget (bot-timing tool), because the server
  also re-plays every win.

**Versioning (avoids the ticket trap):** bots 1–9 stay byte-identical. The version goes to
`bots-v0.11`, and `bots-v0.10` stays in `BOT_VERSIONS` mapped to the same function, so every
outstanding ticket still verifies. Server guards (`verify.ts:22`, `service.ts:83`), the Edge
bundle, `CAMPAIGN_LEVEL_REWARD_MAX` and the 80/90/100 bonuses ship **server first, then the page**.

---

## E. Decisions (owner, 2026-11-12)

1. **Centre stone:** allowed from level 71; the centre-gold test is scoped to levels ≤ 70.
2. **Levels 11–70:** tier 2 (dedupe + text fixes + deal design), with frozen alternates for old proofs.
3. **Seeds 71–100:** 30 per first clear; chapter bonus 80: 250, 90: 300, 100: 500.
4. **Rival strength:** each at least matches full bot 9 (≥ 50%), at least two clearly beat it (≥ 55%),
   and the style differences show in the numbers.
5. **Practice:** the rivals also play in Practice, rotating with bot 9 on Hard and in Blitz mode.
6. **Names are internal.** Ironwood / Strangler Fig / Night Bloom name bots 10 / 11 / 12 in code and
   docs only; the game never shows them. Level names stay player-facing.
7. **Uneven Ground:** the favoured seat wins 55–70% bot-vs-bot; 3–4 levels may be harsher (declared
   in data, measured, never above the bound set per level).
8. **Order:** VIII Ironwood, IX Strangler Fig, X Night Bloom.

## F. Order of work

1. Rivals (bots 10–12), measured against the acceptance bar; SPEC section.
2. Chapter VIII, then IX, then X, each with validation, the balance run and the proxy run.
3. Tier 2 fixes to 11–70.
4. Merge the 0.85 base (merge, not rebase), then rewards, server guards, Practice/Blitz rotation.
5. Deploy order: server and Edge bundle first, then the page.

---

## G. Rivals: what was measured (2026-11-12)

Tool: `src/sim/rivals.ts` — a rival against **full-search level 9** (`9full`: the campaign's level 9
without the authored-board caps) on campaign boards 25–70, one deal per game, seats alternating. Batches
of 100–150 games; the final numbers are on deals the tuning never saw. At 100 games the noise is about
±5 points, so single batches above 55% were not trusted until repeated.

| Finding | Evidence |
| --- | --- |
| The authored-board caps cost level 9 nothing | full search vs capped: 48% over 100 |
| Deeper search (look at my answer to their reply) does not help | Night Bloom with it: 59% on one batch, then 46/49/43% on three fresh ones |
| Leaving played cards out of imagined hands does not help | level 9 with it vs without: 48% over 150 |
| What helps: an endgame fade of danger/pressure, and level 9's own danger weights | Ironwood 54%, 56%, 54% (350 games) |

**Final configs (`RIVAL_CONFIGS`)** and where they stand against full level 9:

| Rival | Wins | Style shows as |
| --- | --- | --- |
| 10 Ironwood (fortress) | **55%** over 350 | the one rival clearly above level 9 |
| 11 Strangler Fig (siege) | 51% over 150 (Cursor: 48% over 50) | more Strangle wins (14 against 11) |
| 12 Night Bloom (patient) | 51% over 150 (Cursor: 58% over 50) | Bomb cards kept for the last turns (66 late against 35) |

Owner bar (2026-11-12): 52% over 50 games. Ironwood clears it on every batch; Fig and Bloom are at
level 9's strength (48–58% on single batches, ~51% pooled) with a clearly different way of playing.
**Accepted by the owner (2026-11-12):** Fig and Bloom ship as "as strong as level 9, with their own way
of playing"; Ironwood is the one rival measurably above it.
Speed on this machine: 75–115 ms a move for 10/11, 115–160 ms for 12 (about 1.5x level 9), inside the
approved ~1 s on a mid-range phone. The rivals' choices are pinned by `tests/bots/levels-frozen.test.ts`;
changing a rival needs a new bot version, because campaign proofs replay against it.

## H. Uneven boards: the lever that actually works (2026-11-12)

The first draft of chapter IX was inert: bot-favoured boards read 47% bot-vs-bot, the same as even
boards (Cursor's sweep, 1,800 games). The instrument plays the SAME bot in both seats, so only geometry
can move it — and a lever test showed it does, just not the way the boards were drawn:

| Test board (bot 9 vs bot 9, 60 games) | Bot's seat wins |
| --- | --- |
| open | 47.5% |
| stone in the player's home zone (3 open neighbours) | **38% — helps the player** (a compact home is hard to cut) |
| 7 gold two steps from the bot | 57% |
| player's exits two steps out walled, two left open | **65%** |
| bot's exits walled (a fortress) | 37% — hurts the bot |

Games end with about 6–7 tiles each: they are fights, not land grabs, so territory and a few gold barely
matter. What decides an uneven board is **how freely each side gets out of its corner**: the player's
seven exits are the hexes two steps from its home. Gold on one of those exits helps the player; an exit
that opens into wide ground is worth more than one that opens onto an edge.

Recipe used for every bot-favoured board: close both edge exits, leave two exits open (the minimum
without a single-hex chokepoint), keep gold off them, give the bot a gold hex or two near its home.
Measured at 150 games each: 82 56%, 83 59%, 85 59% (harsh), 87 56%, 88 61%, 89 60% (harsh), 90 67%
(harsh), 94 56%, 99 55%; 86 (player-favoured) 44%. Level 79 could not be made bot-favoured honestly
inside the bridges idea and is now an even board (measured 50%).
