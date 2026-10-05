# Waiting for the locked beta

Everything changed in the test copy (`dev`, published at `/test/`) is listed here until it goes
into the locked beta (`main`). Nothing here is in the real game yet. When the user says
"lock it in", show this list and ask which items to include; then each chosen item goes through
the strict flow (tests first, full `npm run check`, the checks listed under it, the user's
go-ahead). Tick an item and add the date when it reaches `main`.

## Waiting

### Thumb layout and the idle tip (phones)
- Date: 2026-10-05 · Commit: `7254eeb` · In test only
- Phones held upright (touch, portrait, up to 600px wide). The hand is a curved fan rising from
  near the bottom centre to the right edge, the deck and throw pile sit side by side in the lower
  left, Undo and Sort in the free bottom-right corner, the "?" button is gone (How to play is in
  the menu). No hint row: its height goes to the board, and the step's tip shows as large faint
  words over the board after 4 seconds without a touch on my turn. Settings: Thumb layout
  On/Off, Hand side Right/Left (Left mirrors everything), Idle tip On/Off.
- Code: `web/src/logic/layout.ts` (the `thumb` variant of the one layout engine), the test-only
  `web/src/lab-mode/thumb.ts` and `lab-css.ts`, the lines in `web/src/main.ts` marked "thumb".
  Check: `web/e2e/thumb-check.ts`; screenshots in `docs/screens/thumb/`.
- Check before locking in:
  - card tap accuracy on real phones (every visible slice picks its card; 5, 8 and 10 cards);
  - the 360px width: the board's tiles drop to about 38pt with 8 cards, and a 10-card hand
    (Lab only) gets 32pt slices instead of 40;
  - Large text (the move buttons and the tip corner beside the fan);
  - left-hand mode on a real phone;
  - the idle tip on a crowded map (readable? the faint plate only when the map is busy);
  - the coach and first-time tips in the narrow corner beside the fan.

### Desktop: a proper coach and tip panel
- Date: 2026-10-04 · Commit: `dcc76c0` · In test only
- On wide screens the coach and first-time tips use the empty space above the deck and throw
  pile, at full size; with the coach on, the cards sit low in their column so the panel has room.
- Code: `web/src/lab-mode/lab-css.ts` (the "desktop" block).
- Check before locking in: the panel never overlaps the piles, the hand or the header at
  1280x800, 1440x900, 1600x980 and 1920x1080; move it into `web/src/style.css`.

### No Confirm box: tap again to place
- Date: 2026-10-04 · Commit: `a46a5e8` · In test only
- A waiting move shows no box; tapping the same card or hex again places it; another card or hex
  changes the choice; Undo after. The hint says "Tap again to place it".
- Code: `web/src/main.ts`, lines marked "the test copy: no Confirm box".
- Check before locking in: where the risk warning ("Your opponent could cut 4 of yours") goes
  now (the board's -3 badges already show it); the e2e tests that click `#confirm-play`; the
  coach's "Confirm" step.

### No owner marks on tiles
- Date: 2026-10-04 · Commit: `fe00c08` · In test only
- The circle on my tiles and the diamond on the opponent's are gone (moss and lava show whose).
- Code: `web/src/ui/board.ts`, `mark()`.
- Check before locking in: colour-blind readability without the marks, the "Low detail" look and
  the legend; remove or keep `youMark` / `botMark` (an accessibility setting?).

### Watch a game
- Date: 2026-10-04 · Commit: `ceeadeb` · In test only (inside the Lab)
- Two opponents play each other live; speed switch; Take over.
- Check before locking in: does it belong in the real menu (e.g. to learn from Level 9)? The
  pop-ups that still say "You" for the green side.

### The Lab: boards of any shape, reshuffle, longer games
- Date: 2026-10-04 · Commits: `04297e9`, `9afb814`, `4ef2ccd` · In test only
- Only if a preset proves fun. Needs SPEC changes, new golden games, and the tests listed in
  `docs/LAB-KNOWN-BREAKAGE.md` fixed.
