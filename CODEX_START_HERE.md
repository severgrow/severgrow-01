# Start work on Futasaku 0.4

1. Verify that the checkout is on `Futasaku0.3`; run `git status --short` and preserve any user work.
2. Read `AGENTS.md`, `README.md`, `docs/FUTASAKU_0_4_BASELINE.md` and `docs/SPEC.md`.
3. Install with `npm ci`. The current game uses `CHANNEL=futa04 npm run web:build` (or `web:dev`). A plain build is the retained historical live channel.
4. Run `npm run check` and relevant current-game browser scripts before declaring a change complete.
5. Commit and push only `Futasaku0.3`. Never change or deploy `main`, `dev` or frozen `Main2.0`.

The working directory may contain older Test2 checkouts. Do not move or reset them. If the current game requires a new public route, plan and verify that separately from gameplay work.
