# Bot tactics: Strengthen and Fruit (bots-v0.6)

All levels read only their own View (my hand, the board, the discard pile, counts). They never
see the opponent's hand or the deck order. Every decision is deterministic for a given seed.
The code is in `src/bots/tactics.ts` (judging) and `src/bots/levels.ts` (the levels). Every
Strengthen or Fruit decision carries a short plain-words reason (`decideLevelAction(...).reason`)
for debugging and simulation reports; players never see it.

The previous bots are kept, unchanged, as `bots-v0.5` (`src/bots/v05/`) so earlier games and
world-map tickets still verify.

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
- *Level 9 also:* if the opponent still has its Fruit and a big enough group next to the tile,
  a tough tile there protects less; and a tough tile whose support is a weak, exposed link
  protects less.

**Fruit** (give up 3 connected tiles to remove one adjacent enemy tile):
- *Net swing:* the opponent's lost points (the target and everything cut off from it) minus
  mine (the three given up and anything of mine cut off).
- *A quick look first:* every legal Fruit is checked cheaply; only the 4 most promising get the
  full evaluation (exposure and pressure, as for any move). This keeps the bots fast.
- *Hold or use (levels 7-9):* a Fruit used now gives up its future value. The bots subtract a
  "hold value" that is larger early in the game (the deck is full) and smaller near the end.
  When well behind (4+ points) the hold value halves (a comeback try).
- *Bonus:* +1 for removing a top-rank tile (a permanent blocker).
- *Never by itself a Strangle:* Fruit only empties hexes, and Strangle needs blocked hexes, so a
  Fruit can never win by Strangle on its own (see the adversarial test 3).

## Levels

| Level | Strengthen | Fruit |
| --- | --- | --- |
| 1-2 | ignores it, but now and then (3% of Grow steps, on its own seeded stream) plays a random Strengthen or Fruit, good or bad | the same whim |
| 3-4 | only with a top card that has no better use this turn, on the tile holding up the most | when it removes 4+ of the opponent's points, without counting its own losses |
| 5-6 | protected tiles x exposure x size of the step up | net swing minus a small hold value; never if it cuts off its own tiles |
| 7-8 | full evaluation (beatable chance before and after, exposure, root, blocker, cost) | full evaluation (net, exposure, hold or use, comeback, top-rank blocker) |
| 9 | as 7-8, plus the opponent's remaining Fruit and weak supporting links | as 7-8 |

## Tuning and evidence

See `docs/SPEC.md` section 11.3 for the simulations that set the rules defaults, and
`docs/LADDER.md` for the ladder between the levels.
