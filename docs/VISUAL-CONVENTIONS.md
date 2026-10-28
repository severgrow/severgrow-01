# FUTASAKU visual conventions

Current shared finish, 28 October 2026. Applies to future UI work and to the five changes in this pass.

- **Controls:** use the existing native button/hardware classes. A press answers over `--ix-press`
  (90ms), compresses by 1.5% and dims by 4%; release returns through the same easing. Keep 44px hit
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
