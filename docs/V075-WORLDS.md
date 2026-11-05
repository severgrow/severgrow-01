# v0.75 instruments and material worlds

## Baseline and release hold

Base: `e657a8ace4ad25d8a204ae152be7138d85097c12`, including Claude's lesson opponents and
no-skipped-growth bot changes. Engine rules, bot versions, online protocol, account data, saves,
Seeds, planet topology and the approved projections are untouched.

Worktree: `/workspace/futasaku-v075-worlds`; branch: `feature/v075-four-worlds`.
The owner initially reconfirmed the release hold on 5 November, then relayed Claude's confirmation
that `e657a8ac` deployed at 08:34 GMT and Codex may push. Both remote refs match that baseline.
**The hold is cleared; publication still requires green checks. New worlds remain `/test/` only.**
This document is a local handoff, not evidence of deployment. No unattended check-in is scheduled.

## Interaction changes

- The warm turn rim reads actual offline state or the online driver's confirmed match phase/seat,
  independently of queued captions, sound and opponent replay. Its ink is `LIGHT_TONES.amber.core`.
- PLAY controls arrive immediately. The existing world fades over 1500ms, retaining its canvas and
  pose for an interrupted return. The retained frame is frozen while the cached sky takes over:
  no globe loop during the compositor fade. Reduced motion exits immediately; PWA resume during
  the fade preserves PLAY instead of revealing the main menu.
- A PLAY tap during optional UI mounting survives boot completion. One early online-entry tap is
  retained until the real handler is mounted; leaving the doorway cancels that intent.
- Desktop cockpit/hand move down together on sufficiently tall desktop layouts. Match chat aligns
  above the whole cockpit with an 8px gap. Short desktop windows retain a usable compact reading
  panel. Phone and short landscape dock positions are preserved.
- Existing Planet chat/colour/achievement windows retain the shared dark glass and interruptible
  surface motion. The new picker reuses the same native press and swatch vocabulary.
- Space lights have softer profiles, depth variation and a small continuous cached drift variation.
  Game space remains one still background image. The shared film grain is unchanged.
- Challenges use a tangent-plane crossed-swords stamp, not screen-space stripes. It turns with its
  tile, is antialiased and has no DOM/image overlay or animation loop.

## World architecture and current scope

`web/src/worlds/worlds.ts` defines stable ids, material tokens, a forgiving versioned preference,
and `DuelWorlds = { environment, owners: [you, opponent] }`. Screen owners are 0/1, even when the
online player's authoritative server seat is 1. Never feed raw server seats into screen materials.

The selector and reading of its preference are gated to `/test/`. The preference uses the existing
channel-prefixed browser-storage adapter, with an in-memory fallback. It does not change player
identity colours, ownership, gameplay state or another player's setting.

The renderer supports independent combinations of all five ids, including the original FUTASAKU
look. `DefaultArtBoardView.setWorldAppearance(duelWorlds(localId, opponentId))` is the integration
seam for future match/profile metadata or campaign definitions. `setLocalWorld` preserves the
opponent's assigned world. The normal game binds the local preference once; replay instances keep
classic art, matching existing replay exports.

**Current deliberate boundaries:** remote players' saved skin preferences are not exchanged by the
existing match protocol. An opponent without an assigned cosmetic id uses classic FUTASAKU art.
The local selection changes your personal environment/terrain and only your land's Planet material.
The every-ten-level campaign rotation, account-level cosmetic sync and themed replay exports are
future integrations, not implemented features or hidden backend dependencies.

### Four materials

- Ocean: deep teal bed, long coherent currents, a top-down atoll home.
- Forest: forest floor and soft overlapping canopy, a mature tree home.
- Magic Fields: indigo soil, silver reed beds/mineral paths, a restrained crystal formation.
- Volcanic: cooled irregular basalt plates, rare residual heat, a crater home.

`scripts/build-world-materials.mjs` deterministically generates periodic SVG source atlases and
landmarks. `node scripts/build-world-materials.mjs` must produce no diff unless the recipe changed.
The board loads baked 768px lossless WebP terrain, avoiding repeated SVG-pattern rasterisation.
Regenerate these after changing a recipe with
`PW_CHROMIUM=/usr/bin/chromium node scripts/build-world-materials.mjs --raster` (Chromium and
ffmpeg are authoring tools only, not application dependencies). `materials.json` pins source and
output hashes; tests reject stale bakes. The four atlases total 288,718 bytes; only the chosen one
loads (23–178KB each). Homes remain small vector assets.
Board patterns use global board coordinates, including underneath homes: an atlas never restarts
at a hex boundary. Existing rocks, gold frames, physical number stones and gameplay overlays remain
separate. Only chosen full-detail terrain downloads; selector landmarks are tiny inline assets.
New terrain follows the default-art failed-image fallback rather than showing broken images.

The Planet uses low-detail world-fixed shader recipes sharing the material pigments and the
existing grain field. No texture atlas, material rebuild, per-tile render loop or new dependency.
Only `KIND.mine` receives the local cosmetic material; ownership hue and boundaries stay independent.
Cosmetic changes apply immediately, with one 150ms opacity-settling beat on each renderer's surface,
using the existing interface token. Rapid changes replace it; reduced motion skips it. No tile
movement, delayed input, retained fill effect or extra rendering loop.
The stamp adds two signed bytes per vertex to the existing geometry buffers; measure this alongside
frame time rather than treating an extra attribute as free.

### Adding a world

1. Add a stable id and material definition; unknown ids always fall back to FUTASAKU.
2. Add a deterministic, periodic material and top-down home recipe to the asset generator.
3. Register its URLs in `worlds/art.ts` and a low-detail recipe/code in `planet-material.ts`.
4. Extend mixed-pair, persistence and visual checks. Keep gameplay/proof data cosmetic-free.

Do not implement a second settings store, Realtime connection, particle system or grain layer.

### Captured previews

These are real production renderers with deterministic test data, not concept art:
[Ocean](screens/v075-worlds/ocean.png), [Forest](screens/v075-worlds/forest.png),
[Magic Fields](screens/v075-worlds/magic-fields.png), [Volcanic](screens/v075-worlds/volcanic.png),
[Planet](screens/v075-worlds/planet-ocean.png), [selector](screens/v075-worlds/selector.png),
[desktop chat](screens/v075-worlds/desktop-chat.png).
Each board gallery shows a deliberately different opposing skin; the real game currently falls
back to classic for unassigned opponents. The Planet screenshots use a cached, offline world;
their connection-error footer is fixture state, not a production connectivity claim.

## Verification

[Full local validation and measured limits](V075-VALIDATION.md) records the initial failures,
corrected harness/configuration runs, isolated timeout reruns and final browser results.

- All 226 world checks pass across four sizes and all 25 owner pairings.
- Match chat: 93 checks; Living Territory: 231 checks. Critical flow, cockpit, pile layout,
  information/tutorial intel, Territory challenges/gestures, PLAY fade and panel/channel checks pass.
- Levels 1–10 and the robustness groups passed; the final reading-floor group passed after moving
  the timed input before expensive captures. The three-second minimum and normal gameplay remain.
- The complete Planet rerun passes, including repeated entry, exact picking, full-map zoom,
  native double gesture, one-canvas cleanup, reduced motion and fallback.
- Typechecks and futa04/futa-test/futa05 builds/assets pass. The full unit run passed 4,054 tests
  and timed out on three unchanged simulation cases; all 29 tests in the isolated rerun pass
  within their original budgets. No timeout was increased or test skipped to obtain a pass.
- The manual cold-Draw frame budget remains red on both the reference and current software runner.
  No sustained-60fps or performance-improvement claim is made. Physical iOS/WebKit is unavailable
  locally; the normal release CI supplies the WebKit checks.

## Integration

Read `AGENTS.md`, `docs/RELEASE-FLOW.md` and `docs/HANDOFF-0.75.md` first. Inspect the latest remote
release line and concurrent changes before integrating. Main integration surfaces are `main.ts`,
`polish-075.css`, `defaultArtBoard.ts`, the existing Planet bridge/renderer and WorldView.

Merge/rebase only this feature's commits, resolve against the newest v0.75 code, rerun checks, then
push through `futa0.5-online` to `/test/`. Never force-push or push to `main`. This experimental skin
selector is not a request to promote it to the production root. The previously pending server work
is still Cursor's deployment responsibility; this pass adds no server code or migration.

## Additional measured fixes before the final regression run

The cold-Draw phone probe also flags a large stall in the untouched e657a8ac reference. CPU profiles
showed synchronous layout work in the invisible legacy guide, interleaved hand measurements,
background hold/resume and mechanical counters. The pass now skips the hidden guide's entrance,
batches card rectangles, pauses existing sky animations without rechecking the still game backdrop,
and uses percentage-based drum travel with tracked animations. Counter carries can finish correctly
when the other digit changes, and active drums settle when the tab is hidden.

These are presentation changes only. Existing counter durations/overshoot and card motion values
are preserved. The hidden-guide browser regression passed (zero geometry reads; real guidance still
advances); four counter unit tests passed, including rapid carry updates and hidden-tab cleanup.

The original seven motes also have smaller depth-varied profiles and fade outside the screen at
loop boundaries. No extra particles, blur filters or animation loops were added.

Final serial verification is being run separately from performance measurement. Do not describe the
old phone probe's 34ms tail-frame budget as passed: it failed on the untouched reference too. Record
the final measurements and limitations below after the serial run finishes.
