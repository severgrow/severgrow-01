# MYCELIUM: Engine Spec v0.3 (Claude Code ready)

> **Grow a living network. Protect the connection. Cut theirs.**

Scope of this document: a **pure, deterministic, headless TypeScript rules engine**, two bots, a simulation harness, a replay tool and a terminal client. **No graphics, no networking, no meta systems.** Prove the game first.

---

## 0. Changes from v0.2 (read first)

| # | Change | Why |
|---|--------|-----|
| 1 | Rich hexes: **5** (centre + 2 mirrored pairs), configurable but must be odd | "4 rich incl. centre" is impossible under point symmetry (centre is its own mirror) |
| 2 | **Rot is measured on the kept hand** (after Discard, before Refill), same moment as Knock | v0.2 measured a freshly refilled random hand, so Rot was mostly luck and fired almost every turn |
| 3 | Rot thresholds re-baselined to **T=20, step 8** (placeholders; calibration milestone is mandatory) | Follows from #2 |
| 4 | New phase **`ROT_PICK`**: the opponent explicitly picks among tied Rot candidates | v0.2 required an opponent choice with no action to express it |
| 5 | **Knock gives the opponent one final turn** | v0.2 Knock had no counterplay: lead + deadwood ≤ 10 = instant win |
| 6 | **Cannot discard the card you took from the discard pile this turn** | v0.2 allowed a free no-op turn |
| 7 | Roots default to **ring 2: `(-2,2)` and `(2,-2)`** (6 real neighbours). `rootStyle: 'corner'` kept as a sweep flag | Corner roots have 3 board neighbours; a single 3-card Bloom could strangle them |
| 8 | **`legalActions(view)`** takes a View, not raw State | v0.2 had bots consume `View` while legality needed `State`: bots could not enumerate actions without hidden info |
| 9 | Sever simplified: each player's connectivity depends only on their own tiles, so resolution order is irrelevant | v0.2 implied an ordering that cannot change the outcome |
| 10 | Fruit identity stated: **ignores strength** (can remove a rank-9 tile) | Gives players a reason to save it |
| 11 | Future/platform/monetization material **removed** (see section 21) | Dilutes the engine brief |

---

## 1. Rules at a glance

**Players:** 2. **Board:** 37 hexes (radius 3), point-symmetric terrain. **Cards:** 72 (4 suits x ranks 1-9 x 2 copies). **Hand:** 7.

**Turn:** `DRAW -> ACT -> DISCARD -> KNOCK? -> (Rot -> Sever -> Strangle -> Refill)`

1. **Draw** one card from the deck or the top of the discard pile.
2. **Act:** play any melds you hold.
   - **Run** (3+ same suit, consecutive) = **Hypha**: a straight line of tiles, strength rising outward.
   - **Set** (3-4 same rank, different suits) = **Bloom**: a connected cluster of equal-strength tiles.
   - New tiles must touch your network. They may replace an enemy tile only if **strictly stronger**.
   - Once per match you may **Fruit**: sacrifice 3 connected tiles to delete one adjacent enemy tile of any strength.
3. **Discard** one card.
4. **Knock** if your leftover cards (**deadwood**) total <= 10. The opponent gets one final turn, then the higher tile score wins (ties lose for the knocker).
5. Otherwise: **Rot** punishes too much deadwood by deleting your weakest border tiles, then **Sever** deletes every tile no longer connected to its root, then **Strangle** is checked, then you **Refill** to 7.

**Win by:** Knock (and survive the final turn with a strictly higher score), deck exhaustion (higher score), or **Strangle** (all six neighbours of the enemy root blocked, at least one by an enemy tile).

The whole game is: **grow, threaten the connection, protect yours, manage your hand.**

---

## 2. Engine principles (non-negotiable)

1. **Deterministic.** Same seed + same ordered action list = byte-identical final state. Seeded `mulberry32` only. Never `Math.random()`. Randomness is limited to deck shuffle and terrain generation.
2. **Pure.** `apply(state, action) -> newState`. Never mutate the input (including nested objects). Return a fresh serializable state. Illegal actions throw a typed `IllegalActionError` with a stable `code`.
3. **Serializable.** `State`, `View`, `Action`, `Event`, `RulesConfig` are plain JSON. No classes, Maps, Sets, Dates, functions or `Infinity` in persisted data. Maps/Sets are fine inside a calculation.
4. **Hidden information.** `viewFor(state, player)` never exposes the opponent's hand contents or the deck order. The discard pile is fully public.
5. **Exhaustive legality.** `legalActions(view)` returns every legal action for the actor and nothing illegal. No auto-correction, no "closest valid hex", no silent discards.
6. **No I/O.** The engine has no rendering, networking, filesystem, timers or browser APIs.
7. **Config-driven.** All tunables live in `RulesConfig` (section 3). Do not hardcode the board radius, hand size or thresholds anywhere else.
8. **Do not add rules.** If something is ambiguous: stop, name the exact ambiguity, choose the smallest deterministic interpretation only if it cannot affect balance, otherwise surface it as a design question.

---

## 3. Config

```ts
type RulesConfig = {
  boardRadius: 3;               // do not hardcode 3 elsewhere
  rootStyle: 'ring2' | 'corner';
  handSize: number;             // 7
  copiesPerCard: number;        // 2
  rockCount: number;            // 4  (must be even)
  richCount: number;            // 5  (must be odd: centre + pairs)
  knockDeadwood: number;        // 10
  knockGivesFinalTurn: boolean; // true
  rotThreshold: number;         // 20
  rotStep: number;              // 8
  forbidRedundantDiscard: boolean; // true
  allowHyphaOneBend: boolean;   // false
  fruitPerPlayer: number;       // 1
  rootsScore: boolean;          // false
};
```

`newGame(seed, config?)` validates the config (odd `richCount`, even `rockCount`, `handSize >= 3`) and throws on invalid values.

---

## 4. Board

### 4.1 Hex grid
Axial coordinates `{ q, r }`. Valid when `|q| <= 3`, `|r| <= 3`, `|q + r| <= 3` (37 hexes). Canonical key: `` `${q},${r}` ``.

### 4.2 Directions
Exactly these, indexed 0-5:
```ts
const DIRECTIONS: Coord[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];
```
`dir` in actions is the index into this list.

### 4.3 Roots
- `rootStyle: 'ring2'` (default): P1 `(-2, 2)`, P2 `(2, -2)`. Every root has 6 on-board neighbours.
- `rootStyle: 'corner'` (sweep flag only): P1 `(-3, 3)`, P2 `(3, -3)`.

Root tile: `{ owner, strength: 0, root: true }`. Root immunity is encoded by `root: true` (never rely on `Infinity`). Roots cannot be overgrown, rotted or Fruited, and always count as connected to themselves. Roots are not removed by Sever.

### 4.4 Terrain
```ts
type Terrain = 'normal' | 'rock' | 'rich';
```
Generated from the seed, **point-symmetric**: `terrainAt(q, r) === terrainAt(-q, -r)`.

Counts: exactly `rockCount` rock (default 4 = 2 mirrored pairs) and `richCount` rich (default 5 = centre + 2 mirrored pairs). Centre `(0,0)` is always rich and never rock.

Constraints:
- No rock on or adjacent to either root.
- No rich on or adjacent to either root.
- A hex has one terrain type.

**Implementation requirement:** do not randomize all 37 hexes and hope. Enumerate the symmetry-equivalent pairs (36 non-centre hexes = 18 pairs), remove ineligible pairs, shuffle the eligible pairs with the seeded PRNG, assign `rockCount/2` pairs to rock, then `(richCount-1)/2` pairs to rich, mirror each.

**Rock** is impassable (cannot be claimed, passed through, or crossed by connectivity). **Rich** tiles score 2.

---

## 5. Cards and setup

- Suits: `0 Moss, 1 Ash, 2 Dew, 3 Ember`. Ranks 1-9. `copiesPerCard` copies of each. Default 72 cards, unique stable `id` each. IDs never affect gameplay.
- Two copies of the same suit/rank are strategically identical. `legalActions` must **dedupe** equivalent actions by using the lowest card IDs among identical copies. `apply` must accept any valid IDs.

```ts
type Card = { id: number; suit: 0 | 1 | 2 | 3; rank: number };
```

**Setup (`newGame`):** generate terrain, generate cards, shuffle (seeded), deal `handSize` to P1 then P2, flip one card to start the discard pile, place both roots, P1 is the turn player, phase `DRAW`.

---

## 6. Turn flow

```ts
type Phase = 'DRAW' | 'ACT' | 'DISCARD' | 'KNOCK' | 'ROT_PICK' | 'GAME_OVER';
```

State tracks `turnPlayer` (whose turn it is) and `actor` (who must act now). They differ only in `ROT_PICK`, where the actor is the opponent.

### 6.1 DRAW (actor = turn player)
Action: `Draw { from: 'deck' | 'discard' }`. Mandatory. Hand becomes `handSize + 1`.
- The discard pile is never empty at the start of a turn (the previous turn discarded onto it).
- The deck may be empty (see 6.5). Then only `from: 'discard'` is legal.
- Record `drawnFromDiscard: cardId | null` for rule 6.3.

### 6.2 ACT
Any number of `MeldRun` / `MeldSet`, and up to `fruitPerPlayer` `Fruit` (per player), in any order. Melded cards leave the hand permanently. `EndAct` moves to `DISCARD`. `EndAct` has exactly one meaning.

After **each** placement/Fruit: Sever, then Strangle check (section 8).

### 6.3 DISCARD
Action: `Discard { card }`. Exactly one card from the hand goes to the top of the discard pile.
- If `forbidRedundantDiscard` and `drawnFromDiscard` is set, discarding that card is illegal.
- Then phase becomes `KNOCK` (or the game ends if this was a final turn, see 7.2).

### 6.4 KNOCK
Two actions, exactly one representation:
- `Knock`: legal only if `deadwood(hand) <= knockDeadwood`, where `hand` is the kept hand (post-discard).
- `Continue`: always legal. It resolves, in order and deterministically:
  1. **Rot** (section 9). If tied candidates need an opponent choice, enter `ROT_PICK` and stop.
  2. **Sever** and **Strangle** check.
  3. **Refill** (6.5).
  4. End of turn: next player, `turnNumber++`, phase `DRAW`.

### 6.5 REFILL and deck exhaustion
Draw from the deck until the hand has `handSize` cards. If the deck runs short:
- draw what exists,
- the game ends immediately after this turn (`deck_exhaustion`, section 11).

An exactly-empty deck after a successful refill does **not** end the game.

---

## 7. Knock and the final turn

### 7.1 Knock
`Knock` ends the knocker's turn. No Rot and no Refill. If `knockGivesFinalTurn` the opponent now plays a **final turn**; otherwise the game scores immediately.

### 7.2 Final turn
The opponent plays `DRAW -> ACT -> DISCARD` normally (Fruit, melds, overgrow, Sever, Strangle all apply) with these exceptions:
- they cannot Knock,
- **no Rot** and **no Refill** for them,
- the game ends right after their `Discard`.

If they Strangle the knocker during the final turn, they win immediately (`strangle`).

### 7.3 Knock result
After the final turn: the knocker wins only if `score(knocker) > score(opponent)`. Otherwise the opponent wins and `undercut = true`. Equal scores are an Undercut.

---

## 8. Melds, placement, overgrowth, Sever, Strangle

### 8.1 Placement rules (all melds)
A placement may claim an **empty** hex or an **enemy non-root tile with strictly lower strength** than the new tile (**overgrow**). It may not claim rock, go off-board, overgrow equal/stronger tiles, overgrow a root, or pass through/land on the player's own tiles.

"Adjacent to an existing tile" is evaluated against the board **before** the meld begins. The player's root counts as an existing tile.

Melds are **atomic**: if any card or coordinate fails, nothing changes.

### 8.2 Run -> Hypha
- 3+ cards, same suit, consecutive ranks, no wraparound. Cards are ordered by ascending rank regardless of input order.
- `start` must be adjacent to one of the player's tiles. The line is `start, start+dir, start+2*dir, ...` (one hex per card).
- Strength rises outward: first card on `start`, last card at the tip. The player cannot reorder.
- Every hex on the line must be legal under 8.1.
- If `allowHyphaOneBend` (sweep flag only), `MeldRun` gains an optional `bend: { after: number; dir: number }`. Default: not implemented until Milestone C.

### 8.3 Set -> Bloom
- 3 or 4 cards, identical rank, all different suits. Claims exactly as many hexes as cards.
- The hexes are distinct, form one connected cluster (hex adjacency), at least one is adjacent to an existing tile, and all are legal under 8.1.
- Every tile gets strength = the shared rank.

### 8.4 Overgrowth
`new.strength > old.strength` replaces the enemy tile (removed permanently, new tile owned by the mover). Equal is blocked. Roots are immune. A rank-9 tile can only be removed by Sever, Rot or Fruit.

### 8.5 Sever (the central rule)
After any placement, Rot or Fruit: for each player independently, flood-fill from their root through their **own** adjacent tiles. Every own tile not reached is **severed**: removed, becomes empty, owned by no one, not captured, not recycled.

Each player's connectivity depends only on their own tiles, so order cannot change the outcome and a single pass is sufficient. For event logging, list the opponent's severed tiles first. Sever must be **idempotent** (test it).

### 8.6 Strangle
After every Sever resolution check both roots. A root is **strangled** when all six neighbours are off-board, rock or enemy tiles **and** at least one is an enemy tile (terrain alone never strangles).
- Exactly one root strangled: its owner loses immediately (`strangle`).
- Both: draw (`double_strangle`). Flag every occurrence in sim reports.

---

## 9. Deadwood and Rot

### 9.1 Deadwood
The minimum rank-sum of cards left over after partitioning the hand into valid melds (runs of 3+, sets of 3-4), each card in at most one meld. Exhaustive search (hand <= `handSize + 1` cards). No heuristics. Optional diagnostic `bestMeldPartition(hand)`.

**Kept hand** = the hand after Discard. Knock and Rot both use `deadwood(keptHand)`.

### 9.2 Rot count
```text
rotCount(dw) = 0                                     if dw <= rotThreshold
             = 1 + floor((dw - rotThreshold - 1) / rotStep)   otherwise
```
Defaults (T=20, step=8):

| deadwood | rot |
|---|---|
| <= 20 | 0 |
| 21-28 | 1 |
| 29-36 | 2 |
| 37-44 | 3 |

These numbers are **placeholders** to be set by the calibration milestone (section 17).

### 9.3 Rot selection
Rot affects only the turn player's board. Eligible tiles: the player's non-root tiles that are **border tiles**: at least one of the six neighbours is off-board, empty, rock, or an enemy tile. Eligibility and strengths are read from the board at the **start** of Rot (snapshot).

1. Sort eligible tiles by strength ascending. `k = min(rotCount, eligibleCount)`.
2. All tiles with strength strictly below the boundary strength are rotted automatically.
3. At the boundary strength `s*`, if the tied group size `g <= slotsRemaining`, all are rotted automatically.
4. If `g > slotsRemaining`, the **opponent** chooses, via `ROT_PICK`, one tile at a time from the remaining tied group until the slots are filled. The opponent cannot choose a higher-strength tile.
5. When all Rot removals are done, run Sever and the Strangle check.

`ROT_PICK`: actor = opponent, legal actions = `RotPick { coord }` for each remaining tied candidate. After each pick, if more picks are needed stay in `ROT_PICK`; otherwise resume `Continue` step 2.

---

## 10. Fruit

- Each player may Fruit `fruitPerPlayer` times (default once) per match: `fruitUsed: [number, number]` (or booleans when 1).
- Legal only in `ACT`.
- `Fruit { sacrifice: Coord[3], target: Coord }`.
  - Sacrifice exactly 3 distinct, connected (hex adjacency), own, **non-root** tiles that exist now.
  - Target: an enemy **non-root** tile adjacent to at least one sacrificed tile. **Target strength is ignored.**
- Resolve: remove the 3 sacrificed tiles and the target, then Sever (which may also sever the player's own arm: that is intended and public), then Strangle check.
- **Identity:** Fruit is the answer to a rank-9 fortress and to anything overgrowth cannot reach, at the price of 3 of your own tiles.
- Do not hardcode species: define `interface SpeciesPower { id; canFruit(...); resolveFruit(...) }` and ship exactly one implementation (the rule above). Do not build more species.

---

## 11. Scoring, results, end conditions

**Score:** sum over the player's non-root tiles: `1` (normal) or `2` (rich). If `rootsScore` is true, roots add 1 each (default false).

```ts
type EndReason = 'knock' | 'deck_exhaustion' | 'strangle' | 'double_strangle';
type GameResult = {
  winner: Player | null;      // null only for double_strangle
  reason: EndReason;
  undercut?: boolean;
  scores: [number, number];
  deadwood?: [number, number]; // kept-hand deadwood at the end, when defined
};
```

End conditions: `strangle`, `double_strangle`, `knock` (after final turn), `deck_exhaustion`.

**Deck exhaustion winner:** higher score; tie -> lower kept-hand deadwood; still tied -> **P2 wins** (compensation for P1 moving first).

A terminal state (`phase: 'GAME_OVER'`) accepts no actions.

---

## 12. Types

```ts
type Player = 0 | 1;
type Coord = { q: number; r: number };
type Tile = { owner: Player; strength: number; root?: boolean };

type State = {
  seed: number;
  config: RulesConfig;
  board: Record<string, Tile | null>;
  terrain: Record<string, Terrain>;
  hands: [Card[], Card[]];
  deck: Card[];
  discard: Card[];
  turnPlayer: Player;
  actor: Player;
  phase: Phase;
  drawnFromDiscard: number | null;
  fruitUsed: [number, number];
  finalTurn: { knocker: Player } | null;
  rotPick: { remaining: number; candidates: Coord[] } | null;
  turnNumber: number;           // increments per player-turn, starts at 1
  result: GameResult | null;
  lastResolution: ResolutionSummary | null;
  history?: Event[];
};

type View = {
  player: Player;
  config: RulesConfig;
  board: Record<string, Tile | null>;
  terrain: Record<string, Terrain>;
  hand: Card[];
  opponentHandCount: number;
  discard: Card[];
  deckCount: number;
  turnPlayer: Player;
  actor: Player;
  phase: Phase;
  drawnFromDiscard: number | null;
  fruitUsed: [number, number];
  finalTurn: { knocker: Player } | null;
  rotPick: { remaining: number; candidates: Coord[] } | null;
  turnNumber: number;
  score: number;
  opponentScore: number;
  myDeadwood: number;           // deadwood(hand) for the viewer
  result: GameResult | null;
  lastResolution: ResolutionSummary | null;
};
```

A `View` must contain everything needed to compute legal actions for its player. It must never expose the opponent's hand or the deck order.

```ts
type Action =
  | { t: 'Draw'; from: 'deck' | 'discard' }
  | { t: 'MeldRun'; cards: number[]; start: Coord; dir: number }
  | { t: 'MeldSet'; cards: number[]; hexes: Coord[] }
  | { t: 'Fruit'; sacrifice: Coord[]; target: Coord }
  | { t: 'EndAct' }
  | { t: 'Discard'; card: number }
  | { t: 'Knock' }
  | { t: 'Continue' }
  | { t: 'RotPick'; coord: Coord };

type Event =
  | { t: 'Draw'; player: Player; from: 'deck' | 'discard'; card?: number } // card only if public
  | { t: 'MeldRun' | 'MeldSet'; player: Player; cards: number[]; hexes: Coord[] }
  | { t: 'Overgrow'; player: Player; coord: Coord; oldOwner: Player; oldStrength: number; newStrength: number }
  | { t: 'Fruit'; player: Player; sacrifice: Coord[]; target: Coord }
  | { t: 'Discard'; player: Player; card: number }
  | { t: 'Knock'; player: Player }
  | { t: 'FinalTurnStart'; player: Player }
  | { t: 'RotCount'; player: Player; deadwood: number; count: number }
  | { t: 'RotPick'; picker: Player; coord: Coord }
  | { t: 'Rot'; player: Player; coords: Coord[] }
  | { t: 'Sever'; player: Player; coords: Coord[] }
  | { t: 'Strangle'; player: Player }
  | { t: 'GameEnd'; result: GameResult };

type ResolutionSummary = {
  placed: Coord[];
  overgrown: Coord[];
  rotted: Coord[];
  severed: { player: Player; coords: Coord[] }[];
  fruit?: { sacrifice: Coord[]; target: Coord };
  strangled?: Player;
};
```

Events and summaries are for replay, debugging, animation, bots and telemetry. They must never be required to decide legality and must not leak hidden cards (a deck draw event omits the card for the opponent's view).

---

## 13. API

```ts
newGame(seed: number, config?: Partial<RulesConfig>): State;
legalActions(view: View): Action[];          // for view.actor
apply(state: State, action: Action): State;  // throws IllegalActionError
viewFor(state: State, player: Player): View;
score(state: State, player: Player): number;
deadwood(hand: Card[]): number;
replay(seed: number, actions: Action[], config?: Partial<RulesConfig>): State;
```

Convenience (engine-internal, for sims): `legalActionsForState(state) = legalActions(viewFor(state, state.actor))`.

### Illegal actions (all must throw and leave the input untouched)
`Draw` during ACT; `Discard` of a card not in hand; discarding the card just taken from the discard pile; wrong cards for a meld; duplicate suits in a set; wraparound run; invalid/off-board/rock coordinate; own-tile collision; equal or stronger overgrow; overgrowing a root; Fruit twice; Fruit with disconnected sacrifice, root sacrifice, root target, non-adjacent target; Knock at deadwood 11; any action in `GAME_OVER`; any action by a non-actor; `RotPick` on a non-candidate.

---

## 14. Tests (write first, Vitest, strict TS)

Every rule has unit tests. Every simulation-found bug becomes a regression test.

**14.1 Terrain** (1,000 seeds, both root styles): point symmetry; exactly 4 rock and 5 rich; centre rich; no rock/rich on or adjacent to a root; config validation rejects even `richCount`.

**14.2 Meld validation:** gaps, wrong suit, 2-card run/set, duplicate suits in a set, wraparound (`8-9-1`), off-board, rock, own-tile collision, equal-strength and stronger overgrowth, root overgrowth.

**14.3 Hypha:** straight line in all 6 directions; strength ascends outward; start adjacent to root/own tile; blocked by own tile, rock, board edge; legal overgrow of lower enemy; atomic failure leaves state untouched.

**14.4 Bloom:** 3 and 4 cards; same rank, different suits; connected cluster; touches network; uniform strength.

**14.5 Sever:** chokepoint cut removes the detached arm; only own connectivity matters; severed tiles vanish; idempotent; Fruit/Rot/overgrow can each trigger it.

**14.6 Strangle:** terrain-only blockade does not strangle; 6 blockers with at least one enemy does; one empty neighbour does not; roots immune to overgrow; double strangle yields `double_strangle`; strangle during a final turn.

**14.7 Deadwood:** run/set overlap; alternative partitions pick the minimum; 3- and 4-card sets; duplicate copies; no melds; all cards used.

**14.8 Rot:** table in 9.2 (20->0, 21->1, 28->1, 29->2, 36->2, 37->3); measured on the **kept hand** not the refilled hand; root exempt; only border tiles; boundary ties trigger `ROT_PICK` with the opponent as actor; opponent cannot pick a higher-strength tile; multiple sequential picks; fewer eligible tiles than `k`; cascades into Sever.

**14.9 Fruit:** once per player; exactly 3; connected; no root sacrifice/target; adjacent target; ignores strength (removes a 9); Sever follows; own-arm self-sever is reported; illegal Fruit does not mutate.

**14.10 Knock and final turn:** legal at 10, illegal at 11; Knock skips Rot/Refill; opponent gets exactly one final turn with no Knock/Rot/Refill; knocker wins only with strictly higher score; equal score = Undercut; final-turn Strangle wins for the opponent; `knockGivesFinalTurn: false` scores immediately.

**14.11 Discard loophole:** taking the top discard and discarding the same card is illegal; allowed when the card was drawn from the deck; allowed after melding the card away and discarding another.

**14.12 Deck exhaustion:** refill to `handSize`; short refill ends the game; exactly-empty deck does not; score then deadwood then P2 tie-break; only discard draw legal when the deck is empty.

**14.13 View and legality:** the opponent's hand and deck order never appear in `viewFor`; `legalActions(view)` equals the set of actions `apply` accepts (fuzz-compare against brute-force validation on random states); identical-copy actions are deduped.

**14.14 Purity:** deep-clone state, apply any action, assert the original is unchanged.

**Worked examples (use as fixtures):**
- Opening: P1 Moss 3-4-5, `start (-1,1)`, `dir 1` places strengths 3,4,5 on `(-1,1)`, `(0,0)` (rich), `(1,-1)`. Note `(1,-1)` touches the P2 root: opening contact is possible (see open question C).
- Rot ties: border strengths `[2,2,2,5]`, `rotCount = 2`: three tiles tie at 2 for 2 slots, so the opponent makes two sequential `RotPick`s; the 5 is never eligible for that Rot.
- Knock reversal: knocker leads 12-10 and knocks; the opponent's final turn overgrows and severs 4 tiles, flipping to 11-10 or better for the opponent: knocker loses with `undercut = true`.

---

## 15. Property tests and determinism

Run **10,000+ random-legal-play games** (RandomBot vs RandomBot). After every action assert:

1. no tile on rock; no tile off-board;
2. every non-root tile is connected to its root;
3. roots never overgrown or removed;
4. tile strengths in 1-9 (roots excepted);
5. card IDs across hands/deck/discard are unique and consistent (no card in two places, none vanishes except via melds);
6. `apply` does not mutate its input;
7. terminal states accept no actions;
8. `legalActions` only returns actions `apply` accepts;
9. no game exceeds 60 player-turns (development safety assertion, not a design goal).

On failure print: seed, full action log, state before, failing action, state after, event log (a replayable bug).

**Determinism:** run `seed + actionLog` twice; assert canonical-JSON equality of final state and of event logs.

---

## 16. Bots

```ts
interface Bot { chooseAction(view: View): Action }
```
Bots read a `View` and choose from `legalActions(view)`.

- **RandomBot:** uniform over legal actions, injected seeded RNG. Used for smoke tests and property games.
- **GreedyBot:** maximize immediate board value while minimizing future Sever exposure. Score candidates by: `+ tiles gained, + rich tiles, + enemy tiles overgrown, + enemy tiles severed, + threat on enemy connection, - own sever exposure (tiles lost if the nearest chokepoint is cut), - kept-hand deadwood (Rot risk), - wasted high-strength cards, - knocking when an opponent final-turn cut can flip the result`. Keep it simple and explainable.
- **MCTS (Milestone D):** about 200 rollouts, seeded, rollouts use GreedyBot, expand only legal actions. Hidden information: use **determinization**: sample the opponent's unknown cards from the unseen pool each rollout. It must never read the opponent's real hand. Profile before optimizing.

---

## 17. Simulation and calibration

`npm run sim` runs batches and prints a human report plus `sim-results.json`.

**Metrics:** games; P1/P2 wins; draws; turns/player (mean, median, p90, max); ending reasons (knock, deck exhaustion, strangle, double strangle); average final score and deadwood; melds/turn; tiles placed/turn; overgrowths/game; severed tiles/game; Rot events/game; **fraction of mid-game turns (turn >= 4) where Rot fires**; Fruit usage/game; Knock rate; Undercut rate; **Knock reversal rate** (knocker led at Knock, lost after the final turn); **first-contact turn** (first time a tile touches an enemy tile); first-player advantage under swapped-start matched seeds.

**Near-win telemetry:** turns with a Strangle available next action; largest single Sever; largest score swing; comebacks from 5+ behind; games decided by <= 2 points; mean legal actions/turn.

**Calibration targets (guides, not acceptance):**
- 10-14 turns per player; 48-52% first-player win rate (swapped starts).
- Rot fires on roughly 20-40% of mid-game turns. If it fires almost every turn or almost never, adjust `rotThreshold` / `rotStep` before touching anything else.
- Knock ends a meaningful share of games without dominating; reversal rate above zero but not the norm.
- Strangle ends a small minority of games, yet is a real threat.
- First contact should not be a forced turn-1 event.

Do not tune blindly to numbers. A 50/50 game with low-agency play is a failure.

**Sweeps (Milestone C):** `rootStyle` (ring2 / corner); `rotThreshold` x `rotStep`; `knockDeadwood` 10/9/8/7; `knockGivesFinalTurn` on/off; `copiesPerCard` 1/2; `allowHyphaOneBend`; `fruitPerPlayer` 0/1/2. Each sweep reports the full metric set.

---

## 18. Replay and debug

`npm run replay -- <seed> <action-log.json>`: rebuild the initial state, apply and validate each action, print events/resolutions, print the final result. Also export the pure helper `replay(seed, actions, config?)`. Every bug report is `seed + action log`.

---

## 19. Architecture

```text
src/
  engine/  types.ts constants.ts config.ts board.ts terrain.ts cards.ts deck.ts
           melds.ts placement.ts overgrow.ts sever.ts strangle.ts deadwood.ts
           rot.ts fruit.ts scoring.ts phases.ts actions.ts legalActions.ts
           apply.ts view.ts events.ts result.ts index.ts
  bots/    Bot.ts RandomBot.ts GreedyBot.ts MCTSBot.ts
  sim/     run.ts metrics.ts reports.ts sweeps.ts
  cli/     play.ts replay.ts
tests/
  engine/ properties/ determinism/ bots/ simulation/
```
Small modules, no giant `game.ts`. The engine imports nothing from `bots/`, `sim/` or `cli/`.

---

## 20. Milestones and gates

**Milestones**
- **A:** RandomBot vs RandomBot, 10,000 games: no illegal actions, no invariant failures, no non-determinism.
- **B:** GreedyBot vs GreedyBot, 5,000 games: full metric report.
- **C:** Calibration sweeps (section 17); set final defaults.
- **D:** MCTS with determinization.
- **E:** Human-vs-bot terminal client (board, terrain, hand, discard, deck count, scores, deadwood, legal actions, last resolution). First real "is this fun?" checkpoint.

**Gates (no new mechanics until passed):** 1 Correct (unit/property/determinism green). 2 Stable (10,000 games, zero invariant failures). 3 Competitive (no unexplained first-player imbalance). 4 Interesting (human-vs-bot yields meaningful decisions). 5 Fast (10-14 turns/player plausible). 6 Legible (every board change explainable from events). 7 Replayable (any game recreated from seed + log).

---

## 21. Out of scope (do not build)

UI, animation, sound, art, online multiplayer, accounts, monetization, shops, battle passes, additional species, additional maps, cosmetics, matchmaking, networking, achievements, platform integrations, complex AI beyond section 16, bend-enabled Hypha by default.

Future ideas (species, progression, daily seeds, ranked play, clock) live in a separate roadmap, not in this engine brief. Engine rule for later: keep the engine server-authoritative-ready (pure, deterministic, action-validated) and keep any host clock outside `src/engine/` (host auto-plays `Draw deck` then discards the highest-rank deadwood card, ties by highest rank then lowest card ID, using normal legal actions).

---

## 22. Open design questions (answer with simulation + playtest)

A. Is straight-only Hypha too restrictive? Compare with one bend.
B. Are 2 copies per card too generous for sets?
C. **Opening contact:** with ring-2 roots the board diagonal lets a 3-run reach the enemy root's neighbour on turn 1. Is early contact exciting or forced? If forced, test `boardRadius 4` with roots at `(-3,3)` / `(3,-3)` (do not implement now; just never hardcode radius).
D. Does the final turn make Knock a real gamble, or is it now never worth it?
E. Rot: tension or excessive punishment? Measure cascade size and comeback rate.
F. Is Fruit worth saving, or used reflexively / never?
G. Does overgrow-only-if-strictly-stronger make rank-9 tiles too safe? (Fruit is the intended answer.)

---

## 23. Claude Code brief

Read this entire document before coding. Create a strict TypeScript project with Vitest. Implement in this order:

1. types/config; 2. coordinate/board helpers; 3. mulberry32 PRNG; 4. terrain (pair-based symmetry); 5. cards/deck; 6. `newGame`; 7. meld validation; 8. placement + overgrowth; 9. Sever; 10. Strangle; 11. deadwood; 12. Rot incl. `ROT_PICK`; 13. Fruit; 14. phases/actions + Knock/final turn; 15. scoring/results; 16. `viewFor`; 17. `legalActions(view)`; 18. events/replay; 19. property + determinism tests; 20. RandomBot; 21. GreedyBot; 22. `npm run sim`; 23. sweeps; 24. CLI.

Write tests first where practical. Do not build any UI. Do not simplify rules to pass tests. If you hit an ambiguity not settled here: stop, name it, and either pick the smallest balance-neutral interpretation or raise it as a design question.

### Final acceptance checklist
- [ ] `tsc --strict` and Vitest pass.
- [ ] Every test in section 14 exists and passes.
- [ ] 10,000+ random games pass all section 15 invariants.
- [ ] No `Math.random()` in the engine; no I/O, timers, or UI/network code in `src/engine/`.
- [ ] Input state is never mutated; same seed + action log gives byte-identical state and events.
- [ ] `viewFor` leaks nothing hidden; `legalActions(view)` is exhaustive and exact.
- [ ] Terrain: 4 rock, 5 rich, point-symmetric, root-safe, for both root styles.
- [ ] Rot is measured on the kept hand; `ROT_PICK` works for ties; Sever is idempotent.
- [ ] Knock grants exactly one final turn (no Knock/Rot/Refill); Undercut is deterministic.
- [ ] The redundant-discard loophole is closed.
- [ ] Fruit is once per player and ignores target strength.
- [ ] RandomBot and GreedyBot complete games; `npm run sim` writes the full report and `sim-results.json`; `npm run replay` reproduces a supplied log; the terminal client completes a full game.

**Gameplay first. Rules before graphics. Simulation before balance claims. Clarity before complexity.**
