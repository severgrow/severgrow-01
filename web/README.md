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
- "the game ends when the deck runs out" is now an engine rule for both modes
  (spec v0.3.1); the page's own Lite check (`settle`) is kept as a harmless safety net.

## How the page works

- **Board:** tap any tile to see how many tiles would be lost if it were cut (they
  turn red), and to see only the moves that use that hex. A red **!** marks your
  weak spots the bot could cut. Gold hexes score double, grey hexes are rock.
- **Your cards:** tap a card to see only the moves that use it.
- **Your moves:** one plain sentence per move, like "Grow a line of 3 tiles from E3
  toward the bot (+4 points)". Board moves show a preview first; tap **Play it**.
  A ⚠ and a red note warn you when a move would let the bot cut off a big piece
  of your network.
- **Coach:** for the first 15 moves of a game, a coach box suggests the best move
  ("Suggested"), says why in plain words ("Why", built from real facts about the
  move), and teaches one tactic at a time ("Tactic tip"). Buttons: **Show me**,
  **Do it for me**, **Not this, show another**. The suggested cards and hexes glow
  green. At move 15 it sums up three things to remember. The **Coach: ON/OFF**
  switch at the top hides or shows it at any time and is remembered on your device.
  **Tutorial game** always deals the same game (seed 296), so its 15 coached moves
  are always the same; **Restart tutorial** starts a fresh game with the coach on.
  The coach logic lives in `src/playtest/coach.ts` and uses GreedyBot's scoring
  (`src/bots/GreedyBot.ts`), which is also the bot you play against.
- **What happened:** a running log of both players' moves. It never shows the
  bot's hidden cards.
- The game is saved on your device, so you can close the page and come back.
  Add `?seed=123` to the address to replay a particular shuffle.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout and the 3-line summary |
| `src/main.ts` | Draws the board, cards and buttons; runs the turns |
| `src/presets.ts`, `src/analysis.ts`, `src/names.ts` | Re-export the shared logic from `src/playtest/` |
| `src/bot.ts` | The bot: GreedyBot from `src/bots` (no Knock in Lite) |
| `src/style.css` | Colours and layout, with light and dark modes |
| `tests/*.test.ts` | Lite rules, move sentences, danger maths, bot games (coach tests are in `tests/playtest`) |

## Publishing

`.github/workflows/pages.yml` builds this folder and publishes it to GitHub Pages
every time the repository's default branch changes. GitHub Pages must be switched
on once in the repository settings (Settings → Pages → Source: **GitHub Actions**).
