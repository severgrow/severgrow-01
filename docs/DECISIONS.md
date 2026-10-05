# Decisions (Bloom, layout, homes, polish: v0.7; UI pass: v0.8)

One line each: where the brief left room, what was chosen and why.

## Positioning pass (v0.8.1)

- "Points-up/down family" in the brief: on phones the board already uses the family that gives bigger tiles, which is points left-right in the code ("flat"). I kept that family; its neighbour directions include straight up, so the homes can be exactly vertical.
- Home axis: the board turns in steps of 60 degrees within its family. This is display only: engine coordinates, saves and replays never change.
  - Phones: the volcano is at the top and the tree at the bottom, on the centre line.
  - Points-up-down boards (the 768x1024 tablet and desktop, where that family gives tiles 8% bigger: 107 vs 99pt): my tree on the left, the volcano on the right, level.
- Equal gaps: the two lattice vectors are rounded to whole device pixels once, and every centre is built from them.
  - Of the roundings next to the true vectors, the one with the most equal neighbour distances wins.
  - Drift is at most 1.5 device pixels per step out from the centre, symmetric, so the board stays centred.
  - The painted world uses the same lattice.
- The board's area now matches the layout exactly. The CSS had an 8px margin against the layout's 4px, plus a 6px bottom padding that lifted the board 3px.
- Header: equal side columns (`minmax(0, 1fr)`) put the turn pill exactly on the centre line; before, "Opponent" being wider than "You" pushed it 14pt left at 390x844.
  - The sides now mirror: You ◯ 0 | pill | 0 ◆ Opponent.
  - When either side doesn't fit (a 360px phone with Large text, long scores), both words go together, so the sides stay mirrored. The marks, colours, labels and a tooltip still say whose score it is. No word is ever cut off.
- "?" (How to play): it stays a round corner tool, bottom-right, paired with the bottom-left slot. That slot always holds Replay (dimmed until the opponent has moved), or Skip while an animation plays. The four corners are always two mirrored pairs, and How to play stays one tap away.
- Hint: it sits in the pile row, centred, with the move buttons under it; the deck and the throw pile mirror each other on either side. The hint row is gone.
  - Hints are 28 characters at most. The longest measures 163px at 14pt, so it fits on one line; the centre column is at least 172px.
  - Both pile columns are the same width (the throw pile's label with its count needs 72px), so the pair is a true mirror.
- Hint weight: full for my first 3 turns, then quieter (muted, regular weight) for the everyday hints (draw, sprout, throw). It returns to full when it says anything else, or after 6 seconds on my turn with no tap.
- Undo and Sort: fixed 28pt slots at the two ends of the hand row (44pt touch area), with the fan centred between them. Each is always shown, dimmed and disabled when it has nothing to do, so neither ever appears alone and nothing moves.
- Confirm: the forecast bar covers the whole pile row while a move waits, so the dock never changes height.
- Spare height: on 390x844 and 430x932 the board already spans the full width, so the hint row's height can't make it bigger. The pile row first takes room for its largest piles plus 16pt above and below, then the hand row takes up to 32pt. Whatever is left goes equally above and below the board, never as dead space inside the dock. The old "no gap over 16pt" layout test now applies whenever the board doesn't span the full width. When it does, the test checks that the dock rows already took what they can use.
  - Tiles at 360x640: 49.6 to 54.9pt (+11%). 390x844 and 430x932: unchanged (width-limited).
- Hand cards stay at most 72pt wide. 84pt was tried: then a card's middle hides under the next card in a full hand (a card wider than twice its visible slice).
- Footprint: rock shadows and edges, tile contact shadows and the home mounds' contact shadows now stay inside their own hex, still offset down-right (away from the top-left light). Grass and lava pictures still overlap their neighbours by design (one lawn), so I left that as it is.

## v0.8 UI pass

- Rule (asked for by the user): a Fruit card uses the turn's Sprout, so a turn has one Sprout, one Strengthen or one Fruit card. Blooms are unaffected. The error for a second one is `SPROUT_LIMIT`, the same as a second Sprout. `fruitUsesSprout: false` brings back v0.6/v0.7 play (the legacy test preset uses it, since it has no Sprouts at all).
- The step's name stays "Grow" (user's choice), and the game's name stays Severor.
- The Draw / Grow / Throw bar is gone. The hint line now carries the turn:
  - it offers the Fruit card next to the sprout;
  - it says "Fruit used" or "Sprouted" once the sprout is used;
  - it always ends at "Throw a card".
- The height freed by the bar, the landmarks' old headroom, and thinner margins (the zone keeps 4pt a side, the board 2 units) all go to the board. On tall phones the board is limited by the width, so the gain there is small (+2-4%); 360x640 gains most.
- Orientation is still chosen by measurement. Without the headroom, 360x640 now picks flat hexes too, by a hair (50.0pt against 49.7pt tiles; v0.7 had 47.6pt).
- When the board cannot use more height, the spare goes to the piles row first (up to +40pt), then the message row (up to +40pt), then the hand row (up to +32pt). This keeps the gaps at 16pt or less.
- The "?" is a fifth corner tool in the board zone's lower-right corner. That corner is usually empty: hex corners leave it free in both orientations, and the layout tests check this. During animations the Skip button takes the corner and the "?" hides.
- The "Fruit cards unseen" chip is gone: no hidden-information indicator. The engine still keeps the public count for the bots.
- Piles row: 84pt minimum (was 72), so the pile cards are about 25% taller. The labels and counts are unchanged; the old chip's slot gives them room.
- Fruit card: the numbered cards' layout (corner index, centre icon), with the mushroom in both places. Bone cream, because Ash is already lavender and the four suit colours, gold and both player colours are taken.
- Homes are drawn top-down inside their own hex:
  - a round apple-tree canopy, with the mint circle marker at its heart;
  - a 3/4 aerial volcano, with the diamond crater as its marker.
  The home tile has no number plate, and the danger ring and count are drawn above the landmark, so no tile information is hidden. The old "rise a quarter tile" headroom is gone.

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
- The dock is three fixed rows: a message row (the hint line, or the forecast bar while a move waits for Confirm), the piles (v0.8: no Fruit chip) and the hand. The hint and the forecast share one row because the empty forecast row read as a dead band under the board.
- Spare height above a width-limited board goes to the piles row and the message row first (up to 40pt each), so no gap around the board is over 16pt; the pile cards grow with it.
- The corner tools: shield top-left, target top-right, replay bottom-left, and Skip (only during animations) bottom-right; their one-time tooltip replaces the old "names for the first 3 games".
- Sort is an icon at the right end of the hand (32pt reserved); the smallest visible slice of a card in a full hand is 36pt (was 40) so a full hand of 8 still fits beside it at 360pt.
- The pill's clock "X turns left" is the smaller of the turn limit and half the deck (each round takes at least one card per player); the old unused end-of-game note was deleted.
- Gold hexes: a soft amber tint, a fine grain of tiny dots, a thin edge and the "2" badge (no stripes).
- Pile cards reuse the hand's card component scaled to the piles row (1:1.42); in the Draw step they glow softly and lift 2pt instead of a thick outline.
- Step 3: on tall phones the board is width-limited; spare height goes to the piles (up to +40pt) then the message row (up to +40pt), so no gap between zones exceeds 16pt.
- Step 3: while Undo shows, the coach and first-time tips stop 120px short of the right edge and the Undo chip sits above them, so it is never covered (CI's slightly wider fonts showed the gap alone was not enough).
- Step 4: my home is a small gnarled tree (round, soft shapes, a mint circle in its hollow); the opponent's is a faceted basalt volcano (angular, a red-orange diamond crater): shape alone tells them apart in greyscale.
- Step 4: the volcano is drawn as tall as the tree (peak at the same rise) with a thin light rim, so it stays readable on its dark lava tile and at 40pt.
- Step 4: the danger ring is drawn in the other side's colour on the blocked sides (red on my tree, mint on the volcano), with "N/6" under the tile; it never flashes.
- Step 4: idle motion (sway, falling leaf, smoke, breathing crater, embers) runs only with motion on and Effects above Low; Material detail Low draws the landmarks flat (no highlights, flowers or basalt layers).
- Step 4: the Strangle finish is pulse 380ms, hold 260ms, smother/wither 820ms, bloom/roar 480ms (1.94s at Normal), scaled down by speed; Reduce motion shows only the smother/wither (500ms).
- Step 4: home sounds: tree tap = soft rustle and a warm note; volcano tap = low rumble with crackles; smothered = a breathy sigh; withered = a low grind. All go through the existing sound toggle.
- Step 4: the strangled volcano keeps its ashen crater visible above the moss (the first draft hid it under a flat green triangle).
- Step 5: the one-tap suggestion ranks Blooms through the tapped hex by tiles gained, then opponent tiles replaced or cut, then the fewest of my tiles left open to a cut, then engine order (deterministic).
- Step 5: the first painting tip loops a finger over a bent cluster of three hexes (not a straight strip), because a Bloom can be any connected shape.
- Step 6: Bloom bands: levels 1-3 skip a Bloom 45% / 35% / 25% of the time they would play one, otherwise pick a random legal Bloom (seeded); 4-6 the best quick look; 7-9 the full short-list score; 8-9 hold a plain 3-card Bloom when the chance of a 4 over the next (at most 3) draws is at least 20% and the best other move costs at most 2.5 points.
- Step 7: the autosave is seed + action list + rules version (key severgrow.save.v7); a save from other rules or with an action the rules refuse starts fresh. A game started from a set position (browser tests, the lab) also keeps that position as `base`; ordinary games never write one.
- Step 7: two audio buses (effects, music) with 0-100 sliders on a squared curve (defaults 80 and 60); the Sound and Music toggles still switch them off; a limiter (-6 dB, 20:1, 3 ms) on the master.
- Step 7: the in-game menu is the pause menu ("Paused"): while it (or a sheet opened from it) is open, the next animation step and the opponent's moves wait and CSS animations on the board hold still.
- Step 7: the first-run welcome card shows the three turn steps with icons (Draw, Grow, Throw), the goal, and the tutorial suggestion; its words live in src/strings.ts (WELCOME).
- Step 7: keyboard: D draws from the deck, T takes the throw pile, U undoes (only when Undo shows), next to the existing 1-9, Tab, arrows, Enter, Backspace and Esc.
- Step 7: motion tokens tap 80 / quick 160 / move 280 / moment 600 ms, ease-out and ease-spring, kept equal in CSS and code by a test.
- Step 7: the settings groups stay as they were (Look; Sound and feel; Animations; Playing); the volume sliders join Sound and feel.
- Step 8: the ladder runs 1,000 games per pairing, as asked (swapped starts, 4 processes).
- Self-critique (main screen, round 1): with two or more ways to bloom, the Bloom buttons ran off the right edge of the dock. Now one "Bloom" button ("N ways") opens a list of choices upward over the message row; each choice shows its card numbers in suit colours, so "Bloom 4 tiles" from 3-4-5-6 and from four 6s are told apart. A single way keeps its own button.
- Self-critique: the "Fruit cards unseen: N" chip is now the Fruit card icon and the number (the full words stay as its spoken label and tooltip), freeing room in the dock row.
- Step 9: rotating the phone mid-paint keeps the half-painted shape (nothing is placed); painting carries on afterwards.
- Step 9: the first-tap time is measured with a cold cache on a slow connection (1.6 Mbit/s, 150 ms) and the CPU 4x slower.
- Step 9 (performance): the background grass and lava painting now runs only in idle time, after the first paint; before, its back-to-back slices delayed the menu's first paint (first tap at 4x CPU: 6.4 s -> 2.1 s).
- Step 10: the installable app (manifest, icons, offline service worker) already existed and is kept; the share preview is a 1200x630 image drawn in code (web/e2e/og-image.ts) and committed as web/public/og.png, with og/twitter meta tags.
- Step 10: local playtest notes appear only on ?debug=1 (turn times, Undo count, empty turns, the longest pause and where it ended), kept in this browser (severgrow.playnotes.v1), with "Export as JSON"; nothing is sent anywhere.
- Step 10: set dressing (decorative props outside the board) is not done: cut as the lowest-value item.

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
- Lab (TEST, lite): Classic = no board override (`board: null`), so the classic game's own terrain generation is untouched; Lab boards set `config.board`.
- Lab: with reshuffle on, the game also ends when every card is on the board or in a hand (nothing left to draw, not even after a reshuffle); before this it froze.
- Lab: bot caps apply only on Lab boards (`config.board` set): 4 candidates (not 6), 3 imagined hands (not 6), 12 other replies per hand, 300 Bloom choices per quick look. The classic game's opponent is unchanged.
- Lab: a Lab board's `boardRadius` is how far its farthest hex is from the centre (hex names and sizes use it); rows past Z are named by coordinates.
- Lab: an active experiment also applies to "New game" from the menu, until "Back to Classic".
- Lab: one finger on empty space pans a zoomed board; one finger on a hex still taps or paints, as before.
- Lab: "Homes: near centre" picks the pair about 4 steps apart (the shortest distance that gives no warning).
- Lab: the "bots play each other" feature is called "Watch a game": green (my seat) and red each have a level; "Take over" hands green back to me; watched games are not counted in stats.
- Thumb layout (TEST): the waitlist already existed as docs/LIST-TO-IMPLEMENT.md; it is renamed docs/WAITLIST.md ("Waiting for the locked beta") and every earlier test change is listed there with its date and commit.
- Thumb layout: "phone" = touch screen (coarse pointer), portrait, at most 600px wide; the settings live in the test copy's own storage and appear in Settings under "Phone layout (test copy)".
- Thumb layout: the cards are turned with the arc (a real fan: each card's top points away from the arc's centre); turning them less would shrink the visible slice under 40pt.
- Thumb layout: when space runs out, the order of give is: slightly smaller cards, then the board's 44pt tiles (the dock may take up to 60% of the height), and only then the slice (never under 30pt). A normal hand (8 cards) keeps 40pt+ slices on a 360x640 phone; its tiles drop to about 38pt. A 10-card hand (Lab only) on 360x640 gets 32pt slices.
- Thumb layout: the fan is sized for the game's largest hand (hand size + 1); a smaller hand spreads wider (up to 85% of a card per slice) and stays centred on the arc. Spare height (a board limited by the width) goes to the fan, so there is no empty strip.
- Thumb layout, left hand: the whole layout is mirrored and the cards stack the other way, so every card's number corner stays visible.
- Thumb layout: the move buttons sit in a column over the piles; the coach and first-time tips in the free corner above them, beside the fan (at least half the screen wide). The "?" button is hidden; How to play was already in the in-game menu.
- Idle tip: shown only with the thumb layout (where the hint row is gone); placed in the top, middle or bottom third of the board, whichever has the fewest tiles and rocks (ties: top, then bottom); a 15% soft plate only when more than 4 things are under it.
- The game has no drag-to-throw today (a card is thrown by tapping it, or tapping it and then the throw pile); both still work.
- Thumb layout, after the user's touch map: the piles move to the top left of the card area (just under the board), the fan starts about 36% across at the bottom and passes under them; the move buttons sit under the piles; the coach and first-time tips float just above the cards, 44% wide on the left (clear of my home at the bottom middle).
- Thumb layout, bigger map: the fan is packed using each card's real turned outline (not its diagonal), pushed to the bottom and right edges, and the empty height above it goes to the board; only 4pt is kept above the top card (a picked card lifts briefly into the air above). Card sizes are tried biggest first, each with a 42pt then a 40pt slice. On a normal phone the classic board already spans the full width, so it can't grow there; small phones and tall Lab maps gain the most.
- Thumb layout v2: a gently tilted fan of 10 cards at 40pt needs about 400pt of width, more than a phone has beside the piles; so the dock has two bands: the fan (full width, anchored at the right edge, small hands sit by the right thumb) above a bottom band with the piles (left), the move slot and Undo/Sort (right). Hands over 8 cards (Lab only) get thinner slices (32-36pt) rather than a smaller map.
- Thumb layout v2 numbers: cards 48pt wide (64 before, 25% smaller; 40pt at the smallest), slice 42pt (40 at least), end tilt 7 degrees, rise 10% of the fan's width, picked-card lift 10pt, piles 52pt columns with 48pt cards, dock cap 40% of the usable height, overlap at most 15% of the board's height.
- Smart overlap only applies when the board is held back by the height (a board already as wide as the screen can't grow). "Nothing can be played there this turn" = more than 4 hexes from my network (a Bloom's reach) and more than 1 from the opponent's; target highlights and a Bloom being painted cancel it at once. The see-through fan comes back to full strength for 3 seconds after any touch on the card area.
- Thumb layout v2: the pile labels sit over their counts (the narrower piles); "Skip sprout" keeps its words but is a small pill in the fixed move slot.
