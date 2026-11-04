# THE PLANET (/test/ only)

Owner, 2026-11-04: *"geometry of hexes is wrong, analyse why and fix. If we need 12 pentagons to
make geometric right, that's fine, but hexes should all look the same ... distinguish empty tiles +
inhabitable black pentagons ... Apply the whole window and overlay from current territory, so the
sphere sits where current territory flat map sits ... shadows, light, grain, halo ... real players
tiles ... replace and call it THE PLANET instead of TERRITORY ... Full Territory actions ... deep
space subtle + space with slow slide combo"*.

On the staging copy (`FEATURES.planet`, `channel.ts`: futa05 on `/test/`) the Territory window
draws its ground as a planet in space and is called THE PLANET. Live (`/`, `/2/`, `/3/`) keeps the
flat Territory map and its name, before and after a promote: the switch is the route, not the
branch.

## Why the first sphere's hexes looked wrong, and the cure

The first version split each icosahedron face into a flat grid pushed onto the sphere, and put
every hex corner at the circumcentre of three unequal cells. Measured: median hex side ratio 1.124,
worst 1.634, hex areas 1.60x apart. Now (`web/src/sphere/geometry.ts`): frequency 24 (5,762 tiles),
40 rounds of equal-length springs between neighbouring centres, corners at centroids. Median 1.054,
worst 1.175 (right beside a pentagon), two neighbours never more than 1.090x apart in area. The
twelve pentagons are the twelve icosahedron corners: black, uninhabitable, never selectable.

## The real world on the planet

Away from the pentagons a Goldberg sphere is a hex lattice, so the flat Territory map is laid on
it tile for tile (`latticeMap`): every flat neighbour is a planet neighbour, so growing, selling
and challenging mean exactly what they mean on the flat map. The map covers the 15-ring disc no
pentagon reaches around a fixed spot (face 13); today's world is 10 rings plus 2 of reach.
**Limit:** a world that grows past 15 rings from 0,0 needs a larger frequency (27 gives 17 rings).
`sphere.test.ts` fails the day the current world plus its reach stops fitting.

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
