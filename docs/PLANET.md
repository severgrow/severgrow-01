# THE PLANET (/test/ only)

Owner, 2026-11-04: *"geometry of hexes is wrong, analyse why and fix. If we need 12 pentagons to
make geometric right, that's fine, but hexes should all look the same ... distinguish empty tiles +
inhabitable black pentagons ... Apply the whole window and overlay from current territory, so the
sphere sits where current territory flat map sits ... shadows, light, grain, halo ... real players
tiles ... replace and call it THE PLANET instead of TERRITORY ... Full Territory actions ... deep
space subtle + space with slow slide combo"*.

The Territory window draws its ground as a planet in space and is called THE PLANET
(`FEATURES.planet`, `channel.ts`). First /test/ only; then (2026-11-04) the owner chose "Yes, planet
goes live": it is the whole futa05 game on every route, so it reaches futasaku.com with the next
promote. The locked futa04 line keeps the flat Territory.

## Behind the menu, and the journey

The planet is the main menu's backdrop: whole, dim (46%), untouchable, turning slowly on its own
(one turn in 160 s). ONE canvas covers the screen in both places and never moves or resizes; the
planet is drawn into a FRAME inside it (`projection`, renderer.ts): the whole screen behind the menu,
the panel in the window. So the window's first frame is the menu's last, pixel for pixel (owner:
"There is a jump of the planet ... they have to be in identical position"; `sphere-test` checks pose,
zoom, light and frame across the tap). Opening flies from wherever the spin left it to the middle of
your largest connected holding (`homeTile`). On the way:

1. the frame closes in on the panel like an iris (done by ~60% of the flight), with the window's
   rounded crop;
2. the light rises from the menu's 46% to full over the flight (the flat map's own fade);
3. the stars stream past mid-flight and settle as it lands.

Back puts the menu up at once and the same journey runs in reverse behind it (0.9 s). Flights and the
frame advance by painted frame time (at most 250 ms a frame), so a busy main thread pauses them
instead of skipping them. Freed when the menu goes away (a game starts). Reduced motion: no spin, no
flights, no stream; the planet is simply in place.

## Grow anywhere (server + page, 2026-11-04)

Owner: *"Allow players to grow a tile anywhere in the planet, but keep the current colors - the tiles
around get highlighted only when a tile is placed"*. The geometry moved to `src/planet/geometry.ts`,
shared by the page and the server. The flat lattice walk gives every one of the 5,750 hexagons its
own `q,r` id (measured: no collision, 64 rings at most), and every id of today's world is unchanged.
Server (`server/src/world.ts`): `canGrowOn` accepts any planet tile, seen or not; `worldNeighbours` is
the planet's adjacency (identical to the flat one inside 15 rings); the map payload says
`growAnywhere: true`. The server's seen map is unchanged, so the live flat page keeps working against
the new server, and the new page keeps the seen-map rule against the old one. With `growAnywhere`
the planet is plain ground everywhere and lights only the ring around each placed tile.

**Deploy** (the server change does nothing until the `duel` Edge Function is redeployed; this
container has no Supabase key and its network policy blocks supabase.co):

```sh
npm run server:build-edge            # already committed; rebuild only if server code changed since
npx supabase functions deploy duel --project-ref wbfrbeedlvjercrukngn --no-verify-jwt
BASE_URL=https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel npm run server:smoke
```

Either order works with promote. No database migration: claims are keyed by the same ids.

## The real world on the planet

Away from the pentagons a Goldberg sphere is a hex lattice, so the flat Territory map is laid on
it tile for tile (`latticeMap`), outward from a fixed spot (face 13). Inside the 15 rings no
pentagon reaches, every flat neighbour is a planet neighbour; past them the walk steps around a
pentagon, so rules use the planet's own `neighbourIds`. Every hexagon has an id, so the world can
grow over the whole planet.

Ground kinds (`ground.ts`): unreached (darkest, faint terrain variation), the two undiscovered fog
rings, known free land (lighter), owned (the owner's colour, raised), yours (raised, kin-lit when
selected), pentagons (black glass with a sun glint). Owner borders, the selection ring and a hatch
on disputed tiles mirror the flat map.

## How it fits Territory

`web/src/online/world-planet.ts` mounts the planet into `#online-world-grid` when the window opens
and frees it on close. Territory keeps the data, rules, tile bar, sheets, windows and requests: a
tap on the planet calls Territory's own `select`, so every action works unchanged. The ranking's
"fly to" turns the planet to that player's land. The hidden flat SVG stays underneath.

## Look and cost (`renderer.ts`)

Two WebGL passes, no textures or post-processing: (1) space: sky, two parallax star layers, the
atmosphere halo, still grain; (2) ground: ~104k vertices, a low sun with a soft dusk, a broad sheen,
an atmospheric rim, sun-lit bevels (the sun-facing rim catches light), fine grout, owned ground
glowing faintly on the night side. Opening flies in from space to your land (1.15 s, none with
reduced motion). Drag turns, a flick carries and slows, pinch/wheel zoom, double tap zooms in, a
tap on tiles under 30 px flies in instead of guessing. Nothing renders at rest, except the slow
star slide (~30 fps) while space is on screen; it stops when hidden or with reduced motion.

Proof: `web/tests/sphere.test.ts` (geometry, lattice, ground) and `web/e2e/sphere-test.ts`
(+ `-ios` on WebKit) in CI.
