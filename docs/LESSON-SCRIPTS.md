# Lesson scripts — levels 1-10 (the tutorial)

This file is the script of what the game shows in levels 1-10. It must match the code:

- data and beats: `web/src/lessons/lessons.ts`
- words: the `LESSON` section of `src/strings.ts`
- wrong-tap answers: `web/src/lessons/answer.ts`
- the opponent: `web/src/lessons/opponent.ts`
- authored openings: `web/src/lessons/authored.ts`

If you change a beat, a word or a position, change it here too. If you change a lesson's position or goals, bump its `version` (an unfinished save of the old lesson then restarts cleanly).

**Current version: 2** (2026-10-19 onboarding polish). The campaign progress and match-save keys moved to `.v3` at the same time, so nobody resumes onto a changed board. Old `.v2` keys stay in the browser, unread.

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

- Every glow has the **same rounded corner**, whatever it outlines. SPOTLIGHT and GUIDE hold still (the lit thing already breathes); WHISPER is a gentle pulse on the target only.
- The score display and the pile count are taught **once**, in level 1, and are left as they are everywhere else.

### Per-action mastery fade

The light fades by **action**, not by level. The count is per player and per action type (Draw,
Grow, Throw, Cut, Take over, Bloom, Bomb, Blast, Strengthen, Surround), saved in the channel's own
storage keyed to lesson version 2:

| Times done correctly | Tier | What the player sees |
|---|---|---|
| 1st ever | **SPOTLIGHT** | full window, pointer, full-strength dim, glass explanation |
| 2nd | **GUIDE** | soft glow + pointer, dim ~.15, one short line |
| 3rd | **WHISPER** | gentle pulse on the target, no dim, no pointer, one word |
| 4th + | **SILENT** | nothing; the calm neutral window |

- From level 2 a spotlight may fire only for an action new **in that level**, and levels 2-9 spend at
  most **one** new-idea spotlight. Level 1 may show three (Draw, Grow, Throw). Level 10 has none.
- The safety net is measured from the last touch: **6 s WHISPER**, **12 s GUIDE**, **20 s the light
  guide** (pointer + glow, no heavy dim). Level 10 uses the same timings. Any touch resets it.
- **Two wrong taps on the same step** raise the tier by one for that moment only (SILENT→WHISPER,
  WHISPER→GUIDE; never past GUIDE after level 1). A wrong tap never resets mastery.
- The dim is lighter than it was: `.22` base, `.45` on level 1, `.15` for GUIDE, none for WHISPER.
- **New-power hello:** the first time Bloom, Bomb or Blast is legal after its lesson, its card(s)
  glow once with the one word BLOOM / BOMB / BLAST. It fades after ~2.6 s, is remembered on the
  device, and is never shown again. It never marks the power as a mistake or something to avoid.

### Mission and stage intro

Each level opens with its level number and name for ~1.2 s (a tap skips it), then the board becomes
live. The mission is a small pill in the glass until the player's first move:

| Level | Mission |
|---|---|
| 1 | Draw, Grow, Throw. |
| 2 | Stronger tiles win. |
| 3 | Take the gold. |
| 4 | Cut their root. |
| 5 | Bloom three at once. |
| 6 | Surround their home. |
| 7 | Bomb one tile. |
| 8 | Blast a hole. |
| 9 | Skip Grow. Save cards. |
| 10 | Play a real game. |

### Explanations

- An explanation beat (marked **tap anywhere**) moves on with a tap anywhere, or the glass NEXT.
- An explanation is shown once per level. It is remembered across a refresh, with the lesson's version.

### Wrong taps

- Every tap that cannot do anything gets one short answer, taken from the engine's own reasons.
- In levels 1-3 the **first turn only** is locked: a legal tap that is not the lit one is answered with TAP THE LIT ONE and does not reach the game. From turn 2 those levels are free, still guided by the tier.
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

- **Idle 6 s / 12 s / 20 s.** The safety net brings WHISPER, then GUIDE, then the light guide. The glass offers **Show me**; it nudges the light and never plays for you.
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
  - LIT » after the Grow | DONE GROWING / Tap » to go on to Throw. Shown **once per device**: the player taps » themselves the first time. After that the game moves on to Throw by itself when nothing else can be played. **» is never lit while a legal Bloom, Bomb or Blast exists** (the only exception is the dedicated skip lesson, L9): the light points at the power instead, or stays quiet after its one-time hello.
  - LIT the card to throw | THROW A CARD / Throw 1 card to end your turn. | card picked
  - LIT Throw pile | TAP THE THROW PILE / Move the card here, or tap it again. | card thrown
  - their turn | THEIR TURN / They draw, grow and throw too. (first time only)
- **Later turns:** the fade decides. SPOTLIGHT speaks fully; GUIDE has a short line; WHISPER is one word (DRAW, GROW, THROW …); SILENT shows the neutral window. The safety net raises a silent step after 6 s.
- **Level 10** has no spotlights and no initial light: its hints wait for the same 6/12/20 s safety net.
- **Explanations** cannot be dismissed by a tap in their first 0.65 s, so a tap meant for the move that just happened never swallows them.
- **The cockpit LED** keeps to the score and real results while the window speaks (no competing words).
- **A lit card** sits above the fan, so only that card shows in the glow.
- **Finish card** in levels 1-10: the title, `YOU LEARNED: <the level's one idea>` with a small mark, the score, then Next. No wall of text, no repeated reason, no "Next level unlocked".
- **Install invitation:** never in levels 1-3; from level 4 it waits until the finish card is closed.

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
  6. LIT the cockpit's score display, which holds the score itself (1:0) | LED YOU 1 : THEM 0 | You grew. Tiles keep the rank of the card used. | tap anywhere
  7. LIT the card, then Throw pile | THROW A CARD / Throw 1 card to end your turn. → TAP THE THROW PILE / Move the card here, or tap it again. | thrown
  8. THEIR TURN / They draw, grow and throw too.
  9. Turns 2-4: DRAW, GROW, THROW (one word, same light).
  10. Draw pile at 3 cards: LIT the Draw pile together with its count (the count also glows) | LED LAST CARDS | PILE ALMOST EMPTY / You can see how many cards are left in the Draw pile. | tap anywhere
  11. Pile empty: LAST TURN / Pile empty: each tile is 1 point. Numbers on tiles don’t count. | tap anywhere
- **Finish:** YOU WIN / YOU LEARNED: DRAW, GROW, THROW (✦)
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
- **Finish:** YOU WIN / YOU LEARNED: STRONGER TILES WIN (↑)

## LEVEL 3 — ROCK AND GOLD

- **Setup:**
  - Rock -1,0, gold 0,0.
  - Your tile -1,1 (3); their tile 1,-1 (4). Locked.
  - Opponent grows on turns 1 and 3 and heads for the gold first.
- **Beats:**
  1. LIT the rock | ROCKS BLOCK / Nothing can grow on a rock. | tap anywhere | tapping the rock: ROCK BLOCKS THIS
  2. LIT a card, then the gold | GOLD COUNTS DOUBLE / Gold tiles score two points. Take it first. | Grow onto 0,0
  3. Then the turn in one word. If you leave the gold, they take it. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: GOLD COUNTS DOUBLE (◆)

## LEVEL 4 — CUTTING

- **Setup:**
  - Your tiles -1,1 (4), 0,0 (3).
  - Their link 1,-1 (2) holds their branch 0,-1 (5) and -1,-1 (3) to home.
  - Not locked: other legal moves are played.
- **Beats:**
  1. LIT a card, then the link 1,-1 | CUT THEIR LINK / Disconnect opponent’s tiles from their home to destroy them. | link taken
  2. 0,-1 and -1,-1 wither | THEY WITHERED / Disconnected tiles don’t score anything. | tap anywhere
  3. Then the turn in one word. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: CUT THEIR ROOT (✂)

## LEVEL 5 — BLOOM

- **Setup:**
  - You hold three 3s (one Bloom) and no other Bloom.
  - Your tile -1,1 (2). Their home's sides are held by 9s, so no Bloom can surround it.
- **Beats:**
  1. LIT the three cards | CARDS THAT BLOOM / 3 cards with the same number, or 3 of same suit in order. | tap anywhere
  2. LIT Bloom | TAP BLOOM / Three together make a Bloom. | Bloom picked | THREE CARDS OR MORE, SAME NUMBER, OR COUNTING UP
  3. LIT the Bloom's tiles | TAP THE LIT TILES / Tap or draw the tiles on board. Have to connect to your home. | Bloom played
  4. BLOOM! / A Bloom is an extra move, growing multiple tiles at once. | tap anywhere
  5. Then the turn in one word. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: BLOOM THREE AT ONCE (✿)

## LEVEL 6 — KNOCK-OUT

- **Setup:**
  - Your tiles -1,1 (4), 0,0 (5).
  - Their home 2,-2 has 3 sides on this map (1,-2, 1,-1, 2,-1), all open.
  - The opponent never grows on its own home's sides.
- **Beats:**
  1. LIT their home | SURROUND THEIR HOME / Surround their home from each side for an instant win. | tap anywhere
  2. LIT a card, then an open side | SURROUND THEIR HOME / Surround their home from each side for an instant win. | Grow onto a side
  3. When the engine sees a winning move this turn (and only then): LIT it | YOU CAN WIN / Take the last open side of their home. | surround
- **Finish:** YOU WIN / YOU LEARNED: SURROUND THEIR HOME (◎)
- **Proof:** won by surround on your 2nd turn. The engine-verified win-moment test plays the lit move and checks the strangle.

## LEVEL 7 — BOMB

- **Setup:**
  - You hold a Bomb. Your tile -1,1 (3); their 9s on 0,0 and 1,-1.
  - The opponent does not grow.
- **Beats:**
  1. LIT the Bomb, then 0,0 | BOMB THEIR TILE / A Bomb removes 1 enemy tile. It replaces Grow in your turn. | 0,0 removed | MUST TOUCH YOUR TILES, HOMES ARE SAFE
  2. Then the turn in one word. Ends on points.
- **If you throw the Bomb:** RESTART LEVEL.
- **Finish:** YOU WIN / YOU LEARNED: BOMB ONE TILE (●)

## LEVEL 8 — BLAST

- **Setup:**
  - You hold two Bombs.
  - Your tiles -1,1 (4), 0,0 (5).
  - Their tiles 0,-1, 1,-1, 1,-2, 2,-1 (9s) and -1,0 (6).
- **Beats:**
  1. LIT Bloom (the two Bombs) | TWO BOMBS MAKE A BLAST / A Blast clears a large area. Homes are safe. | Blast picked
  2. LIT the target 0,-1 | TWO BOMBS MAKE A BLAST / A Blast clears a large area. Homes are safe. | Blast played
  3. LIT a card, then a tile | FREE GROW / A Blast is an extra move on top of Grow and Blooms. | the Grow played
  4. Then the turn in one word. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: BLAST A HOLE (✹)

## LEVEL 9 — THROW PILE AND SKIP

- **Setup:**
  - The Throw pile's top card (a 5) finishes the 3-4-5 in your hand.
  - Your tile -1,1 (4); their home's sides are held by 9s.
- **Beats:**
  1. LIT Throw pile (it glows gold) | THROW PILE IS GOLD / An indicator that its top card completes a Bloom in your hand. | drawn from the Throw pile
  2. LIT Bloom | TAP BLOOM / Then tap or draw the tiles on board. Have to connect to your home. | Bloom picked
  3. LIT the Bloom's tiles | TAP THE LIT TILES / Tap or draw the tiles on board. Have to connect to your home. | Bloom played
  3. LIT » | SKIP GROW / You can end a turn without growing to save cards for later. | turn ended without a Grow
  4. Then the turn in one word. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: SKIP GROW. SAVE CARDS. (↦)

## LEVEL 10 — FINALE

- **Setup:**
  - Gold 0,0, rock 0,1.
  - Your tile -1,1 (4); their tiles 1,-1 (4), 1,-2 (6), 2,-1 (7).
  - The gentlest bot (level 1). Draw pile: 14 cards.
- **Beats:**
  - No guidance unless you are idle for 6 s: then the usual one-word light and Show me.
  - When the Draw pile is empty: LAST TURN / Pile empty: each tile is 1 point. Numbers on tiles don’t count. | tap anywhere
- **Finish:** YOU CAN PLAY FUTASAKU / YOU LEARNED: THE WHOLE GAME (★), then Next: the big board.

Level 11 is the first 37-hex level. It has no lesson.

## Turn counts (the player who follows the light)

Measured by the unit suite (`web/tests/lessons.test.ts`), counting the player's own turns:

| Level | Before | After |
|---|---|---|
| 1 | 4 | 4 |
| 2 | 4 | 4 |
| 3 | 4 | 4 |
| 4 | 4 | 4 |
| 5 | 3 | 3 |
| 6 | 2 | 2 |
| 7 | 4 | 3 |
| 8 | 3 | 2 |
| 9 | 4 | 4 |
| 10 | 6 | 2 |

L2-L9 are all at or under five turns. L6, L8 and L10 end sooner because the lesson's own move (or
the finale's strongest attack) is the winning one; no filler turn was added just to reach a count.
L1 is under 60 seconds in the browser test (about 16 s at 390x844).

## Bloom before the Bloom lesson (owner-delegated decision)

No authored hand or deck was re-dealt. The decision per level:

- **L5 is the Bloom lesson.** Its opening hand is deliberately a set of three 3s; there is no earlier
  moment to protect. The opening explanation names those cards before any move.
- **L7, L8 and L9 come after L5**, so Bloom has already been taught. Bloom can still become legal
  while those levels teach something else; the one-time BLOOM hello is the smallest change: it
  glows the cards once and never steers away from them.
- **L9's Bloom is its goal** (the Throw pile completes a run), so it is not accidental.
- Levels 1-4 are covered by the existing test that no Bloom is legal while following the light.

Re-dealing would have changed a level's natural position and its win margin for no teaching gain;
moving the Bloom lesson earlier would have made L5's authored set redundant. The hello keeps the
levels intact and gives the power one calm introduction outside its lesson.
