# v0.75 refinement and four worlds — work queue

Status: active local verification. The owner relayed Claude's confirmation that `e657a8ac` deployed
at 08:34 GMT on 5 November and cleared the push hold. Publication still requires green checks;
new worlds are `/test/` only. No scheduled release job exists in this environment.
The windows below are planning estimates, not unattended automation or delivery guarantees.

## Protected baseline and ownership

- Base: `e657a8ace4ad25d8a204ae152be7138d85097c12`, including the lesson-opponent changes and bots-v0.11.
- Live at intake: `907d0f788d98cc5038ad82ac00237372d07d384c` (Beta 0.75 + egg fix).
- Branch: `feature/v075-four-worlds`; worktree: `/workspace/futasaku-v075-worlds`.
- Read `AGENTS.md`, `HANDOFF-0.75.md`, `CURSOR-SERVER-DEPLOY.md`, architecture and visual conventions.
- Preserve the current planet geometry, bent/seamless duel board, materials, typography, accounts,
  game rules, bot versions, queued Seeds proofs, camera continuity and saved state.
- Do not restore or integrate the abandoned earlier sphere work. Other worktrees remain untouched.
- Cursor's server deployment remains separate. This pass adds no migration, economy change or server feature.
- New world choices are experimental `/test/` options. Default FUTASAKU stays available. No automatic
  promotion of this pass; the publication decision follows reviewed results and the release hold.

## Estimated next-12-hour sequence

Planning envelope: evening 4 November to morning 5 November, Europe/London (GMT).

1. **Hours 0–1: audit and baseline.** Inspect the actual v0.75 UI/renderers, existing skin assets,
   authoritative turn timing, menu/planet lifecycle, desktop cockpit/chat anchoring and panel motion.
   Install dependencies in the isolated worktree; capture representative before screenshots and
   repeatable performance measurements. Record existing failures rather than disguising them.
2. **Hours 1–3: interaction refinement.** Authoritative same-frame amber turn rim; restrained
   compositor-friendly atmosphere; lower desktop cockpit/hand with chat sharing its width above;
   instant PLAY controls plus an interruptible ~1.5s planet-only fade; satisfying Planet chat,
   colours and achievements transitions/focus. Preserve mobile chat and send permissions.
3. **Hours 3–7: four connected worlds.** Reuse the current rendering/material/settings systems.
   Build shared world definitions, deterministic world-space materials and distinctive top-down
   homes for OCEAN, FOREST, MAGIC FIELDS and VOLCANIC. Board detail and planetary LOD share identity;
   ownership rims, digits, gold, legal moves, selection, rocks and blocked cells stay clear.
   Restore a restrained crossed-swords ink insignia on challenged planetary tiles.
4. **Hours 7–9: integration and visual iteration.** Add persistent local selection in the existing
   PLANET selector, keeping identity colours separate from material choice. Inspect every world on
   a small cluster, complete board, mixed boundaries, home, normal planet and close zoom. Capture
   portrait, landscape, desktop and high-density shots; refine weak artwork and alignment.
5. **Hours 9–11: regression and performance.** Unit/type/build/asset checks; relevant lesson,
   offline/online, chat, menu/planet, rapid-toggle, reconnect, reduced-motion and PWA suites.
   Profile frame pacing, initial/lazy bytes, switching, idle work and repeated cleanup against the
   same baseline conditions. Run WebKit where available; distinguish automation from real devices.
6. **Hours 11–12: final polish and buffer.** Fix regressions, inspect final screenshots, review the
   diff and commit focused milestones. Save test evidence, costs, limitations and merge notes.
   Re-fetch remote refs before any integration. Release remains blocked until explicitly cleared;
   after clearance publish to `/test/` through the normal gates and verify the actual published SHA.

Quality controls take priority over these estimates. Keep unfinished items explicit if the session
or time budget ends; never publish an incomplete or unverified feature to meet the window.

## Acceptance checklist

- [x] v0.75 before captures, architecture audit and performance baseline recorded.
- [x] Warm established amber token; border follows actual turn state without reveal/animation lag.
- [x] Sparse depth-aware atmosphere, no popping, no extra game-frame loop or expensive animated blur.
- [x] Desktop hand/cockpit lower; optional chat directly above, same bounds; mobile preserved.
- [x] PLAY controls immediate; planet alone fades ~1.5s; reversal/re-entry/reduced motion correct.
- [x] Crossed-swords stamp reads at real tile scale, including tiny planet views.
- [x] Four complete world identities, homes and adjacency-safe terrain; default retained.
- [x] Shared board/planet definitions; deterministic materials; local selection persists correctly.
- [x] Cosmetic selection never sends ownership/economy/account-preference mutations to the server.
- [x] Planet chat/colours/achievements feel tactile; interrupted opens/closes and focus stay correct.
- [x] Actual mobile/desktop screenshots reviewed and improved; digits/ownership/specials remain clear.
- [x] Functional automated checks/builds verified without weaker assertions; timing reruns and the
  unresolved manual cold-Draw budget are disclosed in `V075-VALIDATION.md`.
- [x] Measured resource/loading/frame-time comparison; no leaked timers, listeners or GPU resources.
- [x] Focused commits, final handoff, remaining limitations and exact preview/deployment status recorded.

## Confirmed appearance scope

Owner chose a shared local environment plus own Planet land, with independent player styles.
Model appearance as `{ environment, owners: [localSkin, opponentSkin] }`, not one global CSS filter.
Each owner gets its own ground/home/edge recipe; neutral/special terrain remains coherent and clear.
The current selector changes the local preference only. Keep an explicit opponent-skin input with
safe default fallback, and test mixed pairings. Future online cosmetic metadata and campaign
opponent definitions can supply it without renderer rewrites. Do not introduce a preference
migration or campaign skin rotation now, and never present a guessed opponent preference as real.

## Checkpoints

- Intake: clean baseline worktree created; no remote write. No product changes yet.
- Scheduling tools checked: none available. Claude's release check-in is not duplicated.

## Local checkpoint — first interaction milestone

- Dependencies installed using a task-local npm cache; baseline futa05 build passed.
- Baseline screenshots captured at 390×844, 844×390, 1280×720 and 1440×900 in Chromium.
  Captures and rectangle/error reports: `/tmp/v075-baseline/` (local artefacts, not a hosted preview).
- Fixed turn-rim timing: actual offline state / confirmed online phase and seat drive the rim;
  queued announcements cannot overwrite it. Uses `LIGHT_TONES.amber.core`; no opacity delay.
- Added an interruptible 1500ms PLAY backdrop fade that reuses the existing world; no new canvas,
  timers or renderer. Reduced motion exits immediately. Returning cancels stale completion.
- Six focused unit tests passed; full TypeScript check passed. Browser verification in progress.
- Release hold unchanged. No push, promotion, server deployment or future check-in scheduled.

## Final local handoff — 5 November

Implementation is complete on the isolated branch. Final local results and initial failures are
recorded in [V075-VALIDATION.md](V075-VALIDATION.md); reviewed screenshots and integration details
are in [V075-WORLDS.md](V075-WORLDS.md). The owner cleared Claude's release hold after confirming
its 08:34 GMT deployment. The next action is the normal gated `/test/` publication, with no
production promotion. No server code or migration is part of this pass.
