# Decisions (Bloom, layout, homes, polish: v0.7)

One line each: where the brief left room, what was chosen and why.

- "Never a straight line" is read as "never has to be one": the brief also says "no shape restrictions beyond being connected", so a straight chain is one legal shape among many.
- The action is a clean rename: `Bloom { cards, hexes }` replaces both old actions; the engine accepts the cards in any order (`hexes[i]` gets `cards[i]`); `legalActions` lists runs with the cards ascending.
- `legalActions` stays exhaustive: a set once per hex set, a run once per legal assignment. The worst case measured (a four of a kind plus a 4-card run, a wide network) is about 6,200 Blooms, listed in about 25 ms, so no cap was needed; `bloomChoices` gives the compact form (group, cluster, assignments).
- Five or more cards of a run: only runs of exactly 3 or 4 consecutive cards are listed (the brief's "any 3 or 4 consecutive cards").
- Error codes: a wrong size is `BLOOM_WRONG_SIZE`; cards with two numbers and mixed suits are `RUN_MIXED_SUITS` (neither a set nor a run); the old set/run codes stay for the other cases and for the parked deadwood rule.
- `bloomMustTouchNetwork: false` (engine only) simply skips the touching check; nothing in the page offers it.
- Bots fully score a short list of Blooms after a quick look at every legal one (10 by default): the best quick scores, the clusters most joined to my network (they protect thin links) and the strongest takeovers, so one purpose never crowds out another.
- Each card group is its own move kind; the moves row shows one button per family (a number for sets, a suit for runs) and size: a set keeps the card that fits the rest of the hand best, a run blooms its highest numbers; a picked card narrows it.
- Painting: the first tap on an empty shape also shows the suggested Bloom through that hex (with Confirm); tapping on keeps painting one hex at a time, so every Bloom can still be made by taps alone.
- The hint for a mouse says "Click to start your bloom, click to finish" (the longer wording did not fit one line on a 360px phone).
- Home wording: the code keeps "root"; the player reads "home", and tile cards and captions say "Your tree" and "Opponent's volcano" (strings: HOME). The coach's glossary word is now "home".
- The blocked-Bloom hint reads "Too few free hexes by your tiles to bloom 3" (it must fit one line); it shows when a held group has no legal Bloom and nothing is picked.
- Word scans: the old combo words and "root"/"roots" are banned with no player-facing allowlist; the only exemption is the scanners themselves (web/tests/bloom-words.test.ts and the scan line in web/e2e/smoke.ts), which must name the banned words.
- Board orientation: chosen by measuring both for the board zone (ties keep points left-right). Tile width is the distance between neighbouring tile centres. 390x844 and 430x932 turn the board (+14%, +15%); 360x640 keeps points left-right (+29% from the slimmer dock).
- The turned board is a rendering mapping only (logic/orient.ts): centres, corners, the point-to-hex lookups and the tile-shape tests of the painted textures go through it, so text, landmarks, textures and the top-left light stay upright. Each orientation paints its own tile textures (in the background).
- The board has no outer frame, rim or corner pins; its drawing area is the tiles plus 6 units of margin and half a tile of headroom at the top (for the home landmarks).
- The dock is three fixed rows: a message row (the hint line, or the forecast bar while a move waits for Confirm), the piles (with the Fruit chip beside them) and the hand. The hint and the forecast share one row because the empty forecast row read as a dead band under the board.
- Spare height above a width-limited board goes to the piles row and the message row first (up to 40pt each), so no gap around the board is over 16pt; the pile cards grow with it.
- The corner tools: shield top-left, target top-right, replay bottom-left, and Skip (only during animations) bottom-right; their one-time tooltip replaces the old "names for the first 3 games".
- Sort is an icon at the right end of the hand (32pt reserved); the smallest visible slice of a card in a full hand is 36pt (was 40) so a full hand of 8 still fits beside it at 360pt.
- The pill's clock "X turns left" is the smaller of the turn limit and half the deck (each round takes at least one card per player); the old unused end-of-game note was deleted.
- Gold hexes: a soft amber tint, a fine grain of tiny dots, a thin edge and the "2" badge (no stripes).
- Pile cards reuse the hand's card component scaled to the piles row (1:1.42); in the Draw step they glow softly and lift 2pt instead of a thick outline.
- Step 3: on tall phones the board is width-limited; spare height goes to the piles (up to +40pt) then the message row (up to +40pt), so no gap between zones exceeds 16pt.
- Step 3: the coach and first-time tips stop 104px short of the right edge while Undo shows, so they never cover the Undo chip.
- Step 4: my home is a small gnarled tree (round, soft shapes, a mint circle in its hollow); the opponent's is a faceted basalt volcano (angular, a red-orange diamond crater): shape alone tells them apart in greyscale.
- Step 4: the volcano is drawn as tall as the tree (peak at the same rise) with a thin light rim, so it stays readable on its dark lava tile and at 40pt.
- Step 4: the danger ring is drawn in the other side's colour on the blocked sides (red on my tree, mint on the volcano), with "N/6" under the tile; it never flashes.
- Step 4: idle motion (sway, falling leaf, smoke, breathing crater, embers) runs only with motion on and Effects above Low; Material detail Low draws the landmarks flat (no highlights, flowers or basalt layers).
- Step 4: the Strangle finish is pulse 380ms, hold 260ms, smother/wither 820ms, bloom/roar 480ms (1.94s at Normal), scaled down by speed; Reduce motion shows only the smother/wither (500ms).
- Step 4: home sounds: tree tap = soft rustle and a warm note; volcano tap = low rumble with crackles; smothered = a breathy sigh; withered = a low grind. All go through the existing sound toggle.
- Step 4: the strangled volcano keeps its ashen crater visible above the moss (the first draft hid it under a flat green triangle).

# Decisions (Seed removal and Fruit cards, v0.6)

One line each: where the brief left room, what was chosen and why.

- Seed mode in the code differed a little from the brief: it never blocked Sprout on turn 1; it made every one-card tile worth 1 and lifted the Strengthen limit so a seed could grow later. All of it is removed.
- The menu's two buttons ("Sprout" and "Seed") became one "New game" button; the version chip, the version picker, "Try the other version" and the per-version record are gone.
- The random number of the deal shows only on `?debug=1` (a small corner box); `?seed=N` still starts that deal but never shows the number. That page is the only word-scan allowlist entry.
- The word scan bans whole words only, so "seedling" (the level 1 icon's name in the docs) and "plants" stay allowed; none of them are shown to the player anyway.
- Old saved games, old tickets and the frozen bots-v0.5 were deleted (fast mode); the goldens are re-recorded on the current rules.
- The Strengthen limit stays as configured (2 per game); the brief says keep Strengthen as is.
- "An empty turn" means a Grow step whose only legal move is ending it; in 200 level-7 games (3,581 Grow steps) it never happened, so the test uses a built "all 9s" board.
- "A plain throw never needs a second confirmation": throws never ask, except throwing your very last card under Confirm "Always" or "Smart" (unchanged; that throw ends your hand).
- The opponent's turn is worked out at its start (same moves the bot picks step by step), only to set the pace; an empty one runs on 200ms of beats and shows for about 400ms in total.
- After an Undo of an auto-skipped Grow step, the game shows the reason and Continue instead of skipping again (no loop).
- A Fruit card is `{ id, suit: null, rank: 0 }` (ids 72-75 after the 72 numbered cards): "no suit, no number" in plain JSON, and rank 0 makes it count 0 for the parked Rot/Knock.
- All Fruit cards are alike, so `legalActions` lists the lowest-id one once per target (like identical number cards); any Fruit card id is still accepted by `apply`.
- "Fruit cards not yet seen" = 4 − mine in hand − played − in the throw pile − those I saw the opponent take from the throw pile (`fruitKnown`, dropped when they play or throw Fruit cards).
- A Fruit card does not use the turn's Sprout, and the Strangle check after it can only end the game if a root was already surrounded (removing a tile only empties a hex).
- The recorded v0.3.1 replays (they used the old 3-tile Fruit) were deleted with the old Fruit; `legacyV03` now only switches the parked rules on for their tests.
- The old Fruit's sacrifice-picking UI (tile card "Fruit this tile", Change/Next, its screenshots and peek scripts) was deleted; a Fruit card is played like a Sprout (card, then target) or from the tile card's "Use Fruit card".
- "Consider Strangle": a Fruit card can never surround a root by itself, so the bots look for a Fruit card that opens a Strangle (a Sprout or combo this turn then wins); levels 4-9 always take it.
- Levels 1-3 play a Fruit card at a random moment with a seeded 35% / 30% / 30% chance per Grow step holding one; levels 1-2 throw one away with 25% / 15% per Throw step holding one.
- "High strength" for levels 4-6 = 7 or more; "big cut" = 3 or more tiles removed in all.
- A slip (the levels' mistake rate) never picks a move the bot rules out altogether (a Fruit card throw, a Fruit card it would keep); this also applies to Strengthen moves ruled out.
- Fruit card defaults chosen by simulation (SPEC 11.4): 4 cards, root counts as touching; two targets fail and are reported (Fruit played in 99.9% of games; 17.6% of games end with >30% top-rank tiles).
- "Game length within 10% of the current default" compares with the v0.5 default (9.14 turns each), the last default before this change.
- Fast mode, saves: the saved-game key moves to severgrow.save.v6 and a save from older rules (no Fruit card fields) is dropped; the player starts a fresh game.
