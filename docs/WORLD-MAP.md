# Seeds and the shared world (FUTASAKU 0.5)

Status: implemented on isolated `futa0.5-world-seeds` branch; **not deployed**. The existing 0.5 match engine and published preview remain authoritative until the online owner integrates this branch.

## v3: the map grows (owner, 2026-10-27)

- **The land underneath** is every hex within `WORLD_LIMIT` (48) of the centre. **What anyone sees** is
  the v2 coastline plus every hex within `WORLD_REACH` (2) of a grown tile — a pure function of the
  claims (`seenWorld` in `server/src/world.ts`), so nothing new is stored and the server and every
  client always agree. A tile near the coast uncovers the land around it at once; no tile is ever at
  the edge. `GET /v1/world` now sends the seen map (`version: 3`).
- **Anywhere** (owner experiment): a tile may be grown on any free cell of the seen map; the
  next-to-your-own rule is gone for claims (challenges still need a shared side). Land nobody can see
  is refused as `INVALID_CELL`. A v2 server still enforces adjacency, and the page follows the
  version it is told.
- **On the page** (`web/src/online/world-view.ts`, helpers in `world-growth.ts`): two rings of fog
  beyond the coast; new land rises in, nearest the newest tile first, with "N NEW TILES UNCOVERED";
  the bar shows the last five placements (a tap flies there) and a RANKING key that drops the
  players' table over the map (a row flies to that player); a find-my-land key beside FIT.
  Browser check: `web/e2e/territory-growth.ts` (local, in-process server).

## v3.1: one window, selling, a living map (owner, 2026-10-28)

- **One deck, one window.** Three equal hardware keys under the wallet — CHALLENGES, RANKING,
  ACTIONS — open the same centred, see-through window over the map (`#online-world-panel`, dark
  glass at ~66% so the land shows through). Challenges has a CURRENT / HISTORY switch; Ranking holds
  the players' table and the latest placements; Actions holds what you can do with the selected
  tile (grow, sell, challenge) plus go-to-my-tiles and fit. Escape or the close key shuts it.
- **Selling a tile** (owner, "for now"): `POST /v1/world/sales {cellId, requestId}` gives back
  `SEED_ECONOMY.tileSaleReturn` (100) and frees the cell. Owner only; refused as `CELL_BUSY` while a
  challenge on it is open. Idempotent by `requestId` (ledger `world_sale`, source `world-sale:<id>`).
  Needs the server redeploy; the page offers it only on a v3 world and confirms with a second tap.
- **A living map, kept quiet**: the fog rings breathe slowly; new land rises in; your own tiles catch
  a rare glint; tiles grown in the last six hours carry a soft halo; a few spores drift across.
  All of it stops under reduced motion.
- **Desktop**: the column (header, wallet, deck, window, selection) shares one width,
  `--world-w`, up to 1240px, sized by the screen height and always centred.
- **Sound** is switched off across the whole game for now (`SOUND_REMOVED` in `web/src/ui/sound.ts`);
  its settings rows are hidden. Vibration stays.

## v3.2: one menu, a living stage (owner, 2026-10-28)

- **One menu, four corners.** The row of keys is gone. The map window has four mirrored corner keys
  on one edge: find-my-land top-left, the MENU key top-right (with the open-challenge lamp), FIT
  (the magnifier) bottom-right, and the selected tile's coordinates bottom-left. The menu opens one
  centred see-through window with two tabs, like Match Intel: CHALLENGES (Current and History
  sections) and RANKING (your standing, the table, the latest placements). Selling and growing
  live on the selection bar; challenging opens by tapping a rival tile next to yours.
- **Your standing**: "#2 of 14 · 3 tiles to pass Kat" with a meter (`standing` in `world-growth.ts`).
- **Your land's outline**: one soft line around every piece of your land (`borderSegments`).
- **Grow ripple**: two blurred rings leave a tile you just grew.
- **Soft focus**: mist, motes, halos, the outline glow and the ripple are drawn through SVG Gaussian
  blurs (`world-blur-*`), so they read as light, not as flat shapes. Reduced motion stops them all.
- **The desktop stage** (wide screens, `desktopStage()`): the map fills everything under the header,
  and Seeds, the notice and the selected tile float over it as glass pills. It opens at a readable
  tile size (54px) centred on your own land; zoomed out, it shows the whole world with sea
  around it. A later global chat can cover this one surface with its dark glass.
- **Challenge offer fix**: the sheet ignores presses for its first 450 ms, so the tap that opened it
  can no longer land on NOT NOW and shut it ("blinking"). Check: `web/e2e/territory-challenge-tap.ts`.
- **Ops**: `docs/ops/return-challenged-tiles.sql` hands back tiles one player took from another by
  challenge (Supabase SQL editor; look first, then change).

## v3.3: four cockpit corners and Territory chat (owner, 2026-10-28)

- **Four corners, one key design**: find-my-land top-left (each press visits the next patch of your
  land, "2/3"), the MENU top-right, ZOOM bottom-right, CHAT bottom-left. Each is the in-game cockpit
  key: 44px, radius 12, the supplied hardware frame (`hardware/button-frame-supplied.webp`), on one
  10px edge (14px on the desktop stage). The coordinates read-out is gone. The menu window opens on
  the corner row and covers the menu key exactly (on desktop it drops from that corner).
- **Territory chat** (`server/src/chat/territory.ts`, `web/src/online/territory-chat.ts`): one shared
  channel for everyone in Territory. Each line shows the sender's nickname and #tag. The server keeps
  the newest 30 messages and deletes older ones (`territory_messages`, migration
  `0018_territory_chat.sql`). It reuses duel chat's text rules, its block list (`match_chat_blocks`:
  one list for both chats) and the rate limiter (6 a minute, 200 a day). Tap someone's message for
  BLOCK (two taps) and REPORT; a report copies the line into `territory_chat_reports`. While open it
  asks for news every 4 s; shut, it asks for nothing. Menu and chat are one window at a time.
- **Rollout order**: run `server/migrations/0018_territory_chat.sql` once (Supabase SQL editor), then
  deploy the `duel` function, then the site. Until then the chat says it is not reachable.

## Ownership and economy

- The world is one versioned, frozen axial hex map. v2 (2026-10-21) is **274 cells** (21 rows, r −10…10): the 183-cell v1 landmass plus an irregular coastal growth, baked into `server/src/world.ts` by `scripts/gen-world-v2.mjs` (no runtime randomness). Its cell IDs are `q,r`. Expansions only ADD ids; every v1 id is unchanged, so an existing claim can never be orphaned — verified against the nine live claims when the coastline shape shipped (none dropped). Historical 8×8 `world_tiles` owners are copied into the central 64 positions by migration `0011_seeds_world.sql`; the historical table and migration remain intact.
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

The world map's screen has its own suite: `web/e2e/world-map-header.ts` asserts, at 320/360/390px, that "TERRITORY" reads on ONE line (measured ink fits the column), that the back chevron and the shared `#online-brand` wordmark share the title's top line (the in-game `#hud-menu` / `#hud-brand` corner language), that the header → status → Seeds → map → selection column steps are one rhythm, that the **surface behind the map window is the main menu's own grained background** (a background patch measures the same grain as the identical menu patch — sd ≈ 3.8, where a flat fill collapses it to ≈ 0.4), that the column uses the viewport (the window owns ≥ 60% of the height, the selection bar reaches the bottom padding), and that the map window keeps its contained surface. It needs an online build (`CHANNEL=futa04 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 npm run web:build`) because the world entry only exists when the build carries a duel API URL; it stubs every call itself, so it never spends quota. `web/tests/world-surface.test.ts` guards the same rules at the source, inside `npm run check`.

**The screen rests on the shared page surface.** The world map is the ONE online screen with no background of its own: `#texture` (`web/src/style.css`) paints the soil gradient, the SVG grain and the vignette at z-index 0, and every `.screen` is transparent over it — exactly how the main menu and the game screen rest on it. `.online-world` must never paint `var(--c-bg)` again; `.online-hub` / `.online-waiting` / `.online-join` deliberately stay opaque, because they centre a narrow column and `web/e2e/online-lobby-overlay.ts` asserts that. The map's bounded window is `.world-grid`, which keeps its own inset surface.

**The window fills the column.** The world's bounding box is 274.49 × 272 units — very nearly square — so a window sized to the map's aspect avoided letterboxing *inside* it but left the void *outside*: a square map at the top of a tall column, with roughly half the screen empty below (the owner saw exactly that at 390×844). He chose a bigger map over centring, accepting a horizontal crop. `.world-grid` therefore takes the column's whole height (`flex: 1 1 0`, no CSS `aspect-ratio`) and `world-view.ts` frames the view to the **window's** aspect via `boundsFor(aspect)`: the largest rect with the window's ratio that fits inside the world's fit box. On a portrait phone that keeps the full height and a narrower width, so the map scales up and the surplus is cropped, pannable to the edges; on a wide screen it resolves to the whole world. Because the box's aspect always equals the window's, the SVG scales both axes equally — the hexes stay true hexagons (asserted: one hex measures √3/2). The framed view is **both** zoom limits, so zooming out can never widen the box back to the world and letterbox it; a `ResizeObserver` re-frames on a shape change. The `dvh` term in the width cap is the same size expressed against the viewport (its 210px is the column's fixed chrome, derived and commented), and `max-height` plus the flex shrink stop a grown chrome — a notice line does exactly that — from overflowing. `.world-selection` anchors to the bottom edge (`margin-top: auto`) so the controls stay at thumb height, and the side gutters are the menu column's own 16px.

**Tile shading and the focus ring.** Each tile's `fill` is its own SVG `linearGradient` (`<defs>` in `world-view.ts`), built in JS from the owner colour the server already sent, so territories read as coloured glass and unclaimed ground stays the quietest surface; one gradient per distinct colour, plus one flat dark one for empty hexes. A second, brighter gradient marks the caller's own territory — no new colours, and `--territory` still drives the stroke. Every hex is `tabindex=0`, and a *pointer* click focuses one **without** matching `:focus-visible`, so a `:focus-visible`-only rule left the browser painting its own rounded blue ring (the bracket the owner photographed). `.world-hex:focus { outline: none }` covers every focus state and `:focus-visible` draws our hex-following cream stroke, so keyboard users keep an indicator. The side gutters are the menu column's own 16px.
