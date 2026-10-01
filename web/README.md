# Mycelium in the browser

A simple playable version of the game: you (green) against a bot (purple).
It lives entirely in this `web/` folder. It uses the rules engine in `src/engine/`
but never changes it, so the game in the browser follows exactly the same rules
as the tests.

## Play it

- **Online:** the GitHub Pages link (see "Publishing" below).
- **On your computer:** `npm run web:dev`, then open the address it prints.

## Lite and Classic

Use the switch at the top of the page. New players start on **Lite**.

- **Lite** keeps growing tiles, cutting links (Sever), surrounding the root
  (Strangle), scoring and gold hexes. It removes Rot, Fruit and Knock, so the game
  simply ends when the deck runs out and the higher score wins.
- **Classic** is the full rule set from `docs/SPEC.md`.

Both are only engine settings (`RulesConfig`, see `src/presets.ts`); the engine's
rules are not changed. Two Lite details are handled by the page, because a setting
alone cannot express them:

- the engine always allows Knock with a perfect hand (0 leftover points), so the
  page never offers Knock in Lite and the bot never uses it;
- the engine only ends a game when a refill comes up short, so in Lite the page
  ends the game as soon as a turn would start with an empty deck (scored with
  the engine's own deck-exhaustion result).

## How the page works

- **Board:** tap any tile to see how many tiles would be lost if it were cut (they
  turn red), and to see only the moves that use that hex. A red **!** marks your
  weak spots the bot could cut. Gold hexes score double, grey hexes are rock.
- **Your cards:** tap a card to see only the moves that use it.
- **Your moves:** one plain sentence per move, like "Grow a line of 3 tiles from E3
  toward the bot (+4 points)". Board moves show a preview first; tap **Play it**.
  A ⚠ and a red note warn you when a move would let the bot cut off a big piece
  of your network.
- **Guided first turn:** the first game walks you through draw, play and throw away.
  "Show me how to play again" at the bottom replays it.
- **What happened:** a running log of both players' moves. It never shows the
  bot's hidden cards.
- The game is saved on your device, so you can close the page and come back.
  Add `?seed=123` to the address to replay a particular shuffle.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout and the 3-line summary |
| `src/main.ts` | Draws the board, cards and buttons; runs the turns |
| `src/presets.ts` | The Lite and Classic rule settings |
| `src/analysis.ts` | "What if" maths: what a move does, what a cut would cost |
| `src/coach.ts` | The guided first turn |
| `src/bot.ts` | The bot: picks the legal move that gains it the most points |
| `src/names.ts` | Plain sentences for moves; names for hexes (like `E1`) and cards |
| `src/style.css` | Colours and layout, with light and dark modes |
| `tests/*.test.ts` | Lite rules, move sentences, danger maths, tutorial, bot games |

## Publishing

`.github/workflows/pages.yml` builds this folder and publishes it to GitHub Pages
every time the repository's default branch changes. GitHub Pages must be switched
on once in the repository settings (Settings → Pages → Source: **GitHub Actions**).
