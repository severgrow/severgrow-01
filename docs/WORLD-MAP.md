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

## v3.4: one Territory menu (owner, 2026-10-28)

Supersedes the four-corner navigation above. Only MENU remains on the map. Its glass drawer contains
labelled My land, Fit map and Chat tools, plus the existing Challenges/Ranking tabs. My land retains
patch cycling; Fit is a one-tap whole-map reset and closes the drawer. Pinch or wheel zoom can start
from that fitted view. A pinch's release never counts as a tile tap; horizontal-only wheel input is
ignored. Tile selection opens grow/sell information in the same drawer, while challenge offers retain
the existing guarded modal. Chat opens from the drawer and has an explicit Menu return control.

Your land keeps its stable player hue and gains a stronger ivory perimeter with the existing glow.
No extra map overlay nodes, animation loops, subscriptions, game rules or server changes are needed.
The existing 0018 migration/Edge deployment requirement for Territory chat is unchanged.

## v3.5: MENU and four icon keys, the tile bar, a smooth map (owner, 2026-10-28)

Supersedes v3.4's drawer. Owner: "fit map and my land was to be removed, and ranking, challenges,
chat, latest should be separate options using just icons … MENU button stays and it's the only button
visible straight away, 4 other keys open after clicking menu … teenage engineering/nintendo inspo …
tapping empty tile should NOT open the menu and still have option to grow/sell/challenge".

- **At rest only MENU shows** (top-right). Pressing it slides a row of icon-only 44px hardware keys
  out to its left: RANKING (a 1-2-3 podium), CHALLENGES (the map's traced swords, carrying the open-
  challenge lamp), CHAT (LATEST, an open book, was removed in v3.5.1). MENU's grille folds into a close mark. Each key opens its
  own page of one window that hangs under the row; the lit key gets a lamp, pressing it again shuts the
  page, and MENU folds everything away. Fit map and My land are gone.
- **A tap only selects.** The tile bar floats at the map's foot: free ground GROW A TILE → CONFIRM GROW,
  your ground SELL → CONFIRM SELL, a rival tile beside yours CHALLENGE (opens the offer), contested
  ground VIEW CHALLENGE. Tapping the same tile again lets it go; a tap on the map shuts an open page.
- **Smoothness.** The SVG Gaussian blurs re-rendered on every frame of a pan: at 4x CPU throttle pan and
  pinch frames ran at p95 50 ms. While the map moves (pan, pinch, wheel, a glide) `.world-grid.moving`
  draws them sharp and pauses the ambient loops; they soften again 140 ms after it rests. View writes
  are coalesced to one per animation frame and the map box is measured once per gesture. Result: p95
  17 ms. A refresh that brings back the same world no longer rebuilds the map, and the tile bar and the
  window's lists are only rebuilt when their content changes (a poll no longer resets an armed key).
  Ranking and Latest rows glide the view to their place (380 ms ease-out; instant under reduced motion).
- Checks: `web/e2e/territory-menu.ts` (CI, 47 checks), `web/e2e/territory-smooth.ts` (frame-time probe,
  run by hand). The older `territory-growth`, `world-pan`, `territory-swords` and `territory-challenges`
  suites still drive the removed FIT / My land keys and the auto-opening offer; they are not in CI.

### v3.5.1 (owner, 2026-10-28): LATEST removed, icons centred

- LATEST and its book key are removed "for now"; the row is RANKING, CHALLENGES, CHAT.
  (`recentActivity` in `world-growth.ts` stays for when it returns.)
- Off-centre icons: a rule lifting every `svg`/`span` child above the key frame also caught the press
  layer (`.press-shade`), turning it into a second grid row after the first press (icons ~5px high) —
  and outranked MENU's glyph and the challenge lamp. Only the key's `svg` is lifted now; the suite
  measures the drawn ink to within 0.75px of each key's centre, before and after presses.
- Hover glow only on devices with a real pointer (`@media (hover: hover)`), so a tapped key on a phone
  does not stay lit. A grow or sell in flight keeps its key in the bar (GROWING… / SELLING…, dimmed)
  instead of the bar shrinking and growing back. Starting a pan pauses only the animated tiles.

## v3.6: achievements, one stake per tile, /test (owner, 2026-10-29)

- **Achievements** (owner: "turn it into achievements and pay seeds for those — for beta we want quick
  easy engagement in territory"). A fourth key in MENU's row (a medal) opens a page of eight one-time
  rewards, 900 Seeds in all: Put down roots (first tile, 100 — it pays the tile back), Good neighbours
  (a tile next to another player, 50), Throw down (send a challenge, 75), Stand your ground (accept one,
  75), Small holding (3 tiles, 100), Conqueror (win a challenge, 150), On the podium (top 3, 100),
  Estate (10 tiles, 250). The key's lamp (and MENU's) counts rewards ready to claim; CLAIM pays at once.
  The server decides (`server/src/seeds/achievements.ts`, routes `GET /v1/seeds/achievements` and
  `POST /v1/seeds/achievements/claim`) from the map and the player's own challenge rows, and pays through
  the ordinary settlement under `achievement:<id>`: one receipt per player, so a retry replays it. No
  migration. The amounts are fixed (not doubled by the beta multiplier) and sit outside the daily cap.
  **Rollout:** deploy the `duel` function (bundle rebuilt in this change). Until then the page keeps the
  key hidden (the route answers 404), so /test/ and the live site are safe either way.
- **One tile backs one stake.** A tile already staked in one of your open challenges, or contested by an
  open challenge, is no longer chosen as a new stake; the next-nearest free tile is, and with none left
  the send is refused (`NO_TILE`, "All your tiles are already at stake"). Before, a one-tile player could
  promise that tile to three defenders. Everything else stays free and generous.
  `server/tests/territory-challenge-integrity.test.ts`.
- **futasaku.com/test** is the staging copy; "promote" puts it live (docs/RELEASE-FLOW.md).

## v3.7: 35 achievements across every mode (owner, 2026-10-30)

- **The set.** The eight Territory achievements above are kept, and 27 more bring the total to **35**
  (the owner said "around 35"). Five sections, in the order the window draws them:
  **Territory 10**, **Duels 9**, **Craft 5**, **Company 4**, **Campaign 7**. Each entry below is
  `id — rule — table it reads`; the first eight are marked *(existing)*.
  - Territory: `roots` grow your first tile *(existing)*, `neighbours` hold a tile beside another
    player *(existing)*, `throw-down` send a challenge *(existing)*, `stand-ground` accept one
    *(existing)*, `holding` hold 3 *(existing)*, `conqueror` win a challenge *(existing)*, `podium`
    reach the top 3 *(existing)*, `estate` hold 10 *(existing)*, `home-guard` win a challenge you
    accepted, `ground-taken` win a challenge you sent — all from `world_claims` / `world_challenges`.
  - Duels: `first-crossing`, `three-crossings`, `ten-crossings` win 1/3/10 online duels;
    `running-sap` / `long-growth` win 3/5 in a row; `live-wood` win a live duel; `higher-branch`
    beat a player at a higher campaign level; `unsevered` win without conceding a cut;
    `caught-knock` win by undercutting a knock — `matches` (+ `seed_reward_receipts` for the level
    comparison, `match_moves` for cuts). Resignations and timeouts count as wins for volume, but
    the craft checks below require a game the engine actually finished.
  - Craft: `bloom-and-nothing` every grow you made was a Bloom; `cut-and-standing` win after a cut
    took a tile; `ringed-root` win with all six sides of your home held by the other player;
    `last-light` win when the deck runs out; `quiet-table` finish a duel where nobody drew from the
    throw pile — `match_moves` and the final board in `matches`.
  - Company: `open-door` an invite you sent is accepted and played; `company` play a friend;
    `grove-of-friends` play three different friends; `generous-host` invite a friend who then wins —
    `matches` + `match_participants` (the creator is seat 0; a friend duel is `openQueue = false`).
  - Campaign: `first-clearing` / `five-clearings` / `ten-clearings` / `whole-chapter` /
    `last-lesson` read the ordered receipt keys (`campaign:cN-M`, `lesson:10`) in
    `seed_reward_receipts`; `clean-hands` a clear with no draw from the throw pile and `quick-work`
    a clear in twelve turns or fewer read the verified clear shape in **`campaign_clears`**.
- **The smart ones, and why they are Futasaku.** They reward a way of playing, not a volume:
  `caught-knock` is the undercut (a comeback that already exists in the result), `unsevered` and
  `cut-and-standing` are the two sides of the cut, `ringed-root` is the home that survived a siege,
  `quiet-table` is the table that never reached into the throw pile, `bloom-and-nothing` is a duel
  built without a single Bomb or Fruit, and `generous-host` is wry about losing well. Every one is
  measured from a server-owned row; none asks the browser for a number.
- **No undo / first try.** The owner's two campaign examples are device-local gestures: Undo is a
  client rewind, and only a WIN submits a campaign proof, so the server cannot honestly see either.
  Rather than invent them, the two campaign craft achievements use the closest facts the verified
  action log does contain: no throw-pile draw (`clean-hands`) and a short clear (`quick-work`).
- **The panel.** Five section headings, each with an earned count (`TERRITORY · 3/10`), keep 35 rows
  readable; the panel body scrolls vertically and never sideways. Unearned rows have no amount and
  no reward teaser; earned rows show one `CLAIM` key; claimed rows show a tick. The intro line
  ("Seeds for your first steps…") is removed per the owner's 2026-10-30 direction, and the claim's
  amount is spoken only in the notice AFTER the claim. Earned-once is still the receipt; a claimed
  achievement never re-arms when the tiles or match rows disappear.
- **Rollout.** New migration **`server/migrations/0021_campaign_clears.sql`** adds the one table (a
  quiet no-op if it is absent: the two clear-shape achievements read zero, the campaign reward is
  untouched). The `duel` Edge Function **must be redeployed** (bundle rebuilt in this change) for the
  new endpoint behaviour and the recording. Until the migration is applied, the rest of the 35 work
  from data that already exists.

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
