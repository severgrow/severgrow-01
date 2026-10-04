# The list to implement

Things tried in the test copy (`dev`, `/test/`) that should later come to the main game
(`main`, the site root). Each one moves over with the strict flow ("lock it in"): tests first,
full `npm run check`, then the user's go-ahead. Tick an item off when it is on `main`.

## Waiting

- [ ] **Desktop: a proper coach and tip panel.** On wide screens (board left, cards right) the
      coach and first-time tips use the empty space above the deck and throw pile, at full
      size: title, the whole sentence, the tip line and full-size buttons. The deck is never
      covered. With the coach on, the cards sit low in their column so the panel has room.
      Now in the test copy: `web/src/lab-mode/lab-css.ts` (the "desktop" block). On main:
      move it into `web/src/style.css` and add a layout check (the panel never overlaps the
      piles, the hand or the header at 1280x800, 1440x900, 1600x980, 1920x1080).

- [ ] **No Confirm box: tap again to place.** When a move waits for confirmation, no box with
      the forecast and Cancel/Confirm appears. Tapping the same card or the same hex again places
      the move; tapping another card or hex changes the choice; Undo still takes it back after.
      The hint line says "Tap again to place it". Now in the test copy (`web/src/main.ts`, the
      lines marked "the test copy: no Confirm box"). On main: decide where the risk warning
      ("Your opponent could cut 4 of yours") goes now that the box is gone (the board's -3 badges
      already show it), update the e2e tests that click `#confirm-play`, and the coach's
      "Confirm" step.

- [ ] **No owner marks on tiles.** The small circle on my tiles and the diamond on the
      opponent's tiles are gone: the moss (green) and lava (red) materials already say whose tile
      it is. Now in the test copy (`web/src/ui/board.ts`, `mark()`). On main: check colour-blind
      readability without the marks (moss vs lava texture, the opponent's pattern), decide what
      the "Low detail" look and the legend show, and update the theme fields `youMark` /
      `botMark` (remove or keep for an accessibility setting).

## Lab ideas that could become real features

- [ ] **Watch a game** (two opponents play each other). Could be a menu option in the main
      game too, e.g. to learn from Level 9.
- [ ] **Bigger boards and longer games** (shapes, reshuffle, turn limit), if a preset proves
      fun. Needs SPEC changes and new golden games.

## Small fixes noticed in the test copy

- [ ] While watching a game, some pop-up messages still say "You" for the green side.
