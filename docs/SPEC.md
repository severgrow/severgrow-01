# SEVERGROW: Engine Spec v0.6 (one game)

> **Grow a living network. Keep it connected. Cut theirs.**

Scope: a **pure, deterministic, headless TypeScript rules engine**, bots, a simulation
harness, a replay tool, a terminal client and a playable web page. This version defines
**one game** (the old "Classic" and "Lite" are merged). The rules that made the game slow
or hard to learn are **parked**: their code stays, behind config switches that are off by
default (see the appendix).

---

## Changelog

**v0.6: Seed mode removed, Fruit cards** (rules version `v0.6-fruit-cards`, bot version `bots-v0.8`)
- **Seed mode is gone.** The one-card move is the Sprout everywhere: a card's number becomes the
  tile, straight away. The `ruleset` key, `RULESETS`, Seed tiles and every Seed word are deleted.
- **Fruit cards replace the old 3-tile Fruit.** The deck gains `fruitCardCount` (4) special
  cards: 72 numbered cards (8 of each number 1-9) plus 4 Fruit cards = 76. A Fruit card has no
  suit and no number; it cannot be melded, sprouted or used to strengthen. Whenever I hold one,
  during my Grow step, I may play it on any opponent non-root tile that one of my tiles touches
  (my root counts, `fruitRootCountsAsTouch`): the tile is removed whatever its strength, the card
  leaves the game, then Sever (both players) and Strangle. No per-turn or per-game limit. A
  Fruit card may be thrown like any card. Action `PlayFruit { card, target }`, event `FruitCard`.
- **Empty turns are fast** (page): with nothing to grow, Grow is skipped (a setting).
- **No old-version support:** only the current rules and bots are kept (older recordings,
  tickets and saves no longer replay). See "Retired rules" at the end.

**Seed A/B test** (rules versions `v0.5-fruit-strengthen` = Sprout, unchanged, and `v0.5-seed`)
- **Why.** The owner wants to play both one-card moves side by side and pick one. Nothing
  else changes; both rulesets are the same game.
- **`ruleset` config key** (`'sprout' | 'seed'`, section 3). Absent means Sprout, so every
  Sprout game, save, recording and golden fixture is byte-identical to before. `RULESETS`
  holds each ruleset's overrides; `rulesetOf(config)` reads it.
- **Seed (section 7.4.1).** The Sprout move, but the new tile is always worth **1** whatever
  the card; the card is used up. A Seed tile carries `seed: true` until it is strengthened.
- **Strengthen in Seed** is unchanged (a strictly higher card on my own non-root tile, and it
  shares the turn's one Seed), except that it has **no per-game limit** (owner's choice), so
  any Seed can later be grown.

**v0.5: Fruit back, Strengthen, a provably fair deal** (this version; rules version
`v0.5-fruit-strengthen`, bot version `bots-v0.6`)
- **Why.** A top-rank tile cannot be replaced by a Sprout or a combo, and the bots used them
  as permanent blockers. Fruit is the answer to a blocker; Strengthen lets a player protect
  a key tile. Both make high cards stronger, so the deal must be provably fair.
- **Fruit is back, on by default** (section 7.8; it leaves the parked rules). Once per player
  per game (`fruitPerPlayer`), during the Grow step: give up `fruitSacrifice` (3) of your own
  connected non-root tiles to remove one enemy non-root tile next to them, **whatever its
  strength**. Then the normal cut check for both players, then Strangle. Option
  `fruitOnlyWhenBehind` (off; simulation only).
- **Strengthen (new Sprout variant, section 7.4).** A Sprout may target one of your own
  non-root tiles when the card is **strictly higher** than the tile: the tile stays and takes
  the card's number. It uses the turn's Sprout. Options `allowStrengthen` and
  `strengthenLimitPerGame` (-1 = no limit). It scores nothing by itself, never changes
  connections, and does not protect from a cut or from Fruit.
- **A fully random, provably fair deal (section 5).** The deck holds the same number of cards
  of every rank; it is shuffled once with an unbiased Fisher-Yates driven by the seeded PRNG,
  and dealt from the top. Random integers now use rejection sampling, so there is no modulo
  bias (`unbiasedShuffle`). Nothing is reordered, balanced or limited. The old guaranteed
  opening combo (`guaranteeOpeningMeld`, its redeal loop, `DealError` and `dealAttempt`) is
  **removed** from the code, config, tests and this spec.
- **Versions.** `RULES_VERSIONS` keeps the previous rules (`v0.4-defaults-2`: no Fruit, no
  Strengthen, the old random-integer method) and `BOT_VERSIONS` keeps the previous bots
  (`bots-v0.5`), so tickets and recorded games from before still verify.
- **Defaults chosen by simulation:** see section 11.3.

**v0.4: one game**
- **One game, no modes.** "Classic" and "Lite" are merged. The page has one New game button.
- **Sprout (new move).** Spend one card to grow one tile next to your network (section 7).
- **Plain random deal.** The deck is shuffled once from the game seed and dealt as it falls.
  (An optional opening-combo redeal existed in early v0.4; it was switched off in
  v0.4-defaults-2 and removed in v0.5.)
- **Card range.** Cards run 1..`maxRank` (5 to 9). Simulation chose **9** as the default
  (section 11.1); smaller values make games too short once Sprout is on.
- **Parked rules.** Rot, Knock (with its final turn) and Fruit were off by default
  (`rotEnabled`, `knockEnabled`, `fruitPerPlayer`). Their code and tests remain (appendix A).
  Fruit came back in v0.5.
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
   - **Sprout** (any one card): one tile with that card's number. **Strengthen** is a Sprout on
     one of your own tiles with a strictly higher card: the tile takes the card's number.
   - New tiles must touch your network. They may replace an enemy tile only if **strictly stronger**.
   - **Fruit card** (v0.6): play one on an enemy non-root tile that touches one of your tiles
     (your root counts): the tile is removed whatever its strength; the card leaves the game.
     As many as you hold, in any order with the other Grow moves.
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
  maxRank: number;              // 9: cards 1..maxRank, 5 to 9 (chosen by simulation, 11.1)
  copiesPerCard: number;        // 2 (chosen by simulation, 11.1)
  sproutsPerTurn: number;       // 1 (0 = Sprout off)
  maxTurnsPerPlayer: number;    // 30 (0 = no limit); the game ends after this many turns each
  allowStrengthen: boolean;     // v0.5, default set by simulation (11.3)
  strengthenLimitPerGame: number; // v0.5, -1 = no limit; default set by simulation (11.3)
  fruitCardCount: number;       // v0.6: 4 (Fruit cards in the deck; 0 = none)
  fruitRootCountsAsTouch: boolean; // v0.6: true (my root counts as touching a Fruit target)
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
};
```

`newGame(seed, config?)` validates the config and throws `ConfigError` on invalid values:
`maxRank` 5-9, odd `richCount`, even `rockCount`, `handSize >= 3`, integers where expected,
known keys only, and a deck large enough to deal both hands, flip a starting discard **and
still leave at least one card to draw** (`4 * maxRank * copiesPerCard + fruitCardCount >= 2 * handSize + 2`).

**legacyV03** (test-only, never in the page): `maxRank 9, copiesPerCard 2, sproutsPerTurn 0,
maxTurnsPerPlayer 0, rotEnabled true, knockEnabled true, allowStrengthen false`: the parked rules
on, for their tests. (v0.6: the recorded v0.3.1 replays were deleted with the old Fruit.)

**Rules versions** (`src/engine/versions.ts`): only the current one, `CURRENT_RULES_VERSION`
(v0.6: older versions, frozen bots and old replays were deleted; see "Retired rules"). A
world-map ticket stores its `rulesVersion` and `botVersion`; verification accepts only the current ones.

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

**A fully random, fair deal (v0.5).** The deck holds exactly `copiesPerCard` cards of every
(suit, rank), so every rank has the same count. It is shuffled **once** with Fisher-Yates driven
by the game seed's deck stream, and hands are dealt from the top; draws come off the top in
order. Nothing is reordered, redealt, balanced or limited: any hand is possible, including
several top cards or none. Random integers in `[0, n)` use rejection sampling on the PRNG's
32-bit output (Lemire's multiply-and-reject), so every value is exactly equally likely
(v0.6: the old floor-multiply method is gone). Cards are conserved: every card is always in
exactly one place (a hand, the deck, the discard pile, or played; a played Fruit card leaves
the game). There is no reshuffle of the discard pile.

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
- **Strengthen (v0.5, `allowStrengthen`).** `coord` may instead be one of the mover's **own
  non-root** tiles when the card's rank is **strictly higher** than its strength: the tile stays
  and its strength becomes the rank. No adjacency is needed. It is a Sprout (it uses the turn's
  Sprout). Equal or lower: `NOT_STRONGER`; the root: `ROOT_IMMUNE`; switched off: `OWN_TILE`;
  over `strengthenLimitPerGame` (-1 = no limit; counted per player in `strengthenUsed`):
  `STRENGTHEN_LIMIT`. Scoring is unchanged, connections are unchanged (no cut can follow), and
  Fruit ignores strength. Event `Strengthen { player, card, coord, oldStrength, newStrength }`
  (instead of `Sprout`); resolution `strengthen: { coord, from, to }`. In `legalActions` it is a
  `Sprout` like any other (one card per suit/rank, board order).

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

### 7.8 Fruit cards (`PlayFruit { card, target }`), v0.6
- The deck holds `fruitCardCount` (4) Fruit cards besides the numbered cards (76 in all). A Fruit
  card has no suit and no number (`suit: null`, `rank: 0`); the deal and every draw stay fully
  random. It can never be in a combo, sprout or strengthen (`NOT_A_NUMBER_CARD`), and is not wild.
- Legal only in `ACT`, with a Fruit card from the mover's hand (`CARD_NOT_IN_HAND`,
  `NOT_A_FRUIT_CARD`). No limit per turn or per game; it does not use the turn's Sprout.
- `target`: an enemy non-root tile (`FRUIT_TARGET_NOT_ENEMY`, `FRUIT_TARGET_ROOT`, `OFF_BOARD`)
  touched by one of the mover's tiles; the mover's root counts when `fruitRootCountsAsTouch`
  (`FRUIT_TARGET_NOT_TOUCHED`). Its strength is ignored, so a 9 can be removed.
- Resolution: the target is removed; the card leaves the game (it does not go to the throw
  pile); then Sever for **both** players and the Strangle check, after **each** Fruit card.
  Atomic. Event `FruitCard { player, card, target, strength }`, then the `Sever` events;
  resolution `fruit: { card, target, strength }`. In `legalActions` all Fruit cards are alike:
  the lowest-id one is listed once per target, targets in board order.
- A Fruit card may be thrown like any card; the opponent can then take it from the throw pile.
  With the parked Rot and Knock it counts 0 as a leftover card.
- The View adds `fruitPlayed` and `fruitUnseen`: the Fruit cards the player has not seen (all
  of them, less those in their hand, played, in the throw pile, or seen taken from the throw
  pile by the opponent and not yet played or thrown). Public information only.

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
phase, drawnFromDiscard, fruitPlayed, fruitKnown, strengthenUsed, finalTurn, rotPick, turnNumber, result,
lastResolution, history, sproutsThisTurn`.

`View`: the player's own hand, opponent hand count, public discard, deck count, the phase and
turn fields (including `sproutsThisTurn`, `fruitPlayed`, `fruitUnseen`, `strengthenUsed`), both scores, own deadwood, result, last resolution.
Never the opponent's hand or the deck order.

```ts
type Action =
  | { t: 'Draw'; from: 'deck' | 'discard' }
  | { t: 'MeldRun'; cards: number[]; start: Coord; dir: number }
  | { t: 'MeldSet'; cards: number[]; hexes: Coord[] }
  | { t: 'Sprout'; card: number; coord: Coord }
  | { t: 'PlayFruit'; card: number; target: Coord }
  | { t: 'EndAct' }
  | { t: 'Discard'; card: number }
  // parked (appendix A):
  | { t: 'Knock' } | { t: 'Continue' } | { t: 'RotPick'; coord: Coord };
```

Events (`state.history`): `Draw, MeldRun, MeldSet, Sprout, Strengthen, Overgrow, FruitCard, Discard,
Sever, Strangle, GameEnd`, plus the parked `Knock, FinalTurnStart, RotCount, Rot, RotPick`. A deck draw
hides its card in the opponent's `eventsFor`. `ResolutionSummary` lists `placed, overgrown,
rotted, severed`, and optionally `sprout, strengthen, fruit, strangled`.

API: `newGame, legalActions(view), legalActionsForState, apply, applyAs, viewFor, score,
deadwood, bestMeldPartition, replay, eventsFor, isFruitCard, RULES_VERSIONS`.

Illegal actions throw and leave the input untouched (codes include `WRONG_PHASE, NOT_ACTOR,
CARD_NOT_IN_HAND, NOT_ADJACENT, OWN_TILE, ROCK, OFF_BOARD, ROOT_IMMUNE, NOT_STRONGER,
SPROUT_LIMIT, STRENGTHEN_LIMIT, NOT_A_FRUIT_CARD, NOT_A_NUMBER_CARD, FRUIT_TARGET_NOT_TOUCHED, REDUNDANT_DISCARD, DECK_EMPTY, GAME_OVER,
KNOCK_DISABLED, ...`).

---

## 10. Tests, properties, determinism

- Every rule has unit tests, written first. Parked-rule tests run with the rules switched on.
- **Property games** check after every action: no tile on rock or off-board; every non-root tile
  connected (except mid-Rot); roots intact; strengths 1..`maxRank`; every card exactly once (in a
  hand, the deck, the discard pile, or played), so every rank keeps its count; `apply` never mutates; a finished game accepts
  nothing; every listed legal action is accepted; at most 60 player-turns for GreedyBot games and
  150 for RandomBot games.
- **Determinism:** seed + action log replayed twice gives byte-identical state and events.
- **Golden games:** final-state hashes of 5 full games on the default config, and the v0.4 golden
  games replayed byte-for-byte on `RULES_VERSIONS['v0.4-defaults-2']` with the frozen `bots-v0.5`.
- **Fairness (v0.5):** the same seed gives the same deal in two separate runs; 100,000+ shuffles of
  a small deck put each card in each position equally often (within a stated tolerance);
  `randomInt` is exactly uniform (checked exhaustively on a small generator); conservation of
  every rank through whole games.
- **legacyV03** replays the recorded v0.3.1 games byte-for-byte.

---

## 11. Bots, simulation, tools

- **RandomBot** (seeded uniform), **GreedyBot** (one-move lookahead: points gained, bot points
  removed, weak spots opened or fixed, pressure on the bot, instant wins, combos kept, high cards
  saved). Both read only a `View`.
- `npm run sim` (metrics report + `sim-results.json`), `npm run sweep`, `npm run properties`,
  `npm run play` (terminal), `npm run replay -- <seed> <log.json>`.

### 11.1 How the defaults were chosen (v0.4 Part 4)

> History. The "guarantee" column below is the old opening-combo redeal, switched off in
> v0.4-defaults-2 and **removed in v0.5**. The table is kept only as the record of how
> `maxRank`, Sprout and `copiesPerCard` were chosen.

`npm run grid` played **1,000 GreedyBot-vs-GreedyBot games per setting** for every mix of
`maxRank` {9, 8, 7, 6} x Sprout {off, on} x guaranteed opening combo {off, on} x
`copiesPerCard` {2, 3} (32 settings, 32,000 games). Targets: no tile placed in under 25% of
turns 1-5; 8-14 turns per player; first-player win rate 46-54%; Strangle ends under 15% of
games; a real choice on most turns (measured as: a combo or a Sprout was playable that turn;
with Sprout on this is nearly always true, so it is a weak test).

| maxRank | Sprout | guarantee | copies | no-tile turns (1-5) | turns/player (mean/median/p90) | P1 win | choice | Strangle | close <=2 | score gap | games |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 9 | off | off | 2 | 64.2% | 15.2 / 15.5 / 18.5 | 46.3% | 30.5% | 11.7% | 11.3% | 12.7 | 1000 |
| 9 | off | off | 3 | 67.4% | 26.4 / 29.5 / 30 | 49.3% | 22.3% | 20.6% | 5.4% | 17.0 | 1000 |
| 9 | off | on | 2 | 35.5% | 13.6 / 14 / 17 | 45.9% | 35.9% | 14.8% | 9.2% | 13.1 | 1000 |
| 9 | off | on | 3 | 38.2% | 25.7 / 29 / 30 | 47.6% | 23.3% | 18.7% | 5.7% | 16.8 | 1000 |
| 9 | on | off | 2 | 0.0% | 9.0 / 9 / 10.5 | 54.5% | 99.8% | 7.8% | 13.0% | 10.9 | 1000 |
| 9 | on | off | 3 | 0.0% | 15.1 / 15.5 / 17.5 | 54.6% | 98.8% | 15.8% | 10.1% | 13.7 | 1000 |
| **9** | **on** | **on** | **2** | **0.0%** | **8.3 / 8.5 / 10** | **50.7%** | **99.6%** | **8.8%** | **13.0%** | **10.7** | **1000** |
| 9 | on | on | 3 | 0.0% | 14.4 / 15 / 17 | 52.1% | 98.5% | 14.8% | 9.1% | 13.6 | 1000 |
| 8 | off | off | 2 | 57.7% | 11.9 / 12 / 15 | 49.5% | 36.8% | 11.4% | 11.6% | 12.4 | 1000 |
| 8 | off | off | 3 | 59.7% | 22.4 / 23.5 / 29.5 | 45.8% | 26.1% | 21.2% | 6.2% | 17.0 | 1000 |
| 8 | off | on | 2 | 32.8% | 10.7 / 11 / 13.5 | 46.3% | 43.3% | 12.9% | 10.7% | 12.7 | 1000 |
| 8 | off | on | 3 | 34.2% | 21.7 / 23 / 29 | 48.6% | 27.3% | 20.8% | 7.3% | 16.3 | 1000 |
| 8 | on | off | 2 | 0.0% | 7.3 / 7.5 / 8.5 | 53.8% | 99.9% | 6.2% | 13.0% | 10.5 | 1000 |
| 8 | on | off | 3 | 0.0% | 12.5 / 13 / 15 | 52.8% | 98.9% | 13.4% | 11.6% | 13.2 | 1000 |
| 8 | on | on | 2 | 0.0% | 6.8 / 7 / 8 | 51.6% | 99.8% | 6.5% | 14.0% | 10.3 | 1000 |
| 8 | on | on | 3 | 0.0% | 11.8 / 12 / 14.5 | 50.9% | 98.4% | 15.5% | 10.3% | 13.6 | 1000 |
| 7 | off | off | 2 | 50.0% | 8.8 / 9 / 11.5 | 49.5% | 46.8% | 8.4% | 11.8% | 11.4 | 1000 |
| 7 | off | off | 3 | 52.7% | 17.2 / 17.5 / 23 | 48.8% | 32.6% | 21.6% | 6.7% | 16.5 | 1000 |
| 7 | off | on | 2 | 27.9% | 7.8 / 8 / 10 | 47.9% | 54.2% | 10.3% | 11.2% | 11.6 | 1000 |
| 7 | off | on | 3 | 29.6% | 16.6 / 17 / 23 | 47.9% | 33.8% | 21.1% | 6.4% | 16.4 | 1000 |
| 7 | on | off | 2 | 0.0% | 5.8 / 5.5 / 7 | 53.9% | 99.9% | 4.8% | 14.5% | 10.0 | 1000 |
| 7 | on | off | 3 | 0.0% | 9.9 / 10 / 12 | 51.5% | 99.0% | 14.8% | 9.9% | 13.2 | 1000 |
| 7 | on | on | 2 | 0.0% | 5.2 / 5 / 6 | 52.5% | 99.9% | 6.4% | 14.0% | 9.7 | 1000 |
| 7 | on | on | 3 | 0.0% | 9.4 / 9.5 / 11.5 | 52.9% | 98.8% | 15.1% | 10.1% | 13.5 | 1000 |
| 6 | off | off | 2 | 36.5% | 6.1 / 6 / 8 | 52.3% | 59.4% | 6.8% | 15.7% | 10.2 | 1000 |
| 6 | off | off | 3 | 41.0% | 12.2 / 12.5 / 16 | 50.6% | 43.9% | 19.4% | 6.5% | 15.6 | 1000 |
| 6 | off | on | 2 | 19.9% | 5.4 / 5.5 / 7 | 49.7% | 67.9% | 7.8% | 14.6% | 9.9 | 1000 |
| 6 | off | on | 3 | 22.6% | 11.5 / 11.5 / 15.5 | 48.5% | 46.2% | 22.3% | 6.4% | 15.6 | 1000 |
| 6 | on | off | 2 | 0.0% | 4.3 / 4 / 5 | 53.0% | 100.0% | 4.2% | 14.8% | 9.2 | 1000 |
| 6 | on | off | 3 | 0.0% | 7.6 / 7.5 / 9 | 51.7% | 99.4% | 10.8% | 10.1% | 12.3 | 1000 |
| 6 | on | on | 2 | 0.0% | 3.8 / 4 / 4.5 | 54.1% | 100.0% | 3.2% | 15.2% | 8.7 | 1000 |
| 6 | on | on | 3 | 0.0% | 7.1 / 7 / 8.5 | 49.7% | 99.4% | 13.9% | 13.1% | 12.0 | 1000 |

Only three settings meet every target: (9, on, on, 2), (8, on, off, 3) and (7, on, off, 3).
**Chosen: maxRank 9, Sprout on, guarantee on, 2 copies** (bold row). It has the fairest start
(50.7% first-player wins), the fewest Strangle endings (8.8%), a real choice on 99.6% of turns
and no empty early turns; games last 8.3 turns per player (median 8.5, 90% under 10). Without
Sprout, a third or more of the first five turns place nothing; with Sprout and fewer cards
(maxRank 7 or less, 2 copies) the deck runs out too fast (4-6 turns each).

**Changed (v0.4-defaults-2): guarantee off.** The guarantee redealt until both hands had a
combo, so every opening hand held a line or clump of 3. Players found that felt arranged,
not shuffled, so the default is now a plain random deal: shuffle once, deal, draw in order
(the row maxRank 9, Sprout on, guarantee off, 2 copies). The trade: first-player wins rise
from 50.7% to 54.5% (just over the 54% target), games run 9.0 turns per player, and Strangle
ends 7.8% of games. Sprout means a hand with no combo can still grow from turn 1.

### 11.2 Bot levels (page only)

`src/bots/levels.ts` gives the page nine levels (bots-v0.6). All read only their own `View`,
are pure and deterministic (same view, level and seed, same move), and count search in
iterations, never time. Level 7 is GreedyBot; levels 1-6 add sloppiness to it; level 8 throws
better; level 9 plans its turn and imagines the opponent's reply. Each level judges
Strengthen and Fruit at its own skill (`docs/BOT-TACTICS.md`).

Ladder (800 games per pairing, starts swapped; `docs/LADDER.md`): every level beats the one
below in 64-72% of games (target 58%), level 9 beats level 7 in 76.8% (target 65%), and
level 7 beats level 1 in 99.6% (target 95%). Level 8 was retuned to get there (it slipped
too often: 57.4% against level 7, now 68.4%).

### 11.3 Fruit, Strengthen and fairness defaults (v0.5)

`src/sim/v05.ts` (run with `src/sim/v05-stage.sh`) plays level-7 vs level-7 games (the full
evaluation for Strengthen and Fruit, `docs/BOT-TACTICS.md`) with swapped starts on matched seeds,
and records every metric below. The baseline and Stage A first ran 2,000 games per setting; on the
owner's request the later settings ran **800** (a win rate is then accurate to about ±3.5%).

Metrics, per setting: share of games with a Fruit, its mean turn, the Fruit user's win rate; the
comeback rate (behind at the midpoint, winning at the end) and the leader's win rate; games
decided by Fruit (the winner's Fruit swing was at least the final margin); Strengthen use and
whether the side that strengthened more won; overgrow + cut actions per game; games with no
overgrow, cut or Fruit in the last 8 player-turns; games ending with a player holding >30% of
their tiles at top rank; games where a top-rank tile blocked something and one was later
removed; turns 1-5 with no legal combo or Sprout and no tile placed; game length; first-player
wins; Strangle; "reflexive" Fruit (in a player's first 3 turns) and "forgotten" Fruit (available
but never used).

| Setting | Games | Fruit games | Fruit mean turn | Fruit user wins | Comeback | Leader wins | Decided by Fruit | Strengthen games | Strengthen/game | More-strengthen side wins | Overgrow+cut/game | Quiet last 8 | >30% top-rank | Blocker removed | Stuck early | Turns/player | P1 wins | Strangle | Reflexive | Forgotten |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline (no Fruit, no Strengthen) | 2000 | 0% | - | - | 34.5% | 65.5% | 0% | 0% | 0 | - | 19.2 | 0.0% | 21.9% | 51.2% | 0% | 9.09 | 54.4% | 8.1% | - | - |
| A1 Fruit 1, give up 3 | 2000 | 62.0% | 13.6 | 47.1% | 34.6% | 65.4% | 5.2% | 0% | 0 | - | 18.4 | 0.1% | 11.7% | 68.5% | 0% | 9.07 | 55.4% | 7.1% | 2.0% | 65.1% |
| A2 Fruit 2, give up 3 | 2000 | 62.0% | 13.7 | 47.4% | 34.5% | 65.5% | 5.2% | 0% | 0 | - | 18.3 | 0.1% | 11.1% | 68.8% | 0% | 9.07 | 55.6% | 7.1% | 2.0% | 65.7% |
| A3 Fruit 1, give up 2 | 2000 | 87.5% | 12.8 | 44.8% | 35.6% | 64.4% | 7.0% | 0% | 0 | - | 18.4 | 0.1% | 11.6% | 73.9% | 0% | 9.06 | 54.7% | 6.4% | 4.6% | 42.4% |
| A4 Fruit 1, give up 4 | 800 | 41.3% | 14.4 | 54.5% | 31.3% | 68.7% | 3.8% | 0% | 0 | - | 18.8 | 0.0% | 15.5% | 64.8% | 0% | 9.04 | 56.3% | 7.8% | 0.9% | 77.7% |
| A5 Fruit 1, only when behind | 800 | 36.0% | 13.8 | 20.5% | 35.4% | 64.6% | 4.0% | 0% | 0 | - | 18.8 | 0.0% | 17.3% | 61.3% | 0% | 9.02 | 55.8% | 7.8% | 1.7% | 77.6% |
| B1 + Strengthen, limit 2 | 800 | 71.0% | 13.6 | 48.5% | 34.4% | 65.6% | 3.0% | 88.8% | 1.95 | 53.9% | 16.5 | 0.0% | 20.3% | 74.4% | 0% | 9.14 | 56.8% | 3.8% | 2.3% | 57.9% |
| B2 + Strengthen, limit 4 | 800 | 71.5% | 13.6 | 46.9% | 34.0% | 66.0% | 3.8% | 88.8% | 2.12 | 53.7% | 16.4 | 0.0% | 21.3% | 74.2% | 0% | 9.14 | 55.8% | 3.5% | 2.3% | 58.1% |
| B3 + Strengthen, no limit | 800 | 71.5% | 13.6 | 46.9% | 34.0% | 66.0% | 3.8% | 88.8% | 2.12 | 53.7% | 16.4 | 0.0% | 21.3% | 74.2% | 0% | 9.14 | 55.8% | 3.5% | 2.3% | 58.1% |

**Stage A choice: one Fruit per player, giving up 3, at any time.** It is the only setting that
meets every Fruit target (used in 40-80% of games, after turn 5 on average, the user winning
45-65%). A second Fruit is almost never used (A2 = A1). Giving up 2 makes it too easy (87.5% of
games, the user winning under 45%); giving up 4 or "only when behind" make it rare, and "only
when behind" turns it into a losing player's last try (the user wins 20.5%).

**Stage B choice: Strengthen on, limit 2 per game.** Limits 2, 4 and none play almost the same
(the bots rarely strengthen more than twice); 2 is slightly the best on top-rank turtling. It
fails two targets, reported honestly: Strengthen is used in 89% of games (target 30-70%), and
the share of games ending with a player holding over 30% of their tiles at top rank rises back
to about 20% (target 10% or less; without Strengthen, Fruit alone brought it to 11.7%). A fix
is proposed to the owner (not added): Strengthen may not raise a tile to the top rank.

Fairness (Part 1): 200,000 opening hands per deck: 3+ top cards in **5.20%** of hands with 56
cards (exact 5.25%) and **2.64%** with 72 cards (exact 2.62%); none at all in 31.90% / 42.46%
(exact 31.75% / 42.17%). `npx tsx src/sim/deal-stats.ts`.


### 11.4 Fruit cards defaults (v0.6)

`src/sim/fruitcards.ts` (run with `src/sim/fruit-stage.sh`) plays level-7 vs level-7 games with
swapped starts on matched seeds. One setting changed at a time from the default; 500 games each
to screen, then the chosen default confirmed with 2,000 (a rate is then good to about ±2.2%).

| Setting | Games | Fruit games | Fruit/game | Fruit/side | Mean own turn | More-Fruit side wins | Two in a turn/game (that side wins) | Thrown, then taken | Stuck in a hand at the end/game | >30% top-rank | Comeback | Leader wins | P1 wins | Strangle | Turns/player | Ends: deck · turn limit · Strangle |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fruitCardCount 2 | 500 | 98.4% | 1.84 | 0.92 | 6.3 | 58.1% | 0.03 (75.0%) | 0.0% | 0.11 | 26.8% | 30.9% | 69.1% | 56.4% | 3.2% | 9.37 | 96.8% · 0% · 3.2% |
| **fruitCardCount 4 (default)** | 500 | 99.6% | 3.54 | 1.77 | 6.8 | 61.8% | 0.10 (44.0%) | 0.0% | 0.38 | 16.4% | 35.9% | 64.1% | 53.2% | 2.4% | 9.71 | 97.6% · 0% · 2.4% |
| fruitCardCount 6 | 500 | 100% | 5.05 | 2.52 | 7.4 | 53.3% | 0.16 (33.3%) | 0.0% | 0.77 | 10.8% | 43.0% | 57.0% | 56.8% | 1.6% | 10.20 | 98.4% · 0% · 1.6% |
| fruitRootCountsAsTouch false | 500 | 99.6% | 3.53 | 1.77 | 6.8 | 62.1% | 0.10 (45.8%) | 0.0% | 0.38 | 16.4% | 36.0% | 64.0% | 54.0% | 2.4% | 9.72 | 97.6% · 0% · 2.4% |
| **default, confirmed** | 2000 | 99.9% | 3.53 | 1.76 | 6.8 | 55.0% | 0.08 (48.1%) | 0.0% | 0.38 | 17.6% | 37.9% | 62.1% | 53.7% | 3.0% | 9.71 | 97.0% · 0% · 3.0% |

What the Fruit cards were played on (default, 2,000 games): a top-rank tile 34.5%, a chain cut
(3+ tiles removed) 11.5%, opening a Strangle 0.2%, other 53.9%. Fruit cards thrown: 0.5% (none
of them taken by the opponent). The score lead right after a two-Fruit turn: +1.1 on average.

Turns with no combo (Sprout only) / with nothing to play at all, by own turn (default):
1-3: 65.6% / 0%; 4-6: 63.9% / 0%; 7-12: 63.3% / 0%; 13+: 88.9% / 0%. **Nothing to play after
turn 3: 0.0%** in every setting (Sprout and Strengthen almost always leave a move), so no lever
is needed. If it ever were, more cards (a third copy) would help most, without changing a rule.

Targets (guides), for the default: Fruit cards played in 50-90% of games: **fail** (99.9%: with
4 in 76 cards nearly every game sees one); on average after turn 4: pass (6.8); the side that
played more wins 45-65%: pass (55.0%); at most 10% thrown and taken: pass (0%); comeback rises
(v0.5: 34.4%) while the leader still wins over 55%: pass (37.9%, 62.1%); at most 10% of games
with a player over 30% top-rank: **fail** (17.6%; v0.5 with Strengthen: 20.3%); first player
46-54%: pass (53.7%); Strangle under 15%: pass (3.0%); game length within 10% of the v0.5
default (9.14 turns each): pass (9.71, +6%).

**Choice: 4 Fruit cards, my root counts as touching.** 2 fails more (top-rank 26.8%, the first
player 56.4%); 6 nearly meets the top-rank target (10.8%) but tips the first player to 56.8%
and slows the game (+11% on v0.5); 4 passes every other target. Root touch on or off plays the
same (the root rarely matters), so the simpler wording stays ("touches yours"). Two Fruit cards
in one turn happen in 8% of games and that side wins 48%: not too strong.

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

### A.5 Fruit
No longer parked: back in v0.5 and on by default (section 7.8).

---

## Retired rules (descriptions only, v0.6)

- **Seed mode** (v0.5 A/B test): the one-card move put a tile of strength 1 whatever the card
  (marked as a seed until strengthened), and Strengthen had no per-game limit so a seed could be
  grown later. Retired in favour of the Sprout.
- **3-tile Fruit** (v0.5): once per game, give up 3 of my own connected tiles to remove one
  opponent tile next to them, whatever its strength (`fruitPerPlayer`, `fruitSacrifice`,
  `fruitOnlyWhenBehind`). Replaced by Fruit cards.
- **Older rules versions** (`v0.4-defaults-2`, `v0.5-fruit-strengthen`, `v0.5-seed`) and the
  frozen older bots (`bots-v0.5`, `bots-v0.7`): no longer kept; recordings made under them no
  longer replay.
- **The biased shuffle** (`unbiasedShuffle: false`, only used by v0.4): removed; the shuffle is
  always unbiased.
