# Decisions (Bloom, layout, homes, polish: v0.7; UI pass: v0.8)

## 2026-11-05 (night) — Sound narrowed: a small fixed palette, one sound at a time

Owner, after hearing /test: "The sounds sound too real, Velcro sound is out ... Zip out too ...
Wine glass tap on each round sound too much like glass. We need to narrow down all to nice click and
taps ... Synth stabs completely out for now ... It's okay if the sounds are a bit repetitive ...
never play 2 at once, add some effect on turn glass to sound better"; "don't rotate - group - and
certain type of buttons should always make a similar sound ... not variety". Asked: a new sound cuts
the old; keep the coins at the end and the short, quiet metal and glass taps; turn glass warm and
soft; the planet's keys the same as the menu's.

- web/src/ui/recorded.ts is now a FIXED PALETTE: ~25 takes, one per group, no rotation, no pitch
  wobble (a Bloom's cards and the Seeds count still step up: a count, not variety). Every take is
  short (<= ~0.5 s) except the turn ring. Velcro, zip, gritty, shaky, long metal, slides, chalk and
  the stabs are never played (the stab files stay in audio/stabs/, unused, not fetched).
- One sound at a time: a new sound fades the ringing one in 8 ms; two in the same instant (30 ms)
  keep the more important (moment > move > key), so a Bloom card wins over its own tile landing.
- Turn: only YOUR turn rings: glass_ring_01, two semitones lower, quieter, through a 2.2 kHz low-pass
  and a short soft room (0.7 s decaying-noise impulse). Their turn is silent.
- Every key (menu, submenus, sheets, the planet's buttons, PLAY, Back) is ui_press_04 on the finger;
  the lift is silent. Cards and tiles play their own pick.
- Silent now: rich-tile chime, cascades, rustle, sparks, thud, rumble, grind, the old turn tone.
- Only the palette's files are fetched (was all 270).
- SOUND OFF BY DEFAULT (owner: "make sound disabled by default but on main menu in corner make a low
  opacity cream icon with the sound showing that its disabled"). The choice is saved as `soundOn`; an
  old saved `sound: true` was only the old default and is not read. The menu's top-left corner (the
  fullscreen key's mirror) holds a 44 px cream speaker at 0.3 opacity, crossed out while off; one tap
  turns sound on (0.55, plain speaker). With sound off no take is fetched at all.

## 2026-11-05 (later) — Synth stabs on top of Cut, Bloom, Bomb and Blast

Owner (futasaku-sfx-2): 96 stabs in 8 packs (web/public/audio/stabs/), rules in ui/sfx-map.json
`stabs`. Asked and answered: Bloom notes follow the tiles as they land; keep the current sounds and
ADD the stab on top; stabs at 0.6 (a bit under); every cut, both sides.

- Packs: the player draws from p2/p4/p8 + shared p5/p7, the opponent from p1/p3/p6 + p5/p7; an action
  takes one pack, never the one its side used last nor one the other side is ringing.
- Cut (every size, yours) = a grow note of your pack; being cut = a grow note of theirs. Bloom = one
  pack, run notes 1,2,3,4 (5+ cards wrap), the LAST note the grow file of that number (full tail).
  Bomb / Blast = the pack's bomb / blast. Max 4 copies of one stab file. Stabs load after all effects.
- Bloom pace (owner: "you can slow down a bit blooming animation"): a Bloom's tiles land 0.8 of a
  move apart (PINNED.bloomGap, ~211 ms; was 0.5, ~132 ms), so each stab note has its own tile.

## 2026-11-05 — Sound returns: the owner's own recordings

Owner: "download the file, upload to repo ... let's do some sound work - 10/10 tactile responsive fun
and excellent". Asked: /test first, ON by default, "you pick" for the moments the map leaves open,
vibration "light and rare".

- 174 takes (web/public/audio/sfx/, 2.0 MB) and the owner's map (web/src/ui/sfx-map.json) are played
  by web/src/ui/recorded.ts through the engine's existing cues (ui/sound.ts): one take per moment,
  never the same twice in a row, the map's volume and pitch wobble, max 4 copies of a set, semitone
  steps for the Seeds count and a Bloom's cards. MP3's silent lead-in is skipped per take.
- Loading: the 13 key takes (~40 KB) decode while the menu is idle (an offline context, no sound), so
  even the FIRST tap is a recording; everything else loads after that tap, once, shared by the game
  and the live-duel screen. Until a take is decoded its cue falls back to the old synthesized click.
- Keys: press on the finger, release on the lift; big keys (PLAY, Find match) one clack; Back keys the
  dull click. Cards and hexes play their own pick sounds (no generic tick on top).
- My picks for the gaps: Cut = velcro (+ metal / heavy wood / gritty + big metal as it grows), being
  cut = metal_big quiet, Bomb = heavy wood drop, Blast = big metal + gritty, Strengthen = wood click,
  Surround finish = glass ring + coins, final turns = glass ring a fifth lower.
- Haptics: only your tile landing, a Cut and win/lose buzz by default (pulses <= 24 ms, patterns
  < 250 ms); the rest only with Effects High.
- Settings: Sound switch, Effects volume and Test sound are shown again; music stays hidden.

## 2026-11-04 (later) — No bot skips its grow (bots-v0.11)

Owner: "Remove the skipping growth in all levels really". The gentler bot levels ended turns
ungrown on purpose (`skipGrowth`: 57% of steps at level 1, 33% at level 4). bots-v0.11
(`src/bots/keeps-growing.ts`): a turn never ends without its grow while one is legal; where the level
would have skipped, it makes the most modest grow (strengthen its weakest tile at the back with its
lowest card, else spread one tile near home). Everything else is the level's own move. A full best
move instead would have made the gentle levels far harder (lesson 9, bot 3 standing in: 55 -> 24
wins of 120); the modest grow keeps them close (55 -> 45).

The server verifies Seeds proofs by replaying the bot by VERSION, so v0.10 stays accepted, the server
lists its versions in `features`, and the page holds a v0.11 proof until its server lists v0.11
(no Seeds lost before the server deploy). Level 9's lesson-only `keepsPlaying` was folded into this.

## 2026-11-04 — The lesson opponent always takes its turn

Owner: beta testers said "levels 2-9 feel broken because the ai opp is not doing much - make sure it
makes more actions especially from lesson 4 onwards ... Don't change much but improve that in a very
smart way not breaking anything".

Measured first (200 casual games a level): levels 2-8 grew exactly one tile every turn, never more;
level 9's real bot (level 4) did NOTHING on 39% of its turns (the campaign ladder's deliberate "lazy"
stop, `skipGrowth`).

- Levels 4-8 (`contests`): the scripted opponent's grow heads for an open hex beside YOUR tiles, so
  every turn visibly answers yours. Random players win slightly more often than before (its tiles
  are within reach).
- Levels 5-8 (`blooms`, Bloom is taught at 5): after its grow it also plays a Bloom it holds, on open
  ground only, never on a key hex, never surrounding your home, and never one that would put it level
  with you or ahead (without that rule, following the light LOST levels 5 and 7).
- Level 9 (`keepsPlaying`): the bot plays its level exactly, but a turn it would end having done
  nothing becomes a modest move (strengthen its weakest tile at the back, else a gentle grow).
  Removing the lazy stop outright made it far harder (bot level 3 standing in for you: 55 -> 24 wins
  of 120); the modest move keeps it close (55 -> 45; bot 2: 36 -> 31; bot 5: 111 -> 101).
- NOT changed: levels 1-3, level 10 and every shared bot level. Level 10's Seeds proof, Campaign and
  Training are replayed by the server against the shared bots, so changing them would break rewards.
  Level 9 pays no Seeds and sends no proof.

## 2026-11-04 — 0.75, "the planet standard": one space, metal keys, the board as a small planet

Owner-approved polish pass (live game only: `html.v075` written by the build for CHANNEL=futa05,
`web/src/polish-075.css`; `FEATURES.space`). What changed and why it is built the way it is:

- **One shared space.** The planet's SPACE shader moved to `web/src/sphere/space.ts` and is used by
  both the planet and the new backdrop (`web/src/player/space-backdrop.ts`) behind the Play submenu,
  the game and the menu until the planet draws. Without a planet the shader gets a vanishing radius,
  so the halo and glow fall away by their own maths. The star offset is shared (`spaceDrift`), so the
  stars carry on between the menu's planet and a game without a cut.
- **Space backdrop cost** (`web/e2e/perf-phone.ts`, 390x844, DPR 3, 4x CPU, idle game, means of the
  runs; this host is shared and noisy):

  | idle game | before | shader every frame, 10/s | ~15/s (menu pace) | shipped |
  | --- | --- | --- | --- | --- |
  | game rAF/s | 0.0 | 8.6 | 15.1 | **0.0** |
  | main-thread task ms/s | 12.1 | 565 | 928 | **11.1** |
  | style recalcs/s | 0.3 | 9.0 | 15.1 | **0.3** |
  | a move: fps / p95 | 41.0 / 41.7 ms | 25.8 / 208 ms | 16.5 / 250 ms | **42.3 / 41.7 ms** |

  Redrawing the shader per frame was significant (and on this probe stuttered a move), so it is
  drawn RARELY: each star layer once onto a canvas a little larger than the screen, slid by the
  compositor at the menu's own pace (two layers, the far one at 0.35 of the near: the same parallax),
  and redrawn exactly one slide further on every 20 s. Two moving full-screen layers still cost a
  move ~6 fps here, so IN GAME the stars stand still, painted once as a background image of the
  backdrop (no layer of their own): measured equal to the build without stars (8 runs each: idle
  task 11.1 vs 12.1 ms/s, a move 42.3 vs 41.0 fps; the p95 guard reads 41.7 ms for BOTH builds on
  this host). The Play submenu and the menu keep the slow slide. Hidden tab: the slide pauses (0
  animations running); Reduce motion: still stars.
- **No flash at start-up.** The built HTML carries `space-first`: a still CSS star field on the page
  background until the shader's stars have drawn (`space-lit`).
- **The board as a small planet.** The Territory globe's spread curve (`k(u) = 1 - f*u^1.25`) at 5%
  bends the game board (`web/src/ui/geom.ts`). Every hex CORNER is bent (as on the Territory globe),
  so neighbours share their corners and the board stays one seamless surface (owner, same day: "gaps
  in the map between empty piles - should never happen"; a first cut that shrank each tile about its
  centre opened hairline gaps and was replaced). A soft two-step shadow under the board's silhouette
  (no filter) floats it over space. The hit test un-bends the point and tests the flat cell;
  `web/tests/board-bulge.test.ts` pins the shared corners and taps every tile's centre, sides and
  corners.
- **In game the game's own background stays** (owner: "put the black and stars on top of existing one
  with like 35% opacity"): the backdrop's sky and stars lie over it at 35%. Measured with that
  layer: idle main thread 8.5 ms/s, a move 42.2 fps, p95 26.7 ms (5 runs).
- **Every menu key is the same key** (owner: "no more highlight diff style for play or level1"): no
  lead outline and no suggestion halo in the menu and submenus.
- **Sharper in-game motion.** Tempo 96/336 -> 80/264 ms, the pinned beats about a fifth shorter,
  the cut's own table with them, and the settle curve's overshoot 1.1 -> 1.03 (a click, not a
  bounce). Reading time (the display's 1 s and lessons' 2 s dwells) is unchanged.

## 2026-11-04 — THE PLANET replaces the flat map on /test/

Owner: *"geometry of hexes is wrong ... replace and call it THE PLANET instead of TERRITORY ... Full
Territory actions"*. The sphere test's lopsided hexes came from projecting a flat grid and using
circumcentre corners (median side ratio 1.124, worst 1.634); an evenly relaxed frequency-24 mesh with
centroid corners gives 1.054 / 1.175. The flat Territory map is laid on the planet tile for tile, so
Territory's own selection and actions drive it unchanged. The twelve pentagons are black,
uninhabitable ground. Only `/test/` (`FEATURES.planet`); live keeps the flat map. Details:
[PLANET.md](PLANET.md).

## 2026-11-03 — The projection stays one shared map; the release does nothing

Owner: *"evaluate a cleaner implementation before committing to the current solution … a
camera-centred, continuous fisheye projection that gives the impression of physically rotating a
globe … no snapping, stepping, delayed updates or changes that happen only when dragging ends"*.

**The architecture was measured, not assumed.** Three candidates were compared on the real page at
390x844 (Chromium, DPR 2, `data-warp-*` counters plus a per-frame probe, CDP CPU throttle 1x/4x):

| candidate | live warp | verdict |
| --- | --- | --- |
| per-tile `d` rebuild, shared-corner projection (shipped) | 0.8-1.0ms, 369 writes, 163-183 cells at 1x; 3.0ms at 4x | **chosen** |
| per-tile `transform` (local-space `d` + affine) | *not cheaper*: writing `transform` measured 1.40ms against 1.30ms for `d` over the same 696 nodes at 1x (2.6 vs 2.7 at 4x) | rejected |
| one group transform / nested affines | a single affine cannot express a falloff that varies with distance from the view centre; concentric rings are the old per-tile falloff with visible steps | rejected |
| canvas / WebGL | no budget to win: the warp is 1-3ms of a 16.7ms frame and the frame p95 is 16.7ms at 4x | rejected |

**Why the affine loses on more than speed.** A best-fit affine per hexagon leaves a **0.151px**
worst corner residual and a **0.261px** worst neighbour seam at the reference view (mean 0.150px over
1514 shared corners) — sub-pixel, so it is a *good* approximation, but it is a different map per
tile and the neighbours no longer meet exactly. The shipped projection draws every shared CORNER
once, so the seam is **0.000px** by construction, at every camera including mid-drag. The affine also
buys nothing measurable: the DOM write is the cost, not the length of the string. `web/tests/
map-globe.test.ts` now pins both numbers so a future "just use transforms" change has to argue with
them.

**What changed in this pass (the other agent's per-frame work is kept).**

- **The release runs no warp pass at all.** It used to end with the authoritative 279-cell pass
  (232 writes, 3.6-10.2ms at 4x) on the exact frame the eye is watching for the jump. It cannot
  change a visible pixel — the live warps already stood on that pose — so it moved to the existing
  `SETTLE_MS` (140ms) soft-focus timer, where the camera has rested. The release now flushes the
  pending frame with the SAME live pass a gesture frame uses.
- **The warp's node list is collected once per paint** instead of re-matched on every frame
  (0.018ms at 1x / 0.085ms at 4x over 711 nodes). Small, but it was pure per-frame overhead.
- `data-warp-live` publishes live passes separately from the settle, so a proof can tell them apart.

**Measured after the change** (`web/e2e/dynamic-globe.ts`, which now also drags diagonally, drags at
the world's rim and samples a tile every frame across the opening): 18 live warps in an 18-move drag,
**0.8ms** median / 0.9ms worst at 1x and **3.0ms** median / 3.4ms worst at 4x, 369 writes; frames
**16.7ms p95 / 16.8ms worst at both throttles**; **0 of 140 visible tiles move at the release**; the
release performs **0 passes**. Diagonal drag seam 0.000px over 371 pairs; rim drag finite and
uninverted with a 0.000px seam; a tracked tile moves **0.000px over 122 sampled frames** of the
menu → Territory opening; tile rects 0.000px menu vs panel and 0.000px after a reload.

**Cost accepted.** The off-screen margin is on the previous pose for 140ms after a release. It is
outside the panel, and the first live pass that brings it into view re-poses it, so nothing visible
depends on it.

## 2026-11-03 — The bend rides the drag, one live warp per painted frame

Owner: *"on the test one its kinda working, but jumpy -- doesnt change while dragging but only when
'drag' is released - it should work smoothly with no time taken and also while dragging"*.

**What was wrong.** The pose was re-derived only when the camera SETTLED: during a pan the code
wrote the `viewBox` and nothing else, so every tile rode the camera rigidly, and the release then
rewarped all of them to the new pose in one step. That single step is the jump he saw.

**What happens now.** `WorldView.queueView` writes the camera and then calls `liveWarp` in the SAME
animation frame, so the `viewBox` and a fresh pose land in one paint and cannot disagree by a frame.
Several `pointermove` events inside one frame still produce one warp, because the pending frame is
never rescheduled. The live pass (`rewarp(live)`) re-poses only the ground whose DRAWN hexagon can
touch the view (the drawn centre plus the hexagon's own reach), while the release's `settleWarp`
remains the authoritative pass over the visible cells plus the half-view margin a live pass skips
(`warpStale` records that debt, so an unchanged pose cannot let it be dropped). A glide re-poses per
frame the same way, and `prefers-reduced-motion` settles in the same task instead of arriving
un-posed.

**Measured** (`web/e2e/dynamic-globe.ts`, 390x844, 18-move drag at one move per 16ms, on the
`data-warp-*` counters the warp already publishes): **1.1-1.6ms median / 1.8-3.4ms worst per live
warp, 367 attribute writes, 163-181 cells** (of 279) on Chromium desktop; **4.2-5.4ms median /
5.4-7.4ms worst at 4x CPU throttle**. Frames during the drag: 16.7ms p95 both unthrottled and at 4x
(one 33-50ms outlier at 4x in some runs) versus 16.8ms for the old settle-only pan, so the live pass
costs no frame at 60Hz on desktop and stays at 60Hz p95 when throttled. The release settle measured
against the last drag frame moves **0 of 137 visible tiles** (it used to move all of them — the
jump); afterwards the settle covers only the margin (212-230 writes, down from 507-581).

**Cost was taken from honest work, not shortcuts.** (a) ONE `d` string per cell is shared by that
cell's face and edge (it was built twice per cell); (b) a live pass touches only the visible ground,
restoring the margin at the settle; (c) an empty frontier no longer sweeps 279 tiles with a class
toggle and an empty dispute layer no longer rebuilds a 279-entry map on every painted frame. The
shared-corner guarantee is untouched: the projection still bends the shared CORNERS, and the seam is
measured on the bent paths mid-drag (**0.000px over 362 visible neighbour pairs**).

## 2026-11-03 (later) — The globe at 15% on a spread curve; every edge reachable; the fog posed live

Owner brief ("TERRITORY GLOBE: FINAL CAMERA, GEOMETRY & INTERACTION POLISH"): a stronger globe,
"ideally around 0.15", every edge tile able to reach the middle of the visible panel, and the
disconnected fog hexes fixed.

- **Strength 0.15, curve `k(u) = 1 - 0.15 * u^1.25`** (`GLOBE_SHAPE`), replacing the sphere's own
  `sin` at 0.08. Rendered and measured at 0.12, 0.135 and 0.15 on the real page (all pass the camera,
  fog and seam proofs in `web/e2e/globe-camera.ts`). The sphere's curve at 0.15 put all its squeeze at
  the rim: the panel's outer tiles measured 1.42-1.65 edge ratio at 34-46% of their area, i.e.
  slivers. The spread curve keeps the same rim but distributes the squeeze inward: 1.24-1.27 and
  53-55% (reference panel 1.2406, 51 tiles past the 1.10 product bar). Radially a tile is squeezed
  2.25x its tangential narrowing (the sphere's ~3x), so it still turns away rather than shrinking.
  A sphere-like power 2 at 0.15 failed 5 of the proof checks. The hexagon bar is now measured on the
  tiles the PANEL shows, at four cameras; every world tile must still be a positive, finite hexagon.
- **Pan limit on the focus** (the world point under the middle of the visible panel), not the box:
  every cell centre plus one cell of overscan (`web/src/online/world-pan.ts`). The product's own
  automatic first frame keeps the old inside-the-world rule so it opens full of land.
- **Feel:** soft edge (rubber band, max 15% of the view, 280ms return), flick carry (tau 220ms, from
  0.3 px/ms), none of it under reduced motion or in a pinch.
- **Fog:** posed with the same pose in the same pass as the land, live during a drag (it used to keep
  its paint-time pose: up to 21px off its neighbours). The far ring sinks toward the background.
- Measured cost: live warp writes +4% (the fog is now included); 1x drag frames p95 16.8ms. The 4x-CPU
  60fps check in `dynamic-globe.ts` fails on this machine for the unchanged baseline too (p95 66.7ms),
  so it is not a regression of this pass.

## 2026-11-03 — The globe is drawn at 8%, the owner's choice over the 5% recommendation

Owner decision, after being shown the strength ladder for the bent lattice in
`web/src/online/map-globe.ts`: **the shipped strength is `GLOBE_FALLOFF = 0.08`** (8% smaller at the
rim), replacing the 5% that had just merged.

**What was said before he chose.** 8% is past the repo's own hexagon-shape rule, `HEX_TOLERANCE = 1.10`
(no edge more than 10% from the tile's longest). Measured on the frozen world, the worst tile is the
outer corner `8,-10`:

| strength | worst max/min edge | shortest vs longest | sharpest interior angle | tiles past 1.10 |
| --- | --- | --- | --- | --- |
| 0.04 (recommended) | 1.0687 | 6.4% | 116.2° | 0 |
| 0.05 (was shipped) | 1.0877 | 8.1% | 115.2° | 0 |
| **0.08 (this)** | **1.1499** | **13.0%** | **111.7°** | **56 / 274** |
| 0.12 (rejected) | 1.2469 | 19.8% | 106.3° | — |
| 0.20 | 1.5056 | 33.6% | 91.4° | — |

He was also told that 8% is the same intensity as the earlier `fisheye-a` attempt he rejected — but
that the technique now is a **true sphere projection with no added contours**: the lattice itself
bends, nothing is drawn on top. He chose 8% anyway.

**The visual trade accepted.** Rim tiles are visibly compressed: at the map's edge a tile's two radial
edges are about 13% shorter than its four tangential ones, so it reads as a hexagon turning away from
the viewer rather than a regular one. Interior angles stay between 111.7° and 125.7° (regular 120°).
The middle of the map is untouched, and neighbours still share every corner exactly (no seams). The
median tile is 1.0571 and the 90th percentile 1.1188, so the compression is concentrated at the rim.

**The guard was re-pointed, not deleted.** `web/tests/map-globe.test.ts` used to assert that 8% fails
`HEX_TOLERANCE` and that the shipped strength passes it. It now pins a **hard floor of 1.20** — the
last rung before the tiles shear into trapezoids — for the shipped strength, and still fails for 0.12,
0.2 and 0.4. `HEX_TOLERANCE` keeps its 1.10 meaning and the test counts how many tiles exceed it (56),
so the cost cannot be quietly widened later. A 0.05 strength remains reachable by changing the one
constant; `globe-subtle` (0.04) is the previous recommendation.

**Superseded the same day:** the pose became view-centred ("Later the same day — the globe is
VIEW-CENTRED, and the panel is a CROP"), so the measured worst tile moved from 1.1499 to 1.2234 and
the hard floor to 1.30. The 8% and the reasoning above are unchanged; only the reference view is.

### Later the same day — the globe is VIEW-CENTRED, and the panel is a CROP

Owner: *"position still jumps, map still isnt the same on main menu and in territory -- we need a
diffrent approach to fixing this"*; *"the geometry was supposed to be dynamic - when edge of the map
is in the centre of the view, those tiles on the edge becoming larger - and what's around it on edges
is getting 'squished' ... so going through map almost feels like turning a globe ball object"*; and
*"so always the middle of the view - what's currently in the centre of the view is 'larger'"*. The
strength stays 8%; he explicitly did not want it talked down.

**The anchor is no longer a second viewBox.** The old `anchoredView` calculated what viewBox the
Territory panel needed to reproduce the menu's mapping. The panel now keeps the menu's physical
canvas (origin, pixel size) and its viewBox, and is clipped to its own frame with
`clip-path: inset(... round 14px)`; `WorldView` measures the panel's frame from the layout offset
chain, not from a transform-sensitive rect. A tile's absolute screen rect is therefore the same on
both surfaces by construction. Measured: **0.000px max rect delta over 279 tiles** in Chromium,
0.007px in WebKit (layout rounding), and **0.000px after a reload**.

**The globe is posed by the camera.** `viewGlobePose(box)` puts the sphere's centre under the view
centre and takes the view's half-diagonal as its rim, so the middle of the view is the fat point and
the edges recede; panning carries the fat point with the finger, zooming keeps the on-screen effect
the same size. The projection maths and `GLOBE_FALLOFF = 0.08` are unchanged. (Superseded the same
day: geometry used to be re-posed only on camera settle, "never per move" — that is exactly what made
the map jump at the release. It is now re-posed once per painted frame during a gesture; see "The
bend rides the drag" above. The settle still rewrites the visible cells plus half a view of margin.)

Measured on the reference 390x844 view: worst max/min edge at 8% = **1.2234** (91/274 tiles past the
1.10 product bar); 0.12 = 1.3870. The hard floor in `web/tests/map-globe.test.ts` is re-pointed from
1.20 to **1.30** (0.10 = 1.2995 still inside; 0.12 fails). The worst tile *visible in the Territory
window* measures 1.11-1.19 across the camera positions and viewports tested, so rim tiles read as
compressed hexagons, not slivers. Cost per settle: 2.4-4.2ms and 507-581 attribute writes on
Chromium desktop, 8.5-12.2ms at 4x CPU throttle; a pan is 0.006-0.03ms per viewBox write.

**The CI failure was not the flat-centre hit test.** The 8% commit already resolved taps against
`drawnAt` (the bent centres). On `cefe8521` the failing tap landed on the tile that was ALREADY
selected, and the product deliberately toggles a second tap off — so the suite read "selected
nothing". The hit test is now a pure `nearestCell` used by both the paint and the tap (the same pose
that is standing on screen), with unit tests proving a tap at a drawn tile's centre selects it at the
view centre and near the edge, and that the old flat-centre rule would have selected `-1,8` instead
of `-1,9` at the edge. The WebKit suite now taps a different tile's drawn centre and asserts the
selected cell is the one drawn under the finger.

## 2026-11-02 — The menu paints before the module; no filter on an animating part

Owner: "run couple extra smoothness checks and smoothness pack … making sure everything appears as
quickly as possible, all animations and transitions are smooth and satisfying … focus on efficiency
and reliability."

**The menu is static, so it is painted statically.** The product menu has a fixed shape (emblem,
wordmark, beta line, PLAY, TERRITORY, Settings); only labels and numbers are data. `vite.config.ts`
now fills the beta line (from `src/strings.ts`), drops PLAY's `hidden`, and adds `world-reserved`
only when the build has an online endpoint. `style.css` shows the product keys from the first frame
and reserves TERRITORY's 50px slot invisibly; `layoutMenu` reveals the key into the slot it already
occupies. The emblem paints from the same silhouette as a CSS mask until the SVG replaces it. This
is why the column no longer moves: measured at 390x844, PLAY's y is 568.06px both before and after
layout (0.00px), and the beta line/logo are on the first frame instead of arriving last. The legacy
channels keep the old gate; no skeleton state and no invented words are shown.

**A filter never rides an animating element.** Owner rule, already in `docs/UX.md` and this file; this
pass found four violations and removed them: the idle hint's `brightness` on the hand, the Throw
step's `grayscale` on every breathing card, the Bloom recipe's animated `drop-shadow`, and a primary
key's `brightness` on press/hover. They now use opacity/colour/background. Measured on the Throw
step: compositor raster 186.9 → 168.6ms per 2.5s at DPR 3. The Throw e2e assertion was changed with
it (it had pinned the old grayscale; the design intent — readable colour plus the ember edge — is
unchanged and now pinned by the absence of the filter).

**Two hot-path reads moved out of the loop.** Painting a Bloom reads the board transform once per
gesture; the drag ghost uses its written size, sampling the box only during the 180ms mini/full
morph.

**Deliberately not touched.** The Territory map's `world-glint` (an infinite filter on every owned
tile) and `world-lamp` box-shadow breath, and everything in `world-view.ts` / `world-camera.ts` /
`living-territory*.ts`: a concurrent change owns that map. The race bar's registered-property
transition and the hand's designed Throw breath are reported, not changed.

**Pre-existing test drift corrected, not hidden.** `web/e2e/hand-life.ts` still looked for a single
`hand-breath` animation and a `--breath-scale` property that the five-baked-amplitude pass replaced;
`web/e2e/online-lobby-check.ts` measured the wordmark→buttons slot on `.menu-inner` after that group
moved into `.menu-stack`, so it could not see the beta line it exists to guard. Both now measure the
current structure (the same intent, stronger). `hand-life`'s final Speed Off assertion remains the
documented pre-existing failure; every breath/reduce-motion check before it passes.

## 2026-11-02 — Transactional mail wears the brand, and lives in the repo

Owner: "if you do design emails sent to people to confirm account / remember password etc, make sure
they're FUTASAKU, with branding, lowkey nice design, simple wording etc, matching the game and language."

**The templates are files.** Supabase Auth's six templates (confirmation, recovery, magic link, email
change, invite, reauthentication) live in `server/email-templates/`;
`scripts/apply-email-templates.mjs` PATCHes the project's `mailer_subjects_*` /
`mailer_templates_*_content` and reads them back. The dashboard is not the source of truth: a change
made only there leaves no reviewable copy and no history.

**Why it is plain HTML and not the game's glass.** Email is not a browser: Gmail strips `<style>`,
most clients ignore CSS variables, `backdrop-filter` does not exist, and inline SVG is stripped. So
the brand is carried by type and colour taken from `web/src/style.css`
(`#18191a` ground, `#eeebe4` ink, `#efe5cb` accent, `#b7a98a` for the quiet brass label already
used by the privacy page). There is one cream button with the raw link underneath for clients that
drop it. No hexagon is drawn: a CSS hexagon needs transforms or pseudo-elements that clients drop.

**Honesty about time.** The copy says "valid for one hour" because `mailer_otp_exp` is 3600. The
apply script warns when the two disagree instead of letting the email promise a duration the server
does not honour. Notification templates are disabled on this project and are not branded. The old
hand-paste `server/templates/email-signin.html` was removed as a second, conflicting copy; history
keeps it.

### Later the same day — the real wordmark, and an image that is not a dependency

Owner: *"the emails sent should contain FUTASAKU logo (no tree one) and be more futasaku, by default
in dark mode."*

The first pass used a letter-spaced type wordmark because "an image would arrive broken". That was
right about the risk and wrong about the conclusion: an image is only fragile when it is the only
carrier. This pass uses the game's own treeless mark (the HUD badge / Profile nameplate asset) as a
hosted PNG at a stable absolute URL — `https://www.futasaku.com/email/futasaku-wordmark.png`, 300×92
(2× of a 150×46 box), tinted `#efe5cb` on the card's ink by
`scripts/build-email-wordmark.mjs` from `web/src/assets/futasaku-wordmark-silhouette.webp` — and
keeps the type wordmark as the fallback instead of deleting it:

- fixed `width`/`height` attributes **and** inline sizes, so a blocked image reserves its box and the
  header does not collapse;
- `alt="FUTASAKU"` styled in the same cream, serif and letter-spacing as the type wordmark, so an
  images-off inbox still shows a deliberate wordmark rather than an empty band;
- `--blocked` in the render script makes that state reviewable, and the measurement reports the box.

More FUTASAKU without clutter: the game's serif display voice for headings (Georgia, the email-safe
relative of Besley), the cockpit's monospaced readout for the code digits, and "VALID FOR ONE HOUR"
as the one quiet brass instrument label. Nothing decorative was added; no gradients, clipart or new
mark was invented.

The cost is honest: the PNG lives at the site root, so it resolves only when this commit is promoted.
Between the push and the promote, real mail shows the alt-text wordmark — by design, not by accident.
`/test/email/futasaku-wordmark.png` proves the file is published before the promote.

Images: [confirmation](screens/email/confirmation.png),
[images off](screens/email/confirmation-images-off.png), [320px](screens/email/confirmation-320.png),
[recovery](screens/email/recovery.png), [magic link](screens/email/magic_link.png),
[email change](screens/email/email_change.png), [invite](screens/email/invite.png),
[reauthentication](screens/email/reauthentication.png).

## 2026-11-02 — Windows keep no interior hairline divider

Owner: "i also dont like the hairline divisions in profile (and if shows up anywhere else) - id
remove and not add in new widnows iin future".

**The rule.** A window separates its rows and blocks with space, a size/weight step or a muted
label, never with a 1px rule between them. The plate's own outer edge is the glass material and is
not covered by this rule. The standing version lives in [UX.md](UX.md#design-rules), and
`tests/window-dividers.test.ts` fails on a new directional hairline inside any window (or on a
pseudo-element line, which is the same thing in another coat). A genuinely necessary divider is
allowed only with a `divider-ok: <reason>` comment at the rule.

**What changed.** The Profile lost its header rule, the rules between the four identity rows, the
rule above the record and the rule between the offline and online records; the six record tiles
now use a neutral fill instead of a 1px contour. The same interior rules were removed from the
pause plate (header, tool row and the centred score rule), Settings rows, "What happened", the
finish card's stat rows, the Territory window's head and standing block, Match Intel's stat strip
and tip accents, the tutorial Bloom groups, and the match chat's head/foot/message separators.

**What was kept, and why.** The 2px+ coloured marks that carry meaning rather than divide blocks:
the observation's margin rule in Match Intel, the card combo edge, the score-pop accent and the
gameplay HUD edge. Buttons, inputs, form fields and the record tiles keep their own contour (or
fill) because that is a control's edge, not a rule between two rows. The glass plate's own edge is
untouched. The Profile plate's measured opacity guard (the "Matches won" band) is unchanged.

## 2026-10-16 — The shared link preview showed the old name (owner report; fixed)

Owner: "when sending a link with an invite to game - the graphic that shows up is an outdated severor
one". Two separate faults, both on the share path.

- **The picture itself was stale.** `web/public/og.png` was drawn by `web/e2e/og-image.ts` on
  2026-10-04, two days BEFORE the rename (`GAME_TITLE` was `Severor` then), and the file was never
  regenerated. It literally rendered the old wordmark. Nothing caught it because the generator is a
  hand-run script and the file is committed.
- **`og:image` was relative** (`./og.png`). The Open Graph spec requires an absolute URL and
  WhatsApp / iMessage / Slack drop a relative one rather than resolving it.

So the card is no longer hand-drawn. `npx tsx web/e2e/og-image.ts` now renders the REAL game (the
built `web/dist`) in Chromium at exactly 1200x630, plays a fixed seeded opening, screenshots it, and
lays the app's own marks (`futasaku-emblem.webp` / `futasaku-white.webp`, tinted `--c-accent` with the
same alpha-mask recipe `branding.ts` uses) over the top band, with the words lifted from
`web/index.html`'s own `og:title` / `og:description`. Palette, type and board therefore come from the
product and cannot drift from it again. The file is `web/public/og.jpg`, not `.png`: the picture is
photographic and lossless PNG weighed ~930 KB against ~200 KB at JPEG q92 — five times the bytes on
every unfurl. The script also verifies the share path it feeds (absolute url, real file, exact size,
no stale name, current icons); a fast unit guard (`web/tests/share-preview.test.ts`) re-checks the
metadata on every `npm run check`.

Metadata added: `og:site_name`, `og:url`, `og:image:type`, `og:image:alt`, `og:image:v`, and the
`twitter:title` / `twitter:description` / `twitter:image` set X needs (only `twitter:card` was there).
`/futa0.5/` — where share links pointed until 2026-10-14 — is a forwarding page, and it now carries
the root build's own share tags (lifted from that build, never repeated by hand) so old links preview
too.

**Cache, and what the owner has to do.** Every invite link is `https://www.futasaku.com/#/join/CODE`,
and a fragment is never sent to a server, so scrapers see the SAME page URL for every invite and cache
its preview as one object (WhatsApp and Slack hold these for weeks). A `?v=2` query was added to
`og:image` — it makes the image address change when the artwork does, which protects CDNs and
browsers — but it cannot bust a page-URL cache that already holds the old card. To see the new one on
a link that was already shared: re-scrape it with Facebook's Sharing Debugger ("Scrape Again", which
WhatsApp reads), or share it once as a NEW address (any extra query, e.g.
`https://www.futasaku.com/?v=2#/join/CODE`); a fresh invite CODE does NOT help, because the fragment is
stripped. Bump `?v=` in `web/index.html` in the same commit whenever the picture changes again.

## 2026-10-15 — Seeds/world v1 implementation boundary

The isolated `futa0.5-world-seeds` branch adds a server-owned Seeds ledger and a 183-cell shared world while preserving the current engine. No merge or deployment is included. The historical automatic map-award path is removed in source and historical owners are copied in the new migration. The online owner must coordinate schema, Edge and web activation so no old awards are missed between copy and cutover. Details: [WORLD-MAP.md](WORLD-MAP.md).

One line each: where the brief left room, what was chosen and why.

## Positioning pass (v0.8.1)

- "Points-up/down family" in the brief: on phones the board already uses the family that gives bigger tiles, which is points left-right in the code ("flat"). I kept that family; its neighbour directions include straight up, so the homes can be exactly vertical.
- Home axis: the board turns in steps of 60 degrees within its family. This is display only: engine coordinates, saves and replays never change.
  - Phones: the volcano is at the top and the tree at the bottom, on the centre line.
  - Points-up-down boards (the 768x1024 tablet and desktop, where that family gives tiles 8% bigger: 107 vs 99pt): my tree on the left, the volcano on the right, level.
- Equal gaps: the two lattice vectors are rounded to whole device pixels once, and every centre is built from them.
  - Of the roundings next to the true vectors, the one with the most equal neighbour distances wins.
  - Drift is at most 1.5 device pixels per step out from the centre, symmetric, so the board stays centred.
  - The painted world uses the same lattice.
- The board's area now matches the layout exactly. The CSS had an 8px margin against the layout's 4px, plus a 6px bottom padding that lifted the board 3px.
- Header: equal side columns (`minmax(0, 1fr)`) put the turn pill exactly on the centre line; before, "Opponent" being wider than "You" pushed it 14pt left at 390x844.
  - The sides now mirror: You ◯ 0 | pill | 0 ◆ Opponent.
  - When either side doesn't fit (a 360px phone with Large text, long scores), both words go together, so the sides stay mirrored. The marks, colours, labels and a tooltip still say whose score it is. No word is ever cut off.
- "?" (How to play): it stays a round corner tool, bottom-right, paired with the bottom-left slot. That slot always holds Replay (dimmed until the opponent has moved), or Skip while an animation plays. The four corners are always two mirrored pairs, and How to play stays one tap away.
- Hint: it sits in the pile row, centred, with the move buttons under it; the deck and the throw pile mirror each other on either side. The hint row is gone.
  - Hints are 28 characters at most. The longest measures 163px at 14pt, so it fits on one line; the centre column is at least 172px.
  - Both pile columns are the same width (the throw pile's label with its count needs 72px), so the pair is a true mirror.
- Hint weight: full for my first 3 turns, then quieter (muted, regular weight) for the everyday hints (draw, sprout, throw). It returns to full when it says anything else, or after 6 seconds on my turn with no tap.
- Undo and Sort: fixed 28pt slots at the two ends of the hand row (44pt touch area), with the fan centred between them. Each is always shown, dimmed and disabled when it has nothing to do, so neither ever appears alone and nothing moves.
- Confirm: the forecast bar covers the whole pile row while a move waits, so the dock never changes height.
- Spare height: on 390x844 and 430x932 the board already spans the full width, so the hint row's height can't make it bigger. The pile row first takes room for its largest piles plus 16pt above and below, then the hand row takes up to 32pt. Whatever is left goes equally above and below the board, never as dead space inside the dock. The old "no gap over 16pt" layout test now applies whenever the board doesn't span the full width. When it does, the test checks that the dock rows already took what they can use.
  - Tiles at 360x640: 49.6 to 54.9pt (+11%). 390x844 and 430x932: unchanged (width-limited).
- Hand cards stay at most 72pt wide. 84pt was tried: then a card's middle hides under the next card in a full hand (a card wider than twice its visible slice).
- Footprint: rock shadows and edges, tile contact shadows and the home mounds' contact shadows now stay inside their own hex, still offset down-right (away from the top-left light). Grass and lava pictures still overlap their neighbours by design (one lawn), so I left that as it is.

## v0.8 UI pass

- Rule (asked for by the user): a Fruit card uses the turn's Sprout, so a turn has one Sprout, one Strengthen or one Fruit card. Blooms are unaffected. The error for a second one is `SPROUT_LIMIT`, the same as a second Sprout. `fruitUsesSprout: false` brings back v0.6/v0.7 play (the legacy test preset uses it, since it has no Sprouts at all).
- The step's name stays "Grow" (user's choice), and the game's name stays Severor.
- The Draw / Grow / Throw bar is gone. The hint line now carries the turn:
  - it offers the Fruit card next to the sprout;
  - it says "Fruit used" or "Sprouted" once the sprout is used;
  - it always ends at "Throw a card".
- The height freed by the bar, the landmarks' old headroom, and thinner margins (the zone keeps 4pt a side, the board 2 units) all go to the board. On tall phones the board is limited by the width, so the gain there is small (+2-4%); 360x640 gains most.
- Orientation is still chosen by measurement. Without the headroom, 360x640 now picks flat hexes too, by a hair (50.0pt against 49.7pt tiles; v0.7 had 47.6pt).
- When the board cannot use more height, the spare goes to the piles row first (up to +40pt), then the message row (up to +40pt), then the hand row (up to +32pt). This keeps the gaps at 16pt or less.
- The "?" is a fifth corner tool in the board zone's lower-right corner. That corner is usually empty: hex corners leave it free in both orientations, and the layout tests check this. During animations the Skip button takes the corner and the "?" hides.
- The "Fruit cards unseen" chip is gone: no hidden-information indicator. The engine still keeps the public count for the bots.
- Piles row: 84pt minimum (was 72), so the pile cards are about 25% taller. The labels and counts are unchanged; the old chip's slot gives them room.
- Fruit card: the numbered cards' layout (corner index, centre icon), with the mushroom in both places. Bone cream, because Ash is already lavender and the four suit colours, gold and both player colours are taken.
- Homes are drawn top-down inside their own hex:
  - a round apple-tree canopy, with the mint circle marker at its heart;
  - a 3/4 aerial volcano, with the diamond crater as its marker.
  The home tile has no number plate, and the danger ring and count are drawn above the landmark, so no tile information is hidden. The old "rise a quarter tile" headroom is gone.

- "Never a straight line" is read as "never has to be one": the brief also says "no shape restrictions beyond being connected", so a straight chain is one legal shape among many.
- The action is a clean rename: `Bloom { cards, hexes }` replaces both old actions; the engine accepts the cards in any order (`hexes[i]` gets `cards[i]`); `legalActions` lists runs with the cards ascending.
- `legalActions` stays exhaustive: a set once per hex set, a run once per legal assignment. The worst case measured (a four of a kind plus a 4-card run, a wide network) is about 6,200 Blooms, listed in about 25 ms, so no cap was needed; `bloomChoices` gives the compact form (group, cluster, assignments).
- Five or more cards of a run: only runs of exactly 3 or 4 consecutive cards are listed (the brief's "any 3 or 4 consecutive cards").
- Error codes: a wrong size is `BLOOM_WRONG_SIZE`; cards with two numbers and mixed suits are `RUN_MIXED_SUITS` (neither a set nor a run); the old set/run codes stay for the other cases and for the parked deadwood rule.
- `bloomMustTouchNetwork: false` (engine only) simply skips the touching check; nothing in the page offers it.
- Bots fully score a short list of Blooms after a quick look at every legal one (10 by default): the best quick scores, the clusters most joined to my network (they protect thin links) and the strongest takeovers, so one purpose never crowds out another.
- Each card group is its own move kind; the moves row shows one button per family (a number for sets, a suit for runs) and size: a set keeps the card that fits the rest of the hand best, a run blooms its highest numbers; a picked card narrows it.
- Painting: the first tap on an empty shape also shows the suggested Bloom through that hex (with Confirm); tapping on keeps painting one hex at a time, so every Bloom can still be made by taps alone.
- The hint for a mouse says "Click to start your bloom, click to finish" (the longer wording did not fit one line on a 360px phone).
- Home wording: the code keeps "root"; the player reads "home", and tile cards and captions say "Your tree" and "Opponent's volcano" (strings: HOME). The coach's glossary word is now "home".
- The blocked-Bloom hint reads "Too few free hexes by your tiles to bloom 3" (it must fit one line); it shows when a held group has no legal Bloom and nothing is picked.
- Word scans: the old combo words and "root"/"roots" are banned with no player-facing allowlist; the only exemption is the scanners themselves (web/tests/bloom-words.test.ts and the scan line in web/e2e/smoke.ts), which must name the banned words.
- Board orientation: chosen by measuring both for the board zone (ties keep points left-right). Tile width is the distance between neighbouring tile centres. 390x844 and 430x932 turn the board (+14%, +15%); 360x640 keeps points left-right (+29% from the slimmer dock).
- The turned board is a rendering mapping only (logic/orient.ts): centres, corners, the point-to-hex lookups and the tile-shape tests of the painted textures go through it, so text, landmarks, textures and the top-left light stay upright. Each orientation paints its own tile textures (in the background).
- The board has no outer frame, rim or corner pins; its drawing area is the tiles plus 6 units of margin and half a tile of headroom at the top (for the home landmarks).
- The dock is three fixed rows: a message row (the hint line, or the forecast bar while a move waits for Confirm), the piles (v0.8: no Fruit chip) and the hand. The hint and the forecast share one row because the empty forecast row read as a dead band under the board.
- Spare height above a width-limited board goes to the piles row and the message row first (up to 40pt each), so no gap around the board is over 16pt; the pile cards grow with it.
- The corner tools: shield top-left, target top-right, replay bottom-left, and Skip (only during animations) bottom-right; their one-time tooltip replaces the old "names for the first 3 games".
- Sort is an icon at the right end of the hand (32pt reserved); the smallest visible slice of a card in a full hand is 36pt (was 40) so a full hand of 8 still fits beside it at 360pt.
- The pill's clock "X turns left" is the smaller of the turn limit and half the deck (each round takes at least one card per player); the old unused end-of-game note was deleted.
- Gold hexes: a soft amber tint, a fine grain of tiny dots, a thin edge and the "2" badge (no stripes).
- Pile cards reuse the hand's card component scaled to the piles row (1:1.42); in the Draw step they glow softly and lift 2pt instead of a thick outline.
- Step 3: on tall phones the board is width-limited; spare height goes to the piles (up to +40pt) then the message row (up to +40pt), so no gap between zones exceeds 16pt.
- Step 3: while Undo shows, the coach and first-time tips stop 120px short of the right edge and the Undo chip sits above them, so it is never covered (CI's slightly wider fonts showed the gap alone was not enough).
- Step 4: my home is a small gnarled tree (round, soft shapes, a mint circle in its hollow); the opponent's is a faceted basalt volcano (angular, a red-orange diamond crater): shape alone tells them apart in greyscale.
- Step 4: the volcano is drawn as tall as the tree (peak at the same rise) with a thin light rim, so it stays readable on its dark lava tile and at 40pt.
- Step 4: the danger ring is drawn in the other side's colour on the blocked sides (red on my tree, mint on the volcano), with "N/6" under the tile; it never flashes.
- Step 4: idle motion (sway, falling leaf, smoke, breathing crater, embers) runs only with motion on and Effects above Low; Material detail Low draws the landmarks flat (no highlights, flowers or basalt layers).
- Step 4: the Strangle finish is pulse 380ms, hold 260ms, smother/wither 820ms, bloom/roar 480ms (1.94s at Normal), scaled down by speed; Reduce motion shows only the smother/wither (500ms).
- Step 4: home sounds: tree tap = soft rustle and a warm note; volcano tap = low rumble with crackles; smothered = a breathy sigh; withered = a low grind. All go through the existing sound toggle.
- Step 4: the strangled volcano keeps its ashen crater visible above the moss (the first draft hid it under a flat green triangle).
- Step 5: the one-tap suggestion ranks Blooms through the tapped hex by tiles gained, then opponent tiles replaced or cut, then the fewest of my tiles left open to a cut, then engine order (deterministic).
- Step 5: the first painting tip loops a finger over a bent cluster of three hexes (not a straight strip), because a Bloom can be any connected shape.
- Step 6: Bloom bands: levels 1-3 skip a Bloom 45% / 35% / 25% of the time they would play one, otherwise pick a random legal Bloom (seeded); 4-6 the best quick look; 7-9 the full short-list score; 8-9 hold a plain 3-card Bloom when the chance of a 4 over the next (at most 3) draws is at least 20% and the best other move costs at most 2.5 points.
- Step 7: the autosave is seed + action list + rules version (key severgrow.save.v7); a save from other rules or with an action the rules refuse starts fresh. A game started from a set position (browser tests, the lab) also keeps that position as `base`; ordinary games never write one.
- Step 7: two audio buses (effects, music) with 0-100 sliders on a squared curve (defaults 80 and 60); the Sound and Music toggles still switch them off; a limiter (-6 dB, 20:1, 3 ms) on the master.
- Step 7: the in-game menu is the pause menu ("Paused"): while it (or a sheet opened from it) is open, the next animation step and the opponent's moves wait and CSS animations on the board hold still.
- Step 7: the first-run welcome card shows the three turn steps with icons (Draw, Grow, Throw), the goal, and the tutorial suggestion; its words live in src/strings.ts (WELCOME).
- Step 7: keyboard: D draws from the deck, T takes the throw pile, U undoes (only when Undo shows), next to the existing 1-9, Tab, arrows, Enter, Backspace and Esc.
- Step 7: motion tokens tap 80 / quick 160 / move 280 / moment 600 ms, ease-out and ease-spring, kept equal in CSS and code by a test.
- Step 7: the settings groups stay as they were (Look; Sound and feel; Animations; Playing); the volume sliders join Sound and feel.
- Step 8: the ladder runs 1,000 games per pairing, as asked (swapped starts, 4 processes).
- Self-critique (main screen, round 1): with two or more ways to bloom, the Bloom buttons ran off the right edge of the dock. Now one "Bloom" button ("N ways") opens a list of choices upward over the message row; each choice shows its card numbers in suit colours, so "Bloom 4 tiles" from 3-4-5-6 and from four 6s are told apart. A single way keeps its own button.
- Self-critique: the "Fruit cards unseen: N" chip is now the Fruit card icon and the number (the full words stay as its spoken label and tooltip), freeing room in the dock row.
- Step 9: rotating the phone mid-paint keeps the half-painted shape (nothing is placed); painting carries on afterwards.
- Step 9: the first-tap time is measured with a cold cache on a slow connection (1.6 Mbit/s, 150 ms) and the CPU 4x slower.
- Step 9 (performance): the background grass and lava painting now runs only in idle time, after the first paint; before, its back-to-back slices delayed the menu's first paint (first tap at 4x CPU: 6.4 s -> 2.1 s).
- Step 10: the installable app (manifest, icons, offline service worker) already existed and is kept; the share preview is a 1200x630 image drawn in code (web/e2e/og-image.ts) and committed as web/public/og.png, with og/twitter meta tags.
- Step 10: local playtest notes appear only on ?debug=1 (turn times, Undo count, empty turns, the longest pause and where it ended), kept in this browser (severgrow.playnotes.v1), with "Export as JSON"; nothing is sent anywhere.
- Step 10: set dressing (decorative props outside the board) is not done: cut as the lowest-value item.

# Decisions (Seed removal and Fruit cards, v0.6)

One line each: where the brief left room, what was chosen and why.

- Seed mode in the code differed a little from the brief: it never blocked Sprout on turn 1; it made every one-card tile worth 1 and lifted the Strengthen limit so a seed could grow later. All of it is removed.
- The menu's two buttons ("Sprout" and "Seed") became one "New game" button; the version chip, the version picker, "Try the other version" and the per-version record are gone.
- The random number of the deal shows only on `?debug=1` (a small corner box); `?seed=N` still starts that deal but never shows the number. That page is the only word-scan allowlist entry.
- The word scan bans whole words only, so "seedling" (the level 1 icon's name in the docs) and "plants" stay allowed; none of them are shown to the player anyway.
- Old saved games, old tickets and the frozen bots-v0.5 were deleted (fast mode); the goldens are re-recorded on the current rules.
- The Strengthen limit stays as configured (2 per game); the brief says keep Strengthen as is.
- "An empty turn" means a Grow step whose only legal move is ending it; in 200 level-7 games (3,581 Grow steps) it never happened, so the test uses a built "all 9s" board.
- "A plain throw never needs a second confirmation": throws never ask, except throwing your very last card under Confirm "Always" or "Smart" (unchanged; that throw ends your hand).
- The opponent's turn is worked out at its start (same moves the bot picks step by step), only to set the pace; an empty one runs on 200ms of beats and shows for about 400ms in total.
- After an Undo of an auto-skipped Grow step, the game shows the reason and Continue instead of skipping again (no loop).
- A Fruit card is `{ id, suit: null, rank: 0 }` (ids 72-75 after the 72 numbered cards): "no suit, no number" in plain JSON, and rank 0 makes it count 0 for the parked Rot/Knock.
- All Fruit cards are alike, so `legalActions` lists the lowest-id one once per target (like identical number cards); any Fruit card id is still accepted by `apply`.
- "Fruit cards not yet seen" = 4 − mine in hand − played − in the throw pile − those I saw the opponent take from the throw pile (`fruitKnown`, dropped when they play or throw Fruit cards).
- A Fruit card does not use the turn's Sprout, and the Strangle check after it can only end the game if a root was already surrounded (removing a tile only empties a hex).
- The recorded v0.3.1 replays (they used the old 3-tile Fruit) were deleted with the old Fruit; `legacyV03` now only switches the parked rules on for their tests.
- The old Fruit's sacrifice-picking UI (tile card "Fruit this tile", Change/Next, its screenshots and peek scripts) was deleted; a Fruit card is played like a Sprout (card, then target) or from the tile card's "Use Fruit card".
- "Consider Strangle": a Fruit card can never surround a root by itself, so the bots look for a Fruit card that opens a Strangle (a Sprout or combo this turn then wins); levels 4-9 always take it.
- Levels 1-3 play a Fruit card at a random moment with a seeded 35% / 30% / 30% chance per Grow step holding one; levels 1-2 throw one away with 25% / 15% per Throw step holding one.
- "High strength" for levels 4-6 = 7 or more; "big cut" = 3 or more tiles removed in all.
- A slip (the levels' mistake rate) never picks a move the bot rules out altogether (a Fruit card throw, a Fruit card it would keep); this also applies to Strengthen moves ruled out.
- Fruit card defaults chosen by simulation (SPEC 11.4): 4 cards, root counts as touching; two targets fail and are reported (Fruit played in 99.9% of games; 17.6% of games end with >30% top-rank tiles).
- "Game length within 10% of the current default" compares with the v0.5 default (9.14 turns each), the last default before this change.
- Fast mode, saves: the saved-game key moves to severgrow.save.v6 and a save from older rules (no Fruit card fields) is dropped; the player starts a fresh game.
- Lab (TEST, lite): Classic = no board override (`board: null`), so the classic game's own terrain generation is untouched; Lab boards set `config.board`.
- Lab: with reshuffle on, the game also ends when every card is on the board or in a hand (nothing left to draw, not even after a reshuffle); before this it froze.
- Lab: bot caps apply only on Lab boards (`config.board` set): 4 candidates (not 6), 3 imagined hands (not 6), 12 other replies per hand, 300 Bloom choices per quick look. The classic game's opponent is unchanged.
- Lab: a Lab board's `boardRadius` is how far its farthest hex is from the centre (hex names and sizes use it); rows past Z are named by coordinates.
- Lab: an active experiment also applies to "New game" from the menu, until "Back to Classic".
- Lab: one finger on empty space pans a zoomed board; one finger on a hex still taps or paints, as before.
- Lab: "Homes: near centre" picks the pair about 4 steps apart (the shortest distance that gives no warning).
- Lab: the "bots play each other" feature is called "Watch a game": green (my seat) and red each have a level; "Take over" hands green back to me; watched games are not counted in stats.
- Thumb layout (TEST): the waitlist already existed as docs/LIST-TO-IMPLEMENT.md; it is renamed docs/WAITLIST.md ("Waiting for the locked beta") and every earlier test change is listed there with its date and commit.
- Thumb layout: "phone" = touch screen (coarse pointer), portrait, at most 600px wide; the settings live in the test copy's own storage and appear in Settings under "Phone layout (test copy)".
- Thumb layout: the cards are turned with the arc (a real fan: each card's top points away from the arc's centre); turning them less would shrink the visible slice under 40pt.
- Thumb layout: when space runs out, the order of give is: slightly smaller cards, then the board's 44pt tiles (the dock may take up to 60% of the height), and only then the slice (never under 30pt). A normal hand (8 cards) keeps 40pt+ slices on a 360x640 phone; its tiles drop to about 38pt. A 10-card hand (Lab only) on 360x640 gets 32pt slices.
- Thumb layout: the fan is sized for the game's largest hand (hand size + 1); a smaller hand spreads wider (up to 85% of a card per slice) and stays centred on the arc. Spare height (a board limited by the width) goes to the fan, so there is no empty strip.
- Thumb layout, left hand: the whole layout is mirrored and the cards stack the other way, so every card's number corner stays visible.
- Thumb layout: the move buttons sit in a column over the piles; the coach and first-time tips in the free corner above them, beside the fan (at least half the screen wide). The "?" button is hidden; How to play was already in the in-game menu.
- Idle tip: shown only with the thumb layout (where the hint row is gone); placed in the top, middle or bottom third of the board, whichever has the fewest tiles and rocks (ties: top, then bottom); a 15% soft plate only when more than 4 things are under it.
- The game has no drag-to-throw today (a card is thrown by tapping it, or tapping it and then the throw pile); both still work.
- Thumb layout, after the user's touch map: the piles move to the top left of the card area (just under the board), the fan starts about 36% across at the bottom and passes under them; the move buttons sit under the piles; the coach and first-time tips float just above the cards, 44% wide on the left (clear of my home at the bottom middle).
- Thumb layout, bigger map: the fan is packed using each card's real turned outline (not its diagonal), pushed to the bottom and right edges, and the empty height above it goes to the board; only 4pt is kept above the top card (a picked card lifts briefly into the air above). Card sizes are tried biggest first, each with a 42pt then a 40pt slice. On a normal phone the classic board already spans the full width, so it can't grow there; small phones and tall Lab maps gain the most.
- Thumb layout v2: a gently tilted fan of 10 cards at 40pt needs about 400pt of width, more than a phone has beside the piles; so the dock has two bands: the fan (full width, anchored at the right edge, small hands sit by the right thumb) above a bottom band with the piles (left), the move slot and Undo/Sort (right). Hands over 8 cards (Lab only) get thinner slices (32-36pt) rather than a smaller map.
- Thumb layout v2 numbers: cards 48pt wide (64 before, 25% smaller; 40pt at the smallest), slice 42pt (40 at least), end tilt 7 degrees, rise 10% of the fan's width, picked-card lift 10pt, piles 52pt columns with 48pt cards, dock cap 40% of the usable height, overlap at most 15% of the board's height.
- Smart overlap only applies when the board is held back by the height (a board already as wide as the screen can't grow). "Nothing can be played there this turn" = more than 4 hexes from my network (a Bloom's reach) and more than 1 from the opponent's; target highlights and a Bloom being painted cancel it at once. The see-through fan comes back to full strength for 3 seconds after any touch on the card area.
- Thumb layout v2: the pile labels sit over their counts (the narrower piles); "Skip sprout" keeps its words but is a small pill in the fixed move slot.
- Thumb layout v3: a 360px row can't give 44pt strips to 8 cards (7 x 44 + one card is wider than the screen), so 360px keeps v2's 48pt cards with the widest strip that fits (40.5pt); 390px gets 52pt cards with 44pt strips.
- Thumb layout v3: Undo and Sort need 44pt under the fan's raised right end; when the 12% rise leaves less, the whole fan lifts by the difference (a few points) rather than overlapping them.
- Thumb layout v3: the piles' counts became small badges on the pile cards (top corner) and the labels sit underneath, so nothing reaches the cards below; the move buttons sit beside the piles in the same notch (one row, two if they need it).
- Thumb layout v3: "never more than 24pt between the map and the dock" wins over centring: a board that already fills the width sits at the bottom of its zone and the spare height goes above it (under the header).
- Thumb layout v3: the bottom safe area was counted twice (by the screen and inside the dock); the dock now sits on the screen's own safe area, 12pt up. This is the likely cause of the empty band in the iPhone screenshot.
- Idle tip anchor: up to 51 spots are tried (17 heights x 3 positions); a spot touching a home, a tile, a gold "2", a highlight or a target is never used; the most empty hexes wins; then smaller words (80%, 65%); with no free spot at all, the smallest words at 20% where they cover the least.
- Weak-spot icons removed (test copy): the shield and target corner buttons, their first-time hints and their toggles are gone. My worst weak link now always pulses with its "-N" badge (it used to need the shield). The opponent's weak links show only on their tile card when tapped ("Opponent weak link: you can reach it now."). Everything the map showed by itself stays.
- Replay button: hidden in the test copy by a flag (`REPLAY_BUTTON`), code kept; the space it took is gone.
- Camera: DEFAULT_TILE is the Classic board's tile width fitted into the board's own box on that screen (59.4px at 390x844). MIN = DEFAULT x 1.0, MAX = DEFAULT x 1.4.
- Camera: if the whole map fits at MIN or bigger, the whole map is shown (it wins over zooming into the action); zooming in to the action area only happens when the whole map would be smaller than MIN.
- Camera: the hovered/painted hex is not added to the frame because the camera never moves while a Bloom is being painted anyway.
- Camera: Smart overlap (the map sliding under the piles) only runs when the whole map is shown; when zoomed in, the map is clipped to its own area instead so it never draws over the header or the cards.
- Camera: hexes and tiles outside the view (plus one hex) are not drawn; the veins, gold badges and background texture are still drawn (they are cheap).
- Camera: tapping an edge arrow shows that part of the map for 2.5 seconds, then the camera goes back (if it was on auto). Manual zoom goes from the whole map up to 2.8 x DEFAULT.
- Camera: the pill reads "Whole map" (and "Back to play" when on); it only appears when the map does not already fit.
- Pro phone layout (test copy): the header keeps only the menu button and the score bar (one 44pt row). The scores, whose turn it is, the level and turns left, and "What happened" moved to the top of the menu; there are no circle/diamond marks there, the colours say who is who. On my turn the faint tip on the map still says what to do.
- Pro phone layout: the dock is three separate bands that can never share space: the hand at the bottom, one control row above it (deck and throw pile on the left, Undo and Sort on the right, the move buttons stacked in the middle), then the map. The gap above the control row equals the gap below it, so the move buttons sit exactly halfway between the map and the hand. When the map is held back by the width, part of the spare height widens those two gaps (up to 20pt each); the rest stays above the map.
- Pro phone layout: the hand keeps the v3 fan's look (end cards tilted 7 degrees, the shallow curve, the 12% rise to the right) but is centred and compact (about 64% of each card shows, at least 34pt) with bigger cards; small hands stay centred. Left-hand mode mirrors it all. To keep the cards big on small phones the dock may take up to 45% of the height (was 40%).
- Pro phone layout: smart overlap (the map sliding under the cards) is off: nothing may sit on the map any more.
- Pro phone layout: deck and throw pile are a little bigger (52pt cards, 12px labels).
- Map behind the cards (test copy, phones): the board's area now runs on under the dock. The camera still frames in the window above the cards (all the framing rules, arrows and the idle tip use that window; DEFAULT_TILE too), so the cards never hide what matters. When zoomed in and there is more map below, it shows through behind the deck, the piles and the cards, under a soft fade: stronger (60%) while choosing, drawing or throwing a card, lighter (15%) while working on the map (a card picked, painting a Bloom, the opponent's turn, a finger on the map); then the cards and piles go 60% see-through until touched. The map behind the cards can't be tapped (pan it up first).
- A map shorter than the window sits at the window's bottom (just above the control row), as before.
- DESIGN (V2 skin): the button lives in the Lab sheet and reloads the page with ?design=1 (the drop's subclass is picked when the page starts); broken sprite crops were cleaned rather than shipped, and only whole details are used.
- Step guidance (test copy): the step is read from the game's own state on every render (my turn: DRAW -> "Draw a card", ACT -> "Play or skip", DISCARD -> "Throw one card"; the opponent's turn -> "Opponent"; game over or watching: none). The words are in src/strings.ts (STEP_CUE). The rarer sub-steps (KNOCK, ROT_PICK) count as Grow.
- Step guidance: the cue shows the moment the step starts (measured 3-10 ms after the render), at 60%, settles to 35% after 2.5 s; after 5 s without input one breath back up (1.4 s), then settled; any tap or key hides it at once (100 ms fade). Placement: the old idle-tip search, now also avoiding ghost tiles, the camera's pill and arrows, and (first) rock hexes; it shrinks (80%, 65%) before it would leave the board, and leaves room for the wider letters while it enters. The entrance animates letter-spacing too (as asked), on the cue only; nothing else moves.
- Step guidance: the "Tap to draw" / "Tap to take" chips sit at the bottom of the pile cards (so the throw pile's top number stays visible) and show for my first 3 turns. There is no card dragging in the game, so the throw pile's "Drop here" became "Throw here", shown while a card is picked in the Throw step; the ring pulses all through the Throw step.
- Step guidance: there is no Draw / Grow / Throw tracker in the game any more (removed in UI pass B), so nothing to strengthen there.
- Step guidance: pulses at half strength after 6 s of waiting, back to full after 10 s without input. Subtle: half the glow, no ring, no chevron. Off: only the normal states. Reduce motion: static text, no pulses. The "Idle tip" setting is gone (replaced by "Step guidance").
- Step guidance: CSS animations only (transform and opacity on the halo, ring, lift and cue); the browser's one animation timeline is the shared clock; the glow is a static box-shadow whose opacity breathes (no re-painting of shadows).
- Font bake-off winner: A, Bricolage Grotesque (display words and numbers) + Figtree (UI text). Why: Bricolage's numerals are sturdy and open, legible at about 14pt on both moss and lava in every palette, with real tabular figures; its slightly quirky, organic shapes fit the moss-and-lava look without going cartoonish, and uppercase step words hold together large and small. Figtree is clean and very readable at 11-12pt on dark. B (Fraunces) is lovely for headings but its numerals have no tabular form and the serifs fuzz on textured tiles; C (Barlow Condensed) reads sporty/technical and its narrow numerals get thin on tiles; D (Alegreya Sans) is softer and smaller. All four fit the 360px header line. Total 35 KB.
- Font sizes: body text 1rem instead of 1.0625rem (Figtree is wider than Alegreya Sans); everything else unchanged. Large text: the stacked move buttons drop to 0.8rem and may wrap to two lines so "Bloom 3 tiles" is never cut at 360px.
- Font loading: the font files and rules come with a small test-only module that loads just after the page script, so the first frame can still show Alegreya Sans for a moment before swapping (font-display: swap; fallbacks matched to the new fonts' size). The live build carries none of it.
- Step guidance v2: the "Tap to draw" / "Tap to take" chips are gone; the piles' glow, lift and ring say it. The big floating word became a small crafted plate: smoked glass with a fine rim in the step's colour (cream for Draw and Throw, moss green for Grow, ember for the opponent), a lit icon medallion (a card lifting off, a sprout, a card going down, an ember), a small line "Step 1 of 3" above the words, and three step pips (done, now, next). It lives at the top of the map's window, centred; if a tile, home, gold "2", highlight or the camera's controls are there, it moves down to the nearest free spot (empty hexes first). It enters with a fade, a 6px rise and the words' tracking settling, then one pass of light across the plate; the icon and the current pip breathe slowly. Crisp (100%) at first, 72% after 2.5 s; a tap hides it, 5 s of rest brings it back once. The chevron is gone (the piles' highlight points the way).
- Font v2: the user didn't love Bricolage Grotesque + Figtree. New bake-off (E Fraunces Soft + Plus Jakarta Sans, F Manrope, G Outfit + Manrope, A, D). Winner E: a soft, slightly old-style serif for the headline words gives the crafted, organic indie feel (moss, trees, lava) without being cartoonish; Plus Jakarta Sans is modern, clean and very legible for text and every number (tabular figures; Fraunces has none, so it never shows numbers). Fraunces is instanced soft (SOFT 100, WONK off) at a display optical size. Body text 0.97rem.
- Fonts are subset with hinting kept: without it, headless phone rendering spaced small text unevenly ("Thro w pile").
- Typography v2 (test copy, the user's choice): Besley (display) + Commissioner (UI), scoped under html.test-typography-v2, set by the test-only font module; the live game keeps Alegreya Sans. Roles, weights, sizes and tokens: docs/ART.md.
- Commissioner has no tabular figures, so "Severor Numerals" was made from Commissioner Bold (OFL allows modified versions under another name): every digit gets the "0"'s width with its outline centred. It covers only digits and a few signs (unicode-range), so numbers are steady and letters stay Commissioner. All numbers use it at 700 (card numbers too; the brief allowed 650-700).
- Typography v2 small corrections: tile numbers lowered 0.087em to the plate's optical centre (measured); the result title balances its lines and scales with clamp() (it left a lone "7!" at 390px); the welcome card's title is Besley (a heading); the sheets' section labels became small uppercase Commissioner labels (they read as labels, not headings); body text 1rem. No component dimensions changed.
- Also fixed while auditing: the step plate now finds its spot again after a resize or rotation (it could sit off screen); on wide screens the slim header's menu button no longer sits on the score bar.

## 2026-10-05 — Main2.0 candidate release

Apply the owner's approved Besley/Commissioner/Numerals, Pro phone layout, Full guidance,
desktop coach, slim header/Pause information, tap-again and Undo, smart camera and map fade
only to Test2. Retain ownership shapes and the existing Main terrain artwork. Lab, Watch,
DESIGN/V3 and comparisons stay experimental; no engine, bot, balance or scoring changes.

Retain original Classic golden fixtures. Assert disabled Lab metadata defaults before removing
only `board:null` and `reshuffleDiscard:false` for historical hash comparison; independently
compare complete games, events, legal actions, bot choices and replay against protected Main.

Wait for required player modules before announcing a working startup. Missing entry/dynamic
modules may reload once using native, channel-prefixed session storage; only successful startup
resets the flag. Missing font files/images must not trigger recovery. Phone rotation keeps the
painted hexes while discarding pointer coordinates from the old viewport. Teaching panels seek
free screen space so legal targets, homes and the step plate remain visible and tappable.

Publish one combined artifact preserving root Main, current Test, and Test2. The authorized Main
exception is its Pages workflow alone, plus scoped routing in generated service-worker output.
- V3 look in Test2 (2026-10-05): an option in the menu (V3 / Leave V3, remembered in main2: storage, or ?design=v3). The skinned renderer and V3 art from Dev, loaded only when the look is on; ownership shapes kept on V3 tiles; Lab and Design stay Dev-only. Checked by web/e2e/test2-v3.ts.

### 2026-10-05 — Test2 message hierarchy
The owner requested fixes to overlapping phase, turn, opponent notices and cramped tips after supplying phone screenshots. Test2 reserves one stable information row above the map, uses faint phase words and one subordinate notice, and opens full lessons/coach explanations only through Help. Original state-owned text and action listeners remain; Main and Dev retain their existing presentation. Twenty browser games are observed, with assisted complex Bloom placements counted explicitly. Long desktop control labels wrap inside their existing column. No gameplay changes.

### 2026-10-06 — Test2 board and turn flow
The owner now requests a larger board and instructions directly over its centre. This supersedes Test2's reserved information row: recover its 68–84px, retain the existing responsive fit calculation, and use pointer-through uppercase phase text fading in 140ms. Hide guidance during card selection or Bloom painting, then return it for the next idle decision. Keep concise notices at the board's top edge and full explanations in Help, with a bounded 44px Hint target.

Remove tile ownership symbols in Test2; existing Forest/Volcano artwork, networks, numbers and accessible descriptions communicate the position. Valid card-and-target Sprouts and completed legal Bloom shapes commit immediately, even with Confirm moves set to Always. Partial shapes and invalid targets spend nothing. Coach/accessibility placement previews still require choosing their highlighted position. Undo remains the safety mechanism. Main/Dev presentation and input policy, engine, bots, cards and save schema are unchanged. Preserve concurrent Main2.0 art/cache work when publishing; use existing exact-head CI and gated Pages, with no workflow or Main/Dev ref changes.

### 2026-10-12 — Tutorial v3: core run and extra lessons
The owner approved splitting the tutorial: a short core run (goal, turn, one Bloom, take over, win, free turn) plus separate extra lessons (Strengthen, Bomb & Blast, Throw pile, Skip & last round, Buttons); one word list (Draw pile, Throw pile, Grow, Bloom, Bomb, Blast, points). Details in docs/TUTORIAL-PLAN.md.

### 2026-10-12 — Tutorial v3: one tutorial, How to menu
The owner asked for the whole game in one tutorial of about 15–16 steps: Strengthen, take over and Bomb taught with Grow, Blast with Bloom, the Throw pile on a Draw, Skip with Grow (the » step), the buttons after the free turn; the last round only as a separate lesson. No tile colours in the copy. The main menu is New game, How to, Settings; How to holds Full tutorial and the separate lessons. This supersedes the core run / More lessons split above.

### 2026-10-13 — Display glow optics (owner-approved, not merged)
Owner reviewed the display→keys optics and approved them: "lock it in for now; may revisit later." Approved but not merged into `futa0.4` and not deployed to `/futa0.4/`; it stays on `futa04-display-glow`. Details and before/after evidence: `docs/DISPLAY-GLOW.md`. Merged into `futa0.5-online` (the combined FUTASAKU 0.5 build) on 2026-10-13.

### 2026-10-13 — Live duels (test channel, branch futa0.5-live)
Where the brief left room: migration numbered 0006 (0003–0005 taken). The replay allowance is a fixed 6 s (`LIVE_REPLAY_ALLOWANCE_MS`): the client has no replay-length acknowledgement today. The pop-up waits without limit for a drag/Bloom paint but at most 10 s for an animation/replay. "3 of their turns or 10 minutes" = whichever comes first. Strikes count consecutive timeouts of the SAME player. Leaving on the opponent's turn turns that turn into a normal 24-hour turn (the opponent did not choose to leave). The tutorial blocks challenges with its own code `BUSY` (shown as "Busy"). Expiry = 45 s, the same as the ring; the waiting pill counts the real remaining seconds. On phones the waiting pill reads "Waiting 40s · Cancel" (the full "Waiting for <name>..." does not fit at 360–430 px; screen readers get the full sentence). A rematch match opens without the starter-lottery animation (the server lottery still decides). The LIVE chip lives in the header's status strip (`#duel-hud`). The 24-hour "less than 15 minutes" warning is hidden while a match is live. Feature flag: `CHANNEL=futa-test` or `VITE_LIVE_DUELS=1`.

### 2026-10-14 — FUTASAKU 0.5 becomes the single merged build (`/futa0.5/` carries everything)
The owner asked for one 0.5 build with "everything we worked on 0.5-online and 0.5-live and all else".
`origin/futa0.5-online` already contained the live-duels merge on top of the online polish pass, so the
work was to make the deployed `/futa0.5/` carry the live feature too. Three things were needed, all on
the same branch (no `main`/`dev`/`futa0.4` touch):
- **Gate (reversible).** `liveDuelsEnabled()` now returns true for `futa05` as well as `futa-test`
  (and any `VITE_LIVE_DUELS=1` build). This reverses the previous session's deliberate test-only gate
  at the owner's request. One-line revert: drop `'futa05'` from `CHANNELS_WITH_LIVE_DUELS` in
  `web/src/online/live/flag.ts`. The product `futa04` build stays off. Pinned by `web/tests/live-flag.test.ts`.
- **Migration 0006** applied to the FUTASAKU project (additive/idempotent; RLS + anon/authenticated
  revoked proved live; advisors reviewed; keep-alive cron untouched).
- **Edge function** rebuilt and redeployed, so the live-duel routes answer instead of 404.
Details and the exact channel gate: `docs/LIVE.md`.

### 2026-10-14 — the main-menu tagline is removed from the menu (reversible)
The owner asked for the menu tagline `GROW · CONNECT · CONQUER` to come off the main menu. It lived in
two places: the static `<p class="tagline" id="menu-tagline">` in `web/index.html`, and
`src/strings.ts` (`ONLINE.tagline`, which `web/src/online/lobby-ui.ts` also wrote into that element on
the online build). Decision: **remove the element from the menu, keep the words and the styling**, so
the owner can restore it with one line and no visual fallout.

- `web/index.html`: the `<p class="tagline" id="menu-tagline">` is **gone** — it is not shipped
  `hidden`. A hidden placeholder is exactly the kind of leftover that reads as "unfinished" later, and
  removing it is the only way to be sure the menu column cannot gain an empty row.
- One-line restore: `SHOW_MENU_TAGLINE = true` in `src/strings.ts`. `web/src/main.ts` then rebuilds the
  element (`class="tagline" id="menu-tagline"`, text `ONLINE.tagline`) in its old slot between the
  wordmark and `.menu-buttons`. The `.tagline` styling stays in place for that
  (`web/src/style.css`, `web/src/fonts-futa04.css`, `web/src/player/fonts.ts`), and the words stay in
  `ONLINE.tagline`.
- No empty gap: with the element absent the column is `wordmark → (14px gap) → buttons`. `.menu` is a
  centred grid, so the column simply re-centres — nothing shifts sideways and no margin is left behind.
  `web/src/style.css` `.tagline` keeps its `margin: 0 0 14px` only for the restored state.
- `web/e2e/online-lobby-check.ts`: the old `tagline is GROW · CONNECT · CONQUER` assertion is replaced
  by four: the string is still available (`ONLINE.tagline`); the menu carries **no** tagline element;
  nothing sits between the wordmark and the buttons; and the wordmark→buttons distance equals the
  column's own gap (so a leftover margin would fail). Not weakened — the new checks cover the new
  decision and still guard the words.
- `web/e2e/online-ux-walk.ts`: `#menu-tagline` removed from the "no clipped text" selector list (there
  is no such element to clip-check any more).
- `web/e2e/typography-audit.ts` keeps `.tagline` in its selector list on purpose: the element no longer
  exists so it simply matches nothing, and it audits the tagline again the moment it is restored.
- Evidence: `web/e2e/menu-tagline-shots.ts` writes `docs/screens/menu-tagline-after-*.png` at 360x640,
  390x844, 768x1024 and 1280x800, paired with the `menu-tagline-before-*.png` captured before the
  removal; it also prints the logo/title/buttons boxes so a spacing regression is a number.

### 2026-10-14 — Accounts: recovery path (PROPOSAL — awaiting the owner's sign-off)

> **This is a proposal, not a decision the owner made.** Nothing was built or deployed; no
> application code, `server/`, `web/` or `src/` file changed, no database write, no Edge deploy.
> Full reasoning: [`ACCOUNTS.md`](ACCOUNTS.md); sharing verdict: [`SHARE-READINESS.md`](SHARE-READINESS.md).

What a code-reading pass found: there is **no account system** (no email/password/OAuth; the Edge
function verifies its own bearer tokens with the JWT gate off), and the **only** move-device path is
the Settings 8-character **link code** — single-use, **10-minute** life, made on the device that
still has the identity. It is a *transfer*, not a *recovery*: a guest whose storage is cleared
cannot reclaim their identity, and a `401` silently mints a fresh guest.

**Proposed (for sign-off):** build a **provider-free durable recovery code** (Option 1) now — it
needs no dashboard, sends no email, collects no personal data, and reuses the existing link-code
machinery — and keep **"Recover with Google"** (Option 2) as the owner's previously-stated
post-playtest destination, done together with real names. If the owner prefers one system only,
Option 2 (Google) is the one, at a higher cost (Supabase Auth + Google Cloud setup + privacy policy).
Whichever is chosen, a recovery must **attach to the existing `players` row** (never create a second
player) so matches and history survive. Names are also flagged: only **400** auto-generated nature
names exist, so collisions/impersonation are certain — recommend a stable discriminator when names
and accounts are done together.

### 2026-10-15 — Accounts: "Continue with Google" is built (owner decision; switched on by the owner)

Owner's decision, superseding the 2026-10-14 proposal: Google sign-in is a **prominent, default** part
of FUTASAKU but **never forced** — a one-time "Continue with Google / Play as guest" card before the
first online visit, a line for guests in Play online, and an Account block in Settings. Offline play
never needs an account. Names stay generated, with a permanent tag from the player id
(`MapleFox #7QK2`); chosen names come later. Scope is accounts + permanent identity only (no XP,
ranks, clans, map).

Built on the existing Supabase project with plain HTTP (no SDK): PKCE in the browser, the server checks
every Supabase token with Supabase itself and never trusts an id or email from the browser, and issues
its own token. A guest upgrades **in place** (same player, same matches); another device recovers the
same player; nothing is ever merged or overwritten (DB unique keys both ways). "Delete my account"
removes the link and the Supabase user and signs out other devices. Privacy policy at
`futasaku.com/#privacy`. Nothing appears until the owner switches Google on in Supabase — release order
and clicks in [`ACCOUNTS.md`](ACCOUNTS.md).

### 2026-10-19 — The root .com build gets the lessons tutorial, and the campaign reset is ACCEPTED

Owner direction: "newest levels tutorial update can be pushed to .com and merge". `futa0.5-online`
was an ancestor of `futa0.5-onboarding-3`, so the merge is clean (`--no-ff`, no conflict
resolution); the root build is now the lessons line's tree, unchanged.

**The storage decision.** The root (`CHANNEL=futa05`, path `/`) uses the `futa05:` storage prefix;
`/3/` uses `futa05-3:`. The lessons line moved the campaign's progress and match save to
`severgrow.campaign.progress.v3` / `severgrow.campaign.save.v3`, so **an existing root player starts
the campaign at level 1 again**. We accept that reset, for the reason already written in
[`CAMPAIGN.md`](CAMPAIGN.md): the onboarding polish changed several authored boards and the lesson
scripts, and a `.v2` "completed" list would unlock levels whose teaching has moved on — the player
would skip the new lessons rather than replay them. This is the owner's earlier written direction,
not a new choice made here.

Nothing is destroyed on the device. The old `.v2` progress, match save and lesson-mastery keys stay
in storage, unread and unwritten; no migration runs and no key is removed. The root and `/3/` have
different prefixes, so a player who tested `/3/` does not carry that progress into the root either
way. If the owner later wants "keep completed", it must be an explicit, visible migration (a one-time
`completed` import into the `.v3` record), never a silent read of the old key — reading it silently
would unlock levels nobody has been taught in the new script.

### 2026-10-24 — The Territory shows YOUR level, not the last one the server was paid for

Owner report: *"on my account - im at level 23 - but on territory it says im level 11 - should never
happen"*. Confirmed rather than assumed. The map's `ownerLevel` is not campaign progress: it is
`max(campaign level in seed_reward_receipts)` — the highest clear the server was ever **told about**
(`server/src/seeds/postgres.ts`, the lateral over `seed_reward_receipts`; `server/src/seeds/memory.ts`
computes the same thing on read). A receipt is written once per level, when a proof is settled, and
proofs are queued on the device until the next menu visit — so the number is a **lower bound** on
progress, and on the owner's account (paid through 11, actually on 23, because levels 12–22 were
never submitted) it understated by twelve.

The honest source of truth for "my level" is the device's own campaign record
(`severgrow.campaign.progress.v3`), the same record the PLAY entry reads. So the viewer's own ground
now takes `max(this device's level, the server's recorded level)`:

- both numbers are statements of *"at least this far"*, so the larger one is the strongest true
  answer and can never show an older number than either source already knows;
- the `max` matters in the other direction too — progress is per device, so a second phone or a
  cleared browser must not pull a player who is at 22 back down to `LEVEL 1`;
- somebody else's ground is **untouched**: no client can know another account's progress, so their
  line keeps the server's recorded figure (and shows none when there is none).

No data to recalculate: there is no `owner_level` column — `world_claims` holds only `cell_id`,
`owner_id`, `claimed_at`, `purchase_request_key`, `source`; the number is derived on every read. The
owner's number corrects itself the moment this web build is live, with **no server deploy** (the
payload did not change).

Known limit, stated plainly: another player's figure can still understate their real progress while
their proofs are queued or if they were never submitted. Closing that needs the server to record
submitted progress rather than paid clears — a separate change, not made here.
