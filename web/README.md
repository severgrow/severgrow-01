# Mycelium in the browser

A simple playable version of the game: you (green) against a bot (purple).
It lives entirely in this `web/` folder. It uses the rules engine in `src/engine/`
but never changes it, so the game in the browser follows exactly the same rules
as the tests.

## Play it

- **Online:** the GitHub Pages link (see "Publishing" below).
- **On your computer:** `npm run web:dev`, then open the address it prints.

## How the page works

- **Board:** tap any hex to see only the moves that use it. If just one move fits,
  it is picked for you. Gold hexes score double, grey hexes are rock.
- **Your cards:** tap a card to see only the moves that use it.
- **Your moves:** one button per legal move. Moves that change the board show a
  preview first (orange outline, new strengths on the hexes); tap **Play it** to
  confirm. Simple moves like drawing happen straight away.
- **What happened:** a running log of both players' moves. It never shows the
  bot's hidden cards.
- The game is saved on your device, so you can close the page and come back.
  Add `?seed=123` to the address to replay a particular shuffle.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout and the "How to play" rules |
| `src/main.ts` | Draws the board, cards and buttons; runs the turns |
| `src/bot.ts` | The bot: picks the legal move that gains it the most points |
| `src/names.ts` | Friendly names for hexes (like `E1`), cards and moves |
| `src/style.css` | Colours and layout, with light and dark modes |
| `tests/web.test.ts` | Checks the bot only makes legal moves and games finish |

## Publishing

`.github/workflows/pages.yml` builds this folder and publishes it to GitHub Pages
every time the repository's default branch changes. GitHub Pages must be switched
on once in the repository settings (Settings → Pages → Source: **GitHub Actions**).
