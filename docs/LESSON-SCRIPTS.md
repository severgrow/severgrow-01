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
- **The opponent** (levels 1-9) is gentle, deterministic and always plays (owner, 2026-10-22: "every
  level has to still feel like a game and a slight challenge"):
  - it plays only legal moves and always draws from the Draw pile;
  - from level 2 it grows on EVERY turn: one tile, spreading on its own side with its lowest card;
    with no room to spread it strengthens its weakest tile, and only then takes your weakest tile
    (level 1 grows once, on its 2nd turn);
  - it throws its lowest card (never a Bomb) and never takes the last open side of your home;
  - a lesson may keep a hex free for you (`avoid`) or send it to one first (`prefer`).
  - Following the light always wins with room to spare; very poor play can lose, and the level is
    simply played again.
  - Level 10 plays the gentlest bot (level 1).
- **No power before its lesson** (owner, 2026-10-22): the lesson never offers a Bloom before level 5,
  a Bomb before level 7 or a Blast before level 8 (`lessonAllows`, applied by the page's session).
  The cards are the engine's; only the offer is narrowed, so no button, card glow, combo bracket or
  gold Throw pile can show a Bloom in levels 1-4.
- **No text on the map.** The map gets only the glow of the lit target and a small ring where a tap
  landed. The lesson speaks in two places only: the DISPLAY (the cockpit's LED) and the INFO BOX
  (`#lesson-plate`).

### The info box (2026-10-19 redesign)

The game's header is the menu and the logo only. The lesson's explanations sit in ONE caption,
floating over the felt — no panel, no title, no mission, no buttons:

    [menu]                                          [logo]

              explanation sentence (up to 4 lines)

- **No border, no outline, no ring, no shadow.** A flat translucent fill at `.77` alpha and nothing
  else; it must read as a caption over the felt, not a bordered panel. No backdrop blur (it would
  repaint the board underneath).
- **Information only.** No NEXT, no Show me, no RESTART button. `pointer-events:none`: every tap
  passes through to the board or a control beneath it.
- **Explanations only** (one full sentence). The box never carries an action label, a score, a
  pile warning or a level name. It is shown once per lesson and is never faded by mastery.
- **Dismissed by a tap anywhere, or on the lit thing itself.** The same tap advances the lesson; it
  does not also play the move. A tap in the first 0.65 s is ignored, so a tap meant for the move
  that just happened never swallows the explanation unread.
- The placement reads the hexes and cockpit controls once per beat: it sits **near the lit target**
  (closest plate centre to the nearest lit centre, centred x on a tie), and it **never overlaps the
  lit target, a control or the header**. On desktop (side layout) and on a beat with no light it
  keeps the older order: fewest covered hexes, then the highest gap under the header. The map is
  never shrunk. It runs when the beat changes, on resize, once after the camera settles (the
  existing 400 ms follow-up) and again whenever the camera's own viewBox comes to rest, so a
  grow's eased zoom cannot leave the caption beside the geometry it was placed against. Nothing
  measures per frame, and the watch leaves with the caption.

### The display (the cockpit LED)

The display says **what to do**, as a short action line in the "Tap the draw pile" style — never a
lone word. During a lesson the cockpit's own step cues (`DRAW!`, `GROW!`, `THROW!`) are quiet, so
two displays never compete.

| Where | What it carries |
|---|---|
| the display | the current action (TAP THE DRAW PILE, CHOOSE A CARD, TAP THE LIT TILE, THROW A CARD, TAP THE THROW PILE…), the score, the Draw pile count, LAST CARDS, LAST TURN, a wrong-tap answer |
| the info box | an explanation sentence (your home, the win condition, first draw, Grow, Throw, bigger number, cut, gold, Bloom, Bomb, Blast, skip, the score's meaning) |

- A beat carries **one or the other**, never the same words twice. A notification may keep its
  explanation (LAST TURN on the display, the scoring rule in the box).
- The **6 s idle nudge** is a glow and a pointer bob only — never a button. It brings the action
  line back at the WHISPER tier.
- A wrong tap is answered on the display (never in the box), with a small ring where the tap landed.

### The light

| Lit thing | Outline |
|---|---|
| a map hex (tile, home, rock) | hex |
| a card in the fan | the card itself, turned with the fan |
| a pile or a button | rounded pill |

- Every glow has the **same rounded corner**, whatever it outlines. SPOTLIGHT and GUIDE hold still (the lit thing already breathes); WHISPER is a gentle pulse on the target only.
- The pile count is taught **once**, in level 1, and is left as it is everywhere else. What a point is worth is taught **once, as its own beat** (level 1 step 8) — and that beat lights the tile that carries the number, not the display, because the sentence is about the tile's rank. The score display itself is readable from the first turn.

### Per-action mastery fade

The light fades by **action**, not by level. The count is per player and per action type (Draw,
Grow, Throw, Cut, Take over, Bloom, Bomb, Blast, Strengthen, Surround), saved in the channel's own
storage keyed to lesson version 2:

| Times done correctly | Tier | What the player sees |
|---|---|---|
| 1st ever | **SPOTLIGHT** | full light and pointer, full-strength dim, the action on the display |
| 2nd | **GUIDE** | soft glow + pointer, dim ~.15, the action on the display |
| 3rd | **WHISPER** | gentle pulse on the target, no dim, no pointer; still the action line — never a single word |
| 4th + | **SILENT** | nothing; the calm neutral display (the score) |

- From level 2 a spotlight may fire only for an action new **in that level**, and levels 2-9 spend at
  most **one** new-idea spotlight. Level 1 may show three (Draw, Grow, Throw). Level 10 has none.
- The safety net is measured from the last touch: **6 s WHISPER**, **12 s GUIDE**, **20 s the light
  guide** (pointer + glow, no heavy dim). Level 10 uses the same timings. Any touch resets it.
- **Two wrong taps on the same step** raise the tier by one for that moment only (SILENT→WHISPER,
  WHISPER→GUIDE; never past GUIDE after level 1). A wrong tap never resets mastery.
- The dim is lighter than it was: `.22` base, `.45` on level 1, `.15` for GUIDE, none for WHISPER.
- **New-power hello:** the first time Bloom, Bomb or Blast is legal after its lesson, its card(s)
  glow once and the display says what to do with it (TAP TO BLOOM / TAP THE BOMB / TAP BLOOM TO
  BLAST). It fades after ~2.6 s, is remembered on the device, and is never shown again. It never
  marks the power as a mistake or something to avoid.

### Stage intro and explanations

Each level opens with a quiet ~1.2 s beat (a tap skips it): the board settles, the stage carries no
label and no words. Then the lesson's explanations begin.

- An explanation beat (marked **tap anywhere**) moves on with a tap anywhere, or a tap on the lit
  thing itself.
- An explanation is shown once per level. It is remembered across a refresh, with the lesson's version.
- Every sentence is the owner's (2026-10-22 sign-off), verbatim in `src/strings.ts` and pinned by
  `web/tests/lesson-words.test.ts`; `docs/LESSON-TEXT-1-10.csv` lists them all. Draw, Grow and Throw
  always have a capital first letter in a sentence.
- **When an explanation appears** (owner, 2026-10-22: "every step has a playable example straight
  away"):
  - board facts and the first turn's shape come before the first draw (your home, the win, the
    three steps, the rock, the gold Throw pile);
  - a MOVE is explained after the draw, the first moment it can be played, right before the tap:
    gold, Bloom, surround, Bomb, Blast; level 2's cut and level 4's cut wait for the turn the cut
    is there to play.
  - an explanation is never skipped because its card was picked first; and the light never points
    at a move the player has not been shown (no taking a tile before level 2).

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

- **Idle 6 s / 12 s / 20 s.** The safety net brings WHISPER, then GUIDE, then the light guide. It is a glow and a pointer bob only — never a button, never a lone word.
- **Hints off.** Settings → Step guidance off hides the box and the light. Wrong-tap answers still go to the display, and the lock is off.
- **A lesson that cannot finish.** If its goal can no longer happen (for example you threw the Bomb
  in level 7), the info box says "This lesson cannot finish now. Open the menu to start again."
  There is no button in the box; the menu is always in the header.
- **The clock.** The Draw pile's count glows when 3 or fewer cards are left. When the pile is empty the LED says LAST TURN.
- **Seeds.** Levels 1-10 pay no Seeds in /3 and their finish card has no Seeds line. Their authored openings cannot be replayed by the server's verifier (see the report).

### Beat format

LIT | DISPLAY (the action) | BOX (the explanation, once) | DONE WHEN | WRONG TAP

A beat carries one or the other, except a notification that keeps its explanation (LAST TURN on the
display, the rule in the box). Every explanation is shown once per lesson and is dismissed by a tap
anywhere (or on the lit thing itself). Every action is a short line on the display — never a single
word.

### The turn

The same in every level:

- **First turn** (level 1, spelled out):
  - LIT Draw pile | BOX: "You start every turn by drawing 1 card from the Draw pile or Throw pile." | tap anywhere
  - LIT Draw pile | DISPLAY: TAP THE DRAW PILE | a card drawn | DRAW FIRST on anything else
  - LIT the suggested card | BOX: "Grow: drag one of your cards from your hand onto the board, or tap
    it to select and then place on the board." | tap anywhere
  - LIT the card | DISPLAY: CHOOSE A CARD | card picked
  - LIT the tile (other legal tiles quietly) | DISPLAY: TAP THE LIT TILE | Grow played
  - LIT the tile that was just grown — its number stone, the rank the card gave it | BOX: "Tiles
    keep the rank of the card used." | tap anywhere. (Owner, 2026-10-20: this used to light the
    score display, which pointed the arrow at the score while the sentence was about the tile's
    number. The score still shows on the display; it is simply not what this beat lights.)
  - After the Grow, when nothing else can be played, the game moves on to Throw by itself (owner,
    2026-10-20: lighting » there was redundant). **» is never lit for a moment before it does**, and
    **never while a legal Bloom, Bomb or Blast exists**.
  - LIT the card to throw | BOX: "Throw: swipe up, drag it to the Throw pile, or double tap to throw a card
    and finish your turn." | tap anywhere
  - LIT the card, then Throw pile | DISPLAY: THROW A CARD → TAP THE THROW PILE | card thrown
  - their turn | DISPLAY: THEIR TURN (box on the first one: "They draw, grow and throw too.")
- **Later turns:** the fade decides the light, not the words. SPOTLIGHT, GUIDE and WHISPER all put
  the action line on the display (WHISPER is never a single word); SILENT shows the score. The
  safety net raises a silent step after 6 s.
- **Level 10** has no spotlights and no initial light: its action waits for the same 6/12/20 s net.
- **Explanations** cannot be dismissed by a tap in their first 0.65 s, so a tap meant for the move
  that just happened never swallows them.
- **A lit card** is lifted out of the fan (raised, slightly larger, a clean shadow), still above the
  fan and still the same button; the lift is dropped as soon as the beat moves on.
- **Finish card** in levels 1-10: the title, `YOU LEARNED: <the level's one idea>` with a small mark, the score, then Next. No wall of text, no repeated reason, no "Next level unlocked".
- **Install invitation:** never in levels 1-3; from level 4 it waits until the finish card is closed.

## LEVEL 1 — FIRST SEED

- **Setup:**
  - 19 hexes; no rock, no gold, no tiles.
  - Locked on the first turn. Draw pile: 12 cards.
  - The opponent grows once, on its 2nd turn, and never takes a tile (owner, 2026-10-23: the first
    game is calm). The light never suggests taking their tile here; that is level 2's lesson.
  - The display scrolls HELLO ♥ WELCOME ♥ from the level's first frame until the third sentence is read.
- **Beats:**
  1. LIT your home | BOX: "This is your home. Place cards on the tiles that connect to your home to Grow." | tap anywhere
  2. LIT their home | BOX: "TO WIN: surround opponent’s home tile, or have more tiles on the board when the Draw pile runs out." | tap anywhere
  3. LIT Draw pile | BOX: "Every turn has 3 steps – Draw, Grow and Throw. You start by drawing 1 card from the top of the Draw pile or the Throw pile." | tap anywhere
  4. LIT Draw pile | DISPLAY: TAP THE DRAW PILE | drawn | DRAW FIRST
  5. LIT the suggested card | BOX: "Grow: drag one of your cards from your hand onto the board, or tap it to select and then place it on the board." | tap anywhere
  6. LIT the card | DISPLAY: CHOOSE A CARD | picked | TAP THE LIT ONE
  7. LIT the tile, other legal tiles quietly | DISPLAY: TAP THE LIT TILE | Grow played | CONNECT TO YOUR HOME, THAT IS THEIR HOME
  8. LIT the hex that was just grown (its number stone: the rank the card gave it) | BOX: "Tiles keep the rank of the card used. Higher ranks are harder to cut." | tap anywhere. The display keeps showing the score (1:0) but is not the lit target.
  9. LIT » | DISPLAY: TAP » TO THROW | tapped
  10. LIT the card | BOX: "Throw: swipe up, drag it to the Throw pile, or double tap to Throw a card. This ends your turn." | tap anywhere
  11. LIT the card, then Throw pile | DISPLAY: THROW A CARD → TAP THE THROW PILE | thrown
  12. their turn | DISPLAY: THEIR TURN + BOX: "They Draw, Grow and Throw too." (first time only)
  13. Turns 2-4: the fade decides; the display carries the action (DRAW, GROW, THROW become TAP THE DRAW PILE, CHOOSE A CARD, THROW A CARD).
  14. Draw pile at 3 cards: LIT the Draw pile together with its count | DISPLAY: LAST CARDS | tap anywhere
  15. Pile empty: DISPLAY: LAST TURN | BOX: "The Draw pile is empty – this is your last turn." | tap anywhere
- **Finish:** YOU WIN / YOU LEARNED: DRAW, GROW, THROW (✦)
- **Proof:** the follower wins 4-1 in 4 of your turns. The browser tapper does it with 0 wrong taps.

## LEVEL 2 — TILE NUMBERS

- **Setup:**
  - Your tile -1,1 (2). Their tiles 0,0 (4) and 1,-1 (5).
  - You hold an 8 and a 6. Locked on the first turn.
  - The opponent grows every turn and never on 0,0, so the cut is open on your second turn.
- **Beats:**
  1. (turn 1, after the draw) LIT the 8 | BOX: "Strengthen: a stronger card can replace your own tile." | tap anywhere
  2. LIT the 8, then your tile -1,1 | DISPLAY: CHOOSE A CARD → TAP THE LIT TILE | Strengthen to 8
  3. Throw; their turn.
  4. (turn 2, after the draw, when the cut can be played) LIT their tile 0,0 | BOX: "Cut: a higher card can take an opponent’s tile." | tap anywhere
  5. LIT a higher card, then their tile 0,0 | DISPLAY: CHOOSE A CARD → TAP THEIR TILE | 0,0 is yours | TOO WEAK: 2 VS 4
  6. Then the turns; the light prefers taking a weak tile of theirs to an empty hex. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: STRONGER TILES WIN (↑)

## LEVEL 3 — ROCK AND GOLD

- **Setup:**
  - Rock -1,0, gold 0,0.
  - Your tile -1,1 (3); their tile 1,-1 (4). Locked on the first turn.
  - The opponent grows every turn and heads for the gold first.
- **Beats:**
  1. (before the draw) LIT the rock | BOX: "Nothing can Grow on a rock." | tap anywhere | tapping the rock: ROCK BLOCKS THIS
  2. (after the draw) LIT the gold 0,0 | BOX: "A gold tile counts double, so it is worth two points." | tap anywhere
  3. LIT a card, then the gold | DISPLAY: CHOOSE A CARD → TAP THE LIT TILE | Grow onto 0,0
  4. Then the turn. If you leave the gold, they take it. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: GOLD COUNTS DOUBLE (◆)

## LEVEL 4 — CUTTING

- **Setup:**
  - Your tiles -1,1 (4), 0,0 (3).
  - Their link 1,-1 (2) holds their branch 0,-1 (5) and -1,-1 (3) to home.
  - Not locked: other legal moves are played.
- **Beats:**
  1. (after the draw) LIT the link 1,-1 | BOX: "Cut a tile to break the chain behind it." | tap anywhere
  2. LIT a card, then the link | DISPLAY: CHOOSE A CARD → TAP THEIR TILE | link taken
  3. 0,-1 and -1,-1 are removed | BOX: "Tiles cut off from their home disappear." | tap anywhere
  4. Then the turn. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: CUT THEIR ROOT (✂)

## LEVEL 5 — BLOOM

- **Setup:**
  - You hold three 3s (one Bloom) and no other Bloom.
  - Your tile -1,1 (2). Their home's sides are held by 9s, so no Bloom can surround it.
- **Beats:**
  1. (after the draw) LIT the three cards | BOX: "BLOOM: three cards with the same number, or three in order in one suit." | tap anywhere
  2. LIT Bloom | DISPLAY: TAP BLOOM | Bloom picked | THREE CARDS OR MORE, SAME NUMBER, OR COUNTING UP
  3. LIT the Bloom's tiles | DISPLAY: TAP THE LIT TILES | Bloom played
  4. BLOOM | BOX: "Bloom grows several tiles at once and does NOT use your Grow." | tap anywhere
  5. Then the turn. Ends on points.
- **The explanation's example (owner, 2026-10-20):** under that one sentence, in the same box, a
  compact set — 3, 3, 3 in three suits — and, when it fits, a second row — 3, 4, 5 in one suit.
  Two rows of tiny faces built from the cards' own face markup (no new art), static, no overlay, no
  animation; the run row is dropped when the box would grow past a third of the screen. The box
  still never covers a lit target and the map is not padded for it.
- **Finish:** YOU WIN / YOU LEARNED: BLOOM THREE AT ONCE (✿)

## LEVEL 6 — KNOCK-OUT

- **Setup:**
  - Your tiles -1,1 (4), 0,0 (5).
  - Their home 2,-2 has 3 sides on this map (1,-2, 1,-1, 2,-1), all open.
  - The opponent grows every turn; with only its home to grow from, it grows onto one of its own
    home's sides with a low card, and the surround takes that tile back (owner, 2026-10-22: a level
    that never moves feels like a bug).
- **Beats:**
  1. (after the draw) LIT their home | BOX: "Surround: fill every tile around their home for an instant win." | tap anywhere
  2. LIT a card, then an open side | DISPLAY: CHOOSE A CARD → TAP THE LIT TILE | Grow onto a side
  3. When the engine sees a winning move this turn (and only then): LIT it | DISPLAY: TAP THE LAST SIDE | surround
- **Finish:** YOU WIN / YOU LEARNED: SURROUND THEIR HOME (◎)
- **Proof:** won by surround on your 2nd turn. The engine-verified win-moment test plays the lit move and checks the strangle.

## LEVEL 7 — BOMB

- **Setup:**
  - You hold a Bomb. Your tile -1,1 (3); their 9s on 0,0 and 1,-1. Draw pile: 11 cards.
  - The opponent grows every turn.
- **Beats:**
  1. (after the draw) LIT the Bomb | BOX: "Bomb: removes one enemy tile, even a 9. Uses your Grow." | tap anywhere
  2. LIT the Bomb, then 0,0 | DISPLAY: CHOOSE THE BOMB → BOMB THEIR TILE | 0,0 removed | MUST TOUCH YOUR TILES, HOMES ARE SAFE
  3. Then the turn. Ends on points.
- **If you throw the Bomb:** the box says "This lesson cannot finish from here." with one START AGAIN button that restarts the level in place.
- **Finish:** YOU WIN / YOU LEARNED: BOMB ONE TILE (●)

## LEVEL 8 — BLAST

- **Setup:**
  - You hold two Bombs.
  - Your tiles -1,1 (4), 0,0 (5).
  - Their tiles 0,-1, 1,-1, 1,-2, 2,-1 (9s) and -1,0 (6).
- **Beats:**
  1. (after the draw) LIT the two Bombs | BOX: "Blast: two Bombs clear a large area. Homes are safe." | tap anywhere
  2. LIT Bloom (the two Bombs) | DISPLAY: TAP BLOOM TO BLAST | Blast picked
  3. LIT the target 0,-1 | DISPLAY: TAP THE LIT TILE | Blast played
  4. LIT a card | BOX: "Blast clears several tiles at once and does NOT use your Grow." | tap anywhere
  5. LIT a card, then a tile | DISPLAY: CHOOSE A CARD → TAP THE LIT TILE | the Grow played
  6. Then the turn. Ends on points.
- **Finish:** YOU WIN / YOU LEARNED: BLAST A HOLE (✹)

## LEVEL 9 — THROW PILE (AND » IS OPTIONAL)

- **Setup:**
  - The Throw pile's top card (a 5) finishes the 3-4-5 in your hand.
  - Your tile -1,1 (4); their home's sides are held by 9s.
- **Beats:**
  1. LIT Throw pile | BOX: "The Throw pile glows gold when its top card completes a Bloom in your hand." | tap anywhere
  2. LIT Throw pile | DISPLAY: TAP THE THROW PILE | drawn from the Throw pile
  3. LIT Bloom | DISPLAY: TAP BLOOM | Bloom picked
  4. LIT the Bloom's tiles | DISPLAY: TAP THE LIT TILES | Bloom played
  5. LIT » (nothing lit while a power is still playable) | BOX: "Tap » to skip Grow/Bloom and keep
     your cards for later." | tap anywhere. Once; skipping is taught here, never required.
  6. LIT the Undo key | BOX: "You are able to undo your previous moves until you Throw a card at the
     end of your turn." | tap anywhere. Once, straight after the skip (owner, 2026-10-22).
- **Finish:** YOU WIN / YOU LEARNED: BLOOM FROM THE THROW PILE (↦)

## LEVEL 10 — FINALE

- **Setup:**
  - Gold 0,0, rock 0,1.
  - Your tile -1,1 (4); their tiles 1,-1 (4), 1,-2 (6), 2,-1 (7).
  - The gentlest bot (level 1). Draw pile: 14 cards.
  - **This is the first level that opens with the Who-starts ritual** (owner, 2026-10-24): the same
    card ceremony as a practice match and an online duel, before the board is yours. It presents the
    engine's starter — `authoredState` opens every lesson on your turn — and decides nothing.
    Levels 1-9 keep their authored openings and never show it.
- **Beats:**
  - Before the first draw, once: BOX: "You are ready now for your first game of Futasaku. Good
    luck!" | nothing lit, a tap anywhere dismisses it | no action line on the display (the box
    speaks, the display keeps the score). Skipped in a resumed game, where the draw has happened.
  - No guidance unless you are idle for 6 s: then the light and the action line on the display
    (never a lone word, never a button).
  - When the Draw pile is empty: DISPLAY: LAST TURN | BOX: "The Draw pile is empty – this is your
    last turn." | tap anywhere
- **Finish:** YOU CAN PLAY FUTASAKU / YOU LEARNED: THE WHOLE GAME (★), then Next: the big board.

Level 11 is the first 37-hex level. It has no lesson, and it also opens with the ritual.

## Turn counts (the player who follows the light)

Measured by the unit suite (`web/tests/lessons.test.ts`), counting the player's own turns:

| Level | Turns | Result (you – them) |
|---|---|---|
| 1 | 4 | 4–1 on points |
| 2 | 4 | 4–2 on points |
| 3 | 4 | 6–2 on points |
| 4 | 3 | 5–2 on points |
| 5 | 3 | 7–4 on points |
| 6 | 2 | surround |
| 7 | 3 | 6–2 on points |
| 8 | 2 | 7–2 on points |
| 9 | 3 | 12–4 on points |
| 10 | 3 | surround |

With the opponent growing every turn (2026-10-22). L2-L9 are all at or under five turns. L6, L8 and
L10 end sooner because the lesson's own move (or the finale's strongest attack) is the winning one;
no filler turn was added just to reach a count.
L1 is under 60 seconds in the browser test (about 16 s at 390x844).

## No Bloom before the Bloom lesson (owner, 2026-10-22)

"Make it impossible to have bloom in hand before the bloom lesson — things shouldn't confuse a
first-time player who doesn't know anything."

- **Levels 1-4 never offer a Bloom**, whatever the player does: `lessonAllows` drops it from the
  moves a lesson offers, and the page's session (`Session.allow`) uses the same list, so the Bloom
  key, the cards' Bloom glow, the combo brackets under the hand and the gold Throw pile never appear.
  The cards themselves are the engine's (a hand may hold three 4s); the game simply does not offer
  the move yet. Pinned by `web/tests/lessons.test.ts` (follow-the-light and 30 random players per
  level) and `web/tests/session-allow.test.ts`.
- The same rule holds for the Bomb (from level 7) and the Blast (from level 8).
- **L5 is the Bloom lesson.** Its opening hand is deliberately a set of three 3s.
- **L7, L8 and L9 come after L5**, so a Bloom may appear while they teach something else; the
  one-time BLOOM hello glows the cards once and never steers away from them.
