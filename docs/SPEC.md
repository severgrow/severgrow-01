# FUTASAKU: Rules Spec 0.4

> **Grow a living network. Keep it joined to your home. Cut theirs.**

This file is the source of truth for the rules of Futasaku. The engine in `src/engine/` implements
exactly this, and the tests in `tests/` check it. If code and this file disagree, that is a bug: raise
it, don't pick one quietly. If a rule here is unclear, ask the owner before changing anything.

The rules version described here is **`futasaku0.4`** (`CURRENT_RULES_VERSION`). Older recorded
versions still replay (section 10). The history of how the rules got here, with the simulations that
chose the defaults, is in `docs/archive/SPEC-HISTORY.md`.

---

## 0. Names

The game uses player words. Some code names are older and are kept on purpose, because saves,
replays and tests use them. Docs and player text use the player word; code may use either.

| Player word | Code name | What it is |
| --- | --- | --- |
| Futasaku | `severgrow` (save keys), `SEVEROR` (old wordmark) | the game |
| Home (your tree, the opponent's volcano) | root | the start tile of each side |
| Tile | tile | one claimed hex with a strength (its number) |
| Gold hex | rich hex | a hex that scores 2 |
| Draw / Grow / Throw | `DRAW` / `ACT` / `DISCARD` | the three steps of a turn |
| Grow (the move) | `Sprout` | one card becomes one tile |
| Strengthen | a `Sprout` on your own tile | a higher card raises your own tile |
| Bloom | `Bloom` | 3 to 6 matching cards become that many tiles |
| Bomb | Fruit card, `PlayFruit`, `FRUIT` | removes one enemy tile |
| Blast | `MegaBomb` | two Bombs together: clears an area |
| Throw pile | discard pile | |
| Opponent | bot (code only) | the computer player; never "bot" on screen |

---

## 1. Rules at a glance

**Players:** you and the opponent. **Board:** 37 hexes (radius 3) with 4 rock hexes (impassable) and
5 gold hexes, mirror-symmetric. **Cards:** 76: the numbers 1 to 9 in four suits (Moss, Ash, Dew,
Ember), two copies of each (72), plus 4 Bombs. **Hand:** 7 cards.

**Who starts:** a fair 50/50 draw at the start of each game (section 5).

**A turn:** **Draw**, then **Grow**, then **Throw**.

1. **Draw** one card: from the deck, or the top card of the throw pile.
2. **Grow:** play, in any order:
   - **one** of these per turn: a **Grow** (any one card becomes one tile), a **Strengthen**
     (a higher card raises one of your own tiles), or a single **Bomb** (removes one enemy tile);
   - and **as many as you like** of: **Bloom** (3 to 6 matching cards become that many tiles) and
     **Blast** (two Bombs together clear an enemy tile and the enemy tiles around it).
   You may also play nothing.
3. **Throw** one card onto the throw pile (skipped if your hand is empty). Then refill to 7 from
   the deck.

**New tiles** must touch your network. They may take over an enemy tile only with a strictly higher
number. **Sever:** after every move, any tile no longer joined to its home is removed.

**The game ends** when:
- a home is **surrounded** (Strangle): its owner loses at once; or
- the **deck runs out**: both sides get the same number of final turns without drawing, then the
  higher score wins; or
- each side has played **30 turns**: the higher score wins.

**Score:** 1 per tile, 2 on a gold hex. **A tied score** goes to the side with the higher total of
its tile numbers (strength); if that is equal too, the game is a **draw**.

---

## 2. Engine principles (non-negotiable)

1. **Deterministic.** Same seed and same ordered list of actions give a byte-identical final state.
   Only the seeded `mulberry32` generator. Never `Math.random()`, clocks or timers in the engine.
   Randomness only in the shuffle, the terrain and the starter draw, each on its own seed stream.
2. **Pure.** `apply(state, action)` returns a new state and never changes its input. An illegal
   action throws `IllegalActionError` with a stable `code`.
3. **Serializable.** `State`, `View`, `Action`, `Event` and `RulesConfig` are plain JSON.
4. **Hidden information.** `viewFor(state, player)` never shows the opponent's hand or the deck
   order. The throw pile is public.
5. **Legal actions.** `legalActions(view)` lists every legal action and nothing illegal, with one
   known exception: for a Bloom of 5 or 6 cards it lists at most 8 card orders per placement (to
   keep the opponent's thinking fast). `apply` accepts every legal order.
6. **No I/O** in `src/engine/`: no rendering, network, files, timers or browser APIs.
7. **Config-driven.** Every tunable lives in `RulesConfig` (section 9).
8. **Do not add rules.** Unclear cases are raised as questions to the owner.

---

## 3. Board

Axial coordinates `{q, r}`; a hex is on the board when `|q|, |r|, |q+r| <= 3`. Key: `` `${q},${r}` ``.
Directions 0-5: `(1,0) (1,-1) (0,-1) (-1,0) (-1,1) (0,1)`.

- **Homes:** player 1 at `(-2,2)`, player 2 at `(2,-2)`. A home is a tile `{owner, strength: 0,
  root: true}`: it is never replaced, removed or cut off, and it scores nothing.
- **Terrain** is made from the seed in mirrored pairs (point symmetry): exactly 4 rock and 5 gold
  hexes. The centre is always gold. No rock or gold on or next to a home. Rock is impassable.

---

## 4. Cards and the deal

- Suits `0 Moss, 1 Ash, 2 Dew, 3 Ember`; numbers 1 to 9; 2 copies of each = 72 numbered cards.
  Plus 4 **Bombs** (`suit: null`, `rank: 0`): 76 cards. Every card has a stable id.
- Identical copies play identically: `legalActions` lists them once, using the lowest ids; `apply`
  accepts any valid id.
- **A fully random, fair deal.** The deck is shuffled once (Fisher-Yates, unbiased random integers by
  rejection sampling) from the deck seed stream. Deal 7 to player 1, then 7 to player 2, then flip one
  card to start the throw pile. Nothing is reordered, redealt or balanced: any hand is possible.
- **Cards are conserved:** every card is always in exactly one place: a hand, the deck, the throw pile,
  on the board as a tile's card, or out of the game (a played Bomb).
- The throw pile is never shuffled back into the deck.

---

## 5. Who starts

At `newGame` the engine draws who starts: a fair 50/50 from its own seed stream (`STARTER_STREAM`,
`randomStarter`). It does not depend on the deal, the terrain or anything else the page derives from
the seed (for example the opponent's level within a difficulty). The starter is stored in
`state.startingPlayer`, is the first `turnPlayer`, and draws on turn 1. The page shows the result as a
short "Who starts?" draw; the result is already fixed by the seed.

---

## 6. The turn

```ts
type Phase = 'DRAW' | 'ACT' | 'DISCARD' | 'GAME_OVER'; // plus 'KNOCK' | 'ROT_PICK' (parked, appendix A)
```

### 6.1 Draw
`Draw { from: 'deck' | 'discard' }`. The deck is never empty at the start of an ordinary turn
(6.4). If the throw pile is empty, only the deck draw is legal. The drawn throw-pile card is remembered
(`drawnFromDiscard`).

### 6.2 Grow
Any number of **Bloom** and **Blast**, and at most **one** of **Grow**, **Strengthen** or **Bomb**
(`sproutsPerTurn` = 1 shared by the three; `fruitUsesSprout`). Any order. Then `EndAct`.
After **each** move: Sever, then the Strangle check. A move may use the last card in hand.

### 6.3 Throw
`Discard { card }`: one card from hand to the top of the throw pile.
- The card just taken from the throw pile may not be thrown back (`REDUNDANT_DISCARD`), unless it
  is the only card in hand.
- With an empty hand, `EndAct` skips the Throw step.

### 6.4 End of turn and refill
After the Throw: Sever and Strangle, then refill the hand to 7 from the deck, then the other side's
Draw. If the refill **empties the deck**, the final turns begin (8.2).

---

## 7. Grow-step moves

### 7.1 Placing tiles (Grow, Bloom)
A new tile may go on an **empty** hex or on an **enemy non-home tile with a strictly lower number**
(it takes it over). Never on rock, off the board, on a home or on your own tile (except Strengthen).
"Touches your network" is judged on the board **before** the move; your home counts. Every move is
all-or-nothing.

### 7.2 Grow (`Sprout { card, coord }`)
One numbered card becomes one tile with that card's number on `coord`, which must touch your network
and be empty or hold a weaker enemy non-home tile. Uses the turn's one Grow (`SPROUT_LIMIT`).

### 7.3 Strengthen (a `Sprout` on your own tile)
`coord` may instead be one of **your own non-home** tiles when the card's number is **strictly higher**
than the tile's. The tile stays and takes the card's number. No touching rule needed. It uses the turn's
one Grow. No limit per game (`strengthenLimitPerGame: -1`). It scores nothing by itself, changes no
connections, and does not protect against a cut or a Bomb. Equal or lower: `NOT_STRONGER`; a home:
`ROOT_IMMUNE`. Event `Strengthen { player, card, coord, oldStrength, newStrength }`.

### 7.4 Bloom (`Bloom { cards, hexes }`)
- **Cards:** 3 to 6 numbered cards that form either
  - a **set**: all the same number, any suits (two copies of one suit are allowed); or
  - a **run**: one suit, numbers in a row, no repeats, no wrap from 9 to 1.
  Bombs never bloom (`NOT_A_NUMBER_CARD`). Holding more matching cards, you choose which to use; the
  rest stay in hand.
- **Hexes:** as many as cards, all different, forming **one connected cluster** of any shape, at least
  one touching your network before the move (`bloomMustTouchNetwork`). `hexes[i]` gets a tile with
  `cards[i]`'s number and must be claimable at that number (7.1). For a run you choose which number
  goes where.
- Unlimited per turn, before or after the other moves. It does not use the turn's Grow.
- Errors: `BLOOM_WRONG_SIZE`, `SET_MIXED_RANKS`, `RUN_MIXED_SUITS`, `RUN_NOT_CONSECUTIVE`,
  `DUPLICATE_HEX`, `HEXES_NOT_CONNECTED`, `NOT_ADJACENT`. Event `Bloom { player, cards, hexes }`.

### 7.5 Bomb (`PlayFruit { card, target }`)
- Play one Bomb on an **enemy non-home tile** that one of your tiles touches (your home counts,
  `fruitRootCountsAsTouch`). The tile is removed **whatever its number**, even a 9. The Bomb leaves
  the game (it does not go to the throw pile).
- It uses the turn's one Grow (`SPROUT_LIMIT`). No limit per game.
- A Bomb may be thrown like any card; then the opponent can take it.
- Errors: `NOT_A_FRUIT_CARD`, `FRUIT_TARGET_NOT_ENEMY`, `FRUIT_TARGET_ROOT`, `FRUIT_TARGET_NOT_TOUCHED`.
  Event `FruitCard { player, card, target, strength }`.

### 7.6 Blast (`MegaBomb { cards, target }`)
- Play **two Bombs together** on an **enemy non-home tile** next to your territory that is joined to
  your home. That tile **and every enemy non-home tile on the 6 hexes around it** are removed,
  whatever their numbers. Your own tiles and both homes are never touched. Both Bombs leave the game.
- An **extra move, like Bloom**: unlimited per turn, and it neither needs nor uses the turn's one
  Grow, Strengthen or Bomb. It works in the final turns too.
- Errors: `MEGA_BOMB_NEEDS_TWO`, `NOT_A_FRUIT_CARD`, `MEGA_BOMB_TARGET_NOT_ENEMY`,
  `MEGA_BOMB_TARGET_ROOT`, `MEGA_BOMB_NOT_CONNECTED`. Event `MegaBomb { player, cards, target,
  destroyed }`.

### 7.7 Taking over
A higher number replaces a weaker enemy tile (event `Overgrow`). Equal is blocked; homes are immune.
A 9 can only be removed by a Bomb, a Blast or a cut.

### 7.8 Sever (the central rule)
After every placement or removal, for each side: everything reachable from its home through its own
tiles stays; every other tile of that side is removed. The order cannot matter. The mover's opponent is
listed first in the events.

### 7.9 Strangle
A home is strangled when none of its six neighbours is free: each is off the board, rock or an enemy
tile, **and** at least one is an enemy tile. Its owner loses at once (`strangle`). Both at once: a draw
(`double_strangle`; it cannot happen through normal moves).

---

## 8. End of the game and scoring

### 8.1 Score
Each non-home tile scores 1, or 2 on a gold hex. Homes score nothing.

### 8.2 The deck runs out: equal final turns
When a refill empties the deck, the game does not end at once. Both sides end up with the **same
number of turns**:
- if the second player emptied the deck, each side plays **one** final turn, the starter first;
- if the starter emptied it, only the second player plays **one** final turn.
A final turn has **no Draw**: it starts at Grow (every Grow-step move is allowed, including Bloom and
Blast), then Throw, with no refill (`state.deckFinal`). After the last final turn the game ends
(`deck_exhaustion`).

### 8.3 Turn limit
After 30 turns each (`maxTurnsPerPlayer`), the game ends (`turn_limit`), scored the same way. It
exists because both sides could keep taking each other's thrown card, so the deck would never shrink.

### 8.4 Winner and tie-break
1. The higher score wins.
2. A tied score: the higher **total strength** wins (the sum of the numbers on that side's tiles,
   homes 0).
3. Equal strength too: a **draw** (`winner: null`).

The result then carries `strengths: [p1, p2]`. A Strangle ends the game regardless of score.

```ts
type EndReason = 'deck_exhaustion' | 'turn_limit' | 'strangle' | 'double_strangle' | 'knock';
type GameResult = { winner: Player | null; reason: EndReason; scores: [number, number];
                    strengths?: [number, number]; deadwood?: [number, number]; undercut?: boolean };
```

A finished game (`GAME_OVER`) accepts no actions.

---

## 9. Config (current defaults)

`newGame(seed, overrides?)` merges `overrides` onto `DEFAULT_CONFIG` and validates (`ConfigError` for
unknown keys, wrong types, `maxRank` outside 5-9, an even `richCount`, an odd `rockCount`, `handSize`
under 3, or a deck too small to deal both hands, flip a card and still leave one to draw).

| Key | Default | Meaning |
| --- | --- | --- |
| `boardRadius` | 3 | board size |
| `rootStyle` | `'ring2'` | where the homes are |
| `handSize` | 7 | |
| `maxRank` | 9 | cards 1..9 |
| `copiesPerCard` | 2 | copies of each suit and number |
| `fruitCardCount` | 4 | Bombs in the deck |
| `rockCount`, `richCount` | 4, 5 | rock and gold hexes |
| `sproutsPerTurn` | 1 | the one Grow / Strengthen / Bomb per turn |
| `fruitUsesSprout` | true | a single Bomb uses that one move |
| `fruitRootCountsAsTouch` | true | your home counts as touching a Bomb target |
| `allowStrengthen` | true | |
| `strengthenLimitPerGame` | -1 | no limit |
| `bloomMustTouchNetwork` | true | |
| `expandedBloom` | true | Bloom of 3-6 cards, sets may repeat a suit |
| `deckFinalTurns` | true | equal final turns at the end of the deck; Blast allowed |
| `randomStarter` | true | the engine draws who starts |
| `strengthTieBreak` | true | tied score: strength, then draw |
| `maxTurnsPerPlayer` | 30 | turn limit (0 = none) |
| `forbidRedundantDiscard` | true | no throwing back the card just taken |
| `rootsScore` | false | homes score nothing |
| `board`, `reshuffleDiscard` | `null`, false | experimental boards (appendix B) |
| `rotEnabled`, `knockEnabled`, `rotThreshold`, `rotStep`, `knockDeadwood`, `knockGivesFinalTurn` | off | parked rules (appendix A) |

---

## 10. Rules versions

A recorded game (save, replay, ticket) names its rules version. `RULES_VERSIONS` keeps each one so
old recordings still replay exactly. A browser save from an older version is replayed under its own
rules, then continues under the current rules from that exact position.

| Version | Differences from `futasaku0.4` |
| --- | --- |
| `futasaku0.4` (current) | |
| `futasaku0.3-six-card-bloom` | player 1 always starts; a tied score goes to player 2 |
| `futasaku0.3-mega-bomb-final-turns` | as above, and Bloom is 3-4 cards with different suits in a set |
| `futasaku0.3-unlimited-strengthen` | as above, and no Blast and no final turns (the game ends when the refill empties the deck) |
| `v0.8-fruit-sprout` | as above, and Strengthen at most twice per game |

Bot versions are in `src/bots/versions.ts` (current `bots-v0.10`).

---

## 11. Types and API

`State` (plain JSON): `seed, config, board, terrain, hands, deck, discard, turnPlayer, startingPlayer,
actor, phase, drawnFromDiscard, fruitPlayed, fruitKnown, strengthenUsed, sproutsThisTurn, deckFinal,
finalTurn, rotPick, turnNumber, result, lastResolution, history`.

`View`: own hand, opponent's hand size, throw pile, deck size, phase and turn fields, both scores,
`fruitPlayed`, `fruitUnseen` (Bombs this player has not seen), result, last resolution. Never the
opponent's hand or the deck order.

```ts
type Action =
  | { t: 'Draw'; from: 'deck' | 'discard' }
  | { t: 'Bloom'; cards: number[]; hexes: Coord[] }   // hexes[i] receives cards[i]
  | { t: 'Sprout'; card: number; coord: Coord }       // Grow or Strengthen
  | { t: 'PlayFruit'; card: number; target: Coord }   // Bomb
  | { t: 'MegaBomb'; cards: number[]; target: Coord } // Blast
  | { t: 'EndAct' }
  | { t: 'Discard'; card: number }                    // Throw
  | { t: 'Knock' } | { t: 'Continue' } | { t: 'RotPick'; coord: Coord }; // parked
```

Events (`state.history`): `Draw, Bloom, Sprout, Strengthen, Overgrow, FruitCard, MegaBomb, Discard,
Sever, Strangle, GameEnd`, plus the parked `Knock, FinalTurnStart, RotCount, Rot, RotPick`. A deck draw
hides its card from the opponent (`eventsFor`).

API: `newGame, drawStarter, legalActions, apply, viewFor, replay, eventsFor, score, scores, strengths,
planMegaBomb, megaBombTargets, rulesConfig, RULES_VERSIONS, CURRENT_RULES_VERSION`.

---

## 12. Tests and determinism

- Every rule has unit tests, written first (`tests/engine/`). Never weaken a test to make it pass.
- **Property games** check after every action: no tile on rock or off the board, every non-home tile
  joined to its home, homes intact, strengths 1..9, every card in exactly one place, `apply` never
  changes its input, every listed legal action is accepted, a finished game accepts nothing.
- **Determinism:** a seed and its action list replayed twice give byte-identical states and events.
- **Golden games:** 8 recorded games replay byte-for-byte on their recorded rules version.
- **Fairness:** the shuffle and the starter draw are tested for even spread.

---

## 13. The opponent

Nine levels in `src/bots/levels.ts` (pure, deterministic, reading only their own `View`; search
counted in steps, never time). Level 7 is the reference player; 1-6 make more mistakes; 8 throws
better; 9 plans its turn and the reply. Details: `docs/BOT-TACTICS.md`, ladder: `docs/LADDER.md`.

The page offers five difficulties; each new game picks one level from its list using the seed,
independently of who starts:

| Difficulty | Levels |
| --- | --- |
| Beginner | 1, 2 |
| Easy | 3, 4 |
| Medium | 5, 6, 7 |
| Hard | 8 |
| Pro | 9 |

---

## Appendix A: Parked rules (engine only, off)

Knock, Rot and leftover-card ("deadwood") scoring are still in the engine behind switches
(`knockEnabled`, `rotEnabled`), off in every rules version, never shown to players, and tested with the
switches on. They are kept because removing them would touch the save and replay format; they may be
removed in a later cleanup. Their full description is in `docs/archive/SPEC-HISTORY.md`, appendix A.

## Appendix B: Experimental boards (engine only)

`board` (a `BoardSpec`: cells, rock, gold and two homes) and `reshuffleDiscard` let the engine run
other board shapes. They are `null`/off in every rules version and not reachable from the game. The
old Lab that used them is archived on the `archive/futa0.4-before-cleanup` branch.
