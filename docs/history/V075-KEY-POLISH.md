# v0.75 — button material and PLAY return polish

Follow-up to `V075-MATTE-PLANET.md`. v0.75 and classic tile art remain the baseline.

## Changes

- Restored the existing dark-glass backdrop blur on shared matte menu, campaign, difficulty,
  invitation and compact chat action buttons. No new blur wrappers or animated filters.
- PLAY keeps the existing recommendation class after lesson graduation. PLAY/LEVEL and the current
  campaign level receive a restrained static amber halo; their material and pressed finish match
  ordinary buttons. Legacy/tutorial recommendation rules remain intact.
- Challenge Accept/Decline, chat Send and moderation actions share the matte/ivory button finish.
  Selected colour swatches sit inward instead of adding another amber frame; challenge metadata
  uses the shared instrument typography.
- Fixed colour loading when `ensureIdentity` returns a fresh object for unchanged credentials:
  use the retained actor so the stale-account guard accepts its own current response.
- PLAY controls appear immediately while the last Planet frame fades out over 650ms. Back reveals
  the Planet over 650ms after its first actual paint. Interrupted navigation starts from the current
  opacity, reuses an existing canvas, and cancels stale completions/listeners/timers. Reduced motion
  stays immediate. A bounded fallback prevents a missing renderer hiding the backdrop indefinitely.

No server, database, gameplay, account, ownership or reward changes. The preceding pass's upright
Planet controls, swords, joined board silhouette and 700ms challenge-to-duel doorway are retained.

## Verification

- All three TypeScript projects pass.
- 74 targeted tests pass: PLAY transitions, suggestion rules, shared/pinned motion, startup,
  living-world source, colour handoff and channel policy.
- futa04 production build and asset isolation pass (106 files).
- Actual browser PLAY checks pass: immediate controls, 650ms exit/return, first-paint readiness,
  interrupted return, disposed canvas, PWA resume and reduced motion.
- Extended `planet-matte` passes all four viewports (320×568, 390×844, 844×390 and 1440×900),
  including real challenge actions, selected colours, chat actions, shared blur, amber recommendation,
  existing camera contracts, reduced motion, startup recovery and seven challenge-doorway scenarios.
- An initial local software-rendered desktop startup missed its first-paint bound; the complete
  rerun passed without changing that bound. The unchanged 0.4 CI motion suite also missed a brief
  card/pile overlap. Its observer now records actual pile-face mutations alongside the original
  animation-frame samples, retaining every timing and hand-over assertion, with failure diagnostics.
  The complete local 0.4 motion suite then passed Draw/Throw, Bloom, cuts, reduced motion and Bomb.
  Full CI must still pass before publication.
- The challenge suite's old yellow-primary/transparent-secondary assertions were superseded by the
  owner's new matte-button direction: both actions now must match the ordinary menu material,
  border, blur, radius and ivory ink. Frameless window, focus, 44px targets, secondary quietness and
  all challenge/settlement checks remain. The full suite passes phones, landscape and reduced motion.
- Level 9's test loop now awaits the actual opponent-turn completion instead of exhausting its
  400-move counter while repeatedly polling the same turn. Its bounded wait still fails a stalled
  bot; all original lesson, cue, completion and progress assertions remain. The complete suite passes.
- The normal root route also passes at 390×844 and 1440×900: blur, amber PLAY, 650ms exit/return,
  no experimental Sphere Test entry and no browser errors.

Real iOS hardware verification is unavailable here; CI WebKit is engine coverage, not a device claim.
Local screenshots are in `/tmp/planet-matte/`. No performance claim is made from software-rendered
Chromium; this pass adds no idle loop, texture dependency or per-frame layout measurement.

## Release

The owner explicitly requested promotion of this combined pass. Publish only the exact commit
whose full CI is green. Both root and `/test/` must resolve to that commit in the approved
`futa0.5-online` publisher; a moved `live` ref alone is not evidence of deployment.
