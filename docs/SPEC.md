# SEVERGROW: Engine Spec v0.4 (one game)

> **Grow a living network. Keep it connected. Cut theirs.**

Scope: a **pure, deterministic, headless TypeScript rules engine**, bots, a simulation
harness, a replay tool, a terminal client and a playable web page. This version defines
**one game** (the old "Classic" and "Lite" are merged). The rules that made the game slow
or hard to learn are **parked**: their code stays, behind config switches that are off by
default (see the appendix).

---

## Changelog

**v0.4: one game** (this version)
- **One game, no modes.** "Classic" and "Lite" are merged. The page has one New game button.
- **Sprout (new move).** Spend one card to grow one tile next to your network (section 7).
- **Guaranteed opening combo.** Both opening hands always hold at least one combo (section 5).
- **Smaller deck.** Cards run 1..`maxRank` (default chosen by simulation, section 3).
- **Parked rules.** Rot, Knock (with its final turn) and Fruit are off by default
  (`rotEnabled`, `knockEnabled`, `fruitPerPlayer`). Their code and tests remain (appendix A).
- **The turn ends by itself** after the discard when Rot and Knock are off: no Continue step.
- **Simple ending.** The game ends when the deck can no longer refill a hand; higher score
  wins; **a tie goes to Player 2**. Strangle still wins at once.
- **Stuck-game fixes.** (a) an empty hand skips the discard; (b) the card just taken from the
  discard pile may be discarded when it is the only card in hand. These replace the v0.3.1
  rules "a meld may not empty the hand" and "a meld may not strand the taken card".
- **legacyV03.** A test-only config reproduces v0.3.1 byte-for-byte for recorded games.
- **Turn limit.** A game ends after `maxTurnsPerPlayer` turns each (default 30, so 60 in total),
  scored like the deck running out (reason `turn_limit`). Found by simulation: both players can
  keep taking each other's discard without playing, so the deck never shrinks and the game would
  never end.

**v0.3.1** (playtest decisions, kept)
- A turn never starts with an empty deck: a refill that leaves the deck empty ends the game.
- Turn safety cap per bot: 60 player-turns for GreedyBot games, 150 for RandomBot games.

**v0.3** (original brief) changes from v0.2 are summarised in the git history.

---

## 1. Rules at a glance

**Players:** 2 (you and the bot). **Board:** 37 hexes (radius 3), mirror-symmetric terrain.
**Cards:** 4 suits x ranks 1..`maxRank` x `copiesPerCard`. **Hand:** `handSize` (7).

**Turn:** `DRAW -> ACT -> DISCARD -> (Sever, Strangle, Refill)`

1. **Draw** one card from the deck or the top of the discard pile.
2. **Act:** play any combos you hold, and up to `sproutsPerTurn` Sprouts.
   - **Hypha** (3+ cards of one suit in a row): a straight line of tiles, strength rising outward.
   - **Bloom** (3-4 cards of one number, different suits): a connected clump, all that strength.
   - **Sprout** (any one card): one tile with that card's number.
   - New tiles must touch your network. They may replace an enemy tile only if **strictly stronger**.
3. **Discard** one card (skipped if your hand is empty).
4. **Sever** removes every tile no longer joined to its root, **Strangle** is checked, and you
   **refill** to `handSize`. The turn passes.

**Win by:** the higher score when the deck runs out (tie: Player 2), or **Strangle** (all six
neighbours of the enemy root blocked, at least one by your tile).

The whole game: **grow, keep your network joined, cut theirs.**

---

## 2. Engine principles (non-negotiable)

1. **Deterministic.** Same seed + same ordered action list = byte-identical final state. Seeded
   `mulberry32` only. Never `Math.random()`. Randomness only in deck shuffle and terrain.
2. **Pure.** `apply(state, action) -> newState`. Never mutate the input. Illegal actions throw
   `IllegalActionError` with a stable `code`.
3. **Serializable.** `State`, `View`, `Action`, `Event`, `RulesConfig` are plain JSON.
4. **Hidden information.** `viewFor(state, player)` never exposes the opponent's hand or the
   deck order. The discard pile is public.
5. **Exhaustive legality.** `legalActions(view)` returns every legal action and nothing illegal.
6. **No I/O** in `src/engine/`: no rendering, networking, files, timers or browser APIs.
7. **Config-driven.** All tunables live in `RulesConfig`.
8. **Do not add rules.** Ambiguities are raised as questions.

---

## 3. Config

```ts
type RulesConfig = {
  boardRadius: number;          // 3
  rootStyle: 'ring2' | 'corner';
  handSize: number;             // 7
  maxRank: number;              // cards 1..maxRank, 5 to 9 (default chosen in Part 4)
  copiesPerCard: number;        // default chosen in Part 4
  sproutsPerTurn: number;       // 1 (0 = Sprout off)
  guaranteeOpeningMeld: boolean;// true
  maxTurnsPerPlayer: number;    // 30 (0 = no limit); the game ends after this many turns each
  rockCount: number;            // 4 (even)
  richCount: number;            // 5 (odd: centre + pairs)
  forbidRedundantDiscard: boolean; // true
  rootsScore: boolean;          // false
  allowHyphaOneBend: boolean;   // false (not implemented)
  // Parked rules (appendix A), all off by default:
  rotEnabled: boolean;          // false
  rotThreshold: number;         // 20
  rotStep: number;              // 8
  knockEnabled: boolean;        // false
  knockDeadwood: number;        // 10
  knockGivesFinalTurn: boolean; // true
  fruitPerPlayer: number;       // 0
};
```

`newGame(seed, config?)` validates the config and throws `ConfigError` on invalid values:
`maxRank` 5-9, odd `richCount`, even `rockCount`, `handSize >= 3`, integers where expected,
known keys only, and a deck large enough to deal both hands, flip a starting discard **and
still leave at least one card to draw** (`4 * maxRank * copiesPerCard >= 2 * handSize + 2`).

**legacyV03** (test-only, never in the page): `maxRank 9, copiesPerCard 2, sproutsPerTurn 0,
guaranteeOpeningMeld false, maxTurnsPerPlayer 0, rotEnabled true, knockEnabled true, fruitPerPlayer 1`. Replaying
the recorded v0.3.1 games with it gives byte-identical states and events (state fields and
config keys added in v0.4 excluded).

---

## 4. Board

Axial coordinates `{q, r}`; on board when `|q|, |r|, |q+r| <= boardRadius`. Key `` `${q},${r}` ``.
Directions, indexed 0-5: `(1,0) (1,-1) (0,-1) (-1,0) (-1,1) (0,1)`.

**Roots:** `ring2` (default) P1 `(-2,2)`, P2 `(2,-2)`; `corner` P1 `(-R,R)`, P2 `(R,-R)`.
Root tile `{owner, strength: 0, root: true}`: never replaced, removed or severed.

**Terrain** (point-symmetric, generated from the seed by mirrored pairs): exactly `rockCount`
rock and `richCount` rich ("gold") hexes; the centre is always rich; no rock or rich on or next
to a root. Rock is impassable. Gold tiles score 2.

---

## 5. Cards and setup

- Suits `0 Moss, 1 Ash, 2 Dew, 3 Ember`; ranks `1..maxRank`; `copiesPerCard` copies; stable ids.
- Identical copies are strategically identical: `legalActions` dedupes them using the lowest
  ids; `apply` accepts any valid id.

**Setup (`newGame`):** terrain, cards, seeded shuffle, deal `handSize` to P1 then P2, flip one
card to start the discard pile, place both roots, P1 to `DRAW`, turn 1.

**Guaranteed opening combo** (`guaranteeOpeningMeld`): if either hand holds no combo (a run or
set of 3), the deal is redone from the seed plus an attempt counter (attempt 0 is the plain
deal). After **200** failed attempts `newGame` throws `DealError` (`NO_OPENING_COMBO`). Every card
appears exactly once; the same seed always gives the same deal. `state.dealAttempt` records the
attempt used.

---

## 6. Turn flow

```ts
type Phase = 'DRAW' | 'ACT' | 'DISCARD' | 'KNOCK' | 'ROT_PICK' | 'GAME_OVER';
```
`KNOCK` and `ROT_PICK` only occur with parked rules on (appendix A).

### 6.1 DRAW
`Draw { from: 'deck' | 'discard' }`. The deck is never empty at the start of a turn (6.5), except
in a Knock final turn (appendix). The discard pile may be empty (after an empty-hand turn); then
only the deck draw is legal. Records `drawnFromDiscard`.

### 6.2 ACT
Any number of `MeldRun` / `MeldSet`, up to `sproutsPerTurn` `Sprout` per turn, in any order, then
`EndAct`. Melded and sprouted cards leave the hand permanently; a move may use the last card.
After **each** placement: Sever, then the Strangle check.

### 6.3 DISCARD
`Discard { card }`: one card from the hand to the top of the discard pile.
- With `forbidRedundantDiscard`, the card just taken from the discard pile may not be discarded,
  **unless it is the only card in hand** (edge case b).
- **Empty hand** (edge case a): `EndAct` skips the discard step entirely.

### 6.4 End of turn
After the discard (or the skipped discard), with Rot and Knock off, the turn **finishes by
itself**: Sever and Strangle, refill (6.5), then the next player's `DRAW`. There is no Continue
step. (With Rot or Knock on, the `KNOCK` step comes first: appendix A.)

### 6.5 Refill and the end of the deck (edge case c)
Draw from the deck until the hand holds `handSize`. The game ends **right after this turn** if:
- the deck could not fill the hand (draw what exists), or
- the deck is empty after the refill (a turn never starts with an empty deck).

The result is `deck_exhaustion`: higher score wins; **a tie goes to Player 2**.

**Turn limit:** the game also ends right after turn `2 * maxTurnsPerPlayer` (the second player's
last turn), scored the same way, with reason `turn_limit`. This guarantees every game ends, even
if both players keep taking each other's discard.

---

## 7. Moves: placement, Hypha, Bloom, Sprout, replacing

### 7.1 Placement rules (all placing moves)
A new tile may claim an **empty** hex or an **enemy non-root tile with strictly lower strength**
(replace). Never rock, off-board, a root, or the mover's own tile. "Touches the network" is
judged on the board **before** the move; the root counts. Moves are **atomic**.

### 7.2 Hypha (`MeldRun { cards, start, dir }`)
3+ cards, one suit, consecutive ranks, no wraparound, sorted ascending. `start` touches the
network; tiles go `start, start+dir, ...`, strength rising outward.

### 7.3 Bloom (`MeldSet { cards, hexes }`)
3 or 4 cards of one rank, different suits; as many distinct hexes, forming one connected cluster,
at least one touching the network; every tile gets that rank.

### 7.4 Sprout (`Sprout { card, coord }`), new in v0.4
- One card from hand becomes one tile of strength = its rank on `coord`.
- `coord` touches the mover's network (root counts) and is empty or holds a strictly weaker
  enemy non-root tile; no rock, off-board, root or own tile.
- At most `sproutsPerTurn` per turn (`SPROUT_LIMIT`); legal only in `ACT`.
- Sever, Strangle and scoring apply as usual. Not offered when it has no legal target (edge d).

### 7.5 Replacing ("overgrowth")
`new.strength > old.strength` replaces the enemy tile. Equal is blocked; roots are immune. A
tile of strength `maxRank` can only be removed by Sever (or the parked Rot/Fruit).

### 7.6 Sever (the central rule)
After any placement or removal, for each player: flood-fill from their root through their **own**
tiles; every own tile not reached is removed. Order cannot matter. The mover's opponent is listed
first in events. Idempotent.

### 7.7 Strangle
A root is strangled when all six neighbours are off-board, rock or enemy tiles **and** at least
one is an enemy tile. One strangled root: its owner loses at once (`strangle`). Both: draw
(`double_strangle`, which cannot occur through normal moves).

---

## 8. Scoring and results

**Score:** each non-root tile scores 1, or 2 on a gold (rich) hex; roots add 1 only with
`rootsScore`.

```ts
type EndReason = 'knock' | 'deck_exhaustion' | 'turn_limit' | 'strangle' | 'double_strangle';
type GameResult = { winner: Player | null; reason: EndReason; undercut?: boolean;
                    scores: [number, number]; deadwood?: [number, number] };
```
`deadwood` is only present when a parked leftover-card rule (Rot or Knock) is on. A finished game
(`GAME_OVER`) accepts no actions.

---

## 9. Types and API

`State` (plain JSON): `seed, config, board, terrain, hands, deck, discard, turnPlayer, actor,
phase, drawnFromDiscard, fruitUsed, finalTurn, rotPick, turnNumber, result, lastResolution,
history, sproutsThisTurn, dealAttempt`.

`View`: the player's own hand, opponent hand count, public discard, deck count, the phase and
turn fields (including `sproutsThisTurn`), both scores, own deadwood, result, last resolution.
Never the opponent's hand or the deck order.

```ts
type Action =
  | { t: 'Draw'; from: 'deck' | 'discard' }
  | { t: 'MeldRun'; cards: number[]; start: Coord; dir: number }
  | { t: 'MeldSet'; cards: number[]; hexes: Coord[] }
  | { t: 'Sprout'; card: number; coord: Coord }
  | { t: 'EndAct' }
  | { t: 'Discard'; card: number }
  // parked (appendix A):
  | { t: 'Fruit'; sacrifice: Coord[]; target: Coord }
  | { t: 'Knock' } | { t: 'Continue' } | { t: 'RotPick'; coord: Coord };
```

Events (`state.history`): `Draw, MeldRun, MeldSet, Sprout, Overgrow, Discard, Sever, Strangle,
GameEnd`, plus the parked `Fruit, Knock, FinalTurnStart, RotCount, Rot, RotPick`. A deck draw
hides its card in the opponent's `eventsFor`. `ResolutionSummary` lists `placed, overgrown,
rotted, severed`, and optionally `sprout, fruit, strangled`.

API: `newGame, legalActions(view), legalActionsForState, apply, applyAs, viewFor, score,
deadwood, bestMeldPartition, replay, eventsFor, dealOpening`.

Illegal actions throw and leave the input untouched (codes include `WRONG_PHASE, NOT_ACTOR,
CARD_NOT_IN_HAND, NOT_ADJACENT, OWN_TILE, ROCK, OFF_BOARD, ROOT_IMMUNE, NOT_STRONGER,
SPROUT_LIMIT, REDUNDANT_DISCARD, DECK_EMPTY, GAME_OVER, KNOCK_DISABLED, ...`).

---

## 10. Tests, properties, determinism

- Every rule has unit tests, written first. Parked-rule tests run with the rules switched on.
- **Property games** check after every action: no tile on rock or off-board; every non-root tile
  connected (except mid-Rot); roots intact; strengths 1..`maxRank`; every card exactly once (in a
  hand, the deck, the discard pile, or played); `apply` never mutates; a finished game accepts
  nothing; every listed legal action is accepted; at most 60 player-turns for GreedyBot games and
  150 for RandomBot games.
- **Determinism:** seed + action log replayed twice gives byte-identical state and events.
- **Golden games:** final-state hashes of 5 full games on the default config.
- **legacyV03** replays the recorded v0.3.1 games byte-for-byte.

---

## 11. Bots, simulation, tools

- **RandomBot** (seeded uniform), **GreedyBot** (one-move lookahead: points gained, bot points
  removed, weak spots opened or fixed, pressure on the bot, instant wins, combos kept, high cards
  saved). Both read only a `View`.
- `npm run sim` (metrics report + `sim-results.json`), `npm run sweep`, `npm run properties`,
  `npm run play` (terminal), `npm run replay -- <seed> <log.json>`.

---

## Appendix A: Parked rules (off by default)

These rules remain in the engine and are tested with their switches on (the `legacyV03` config
turns them all on). With them off they are hidden everywhere: page, coach and how-to text.

### A.1 Leftover cards ("deadwood")
The minimum rank-sum of cards left after splitting the hand into combos (exhaustive search). With
Rot or Knock on, a deck-exhaustion tie goes to lower leftover points, then Player 2, and results
carry `deadwood`.

### A.2 The KNOCK step and Continue
With `rotEnabled` or `knockEnabled`, the discard leads to the `KNOCK` step: `Knock` (if enabled and
leftover points `<= knockDeadwood`) or `Continue` (Rot, then Sever and Strangle, refill, next
turn). An empty hand goes straight to this step.

### A.3 Knock and the final turn (`knockEnabled`)
Knock ends the knocker's turn with no Rot and no refill. With `knockGivesFinalTurn` the opponent
plays one final turn (draw, act, discard; no Knock, Rot or refill), then the knocker wins only with
a strictly higher score; otherwise the opponent wins (`undercut`). Knock is illegal when disabled
(`KNOCK_DISABLED`).

### A.4 Rot (`rotEnabled`)
On Continue, `rotCount(dw) = 0` if `dw <= rotThreshold`, else `1 + floor((dw - rotThreshold - 1) /
rotStep)`, measured on the kept hand. That many of the player's weakest border tiles rot; ties at
the boundary are picked by the opponent in `ROT_PICK`. Then Sever and Strangle.

### A.5 Fruit (`fruitPerPlayer > 0`)
Once per allowed use: sacrifice 3 connected own non-root tiles to remove one adjacent enemy
non-root tile of any strength; then Sever and Strangle.
