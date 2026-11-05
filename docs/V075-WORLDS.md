# v0.75 instruments and material worlds

## Baseline and release hold

Base: `e657a8ace4ad25d8a204ae152be7138d85097c12`, including Claude's lesson opponents and
no-skipped-growth bot changes. Engine rules, bot versions, online protocol, account data, saves,
Seeds, planet topology and the approved projections are untouched.

Worktree: `/workspace/futasaku-v075-worlds`; branch: `feature/v075-four-worlds`.
**No push or promotion until the owner relays Claude's confirmation that his release is live.**
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

`scripts/build-world-materials.mjs` deterministically generates small periodic SVG atlases and
landmarks. `node scripts/build-world-materials.mjs` must produce no diff unless the recipe changed.
Board patterns use global board coordinates, including underneath homes: an atlas never restarts
at a hex boundary. Existing rocks, gold frames, physical number stones and gameplay overlays remain
separate. Only chosen full-detail terrain downloads; selector landmarks are tiny inline assets.
New terrain follows the default-art failed-image fallback rather than showing broken images.

The Planet uses low-detail world-fixed shader recipes sharing the material pigments and the
existing grain field. No texture atlas, material rebuild, per-tile render loop or new dependency.
Only `KIND.mine` receives the local cosmetic material; ownership hue and boundaries stay independent.
The stamp adds two signed bytes per vertex to the existing geometry buffers; measure this alongside
frame time rather than treating an extra attribute as free.

### Adding a world

1. Add a stable id and material definition; unknown ids always fall back to FUTASAKU.
2. Add a deterministic, periodic material and top-down home recipe to the asset generator.
3. Register its URLs in `worlds/art.ts` and a low-detail recipe/code in `planet-material.ts`.
4. Extend mixed-pair, persistence and visual checks. Keep gameplay/proof data cosmetic-free.

Do not implement a second settings store, Realtime connection, particle system or grain layer.

## Verification checkpoint

Completed locally so far:

- Dependency install and baseline futa05 build.
- Baseline Chromium captures: 320-class phone work follows; original captures at 390×844,
  844×390, 1280×720 and 1440×900 are in `/tmp/v075-baseline/`.
- Focused tests: 32 passed, plus three deferred-entry tests passed.
- futa04 build and asset isolation passed (112 files at that checkpoint).
- PLAY browser checks passed: early tap, immediate controls, 1500ms effect, no rendering during
  the retained-frame fade, interrupted same-canvas return, cleanup, reduced motion and PWA resume.
- First full check: 399 test files passed; one simulation-heavy test timed out while browser
  workloads shared the machine (4043 passed, one expected failure, 66 optional skips).
  Its isolated rerun passed all three tests in 7.08 seconds without changing its 60-second timeout.

Still validating: final full check with no concurrent browser load, all four viewport/pair captures,
final chat/lesson/Planet regressions and comparative performance. Do not infer completion from this
checkpoint. WebKit is not installed; physical iOS Safari/PWA hardware has not been tested.

## Integration after the release hold is lifted

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
