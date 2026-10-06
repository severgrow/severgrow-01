# Futasaku 0.3

The browser game lives in `web/`; its deterministic rules live in `src/engine/`.
This branch starts from the frozen Test2/Main2.0 commit
`89d438c1b3fca253292d1b8a9eabffcf5e2da315`. The current Futasaku game is
the `test2` build:

```sh
npm ci
CHANNEL=test2 npm run web:build
CHANNEL=test2 npm run web:dev
npm run check
```

`web/dist/` is the production output. The plain `npm run web:build` command
still targets the historical live channel; use `CHANNEL=test2` when checking
the Futasaku 0.3 game. No rule or save format was changed in this baseline.

| Area | Home |
| --- | --- |
| Rules, actions, state and deterministic replay | `src/engine/` |
| Computer player | `src/bots/` |
| Browser wiring and input | `web/src/main.ts`, `web/src/logic/` |
| Test2 presentation and responsive layout | `web/src/player/` |
| Board, cards, effects and audio | `web/src/ui/` |
| Optional V3 board art | `web/src/ui/skin/`, `web/src/skins/`, `web/public/design-v3/` |
| Save and settings compatibility | `web/src/logic/persist.ts`, `web/src/logic/settings.ts`, `web/src/channel.ts` |
| Rule specification | `docs/SPEC.md` |
| Unit and browser checks | `tests/`, `web/tests/`, `web/e2e/` |

The historical Test and live channels remain in this repository because some
shared tests and build checks still exercise them. Their Lab and Design assets
are not part of the Test2 build. See
[`docs/FUTASAKU_0_3_BASELINE.md`](docs/FUTASAKU_0_3_BASELINE.md) for the
cleanup inventory and retained compatibility identifiers.
