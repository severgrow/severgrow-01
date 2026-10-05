You are the lead artist and technical artist for **SEVEROR**, a two-player hex strategy game for phones and desktop browsers.

The game fantasy is:
- Player 1: a living **FOREST** network
- Player 2: a living **VOLCANO** network

This package includes:
- `reference/CURRENT_ATTEMPT_DO_NOT_COPY.png` — a NEGATIVE reference
- exact pointy/flat coverage masks
- exact clip masks
- local number/gold clarity masks
- geometry metadata
- network style specs
- resolution/export rules
- QA scripts

Read `README_FIRST.md`, then all files in `spec/`, then `developer_handoff/RENDERER_HANDOFF.md`.

Do not use old V1/V2 production art as a shortcut.

# WHAT IS WRONG WITH THE CURRENT ATTEMPT

Do NOT repeat these problems:

1. Two styles on one board: flat UI hexes beside painted owned tiles, making the owned tiles look like stickers.
2. Rock/neutral cells are visually louder than important territory.
3. Each hex is a separate mini-painting with its own lighting and texture logic.
4. Tiny blurry micro-detail collapses into mush on phones.
5. Homes use an isometric/3D/plinth language on a top-down board.
6. Busy art sits under the strength number.
7. The network, the defining mechanic, is too thin and lost.
8. Source/contact-sheet artefacts or low-resolution crops are visible.

# JOB

Build a **V3 ART SYSTEM** that looks like a high-end indie strategy game:
- hand-crafted
- premium
- calm
- tactile
- top-down
- system-driven
- extremely readable

It must work from ~40 px per tile on a phone to ~160 px on desktop and remain suitable for animation.

Developers will write the renderer. Deliver clean art assets, exact specs, source masters, runtime exports, proof images and a manifest. Do not write game code.

# CORE ART PRINCIPLE

The board is one continuous world.

Ground is NOT a finished picture per hex.

Owned tiles reveal regions of continuous seamless ground textures sampled by board position. Local masks control strength and clarity. Props/homes/networks are separate layers.

# VISUAL DIRECTION

Reference qualities only, not copies:
- Dorfromantik — calm grouping
- Bad North — strong readable forms
- ISLANDERS — compact stylized terrain
- Root — physical-board confidence

Original work only.

## Projection
STRICT TOP-DOWN ORTHOGRAPHIC for everything:
- terrain
- props
- homes
- scars
- FX

No isometric, 3/4, plinth, visible tile side or faux camera depth.

## Lighting
One screen-space source:
- light from top-left
- short soft shadows down-right
- art stays upright when the board rotates in 60° steps

## Shape language
Shapes over detail.
Use large painted/gouache forms with roughly 3–4 value steps:
- shadow
- base
- light
- small highlight

No photo textures.
No sub-pixel speckle.
No AI micro-noise.
No random tiny detail.

At 25% size, every asset must still read clearly.

Do not bake:
- text
- numbers
- hex outlines
- frames
- number plates
- gold badges
- interaction glows
- ownership UI
into terrain art.

# PALETTE

Empty:
#1c1f1e, #262a28, #323633

Rock:
#3d3b37, #57534c, #7a7468, #9a9386

Gold:
#5a4a2a, #8a6f36, #c9a24a

Forest:
#1f3a26, #2f5a32, #4f8a3c, #86b552, #cfe08a
sparingly: #e9c45a, #d8664a, #f2efe2

Volcano basalt:
#1b1817, #2c2523, #463a35, #6a5850

Magma:
#8f2212, #d2481a, #f47a26, #ffd46a

Forest and volcano must differ clearly in greyscale and texture structure.

# A) SEAMLESS GROUND

Create source masters in `masters/textures/` and runtime exports in identical relative paths inside `hi/` and `lo/`.

Required:
- empty_ground.webp
- gold_ground.webp
- forest_ground_a.webp
- forest_ground_b.webp
- forest_lush.webp
- volcano_ground_a.webp
- volcano_ground_b.webp
- volcano_hot.webp

Pattern repeat: roughly every 4 hexes.

Main material shapes should be around 1/6–1/3 of a hex wide.

Rules:
- no global gradients
- no hotspot
- no obvious stamped repeat
- even value distribution
- truly seamless opposite edges
- one consistent screen-space light

For every runtime texture, generate a 3×3 repeat proof in `docs/repeat_proofs/`.

# B) STRENGTH 1–9

Do not paint 9 independent final hex pictures.

Use:
- base seamless ground
- lush/hot overlay
- included `coverage_01..09` masks
- increasing prop richness

The starter already contains:
- master 1024 masks
- hi 512 masks
- lo 256 masks
for pointy and flat.

Forest:
1 already finished/alive
3 growing
5 healthy
7 rich
9 peak ecosystem, still controlled

Volcano:
1 restrained active basalt
3 clear heat
5 dangerous
7 intense
9 peak power

Even level 9 must retain significant dark basalt structure.

# LOCAL READABILITY MASKS

A continuous texture cannot contain a repeated per-hex calm circle without exposing the grid.

Use the supplied local masks:
- `clarity_number_zone.png`
- `clarity_gold_zone.png`

These are applied by the renderer after world texture sampling.

Do not paint a blank number circle into the seamless texture.

# C) PROPS

Create separate top-down transparent props.

Forest: 12
- shrubs
- ferns
- flower clumps
- berry bush
- mushrooms
- sapling
- related large readable organic accents

Volcano: 12
- basalt boulders
- crust slabs
- ember vents
- cinder piles
- related volcanic accents

Rock: 4
- large blocked boulder clusters
- grey, calm, unmistakably blocked
- quieter than owned territory

Animation-ready layers where useful:
- leaves separate from stem
- vent glow separate from rock

No prop may be needed to identify ownership.

# D) HOMES

Top-down only.
No plinth.
No baked roots/lava connections.

Forest:
- forest_tree_canopy
- forest_tree_leaves_layer
- forest_tree_shadow

Volcano:
- volcano_crater
- volcano_crater_glow
- volcano_smoke_01..03

Master around 1536 px where useful.
Runtime:
- hi ~768 px
- lo ~384 px

Homes should fill roughly 70% of a hex, feel iconic, and remain readable at phone size.

# E) NETWORK — HERO ELEMENT

The game owns structural geometry.

The renderer draws ONE continuous path per linked pair.

Never build structural continuity from two independently capped connector sprites.

Provide:
- forest_vine_strip
- lava_flow_strip
- `network/style.json`

Master strip ~1024×128
Hi ~512×64
Lo ~256×32

Forest:
thick living root/vine, bark edge, mossy body, restrained highlight.

Volcano:
molten river inside dark crust, readable flow, restrained inner heat.

Network is the loudest/near-loudest board surface element.

Use the included style.json as a starting point and improve only if the style frame proves a better width/value relationship.

# F) STATES + FX

Create:
- forest wilt props ×4
- volcano ash props ×4
- leaf mote
- spark
- ember
- ash
- dust
- sever burst
- forest scar decal
- volcano scar decal

Use the included cutoff tint JSONs as technical starting values.

# READABILITY

Contrast hierarchy:
1. network
2. homes
3. owned ground
4. props
5. gold
6. blocked rock
7. empty

The central ~30% radius is the gameplay-number calm zone.
The lower-right ~20% radius is the gold-badge calm zone.

No props in those zones.

At 40 px tile size, remove tiny detail rather than compressing it into noise.

# RESOLUTION AND EXPORT

Tiles render from about 20 to 160 CSS px at device pixel ratio 1–3, up to roughly 480 device px per hex.

## Masters
Keep development source in `masters/`.
- about 1024 px per hex
- seamless textures 4096×4096
- homes ~1536 when useful
- network strip ~1024×128

Masters never ship.

## Runtime tiers

### hi/
- 512 px nominal per hex
- textures 2048×2048
- desktop/tablet/zoomed views
- compressed tier target under 8 MB

### lo/
- 256 px nominal per hex
- textures 1024×1024
- phones/normal zoom
- compressed tier target under 3 MB

Names and anchors must be identical across tiers.

Downscale:
- Lanczos
- very light sharpening only
- no extra micro-detail

Check every lo asset at 40 and 64 px.

## Memory
Do not assume compressed size equals memory.
A decoded 2048×2048 RGBA image is ~16 MB.

Therefore design the pack so the renderer can:
- load only one tier
- default phones to lo
- avoid keeping unused hi assets decoded
- composite ground to a board-resolution canvas
- release temporary source images when practical

# TECHNICAL CHECKS

Run the supplied QA scripts and report:
- exact dimensions
- true alpha
- safe margins
- opaque texture alpha = 255
- opposite-edge seam error
- 3×3 repeat proofs
- tier compressed sizes
- manifest completeness

If generated art contains noisy micro-detail:
- simplify
- lightly posterize toward the intended palette
- smooth shape interiors
- keep silhouette edges crisp

Use sRGB.
Inspect alpha assets on #1c1f1e to catch pale fringes.

# MANIFEST

Final `manifest.json` must list every production file with:
- relative path
- tier
- pixel dimensions
- purpose
- opaque/alpha
- anchor point
- paired animation layers
- source/master relationship
- notes

# WORKFLOW — IMPORTANT

## PHASE 1 ONLY FIRST

Do not build the entire V3 pack immediately.

Create the minimum real art needed for a style-frame system:
- empty ground
- gold ground
- forest base
- forest lush
- volcano base
- volcano hot
- blocked rock language
- forest home
- volcano home
- forest network strip
- lava network strip
- forest sever scar
- volcano sever scar

Then create a 19-hex style-frame board showing:
- empty
- gold
- rock
- forest home
- forest strengths 1,3,5,7,9
- volcano home
- volcano strengths 1,3,5,7,9
- continuous networks
- sever scar
- plain white number plates

Produce:
- pointy 40
- pointy 80
- pointy 150
- flat 40
- flat 80
- flat 150

Use #1c1f1e background.

The style frames must be rendered FROM THE REAL SEPARATE ASSETS, not painted as one concept illustration.

This proves that the system actually works.

After those six files and repeat proofs are complete:
STOP AND WAIT FOR APPROVAL.

Do not create the full asset pack until approved.

# FINAL QUALITY BAR

It must not look:
- AI generated
- noisy
- soft
- like sticker art
- like mini paintings clipped into tiles
- isometric
- generic mobile-game art
- inconsistent concept art

It should make someone think:

“Now this actually looks like a real premium game.”

Begin with Phase 1 only.
