# Futasaku

A two-player hex card game in the browser: draw a card, grow your network from your home, throw a
card. Keep everything joined to your home, and cut your opponent's links. You play against a
computer opponent at five difficulties.

- **Rules:** [`docs/SPEC.md`](docs/SPEC.md) (the source of truth).
- **How to work on it:** [`AGENTS.md`](AGENTS.md) (branches, checks, the quick `TEST:` mode).
- **The game:** branch `futa0.4`, published at `https://severgrow.github.io/severgrow-01/futa0.4/`.
- **The test copy:** branch `futa-test`, published at `https://severgrow.github.io/severgrow-01/futa-test/`.

## Run it

Node 20.19 or newer.

```sh
npm ci
npm run web:dev        # play locally
npm run web:build      # build into web/dist
npm run check          # strict types + every unit test
```

## What is where

| Area | Home |
| --- | --- |
| Rules, state, replay (pure, deterministic) | `src/engine/` |
| The opponent's levels | `src/bots/` |
| Player words | `src/strings.ts` |
| The page | `web/src/` (`main.ts`, `logic/`, `player/`, `ui/`) |
| Tests | `tests/`, `web/tests/`, `web/e2e/` |
| Docs | `docs/` (`SPEC.md`, `DECISIONS.md`, `WAITLIST.md`, `BOT-TACTICS.md`, `LADDER.md`) |
| Old records | `docs/archive/` |

## History

Futasaku grew out of Severgrow/Severor (the old game, still on `main` at the site root). Everything
removed in the Futasaku 0.4 cleanup (the old live and test channels, the Lab, DESIGN and V3 art) is
kept on the branch `archive/futa0.4-before-cleanup`. The rules history is in
[`docs/archive/SPEC-HISTORY.md`](docs/archive/SPEC-HISTORY.md).
