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
