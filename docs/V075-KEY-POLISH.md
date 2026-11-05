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
- 44 targeted tests pass: PLAY transitions, suggestion rules and shared/pinned motion.
- futa04 production build and asset isolation pass (106 files).
- Actual browser PLAY checks pass: immediate controls, 650ms exit/return, first-paint readiness,
  interrupted return, disposed canvas, PWA resume and reduced motion.
- Extended `planet-matte` covers real challenge actions, selected colours, chat actions, shared blur
  and amber recommendation, in addition to its existing four viewport and camera contracts.
  Its final result and release CI must be checked before publication.

Real iOS hardware verification is unavailable here; CI WebKit is engine coverage, not a device claim.
Local screenshots are in `/tmp/planet-matte/`. No performance claim is made from software-rendered
Chromium; this pass adds no idle loop, texture dependency or per-frame layout measurement.

## Release

The owner explicitly requested promotion of this combined pass. Publish only the exact commit
whose full CI is green. Both root and `/test/` must resolve to that commit in the approved
`futa0.5-online` publisher; a moved `live` ref alone is not evidence of deployment.
