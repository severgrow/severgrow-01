# Bot tactics: Strengthen and Fruit cards (bots-v0.8)

All levels read only their own View (my hand, the board, the discard pile, counts). They never
see the opponent's hand or the deck order. Every decision is deterministic for a given seed:
randomness only comes from the seeded PRNG. The code is in `src/bots/tactics.ts` (judging) and
`src/bots/levels.ts` (the levels). Every Strengthen or Fruit card decision carries a short
plain-words reason (`decideLevelAction(...).reason`) for debugging and simulation reports;
players never see it.

v0.6: only the current bots are kept (the frozen bots-v0.5 were deleted with the old rules).

## What the bots weigh

**Strengthen** (a Sprout on my own weaker tile):
- *How much it protects:* the tiles I would lose if this tile were taken (the tile itself and
  everything that hangs on it), plus what the bot would gain. Gold counts double.
- *How exposed it is:* touching an enemy tile (it can be overgrown next turn), two hexes away,
  or far.
- *How likely it is to be beaten (levels 7-9):* the chance the opponent holds a stronger card
  next turn, before and after. This uses only public information: every rank has the same
  number of cards, minus the cards in my hand, in the discard pile, and showing on the board.
- *Its role:* next to my root (Strangle defence), touching two or more enemy tiles (a blocker).
- *Its cost:* the card and the turn's Sprout (any other use of them competes in the ranking),
  plus a small cost for spending a high card.
- *Level 9 also:* while a Fruit card is still unseen and an opponent tile touches the tile, a
  tough tile there protects less (a Fruit card ignores strength); and a tough tile whose support
  is a weak, exposed link protects less.

**Fruit cards** (v0.6: remove one enemy non-root tile touched by mine, any strength; the card
leaves the game):
- *Net swing:* the opponent's lost points (the target and everything cut off from it) plus any
  points I gain. Nothing of mine is given up any more.
- *A quick look first:* every legal target is checked cheaply; only the 4 most promising get the
  full evaluation (exposure and pressure, as for any move). This keeps the bots fast.
- *Strangle:* a Fruit card only empties a hex, so it can never surround a root by itself; but it
  can **open** a Strangle: after it, a Sprout or combo this turn surrounds their root. Every
  level from 4 up takes that (never lost to a slip or laziness).
- *Hold or use (levels 7-9):* a Fruit card used now gives up its future value. The bots subtract
  a "hold value", larger early in the game (the deck is full), smaller near the end, halved when
  well behind (a comeback try), and one point higher for a **second Fruit card in the same turn**
  (only if it pays).
- *Blockers and thin links:* +1 for removing a top-rank tile (a permanent blocker); +0.8 when the
  target could take one of my tiles that holds up 3 or more (it protects my thin link).
- *Counting (level 9):* with no Fruit card left unseen the hold value rises (nothing can remove
  my blockers, no rush); with 2 or more unseen it drops (use it before the race turns). Level 9
  also searches the opponent's best reply after a Fruit card, as after any growing move (least
  counterplay).
- *Never an ordinary throw:* no level from 3 up throws a Fruit card while it holds any other
  card (it would feed the opponent through the throw pile); a slip never picks it either.

## Levels

| Level | Strengthen | Fruit cards |
| --- | --- | --- |
| 1-2 | ignores it, but now and then (3% of Grow steps, seeded) plays a random Strengthen | a random legal target at a random moment (35% / 30% of Grow steps holding one, seeded); sometimes throws one away (25% / 15% of Throw steps holding one) |
| 3 | only with a top card that has no better use this turn | a random legal target at a random moment (30%); never throws one |
| 4 | as 3 | simple rules: a high tile (7+), a big cut (3+ tiles), or opening a Strangle; never throws one |
| 5-6 | protected tiles x exposure x size of the step up | as 4 |
| 7-8 | full evaluation (beatable chance before and after, exposure, root, blocker, cost) | full evaluation (net swing, blockers, thin links, Strangle, hold or use, second Fruit only if it pays) |
| 9 | as 7-8, plus the opponent's unseen Fruit cards and weak supporting links | as 7-8, plus counting the unseen Fruit cards and the opponent's best reply |

## Tuning and evidence

See `docs/SPEC.md` section 11.3 for the simulations that set the rules defaults, and
`docs/LADDER.md` for the ladder between the levels.
