# Seeds and the shared world (FUTASAKU 0.5)

Status: implemented on isolated `futa0.5-world-seeds` branch; **not deployed**. The existing 0.5 match engine and published preview remain authoritative until the online owner integrates this branch.

## Ownership and economy

- The world is one versioned, frozen 183-cell axial hex map. Its cell IDs are `q,r`. Future expansions add IDs without moving old IDs. Historical 8×8 `world_tiles` owners are copied into the central 64 positions by migration `0011_seeds_world.sql`; the historical table and migration remain intact.
- A player's first claim may be any unowned cell. Later claims require an unowned neighbour of at least one of that player's cells. Each claim costs exactly 100 Seeds. Owners never lose cells through map claims, account renames, or game results. Server-held player IDs determine ownership; display names are presentation only. Player colour is a stable hash of that ID.
- A Seed wallet, immutable signed ledger and one receipt per source back every credit/debit. A Postgres transaction locks the wallet; a global world revision row serializes claims before occupancy/adjacency checks. Concurrent buyers cannot take the same cell or overspend. A duplicate purchase request replays the original receipt without another charge.
- `server/src/seeds/config.ts` is economy version 1. Official Find Opponent queue: win 30, loss 8, draw 12, first 20 paid matches per player/UTC day, five paid results against the same opponent/day. Friend duel: 15/4/6, first 10 paid/day, three against the same opponent/day. Training: 10/3/0, first five paid/day. Repeatable awards also share a 600 Seed/UTC-day cap. A cap slot is consumed only when a valid completed result actually receives Seeds. Resignations/timeouts pay nothing.
- Campaign first clear pays 50 for each level 1–3; 15 for 4–20, 20 for 21–40, 25 for 41–50. Completing levels 10/20/30/40/50 adds 50/60/75/90/125. Campaign is outside daily repeatable caps. Only levels currently authored in the client can be claimed; the schedule is ready for future levels.

## Proof, identity and visibility

- Online rewards use only server-stored queue/friend identity and finished engine result. Campaign and Training claims submit a bounded action log; the server recreates the official opening and deterministic bot actions and rejects an unfinished, altered or invalid replay. Training uses a server-issued seed/difficulty ticket that can settle once. No browser endpoint can adjust a wallet directly.
- Browser-local pending offline proofs are explicitly **not** spendable. The menu retries them after reconnect. A Training game started without a ticket remains playable but cannot receive Seeds. Game-over copy distinguishes pending verification from credited Seeds.
- Guest-to-account upgrade retains the canonical player ID, wallet, claims and match history. Nickname changes appear through refreshed public world reads. Guest cleanup must preserve any player with earned/spent Seeds or claims.
- `GET /v1/world` is public: geometry, owner ID/name/tag/colour, claim time, cost and revision. No balance, account email, hidden match state or token is public. Authenticated `GET /v1/seeds/wallet` returns only the caller's wallet. Claims require a bearer token and a stable request ID. The browser polls while the world is visible, stops when hidden, and keeps pan/zoom separate from ownership state.
- The first 100 Seeds invitation is local menu presentation backed by a server-side seen flag. It does not award or reserve territory.

## Rollout

1. Confirm with the online owner that their active changes are integrated; rebase this isolated branch and rerun the 0.5 suites.
2. Review/test `0011_seeds_world.sql` against a **staging copy** of the production schema and back up the live database. The historical cron migrations need the production `pg_cron` environment; local tests may exclude only those two historical cron files.
3. Deploy the schema and Edge bundle together in a coordinated cutover. The old automatic `world_tiles` award path must not keep writing between the historical-owner copy and new Edge activation, or a final backfill must be applied. Never expose new UI before the matching API/schema are live.
4. Smoke test two accounts, earning and claiming the same available cell simultaneously, wallet idempotency, nickname refresh and reconnect. Deploy the web preview only after owner approval. No merge, production migration, Edge deployment or Pages publication is part of this feature branch.

## Source and tests

`server/src/world.ts` owns geometry; `server/src/seeds/` owns rewards, proof and transactions; `server/src/seeds/router.ts` owns the HTTP surface. `web/src/online/world-view.ts` renders the public world; `web/src/online/seed-rewards.ts` queues offline proof. Tests: `server/tests/world-map.test.ts`, `server/tests/seeds-verify.test.ts`, `server/tests/seeds-postgres.integration.test.ts` (requires a migrated local Postgres and `REQUIRE_DATABASE=1`). No engine rule, deck, AI level or match setup is changed.

The world map's screen has its own suite: `web/e2e/world-map-header.ts` asserts, at 320/360/390px, that "THE WORLD MAP" reads on ONE line (measured ink fits the column), that the back chevron and the shared `#online-brand` wordmark share the title's top line (the in-game `#hud-menu` / `#hud-brand` corner language), that the header → status → Seeds → map → selection column steps are one rhythm, that the **surface behind the map window is the main menu's own grained background** (a background patch measures the same grain as the identical menu patch — sd ≈ 3.8, where a flat fill collapses it to ≈ 0.4), that the column uses the viewport (the window owns ≥ 60% of the height, the selection bar reaches the bottom padding), and that the map window keeps its contained surface. It needs an online build (`CHANNEL=futa04 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 npm run web:build`) because the world entry only exists when the build carries a duel API URL; it stubs every call itself, so it never spends quota. `web/tests/world-surface.test.ts` guards the same rules at the source, inside `npm run check`.

**The screen rests on the shared page surface.** The world map is the ONE online screen with no background of its own: `#texture` (`web/src/style.css`) paints the soil gradient, the SVG grain and the vignette at z-index 0, and every `.screen` is transparent over it — exactly how the main menu and the game screen rest on it. `.online-world` must never paint `var(--c-bg)` again; `.online-hub` / `.online-waiting` / `.online-join` deliberately stay opaque, because they centre a narrow column and `web/e2e/online-lobby-overlay.ts` asserts that. The map's bounded window is `.world-grid`, which keeps its own inset surface.
