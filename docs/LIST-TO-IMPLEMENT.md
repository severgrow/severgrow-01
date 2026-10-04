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

## Lab ideas that could become real features

- [ ] **Watch a game** (two opponents play each other). Could be a menu option in the main
      game too, e.g. to learn from Level 9.
- [ ] **Bigger boards and longer games** (shapes, reshuffle, turn limit), if a preset proves
      fun. Needs SPEC changes and new golden games.

## Small fixes noticed in the test copy

- [ ] While watching a game, some pop-up messages still say "You" for the green side.
