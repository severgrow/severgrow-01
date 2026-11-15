# Latency probes (measurement only)

Throwaway measurement tools for the 2026-11-15 "action latency" report. They drive REAL gestures on
a real move and read the phases in the page; they never edit the app and are not part of any suite.

- `latency.ts` — tap a card, tap a legal hex, drag a card onto the Throw pile; per-phase p50/p95,
  long tasks, CDP metrics, the page's own `renderCosts()`. `MOVES`, `THROTTLE`, `DPR`, `BASE`,
  `BROWSER=chromium|webkit`, `PERSIST=1` (a service-worker second launch) as env vars.
- `pixels.ts` — "did it reach the screen": a CDP screencast, the first frame whose pixels differ
  from the pre-tap baseline, plus frames-per-second during the move.
- `frames-cost.ts` — a Chrome trace aggregated by event name (Paint, RasterTask, image decodes,
  UpdateLayoutTree, Layout) over one move, per move.
- `render-cost.ts` — tap → state and `renderCosts()` on WebKit at iPhone DPR, several builds in one
  process (a directory or a URL per target).
- `one-move.ts`, `fan-arrival.ts`, `layout-piles.ts`, `hand-*.ts`, `wk-frames.ts`, `deck-hit.ts` —
  narrower diagnostics used while localising the above.

Run with the repo's `tsx`:

```sh
PW_CHROMIUM="/path/to/Chrome for Testing" BASE=https://www.futasaku.com/test/ MOVES=6 \
  ./node_modules/.bin/tsx probe/latency.ts
```

Results are written to `/tmp/latency/*.json`. Numbers from these probes are recorded in
`docs/PERFORMANCE-RELIABILITY-2026-11.md`.
