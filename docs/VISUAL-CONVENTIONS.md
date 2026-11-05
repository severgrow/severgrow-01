# FUTASAKU visual conventions

Current shared finish, 28 October 2026. Applies to future UI work and to the five changes in this pass.

- **Controls:** use the existing native button/hardware classes. A press uses the delegated native depth
  (`logic/press.ts`); the shared surface finish answers over `--ix-press` (90ms). Keep 44px hit
  areas, visible keyboard focus and existing disabled-state behavior. Account and chat keys share
  this response through `web/src/ui/instrument.css`.
- **Panels:** use `enterSurface`/`exitSurface` from `web/src/ui/interface-motion.ts`. Shared open/close
  durations are 150/100ms with 4px entrance travel, .996 start scale and only .05% settling overshoot.
  Inputs become available immediately; exiting surfaces become inert immediately. Reopen interrupts
  the existing exit. Match chat uses the same duration constants. Do not animate gameplay with these.
- **Glass:** reuse `--dark-glass` and `--dark-glass-blur`, preserving documented feature-specific
  readability adjustments (such as the weaker match-chat blur). Do not add blur layers for decoration.
- **Type:** use existing display/UI fonts. Small transcript metadata and quiet status text use
  `--instrument-label-size` (.6875rem), `--instrument-tracking` (.08em) and `--instrument-muted`.
  Keep body text/board digits in their existing hierarchy and support Large Text.
- **Selection:** preserve the existing card fan/lift and legal/illegal states. The selected card's
  single ivory outline uses `--instrument-selection`; other playable cards step back to .82 opacity.
  Disabled cards and tutorial targets keep their existing stronger meanings. No new render loop.
- **Territory:** player hues still identify the same players. Existing halos have a lower opacity
  range, the glow filter is narrower and the ownership edge is slightly stronger. No new SVG nodes,
  timers, animations or server changes are introduced by this lighting adjustment.
- **Accessibility/performance:** both OS and in-game reduced motion suppress spatial movement.
  Prefer opacity/transform on finite transitions; never add permanent animation loops or a new
  dependency/subscription for visual polish. Check phone, landscape and desktop screenshots.

## Validation and release

The consistency contract is referenced by AGENTS.md. The existing motion test pins JS/CSS duration
constants; update both deliberately when the owner changes the motion direction. Verify actual
controls and screenshots, including reduced motion and an interrupted close/reopen. Preserve the
Territory v3.4 single-menu layout and existing rules. Daily, engine rules and server deployment are out of scope.

Implementation complete: unified key response, quieter Territory lighting, metadata rhythm,
shared snappy panel timing and selected-card hierarchy. Test/build/release evidence is appended
below after verification. Push through the existing futa0.5-online release workflow; a successful
push alone does not prove the Pages deployment has finished.


## Verification — this pass

- Full `npm run check`: 322 files / 3,257 tests passed; 1 expected failure and 66 optional skips.
- Motion vocabulary contract: 7 checks passed, pinning the revised shared JS/CSS values.
- Territory growth browser suite: 51 checks passed, including the final panel timing and corner alignment.
- Account nickname browser suite passed; Settings visual suite passed 6 viewport/Large Text cases.
- Current lesson layout suite passed 51 checks. Selected-card phone and desktop screenshots were
  inspected: selected outline is ivory at 1px, other playable cards .82 opacity, illegal cards .62.
- Idle-hand performance checks passed geometry, no extra frame-loop, hidden-tab and reduced-motion
  cases. Its final Speed Off assertion fails on both this build and the unchanged `25b683f7` baseline;
  no claim that existing behavior was fixed by this visual pass. No additional animation loop was added.
- Physical phones and hosted production were not tested. GitHub Actions completion requires access
  unavailable in this environment; the normal release workflow runs after the release-branch push.

Images: [selected card / phone](screens/instrument-polish/selected-card-phone.png),
[selected card / desktop](screens/instrument-polish/selected-card-desktop.png),
[Territory lighting](screens/instrument-polish/territory-phone.png).


## Territory navigation update in this release

One MENU control replaces the four visible corner controls. The drawer contains labelled My land,
Fit map and Chat controls, existing Challenges/Ranking tabs, and contextual grow/sell actions after
a tile is tapped. Chat has a visible Menu return button. Fit resets the whole-map view; pinch and
wheel zoom can continue directly from it. Pinch release cannot select a tile. Horizontal-only wheel
input is ignored. Own land has a stronger ivory perimeter independent of player hue.

The new `territory-menu` browser suite is included in CI. It verifies one map key, labelled utilities,
My land, Fit, wheel zoom, real two-finger CDP touch zoom, tap safety, chat return, 320px fit and landscape
keyboard behavior. Earlier four-corner/Fit-toggle screenshot expectations are superseded by v3.4.


Final single-menu release verification: full check again passed 322 files / 3,257 tests (1 expected
failure, 66 optional skips). Single-menu/gesture suite: 22 checks passed; Territory flow: 52 checks;
Territory resilience passed after the structural update. Pinch was driven through Chromium CDP touch,
not just synthetic DOM events. Narrow 320px and landscape keyboard viewport checks passed. Physical
phone testing remains unverified. All requested implementation is complete; publication is through
normal CI/Pages and its completion is not inferred solely from the git push.

Latest screenshots: [one menu and your land](screens/instrument-polish/territory-phone.png),
[phone drawer](screens/instrument-polish/territory-menu-phone.png),
[desktop drawer](screens/instrument-polish/territory-menu-desktop.png).

Final TypeScript, futa04/futa05 production builds and asset-isolation checks passed (102/103 files). No server source, migration or Daily code changed in this pass.

## Quiet interaction contract — 31 October 2026

- The delegated native press (`logic/press.ts`, `data-pressed`) owns physical depth. A CSS `:active`
  fallback must exclude `[data-pressed="true"]`; prefer omitting a local spatial fallback entirely.
  Stacking transform scale and the native scale
  makes apparently identical keys compress differently. Keep existing base positioning transforms.
- A turn handoff uses the existing cockpit pulse and readout; do not restore a second screen overlay.
- Keyboard-facing centred sheets reuse `ui/sheet-viewport.ts`; full game layout continues to use
  `ui/app-viewport.ts`. Safe-area padding and a reduced visual viewport must be accounted for together.
- Decorative acknowledgements belong to an explicit interaction, run once, then release their effect.
  Use the existing shared open/press durations. Reduced motion keeps the settled selected state.
- Navigation memory stores presentation only. Never restore membership, wallet balance, legal moves,
  turn deadlines or any other authoritative gameplay state from it.
- Prefer an existing status lane, an accessible control label, shape/weight or brief light feedback
  over new captions, banners, badges or permanent instructions.

## Piles and strike vocabulary — 1 November 2026

- Bloom-completing Throw piles keep the existing soft cream/gold shadows, with no hard border or
  spread-only contour. Empty Throw sockets use the same `.075 × card width` corner radius as cards.
- Opponent Bomb/Blast cues reuse `replay/strike.ts`: one Bomb card means Bomb, two mean Blast.
  Keep them in the existing effects layer, finite, pointer-transparent and static under reduced
  motion. Fast-forward and abandoned turns must not leave or recreate a cue.
- Draw-pile alignment reserves the settled grid slot and the scaled/breathing pile width before
  approaching the cockpit. Do not cache a smaller, transitioning Grow slot as Draw's final width.
- Replay Close reuses `ICONS.close` and a 44px target; an active video action row replaces its idle
  Share key. Paused boards keep full contrast for reading. Prefer typography and spacing over nested
  panel frames; preserve the Territory YOU highlight and keyboard focus indicators.
- Replay names align to the rendered hex map's outer edges, using the existing board sizing pass.
  When a very short landscape map cannot fit the names and score together, keep the names directly
  outside those same edges. The score stays centred; resize/export layout updates share this rule.

## Windows, and what may not be drawn in them — 2 November 2026

The owner, looking at two windows side by side: *"territory and profile windows dont match really
- we should never use frame contour ... but BOTH (and any other similar) should be using our classic
dark glass window style"*, and *"i also dont like the hairline divisions in profile (and if shows up
anywhere else) - id remove and not add in new windoows iin future"*.

- **One material per window.** Every dialog, sheet and panel uses the game's classic dark glass:
  `--dark-glass` and `--dark-glass-blur` (defined once at the top of `web/src/style.css`, surfaced as
  `web/src/player/glass-surface.ts`). A window that needs a feature-specific readability adjustment
  keeps it and says why in a comment — the match-chat blur is the documented example. There is no
  third material and no per-window tint.
- **No frame contour.** Do not stroke an outline, inner border or ring around a window to define it.
  A window is separated from the board by its material (blur, depth, shadow) and its position, never
  by a drawn frame. This includes a 1px "instrument" border that follows the window's own edge.
- **No interior hairline dividers.** Do not draw a line between rows or blocks inside a window. Use
  space, type weight and a muted label to show where one block ends and the next begins. This
  applies to list rows, record rows, settings groups and any future list. Replacing a hairline with
  a 1px shadow, a gradient rule or a dotted line is the same divider in a different coat — not a
  fix. If a divider is ever genuinely unavoidable (a dense numeric table where a misread is a
  gameplay error), mark it with a `/* divider-ok: <reason> */` comment at that rule and keep it to
  that one place — that exact marker is what `tests/window-dividers.test.ts` looks for, so prose
  explaining the reason is not enough on its own. The same rule, the marker and the guard are
  stated in `docs/UX.md` and `docs/DECISIONS.md`.
- **Buttons wear the game's button, not a frame.** A window's actions reuse the existing ghost /
  primary classes. No border ring of their own, no new button shape per dialog. A window action and
  a menu key of the same rank must look like siblings.
- **Keep the readable exceptions.** A feature-specific opacity change made to fix a real reported
  defect (the Profile plate at `alpha 0.982`, chosen because a bright key bled a band across a row
  through the glass) survives this rule; re-measure that defect before making such a surface
  translucent again.

## Motion — what the numbers are now

The earlier note in this file (150/100ms, 4px travel, .996 start scale) describes a SHEET's arrival
and is still true for sheets. Screens have their own, larger beat, and the direction carries meaning.
Source of truth is `web/src/ui/interface-motion.ts`:

- `open: 150`, `close: 100`, `travel: 4` (a sheet), `screen: 10` (a whole screen),
  `stagger: 50` (the beat between a screen's body and its own head row), `colourIn: 1000` /
  `colourOut: 300` (the living map's tiles coming up to, and going back down from, their colours),
  `easeOpen` `cubic-bezier(0.22, 1, 0.36, 1)`, `easeClose` `cubic-bezier(0.4, 0, 1, 1)`.
- Depth decides direction: a forward move (menu → PLAY → picker) rises from below, a back move drops
  from above, the board itself never moves, and a boot screen is simply there. A sheet keeps its own
  smaller travel.
- Every arrival is paint only: the screen accepts input on its first frame. Reduced motion skips
  spatial movement entirely — including CSS transitions, which the JS cancels rather than trusting
  a cascade race.
- **Never a filter on an animating element.** A `filter` on a node whose ancestor is animating (or
  on the animating node itself) re-rasterises every frame; that cost was measured and removed twice
  already (the Territory fog, and the surrounded-home glow). Paint the effect instead — a radial
  gradient, a second stroke, a heavier line — or let it live where nothing animates.

## One glass window — 2 November 2026

- **The material.** The classic dark glass is `--dark-glass` (`rgba(8, 10, 10, .42)`) with
  `--dark-glass-blur` (`blur(9px) saturate(1.05)`) from `web/src/style.css` `:root` — the recipe the
  pause plate (`#sheet-menu`) and the Match Intel / lesson window
  (`web/src/player/glass-surface.ts`, `#futasaku-glass`) already share. Its complete finish is that
  file's "NO FRAME AROUND THE GLASS" rule: `border: 0`, the 15px corner and the one soft shadow
  `0 10px 28px rgba(0, 0, 0, .22)`. No outline, no edge highlight, no inset hairline anywhere.
- **Every floating window wears it.** The Territory challenge card — and the 100-Seeds invitation
  that shares `.world-invitation-card` — used to be a material of its own (`#1c211edb`,
  `blur(10px)`, a 1px outline, a 20/80px shadow); the profile sheet's plate was alpha 0.982 with a
  32px corner. Both now read the shared values. `.sheet`'s floating rule no longer declares a corner
  (it was `calc(var(--radius) * 2)` and, on specificity, beat the family rule for every sheet except
  the pause plate).
- **Documented exceptions are density only.** Settings and Tutorial (0.88) and Match Intel (0.86 +
  `blur(16px)`) are READING surfaces: at 42% a lit menu key or the hand's card faces read through
  the words. They keep that density; corner, shadow and edge are the family's, and Match Intel's old
  1px inset hairline is gone.
- **The profile's band is measured, not pinned.** The 0.982 plate existed to stop a bright menu key
  washing the MATCHES WON row. On the rendered pixels at 390x844 the ground now varies 5.96/255
  across that row (0.59 on the opaque plate; 51 in the owner's screenshot). `web/e2e/menu-profile.ts`
  fails above 8/255 and also samples the row's muted label contrast (7.4:1).
- **Action keys draw no ring.** A filled lead key (amber on the challenge card) and a quiet
  transparent second, 10px corner, 44px floor, the delegated press and a 2px ivory
  `:focus-visible` ring. Before this pass those two keys had no app focus style at all — the
  browser's own 3px ring — and a 1px border each.

Images: [challenge](screens/glass/territory-challenge-390x844.png),
[profile](screens/glass/profile-390x844.png), and their before-shots
[challenge](screens/glass/before-territory-challenge-390x844.png),
[profile](screens/glass/before-profile-390x844.png).

## Smoothness + efficiency pass — 2 November 2026

Owner: *"run couple extra smoothness checks and smoothness pack … making sure everything appears as
quickly as possible … focus on efficiency and reliability of everything."*

**The product menu paints its finished column before the module runs.** The menu's shape is static
(logo, wordmark, beta line, PLAY, TERRITORY's slot, Settings), so it is now in the built HTML:
`vite.config.ts` fills the beta line from `src/strings.ts`, drops PLAY's `hidden`, and adds
`world-reserved` only when the build has an online endpoint; `style.css` shows the product keys
behind `html.test-typography-v2` and holds TERRITORY's exact 50px slot invisible until
`layoutMenu`. The emblem paints from the same silhouette as a CSS mask (`:has(> svg)` steps the
mask aside when the SVG logo replaces it). Measured at 390x844: PLAY's y is **568.06px before and
after layout** (0.00px shift), and PLAY is visible from the first CSS paint instead of after the
module. A tap that lands in that window is delivered once the module attaches its listener (input
events queue on the busy main thread). No skeleton: the beta line, logo and PLAY are the real ones.
The numerals font and the emblem are preloaded; the two boot modules (branding, board art) now start
their imports together instead of one after the other.

**Never a filter on an animating node — enforced in the four places this pass found.** The idle
hint animated `filter: brightness()` on the hand; the Throw step put `grayscale(.54)` on every card
while the whole hand breathed; the Bloom recipe animated a `drop-shadow` on the always-drifting
combination; and a primary key brightened with `filter` on press/hover. All four now move
opacity/colour/background only. The hand's dimmed cards keep their 0.62 opacity and drop the extra
`filter: saturate(.6)`. The territory heartbeat branch loses its permanent `filter: blur(.8px)`.
Measured on the Throw step at DPR 3: compositor raster **186.9 → 168.6ms per 2.5s** with the
grayscale filter gone (the breathe itself is the larger cost and is kept; it is the owner's cue).

**One animation, one name.** `futa04-hardware-reflect` was defined twice (a key-bezel filter and the
display bloom's opacity); the later definition won, so a major event ran the bloom's opacity on the
key bezel. The key-bezel animation is now `futa04-hardware-reflect-key`.

**Cheap transitions use the shared tokens, not literals.** 150ms states use `--ix-open`, 140ms
uses `--ix-open`, 200/220ms lifts use `--dur-quick`, 300ms cross-fades use `--dur-consequence`, and
120ms proximity uses `--ix-press`. The card lift's private `cubic-bezier(…1.2/1.3)` curves are now
`--ease-settle`; the bespoke curves that remain belong to the board's own choreography (the
starter ritual, the cut, the tutorial curtain), not to a control's lift. Board cut choreography (withering fills, the 2.5s end-game
vignette) keeps its designed timings and is called out here as deliberately not tokenised.

**Two interaction reads moved off the hot path.** A Bloom paint reads the board's screen transform
**once per gesture** (`pointerdown`) instead of once per `pointermove`; the drag ghost uses its
written size instead of `getBoundingClientRect()` on every move, sampling the box only during the
180ms mini/full morph. Both are read-after-write removals in the two loops a finger drives.

**One obvious missing transition.** The finish card's `More` disclosure now fades its extras in on
`--ix-open` (opacity only; the plate's height change is layout and is not animated). Reduced motion
shows them at once.

**Left alone, and why.** `online-css.ts`'s `world-glint` (an 11s infinite filter brightness on every
owned tile) and `world-lamp`'s box-shadow breath are on the Territory map, which a concurrent change
is editing; they are reported, not touched. The race bar's `--share` transition (0.6s, registered
custom property) paints each frame but is the score's only read-out; the hand's 1.35s Throw breath
and the step cue's 260/320/900ms choreography are designed beats. `perf-phone` stays green
(idle: 0 game rAF frames, no paint-property animation; a turn: p95 16.8ms at 4x CPU).

## Connected Territory — November 2026

- Ranking counts the largest side-connected holding, never summed islands. Reuse the server's
  `territory-ranking.ts` calculation and authoritative standings. Profiles show CONNECTED TILES
  and TOTAL TILES; do not add chase sentences or instructional filler to the map's submenus.
- The colour key is one solid droplet in the player's resolved ground colour. Preserve the existing
  podium/swords/chat/medal vocabulary, 44px keys and shared motion tokens.
- Whole-map zoom fits the actual panel crop, independently of the readable default and zoom-in
  floor. Deliberate input after rotation starts from the drawn camera; ordinary menu navigation
  preserves the shared camera. Sea taps never select a nearest distant tile.
- Build atmosphere from existing light, vignette, panel lip, ownership tint and the global grain.
  Do not add decorative blur layers or idle loops. Selection never flies the camera to a tile.
- The software-browser 3,000-cell overview remains a measured performance limit; the current
  renderer is not certified for 60fps at that density. See `TERRITORY-FINAL-POLISH.md` for evidence.

## Isolated /test/ experiments

The first-experience refinement and Sphere Test use the existing `FEATURES` route/channel gates.
Keep them exclusive to `/test/`; do not change production defaults or the approved real map.
`futa05-test:` saves are separate and experimental campaign results never sync real rewards/progress.
Keep the existing caption, legality, feedback and three-second deliberate-dismissal floor. Legal
gameplay never waits for prose; random taps never acknowledge it. See `FIRST-EXPERIENCE-TEST.md`.

The spherical prototype reuses the real palette, typography, grain and shared micro-motion. It has
only Back, the planet and the existing-colour home key. No toolbar, floating labels, glossy bloom,
idle render loop or backend feature. Reduced motion stays static; raster detail returns at rest.
Treat WebGL fallback, cleanup and device limitations as part of the experience. See `SPHERE-TEST.md`.

## v0.75 refinement

- v0.75 remains the reference. Turn lights follow confirmed turn ownership, independently of
  queued presentation. Amber is `LIGHT_TONES.amber.core`, not a near-white replacement.
- The four experimental worlds were rejected and removed. Classic FUTASAKU art is the only active
  material. The pure owner/environment identity model remains dormant for future work; never revive
  rejected assets or let a saved cosmetic id change ownership or gameplay.
- Menu suggestions, difficulty keys and ordinary menu actions share one matte material in
  `polish-075.css`. Suggestions add only a restrained amber shadow, never a different fill or weight. Full menu,
  footer and difficulty labels share the same 1rem size, regular weight and .14em tracking.
- An active Planet key sits inward; no amber indicator stripe. Keep the existing focus outline.
- Global chat warms one identity-scoped, bounded in-memory page before opening; never poll while
  closed or flash an empty transcript before a warmed page. Backend compatibility ids stay unchanged.
- Planet dragging stays geographically north-up during input, with soft pole limits and wrapped
  longitude. No inertia, roll correction, zoom easing or recentering may move it after release.
  Keep wheel/pinch anchored where possible without violating that orientation.
- Planet status readouts float in the existing stage; changing their text must never resize
  the map or move the camera. Keep the menu and selection controls clear and pointer events through.
- Planet challenge → duel uses one finite 700ms dark veil, with the existing grain above it. Prepare
  the board at the opaque midpoint; no overlapping screens. Reduced motion bypasses the doorway.
- The board shadow and turn glow follow one closed perimeter. Keep the indicator crisp and feather
  only its underlay with faint painted strokes; never blur tile art, digits or an animated board container.
- `/test/` first startup waits for app, fonts and a real planet paint, then reveals once. Keep a
  bounded fail-open, direct-game links and reduced motion; never replay it on navigation or resume.
- A window keeps its own reading position; switching windows must not steal another page's offset
  or discard a chat draft. Retain the shared glass, native press and interruptible surface motion.
- Reuse the existing atmosphere/grain. Mote loops fade outside the view; new material details are
  static. Measure performance, batch geometry reads before animation writes, and do not scan or
  measure a hidden/unchanged presentation just to restart an effect.

## Matte action refinement — 5 November 2026

- Shared matte menu/dialog/chat keys use the existing dark-glass backdrop blur. Reuse that pair;
  do not add decorative blur wrappers. PLAY keeps its static, visible amber recommendation after
  lesson graduation; the LEVEL key retains its progress-based guidance. No new progress rules.
- Challenge/invitation actions and Global chat Send/report/block use the shared matte finish,
  ivory type and native press. The selected colour sits inward rather than wearing an amber frame.
- PLAY's background leaves in 650ms. Returning reveals the world over 650ms after its real first
  paint; menu controls are immediate. Retained planets interrupt at their current opacity, new
  navigation cancels stale completion, reduced motion is instant, and readiness has a bounded fallback.
