# Territory final polish — 3 November 2026

Base: `c4850101` on `futa0.5-online`. The approved 15% spread-curve projection, fog topology,
momentum, soft pan limits and shared menu canvas are preserved.

## Navigation and selection

Maximum zoom-out contains the discovered coast on every device. It accounts for the actual panel
crop within the full-bleed shared canvas, including its offset focus. The readable default and
minimum zoom use an independent cell-size floor, so a growing world cannot push the default out to
a microscopic overview. The existing rest timer gently centres a completed full-map zoom; a new
gesture interrupts it, and ordinary edge/sea taps never request a camera move.

Hit testing uses the six projected, rounded polygon corners written by `globeHex`; it no longer
selects an arbitrary nearest tile in empty sea. A conservative centre bound skips distant polygons.
Largest-cluster home framing reuses the existing deterministic real-tile anchor. Manual camera and
zoom persistence still take precedence.

## Competitive ownership statistics

`server/src/territory-ranking.ts` traverses one ownership snapshot with the authoritative six-side
neighbour topology. It counts the largest component and total separately, and ranks by connected
count only; equal counts use existing acquisition age then a stable owner-id tie break.
World-map responses carry authoritative standings; old-server compatibility derives the same
calculation from the public authoritative ownership snapshot. Clients never submit competitive scores.

Public profiles expose `connectedTiles` in addition to the compatible `tiles` total. Postgres adds
an array aggregate of this player's cell ids to its existing SINGLE statement, then traverses it in
memory. No extra query per tile/player, recursive SQL fan-out, table or migration. Both counts are
from that same statement snapshot. The profile privacy allow-list remains explicit.

Own and visitor profiles show CONNECTED TILES and TOTAL TILES. An old server that lacks the new
profile field yields an honest em dash, not an invented zero. The server Edge bundle must therefore
be redeployed before declaring the complete release live.

## Restrained finish

Options considered: a drifting cloud layer, additional blurred shadows, shared existing-light
refinements. Cloud/blur layers would add idle paint and compete with the already-live fog.
The selected inexpensive changes reuse existing surfaces: a faint warm centre in the existing
vignette, an ivory-lit panel lip, a quiet ownership-colour wash in the existing own-ranking row,
and a full colour droplet matching the player's actual resolved ground colour. The existing global
grain binds them together. No new loop, blur, dependency, caption or control.

Ranking's chase sentence/meter and the colour instruction sentence are removed. The chat glyph's
corners are optically softened; the existing podium, swords and medal identities are retained.
Connected-count changes animate only the existing number, once; reduced motion stays still.

## Verification

The 3,000-cell browser probe uses
synthetic geometry and ownership over a real local API and the production renderer; no production
accounts or land are modified. Physical Safari/PWA hardware and live Postgres require actual access;
WebKit engine results must be distinguished from physical-device verification.

## Cursor: server deployment

The owner has explicitly assigned the Edge deployment to Cursor. The web client is compatible with
the old server, but profiles cannot show their new connected count until this step is done.
No SQL migration or data backfill is required for this pass. The regenerated Edge bundle is committed
with this work.

```sh
git pull --ff-only origin futa0.5-online
npm ci
npm run server:build-edge
npx supabase functions deploy duel --project-ref wbfrbeedlvjercrukngn --no-verify-jwt
```

Use the existing deployment credentials. Keep the project's current secrets and JWT setting.
After deploy, check the usual `/v1/health` and `/v1/health?db=1`, then GET `/v1/world`: `world.rankings`
contains `connectedTiles`, `totalTiles` and deterministic ranks. With an existing authenticated
player, GET `/v1/players/<player-id>/profile` must include `connectedTiles` alongside `tiles`.
Compare the map response's counts for that player. Do not create production purchases or captures
just to verify the read-only rollout. Local tests already cover bridge cuts/reconnections and
existing challenge tests protect the single-tile settlement rule.

## Measured rendering limit

These are Chromium software-browser runs on a 390 × 844 viewport at 4× CPU throttle. They measure
full-overview dragging, including owned land, borders, fog and selection. They are not physical
phone benchmarks. The first run overlapped the unit suite and is excluded from comparison.

| Visible land | Ownership layout | Frame p95 | Worst frame | Last reported warp | Retained JS heap change after GC |
| --- | --- | --- | --- | --- | --- |
| 3,000 | fragmented | 1,799.9 ms | 4,416.5 ms | 202 ms | 15,199,324 → 15,295,116 bytes |
| 3,000 | contiguous countries | 2,200 ms | 3,399.9 ms | 187.8 ms | 15,039,056 → 15,166,012 bytes |
| 750 | contiguous countries | 733.2 ms | 1,716.5 ms | 27.6 ms | 13,661,308 → 13,717,672 bytes |

**The 3,000-cell overview does not meet a smooth mobile-frame target in this environment.**
The retained heap is stable in these finite runs; rendering is the limiting factor. The CPU profile
shows SVG/native rendering and attribute writes, projected path generation and repeated border
construction. The small changes made are: reuse fixed hex corner data, avoid per-frame concatenation
of all cells, cache flat border edges until ownership changes, omit off-screen border segments from
the drawn path (with a two-hex glow margin), and remove paused CSS brightness filters while moving.
All visible geometry still uses the same live 15% curve. No LOD renderer, WebGL rewrite or disabled
fog/selection animation was introduced. Results vary by layout/run and do not establish a percentage
speed-up. A denser renderer would be separate work; these measurements must not be described as 60fps.

The normal-map camera proof measured 16.7 ms p95 at 1× CPU. Its seam, pan limit, inertia, selection
and reduced-motion checks passed. Active rotation additionally exposed a stored-vs-drawn aspect
mismatch: zoom and drag now start on the actual drawn frame, and the pose is derived from that same
frame while stored manual coordinates remain untouched during passive presentation. The added
rotation regression was seen failing before the fix and passing afterwards.

The existing `territory-smooth` manual probe also misses its unchanged 34 ms budget in this software
browser. A separate archive of the unchanged `c4850101` release measured pan/pinch p95 83/50 ms;
this branch's isolated run measured 83/150 ms. Pinch is slower in this run, so no general performance
improvement is claimed. The first current-branch run overlapped unit tests and is excluded. These
manual timing failures are disclosed rather than hidden by raising budgets or changing assertions.
Physical-device profiling remains necessary, including the normal-density pinch path.

## Local verification recorded

- `npm ci` passed; full check passed **388 files / 3,956 tests**, with one expected failure and
  66 optional integration skips. TypeScript passed. Production Postgres access was unavailable.
- The final frontend rerun passed **247 files / 2,375 tests**, with one expected failure; TypeScript
  passed again after the final colour-read fallback. No tests were skipped to make the suite green.
- Both futa04 and futa05 production builds and asset guards passed (101 / 104 files).
- The profile browser suite passed, including 320px/Large Text, contrast, keyboard focus and
  pixel sampling for the old bright band. The new row initially exposed the PLAY key behind the
  glass; dimming the existing menu ink while the profile is open fixed it without a new blur layer.
- Camera/fog proof passed: shared corners, no inverted fog, all four edge tiles reachable, soft
  overscroll, momentum, still slow releases, immediate outline and no selection camera move.
- Touch gesture suite passed, including rapid in/out double taps, pointer recovery and pan/pinch.
- Local continuity suite passed 231 checks. Full-map fit, actual pinch, sea taps, edge taps, profile
  3-connected/9-total and active rotation passed across phone/landscape/tablet/desktop fixtures.
- Local WebKit installation was blocked by the environment's download-domain policy. The existing
  Chromium/WebKit continuity suites now both contain the whole-panel fit assertion; CI also runs
  the new 3,000-cell probe. Physical Safari/iOS PWA hardware remains unverified.
- The challenge browser suite passed on 320/360/390px phones, landscape and reduced motion. The
  frameless action keys explicitly reset their idle outline width while retaining keyboard focus.
- A disposable, loopback-only Postgres 17 database subsequently passed the four existing account
  integration/security checks. The changed REAL profile aggregate returned 3 connected / 9 total;
  the real world service ranked another player's 4 connected / 4 total higher. Transferring just
  the bridge changed the first player's count 3 → 1, total 9 → 8, and kept all 13 world cells.
  Returning that tile restored 3 immediately. Empty ownership returned 0. The container/data were
  removed afterwards. These were local database fixtures, not a Supabase deployment check.
- The final isolated dynamic-globe probe retained shared corners, no release drift, sane world
  edges, stable reload pixels and no page exceptions. It measured 16.7 ms frame p95 at 1× CPU;
  its TWO 4× timing assertions failed (66.7 ms frame p95 / 35.9 ms worst warp). Its final printed
  `PASS 17 ...` line counts checks and is not an all-green result; the failures remain disclosed.

## Visual evidence

Representative current captures (local fixtures, not production players):

- Readable default: [phone](screens/territory-final/default-phone.png) /
  [desktop](screens/territory-final/default-desktop.png).
- Full 3,000-cell map: [portrait](screens/territory-final/map-3000-phone.png) /
  [landscape](screens/territory-final/map-3000-landscape.png) /
  [desktop](screens/territory-final/map-3000-desktop.png). These prove containment, not smoothness.
- [Public profile: 3 connected / 9 total](screens/territory-final/profile-connected.png).
- [Connected ranking without chase text](screens/territory-final/ranking.png) /
  [full-colour drop without instruction text](screens/territory-final/colours.png).

Earlier reference captures remain in `docs/screens/living-territory/` and
`docs/screens/territory-icons/`; the approved globe curve and shared glass are retained. The
continuity suite compares actual menu/Territory tile pixels, not just these static captures.

## Release checkpoint

Implementation: `06a4ed56a5240380c7e401ca0c9e75bb0397c7c5`.
[CI #1017](https://github.com/severgrow/severgrow-01/actions/runs/41689864168) passed its unit/build
job and all **15 browser suites**, including the new 3,000-cell probe and both WebKit suites.
[Extra regressions #136](https://github.com/severgrow/severgrow-01/actions/runs/41689863972) passed.

The owner-authorised `npm run promote -- 06a4ed56a5240380c7e401ca0c9e75bb0397c7c5` fast-forwarded
`live` to this tested commit. This documentation update also triggers publication from the approved
`futa0.5-online` branch, as required by the environment policy in `docs/RELEASE-FLOW.md`. A moved
branch alone is not proof of publication; the Pages workflow must finish successfully.

Direct access to `futasaku.com`, the Pages release manifest and Supabase is blocked by this cloud
environment's domain policy. Hosted workflow results can be inspected, but direct production
browser/API checks and a physical iPhone/PWA check cannot be claimed. Cursor owns the separate Edge
deployment above; until then the web has its compatible ownership-snapshot ranking fallback and
unknown connected profile counts remain an em dash.

The newly queued onboarding refinement and genuine spherical prototype are a SEPARATE `/test/`
experiment. They are not part of this promoted commit and must not be promoted with it.
