# FUTASAKU 0.4 — rules (source of truth)

> **Grow a living network. Keep it connected. Cut theirs.**

This document defines the current game on branch **`futa0.4`**. Player-facing names are used here.
Engine identifiers may still say `Sprout` / `PlayFruit` / `MegaBomb` for save and replay compatibility.

Archive of the tree before cleanup: git branch `archive/futa0.4-before-cleanup`.
Older Severgrow / Classic material lives on `main` and in git history.

---

## Versions

| Kind | Value |
| --- | --- |
| Rules | `futasaku0.4-strength-draw` |
| Product channel | `CHANNEL=futa04` → `/futa0.4/` |
| Experiment copy | `CHANNEL=futa-test` → `/futa-test/` |

---

## Player names

| Player sees | Engine / code (kept for compatibility) |
| --- | --- |
| **FUTASAKU** | package / title |
| **Grow** (one tile) | action `Sprout` |
| **Bomb** | Fruit card / `PlayFruit` |
| **Blast** | `MegaBomb` |
| **Bloom** | `Bloom` |
| Opponent | bots / seat 1 |

---

## Turn structure

Each turn is **Draw → Grow → Throw**.

1. **Draw** — take the top deck card or the top of the throw pile.
2. **Grow** — place tiles. You get **one** ordinary Grow (or Strengthen, or single Bomb). **Bloom** and **Blast** are **extra** and do not use that one Grow. You may Bloom / Blast any number of times in any order with the Grow.
3. **Throw** — discard one card. Any card in hand may be thrown, including a card just taken from the throw pile. The turn then ends (Rot / Knock are off by default).

**Grow (one tile):** spend one numbered card to claim an empty hex next to your network, or overgrow a weaker enemy non-home tile, or Strengthen one of your own non-root tiles with a strictly higher card. Strengthening uses the same one-Grow allowance.

**Bloom:** 3–6 cards that form a set (same rank) or a run (one suit, consecutive ranks, no wrap). Place that many connected hexes touching your network; each card supplies its own strength. Extra — does not use Grow.

**Bomb:** special card (no suit / no rank). Play on an enemy non-home tile that touches your network (home counts). Removes that tile at any strength, then Sever + Strangle. **Uses the turn’s Grow.** Four Bombs in the deck.

**Blast:** two Bombs together. Clears the target hex and its six neighbours of enemy non-home tiles (homes are immune). **Extra like Bloom — does not use Grow.**

---

## Who starts

The engine owns this. `startingPlayerFor(seed)` is a **seeded lottery**, shown in the Who-starts
UI, **not** coupled to difficulty. `newMatch(seed, config)` builds the opening with the winning
seat already set (`src/engine/match.ts`); the browser and `server-core` both use it, so the client
and the verifier can never disagree. Archived rule versions set `startingPlayerLottery: false` and
always start with player 0, so old saves and replays still verify.

The Who-starts ritual is presentation only: it deals two cards from its own nine-card deck — one
card of every strength 1–9, colours random — so the two revealed numbers can never tie, and the
higher card always belongs to the seat the engine (or the server) already chose.

A match is reproducible from its **rules version + seed + config + starting-player result**:
`matchSetup(seed, rulesVersion)` returns exactly that record, and `stateFromSetup` rebuilds the
opening state from it.

---

## Difficulty

The three practice-match tiers (owner direction, 2026-10-15; the menu entry reads **Practice
match**). A tier’s first game starts at the bottom of
its range; the only movement is the one-game carry-over, a win stepping the tier’s next game one bot
level UP and a loss one DOWN, never outside the tier’s own range.

| Label | Bot level range |
| --- | --- |
| Easy | 3–4 |
| Medium | 5–6–7 |
| Hard | 8–9 |

No level is chosen from the match seed: the tier’s level is fixed for the next game until a finished
game moves it (`stepAfterGame` in `web/src/logic/difficulty.ts`).

### Rivals: bots 10–12 (bots-v0.11)

Three bots above level 9, beside each other rather than a ladder (owner decision 2026-11-12;
`src/bots/levels.ts`, `RIVAL_CONFIGS`). Each is level 9’s planner, searching every board fully,
plus one way of playing:

| Bot | Internal name | Way of playing |
| --- | --- | --- |
| 10 | Ironwood | defensive: guards its home ring, keeps its network hard to cut, wins on score |
| 11 | Strangler Fig | aggressive: grows toward the opponent’s home and plays for the Strangle |
| 12 | Night Bloom | patient: holds Blooms and cheap Bomb cards for the turn that counts |

- **The names are internal.** The game never shows them; a rival is shown, and counted in stats,
  as level 9 (`ladderLevel`).
- **Where they play:** campaign levels 74–100 (chapters VIII–X, `docs/CAMPAIGN-71-100.md`).
  Approved, not yet built: they also rotate with level 9 in the Hard tier and in Blitz practice.
- **Bots 1–9 do not change.** Their decisions are pinned by `tests/bots/levels-frozen.test.ts`.
- **Versions:** `bots-v0.11` is current. `bots-v0.10` stays accepted for tickets and proofs issued
  before it (same moves for levels 1–9) and can never replay a rival.
- **Strength** (measured with `src/sim/rivals.ts` on campaign boards, seats swapped, against
  full-search level 9): Ironwood 55% over 350 games; Strangler Fig and Night Bloom about 51%, i.e.
  level 9's strength with their own way of playing (owner accepted, 2026-11-12;
  `docs/CAMPAIGN-71-100.md` G).

---

## Ending the game

- **Surround (Strangle):** surround the opponent’s home → you win. Both homes surrounded → draw.
- **Deck end:** each seat gets a fair final Grow-first turn, then score.
- **Turn limit:** 30 turns each, then score.

### Scoring and ties

Score = non-root tiles (gold / rich = 2). Roots do not score by default.

When scores are equal:

1. Higher **total of non-root tile strengths** wins.
2. If strengths are equal too → **real draw** (`winner: null`).

Config flag: `strengthTiebreak` (default on). Parked leftover-card / Knock paths still use deadwood then P2.

---

## Engine constraints

`src/engine/` is pure and deterministic: no `Math.random`, no I/O, no timers. Randomness uses seeded `mulberry32` / `deriveSeed` streams only.

---

## Board size

Product / normal Play uses **board radius 3** (37 hexes).

**Tutorial exception (confirmed):** the guided tutorial uses **board radius 2** (19 hexes — one ring smaller, same hex shape). Normal games are unchanged. See `TUTORIAL_BOARD_RADIUS` in `web/src/logic/tutorial-script.ts`.

---

## Bloom size note

Current Bloom allows 3–6 cards (rules lineage `futasaku0.3-six-card-bloom`). Older recordings keep 3–4 card Bloom via `expandedBloom: false`.

---

## Retired on this branch

- Optional V3 skin / `design-v3` art (archived on `archive/futa0.4-before-cleanup`).
- Lab / Design V2 experiment surfaces are not part of the product or TEST copy.
- Old “tie always goes to the second player” core end rule (replaced by strength → draw).
