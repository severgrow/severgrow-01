# Bot tactics: Blooms, Strengthen and Fruit cards (bots-v0.10)

All levels read only their own View (my hand, the board, the discard pile, counts). They never
see the opponent's hand or the deck order. Every decision is deterministic for a given seed:
randomness only comes from the seeded PRNG. The code is in `src/bots/tactics.ts` (judging) and
`src/bots/levels.ts` (the levels). Every Bloom, Strengthen or Fruit card decision carries a short
plain-words reason (`decideLevelAction(...).reason`) for debugging and simulation reports;
players never see it.

v0.6: only the current bots are kept (the frozen bots-v0.5 were deleted with the old rules).
v0.7: Bloom is the only combo; the old line and clump play was deleted with bots-v0.8.

## Blooms (v0.7)

A hand can usually bloom in many ways (up to about 6,000 legal Blooms in the worst positions
measured, listed in about 25 ms). The bots look at all of them cheaply, then fully score a
short list (`src/bots/bloomLook.ts`):
- **Quick look** (every legal Bloom): tiles gained, gold hexes, the number and strength of the
  opponent tiles replaced, links to my network (compact clusters joined by several links resist
  cuts), strong numbers on the front line, little strength wasted on empty hexes. A Bloom that
  fills the last open sides around the opponent's home (a likely Strangle) always ranks first.
- **Short list** (10 per Grow step): every likely Strangle, then the best 60% by quick look, then
  the most-linked clusters, then the strongest takeovers, at most two shapes per set of hexes,
  so a protective Bloom is never crowded out by greedy ones.
- **Full score** (the short list only): the same board evaluation as every other move (net
  tiles, cuts, my exposure, pressure on the opponent, the home ring).
- **Level 9's opponent reply** imagines their Blooms the same way, with a short list of 6.
- **Holding** (levels 8-9): a plain 3-card Bloom (no replacement, no Strangle) is held when the
  unseen cards (not in my hand, not thrown) that would make it a Bloom of 4 give at least a 20%
  chance over my next draws (at most 3, fewer near the end), and the best other move (not using
  those cards) costs at most 2.5 points. It is a judgement call, not a habit: once in about 200
  Blooms in 30 games of 9 vs 8.

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
  can **open** a Strangle: after it, a Bloom this turn surrounds their root (v0.8: a Fruit card
  uses the turn's Sprout, so only a Bloom can finish it; the look-ahead knows this). Every
  level from 4 up takes that (never lost to a slip or laziness).
- *Hold or use (levels 7-9):* a Fruit card used now gives up its future value. The bots subtract
  a "hold value", larger early in the game (the deck is full), smaller near the end, halved when
  well behind (a comeback try), and one point higher for a **second Fruit card in the same turn**
  (only if it pays; since v0.8 the rules allow one Fruit card or Sprout per turn, so this case
  only arises with `fruitUsesSprout` off).
- *Blockers and thin links:* +1 for removing a top-rank tile (a permanent blocker); +0.8 when the
  target could take one of my tiles that holds up 3 or more (it protects my thin link).
- *Counting (level 9):* with no Fruit card left unseen the hold value rises (nothing can remove
  my blockers, no rush); with 2 or more unseen it drops (use it before the race turns). Level 9
  also searches the opponent's best reply after a Fruit card, as after any growing move (least
  counterplay).
- *Never an ordinary throw:* no level from 3 up throws a Fruit card while it holds any other
  card (it would feed the opponent through the throw pile); a slip never picks it either.

## Levels

| Level | Bloom | Strengthen | Fruit cards |
| --- | --- | --- | --- |
| 1-2 | when it would bloom: a random legal Bloom (seeded), or none at all (45% / 35%) | ignores it, but now and then (3% of Grow steps, seeded) plays a random Strengthen | a random legal target at a random moment (35% / 30% of Grow steps holding one, seeded); sometimes throws one away (25% / 15% of Throw steps holding one) |
| 3 | a random legal Bloom, or none (25%) | only with a top card that has no better use this turn | a random legal target at a random moment (30%); never throws one |
| 4 | the best quick look only (tiles, gold, strongest replacement, compact) | as 3 | simple rules: a high tile (7+), a big cut (3+ tiles), or opening a Strangle; never throws one |
| 5-6 | as 4 | protected tiles x exposure x size of the step up | as 4 |
| 7-8 | full evaluation of the short list; 8 also holds (above) | full evaluation (beatable chance before and after, exposure, root, blocker, cost) | full evaluation (net swing, blockers, thin links, Strangle, hold or use, second Fruit only if it pays) |
| 9 | as 8, plus the opponent's best Bloom reply | as 7-8, plus the opponent's unseen Fruit cards and weak supporting links | as 7-8, plus counting the unseen Fruit cards and the opponent's best reply |

## Fruit cards in practice (level 7 vs level 7, 2,000 games, SPEC 11.4)

Each side plays 1.76 Fruit cards a game on average, first around its 7th turn: 34.5% on a
top-rank tile, 11.5% on a chain cut, 0.2% opening a Strangle, the rest on ordinary tiles near
the end of the game (the hold value falls as the deck empties). Fruit cards thrown: 0.5% (none
taken by the opponent). 0.38 Fruit cards per game are still in a hand when the game ends. A
side plays two in one turn in 8% of games and wins 48% of those.

## Tuning and evidence

See `docs/SPEC.md` section 11.3 for the simulations that set the rules defaults, and
`docs/LADDER.md` for the ladder between the levels.
