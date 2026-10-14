# FUTASAKU 0.4

Grow a living network. Keep it connected. Cut theirs.

Rules live in `src/engine/` (pure, deterministic). The browser client lives in `web/`.
**Source of truth:** [`docs/SPEC.md`](docs/SPEC.md). Work on branch **`futa0.4`**.

```sh
npm ci
npm run check
npm run web:build                    # CHANNEL=futa04 by default
CHANNEL=futa04 npm run web:dev
CHANNEL=futa-test npm run web:build  # experiment copy → /futa-test/
CHANNEL=futa05 npm run web:build     # /futa0.5/ preview: online duels + live duels
```

Live preview: `https://severgrow.github.io/severgrow-01/futa0.5/` (the merged FUTASAKU 0.5 build:
online duels, the polish pass, and live duels) · `…/futa0.4/` (the locked product build)  
Pre-cleanup archive branch: `archive/futa0.4-before-cleanup`

| Area | Home |
| --- | --- |
| Rules, actions, state, replay | `src/engine/` |
| Computer player | `src/bots/` |
| Browser wiring and input | `web/src/main.ts`, `web/src/logic/` |
| Futa04 presentation | `web/src/player/` |
| Board, cards, effects, audio | `web/src/ui/` |
| Save / settings / channels | `web/src/logic/persist.ts`, `web/src/channel.ts` |
| Online duel backend | `server/` (see [`docs/BACKEND.md`](docs/BACKEND.md)) |
| Spec | `docs/SPEC.md` |
| Checks | `tests/`, `web/tests/`, `web/e2e/` |

Player names: **Grow**, **Bomb**, **Blast**, **Bloom**. Engine ids `Sprout` / `PlayFruit` / `MegaBomb` remain for saves and tests.
