# Lesson scripts — levels 1-10 (the tutorial)

This file is the script of what the game shows in levels 1-10. It must match the code:

- data and beats: `web/src/lessons/lessons.ts`
- words: the `LESSON` section of `src/strings.ts`
- wrong-tap answers: `web/src/lessons/answer.ts`
- the opponent: `web/src/lessons/opponent.ts`
- authored openings: `web/src/lessons/authored.ts`

If you change a beat, a word or a position, change it here too. If you change a lesson's position or goals, bump its `version` (an unfinished save of the old lesson then restarts cleanly).

## How every lesson works

- **Authored, not dealt.** Each level opens from a fixed position:
  - the 19-hex map, its rock and gold, the tiles already grown;
  - both hands, the Draw pile order and the Throw pile.
  - Every card is a real card from the engine's deck. Cards a lesson does not name are out of play, which is how a lesson gets a short Draw pile (its clock) without a rule change.
- **Steps come from the live game, not a counter.** The light always points at a legal move. From level 4 on, a different legal move is fine and the guide follows what happened.
- **The opponent** (levels 1-9) is gentle and deterministic:
  - it plays only legal moves and always draws from the Draw pile;
  - it grows only on the turns the script lists, and throws its lowest card (never a Bomb);
  - it never takes the last open side of your home.
  - Level 10 plays the gentlest bot (level 1).
- **No text on the map.** Words go in the glass window (instruction ≤ 6 words, reason fits two lines on the smallest phone) or the LED. The map gets only the glow of the lit target and a small ring where a tap landed.

### The light

| Lit thing | Outline |
|---|---|
| a map hex (tile, home, rock) | hex |
| a card in the fan | the card itself, turned with the fan |
| a pile or a button | rounded pill |

- Everything else is dimmed strongly.
- A chunky pointer points at the target; the highlight follows it every frame.

### Explanations

- An explanation beat (marked **tap anywhere**) moves on with a tap anywhere, or the glass NEXT.
- An explanation is shown once per level. It is remembered across a refresh, with the lesson's version.

### Wrong taps

- Every tap that cannot do anything gets one short answer, taken from the engine's own reasons.
- In levels 1-3 (**locked**), a legal tap that is not the lit one is also answered with TAP THE LIT ONE, and it does not reach the game.
- From level 4 on, every legal tap is played.

| Tap | Answer |
|---|---|
| a card, a hex or » before drawing | DRAW FIRST |
| a hex not touching your tiles | CONNECT TO YOUR HOME |
| a rock | ROCK BLOCKS THIS |
| their home / your home | THAT IS THEIR HOME / THAT IS YOUR HOME |
| a weaker card on an enemy tile | TOO WEAK: card VS tile |
| your own tile, with no higher card | YOUR TILE NEEDS A HIGHER CARD |
| a Bomb not touching your tiles | MUST TOUCH YOUR TILES |
| a Bomb or Blast on a home | HOMES ARE SAFE |
| a hex with no card picked | PICK A CARD FIRST |
| the Draw pile again after drawing | ONE CARD PER TURN |
| a Bloom of fewer than 3 cards | THREE CARDS OR MORE |
| a Bloom that does not match | SAME NUMBER, OR COUNTING UP |
| anything during their turn | THEIR TURN |
| anything else the game cannot use now | NOT YET |
| locked levels: a legal but unlit tap | TAP THE LIT ONE |

### Other guidance

- **Idle 6 s.** On your turn the pointer bobs harder and the glass offers **Show me**. Show me nudges the light; it never plays for you.
- **Hints off.** Settings → Step guidance off hides the glass and the light. Wrong-tap answers then go to the LED, and the lock is off.
- **RESTART LEVEL.** If the lesson's goal can no longer happen (for example you threw the Bomb in level 7), the glass says RESTART LEVEL / "This lesson cannot finish now. Start again." with a RESTART LEVEL button.
- **The clock.** The Draw pile's count glows when 3 or fewer cards are left. When the pile is empty the LED says LAST TURN.
- **Seeds.** Levels 1-10 pay no Seeds in /3 and their finish card has no Seeds line. Their authored openings cannot be replayed by the server's verifier (see the report).

### Beat format

LIT | WINDOW (instruction / reason) | DONE WHEN | WRONG TAP

### The turn

The same in every level:

- **First turn** (level 1, spelled out):
  - LIT Draw pile | TAP THE DRAW PILE / Every turn starts with drawing 1 card. | a card drawn | DRAW FIRST on anything else
  - LIT the card | PICK THE LIT CARD / This card will be placed on the board. | card picked
  - LIT the tile (other legal tiles quietly) | TAP A LIT TILE / Tap here to Grow this card. | Grow played
  - LIT » (when growing is done and a Bloom is still possible) | DONE GROWING / Tap » to go on to Throw.
  - LIT the card to throw | THROW A CARD / Throw 1 card to end your turn. | card picked
  - LIT Throw pile | TAP THE THROW PILE / Move the card here, or tap it again. | card thrown
  - their turn | THEIR TURN / They draw, grow and throw too. (first time only)
- **Later turns:** one word: DRAW, GROW, THROW.
- **Levels 6-9:** after the lesson's goal is done, the one-word hints appear only after 6 s idle.

## LEVEL 1 — FIRST SEED

- **Setup:**
  - 19 hexes; no rock, no gold, no tiles.
  - Locked. Draw pile: 12 cards (4 turns each).
  - Opponent grows on its 2nd turn only.
- **Beats:**
  1. LIT your home | THIS IS YOUR HOME / Grow by placing cards on the board, on tiles that connect to your home. | tap anywhere
  2. LIT their home | THAT IS THEIR HOME / Surround it to win, or have more points at the end. | tap anywhere
  3. LIT Draw pile | TAP THE DRAW PILE / Every turn starts with drawing 1 card. | drawn | DRAW FIRST
  4. LIT the card | PICK THE LIT CARD / This card will be placed on the board. | picked | TAP THE LIT ONE
  5. LIT the tile, other legal tiles quietly | TAP A LIT TILE / Tap here to Grow this card. | Grow played | CONNECT TO YOUR HOME, THAT IS THEIR HOME
  6. LED YOU 1 : THEM 0 | You grew. Tiles keep the rank of the card used. | tap anywhere
  7. LIT the card, then Throw pile | THROW A CARD / Throw 1 card to end your turn. → TAP THE THROW PILE / Move the card here, or tap it again. | thrown
  8. THEIR TURN / They draw, grow and throw too.
  9. Turns 2-4: DRAW, GROW, THROW (one word, same light).
  10. Draw pile at 3 cards: count glows, LED LAST CARDS | PILE ALMOST EMPTY / You can see how many cards are left in the Draw pile. | tap anywhere
  11. Pile empty: LAST TURN / Pile empty: each tile is 1 point. Numbers on tiles don’t count. | tap anywhere
- **Finish:** YOU WIN / You had more points – you won!
- **Proof:** the follower wins 4-1 in 4 of your turns. The browser tapper does it with 0 wrong taps.

## LEVEL 2 — TILE NUMBERS

- **Setup:**
  - Your tile -1,1 (2). Their tiles 0,0 (4) and 1,-1 (5).
  - You hold an 8 and a 6. Locked.
  - Opponent grows on its 3rd turn and never on 0,0.
- **Beats:**
  1. LIT the 8, then your tile -1,1 | BIGGER NUMBER WINS / You can replace your tile with a stronger card. | Strengthen to 8
  2. LIT a higher card, then their tile 0,0 | CUT THROUGH THEIR TILE / A card can cut through opponent’s weaker tile. | 0,0 is yours | TOO WEAK: 2 VS 4
  3. Then the turn in one word. Ends on points.
- **Finish:** YOU WIN / You had more points – you won!

## LEVEL 3 — ROCK AND GOLD

- **Setup:**
  - Rock -1,0, gold 0,0.
  - Your tile -1,1 (3); their tile 1,-1 (4). Locked.
  - Opponent grows on turns 1 and 3 and heads for the gold first.
- **Beats:**
  1. LIT the rock | ROCKS BLOCK / Nothing can grow on a rock. | tap anywhere | tapping the rock: ROCK BLOCKS THIS
  2. LIT a card, then the gold | GOLD COUNTS DOUBLE / Gold tiles score two points. Take it first. | Grow onto 0,0
  3. Then the turn in one word. If you leave the gold, they take it. Ends on points.
- **Finish:** YOU WIN / Gold put you ahead.

## LEVEL 4 — CUTTING

- **Setup:**
  - Your tiles -1,1 (4), 0,0 (3).
  - Their link 1,-1 (2) holds their branch 0,-1 (5) and -1,-1 (3) to home.
  - Not locked: other legal moves are played.
- **Beats:**
  1. LIT a card, then the link 1,-1 | CUT THEIR LINK / Disconnect opponent’s tiles from their home to destroy them. | link taken
  2. 0,-1 and -1,-1 wither | THEY WITHERED / Disconnected tiles don’t score anything. | tap anywhere
  3. Then the turn in one word. Ends on points.
- **Finish:** YOU WIN / You had more points – you won!

## LEVEL 5 — BLOOM

- **Setup:**
  - You hold three 3s (one Bloom) and no other Bloom.
  - Your tile -1,1 (2). Their home's sides are held by 9s, so no Bloom can surround it.
- **Beats:**
  1. LIT the three cards | CARDS THAT BLOOM / 3 cards with the same number, or 3 of same suit in order. | tap anywhere
  2. LIT Bloom | PLAY THE LIT CARDS / Three together make a Bloom. | Bloom picked | THREE CARDS OR MORE, SAME NUMBER, OR COUNTING UP
  3. LIT the Bloom's tiles | TAP BLOOM / Then tap or draw the tiles on board. Have to connect to your home. | Bloom played
  4. BLOOM! / A Bloom is an extra move, growing multiple tiles at once. | tap anywhere
  5. Then the turn in one word. Ends on points.
- **Finish:** YOU WIN / You had more points – you won!

## LEVEL 6 — KNOCK-OUT

- **Setup:**
  - Your tiles -1,1 (4), 0,0 (5).
  - Their home 2,-2 has 3 sides on this map (1,-2, 1,-1, 2,-1), all open.
  - The opponent never grows on its own home's sides.
- **Beats:**
  1. LIT their home | SURROUND THEIR HOME / Surround their home from each side for an instant win. | tap anywhere
  2. LIT a card, then an open side | SURROUND THEIR HOME / Surround their home from each side for an instant win. | Grow onto a side
  3. When the engine sees a winning move this turn (and only then): LIT it | YOU CAN WIN / Take the last open side of their home. | surround
- **Finish:** YOU WIN / You surrounded their home.
- **Proof:** won by surround on your 3rd turn. The engine-verified win-moment test plays the lit move and checks the strangle.

## LEVEL 7 — BOMB

- **Setup:**
  - You hold a Bomb. Your tile -1,1 (3); their 9s on 0,0 and 1,-1.
  - The opponent does not grow.
- **Beats:**
  1. LIT the Bomb, then 0,0 | BOMB THEIR TILE / A Bomb removes 1 enemy tile. It replaces Grow in your turn. | 0,0 removed | MUST TOUCH YOUR TILES, HOMES ARE SAFE
  2. Then the turn in one word (after 6 s idle). Ends on points.
- **If you throw the Bomb:** RESTART LEVEL.
- **Finish:** YOU WIN / You had more points – you won!

## LEVEL 8 — BLAST

- **Setup:**
  - You hold two Bombs.
  - Your tiles -1,1 (4), 0,0 (5).
  - Their tiles 0,-1, 1,-1, 1,-2, 2,-1 (9s) and -1,0 (6).
- **Beats:**
  1. LIT Bloom (the two Bombs) | TWO BOMBS MAKE A BLAST / A Blast clears a large area. Homes are safe. | Blast picked
  2. LIT the target 0,-1 | TWO BOMBS MAKE A BLAST / A Blast clears a large area. Homes are safe. | Blast played
  3. LIT a card, then a tile | FREE GROW / A Blast is an extra move on top of Grow and Blooms. | the Grow played
  4. Then the turn in one word (after 6 s idle). Ends on points.
- **Finish:** YOU WIN / You had more points – you won!

## LEVEL 9 — THROW PILE AND SKIP

- **Setup:**
  - The Throw pile's top card (a 5) finishes the 3-4-5 in your hand.
  - Your tile -1,1 (4); their home's sides are held by 9s.
- **Beats:**
  1. LIT Throw pile (it glows gold) | THROW PILE IS GOLD / An indicator that its top card completes a Bloom in your hand. | drawn from the Throw pile
  2. LIT Bloom, then its tiles | TAP BLOOM / Then tap or draw the tiles on board. Have to connect to your home. | Bloom played
  3. LIT » | SKIP GROW / You can end a turn without growing to save cards for later. | turn ended without a Grow
  4. Then the turn in one word (after 6 s idle). Ends on points.
- **Finish:** YOU WIN / You had more points – you won!

## LEVEL 10 — FINALE

- **Setup:**
  - Gold 0,0, rock 0,1.
  - Your tile -1,1 (4); their tiles 1,-1 (4), 1,-2 (6), 2,-1 (7).
  - The gentlest bot (level 1). Draw pile: 14 cards.
- **Beats:**
  - No guidance unless you are idle for 6 s: then the usual one-word light and Show me.
  - When the Draw pile is empty: LAST TURN / Pile empty: each tile is 1 point. Numbers on tiles don’t count. | tap anywhere
- **Finish:** YOU CAN PLAY FUTASAKU / Next: the big board.

Level 11 is the first 37-hex level. It has no lesson.
