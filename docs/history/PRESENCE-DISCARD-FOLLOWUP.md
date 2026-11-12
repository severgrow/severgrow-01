# Online presence and opponent discard follow-up

Branch: `fix/online-experience-refinement`. Builds on the locally held follow-ups to
staging `42fd4f47`. Runtime candidate `702219a5` subsequently passed release CI and staging.
See the owner-approved publication record below; a selected live ref alone is not deployment.

## Problems reproduced and corrected

- The header used the driver's match-channel presence, while chat and Blitz used the existing
  authoritative heartbeat/status response. A new test published an online server status and
  reproduced the header remaining unknown. The driver now subscribes to the existing shared
  status, emits only when the value changes, and unsubscribes on stop. No extra poll or socket.
- Presence/status requests could own their coalesced queue indefinitely after a suspended network
  request. GET requests and idempotent heartbeats now abort after 12 seconds, releasing the queue
  for its existing recovery/fallback. Invitations and acceptance mutations are not automatically
  cancelled or retried. A browser `online` event also immediately announces and refreshes.
- The player notification socket ignored channel errors/closures and had no connect/join/heartbeat
  acknowledgement deadline. It now repairs these failures, preserves the Phoenix join reference,
  ignores old sockets, and clears its timeout/heartbeat/retry resources on stop.
- The online event-to-animation converter explicitly returned no steps for `Discard`. Its public
  card ID now resolves through the deterministic rules deck, without reading a hidden hand. This
  feeds the existing shared opponent flight in ordinary online play, Blitz and catch-up.
- The shared flight starts visible, uses an 80 ms reveal and 260 ms arc at duration scale 1
  (374 ms at the normal opponent pace), and lands upright. Reduced motion uses the existing
  stationary crossfade. Interrupted flyers cannot later invoke their landing callback.
- Each arriving card covers the preceding visible pile card, including multiple buffered turns.
  Draw-from-pile removes the previous top; the closing authoritative sync reconciles the stack.
  The arrival update is idempotent and does not mutate gameplay state.
- The presence label clears the Blitz button during active gameplay. The HUD is a sibling of
  the header, so its spacing rule must use that actual relationship. A browser assertion reproduced
  the overlap before the selector correction and passes afterwards on phone and desktop.

## Verification

- Red then green: header/server status agreement, hung request recovery, channel error/closure,
  missing join acknowledgement, missing heartbeat acknowledgement, and public discard steps for
  both seats (including Bomb cards and unknown-ID omission). Hidden deck draws remain hidden.
- 76 targeted tests passed before the final effect tests; the three shared-effect tests also passed,
  checking exact-once arrival, cancellation cleanup and reduced-motion frames.
- Real Chromium, real authenticated local HTTP services: four account/guest arrangements passed
  initial presence agreement and recovery after a phone's presence expired, without sending chat.
  The Supabase wire is simulated; the account classification is a fixture, not a provider login.
  Final-run initial eligibility was 147-444 ms; invitation delivery was 41-251 ms across four cases.
- This transport journey used the supported WebGL-unavailable fallback. Normal software-GPU
  attempts encountered long main-thread stalls and a menu timeout; these are not reported as
  passing visual/performance checks. Default journey rendering/thresholds remain unchanged.
- Normal-rendered discard checks passed phone 390x844 and desktop 1440x900 in ordinary online
  and Blitz, plus phone reduced motion. They measured visible travel, previous pile retention,
  the correct final card and flyer cleanup. The offline bot check passed through the classic
  saved-position resume handler; it is not a menu navigation test. Screenshots were inspected.
- New browser checks are included in the extra regression workflow. Transport uses WebGL fallback;
  discard checks keep normal rendering. Neither memory nor listener thresholds were weakened.
- Clean-install `npm ci` and `npm run check` passed: 446 test files, 4,391 tests passed,
  one expected failure and 66 optional skips. Futa04/futa-test builds and asset checks passed.
  Final targeted checks after the connecting-socket fix passed 46 tests in eight files; final web
  typecheck passed. The final six browser variants passed (ordinary online and Blitz on phone
  and desktop, phone reduced motion, offline bot), including the header clearance check.
- The final four-arrangement presence journey also passed expired-presence recovery without chat.
  This used local authenticated HTTP and simulated Realtime with WebGL fallback, not hosted
  Supabase or a physical device. No physical iOS, Android or Mac verification was available.
  No server change, migration or dependency was added.

## Earlier release hold

The previous 15-match soak failed retained-heap slope and listener-drift guards. These changes
have not established their cause or cleared them. The environment also blocks the production
site/API hosts, so hosted staging and production cannot be verified here until settings change.
These historical local failures remain recorded; passing CI does not establish their root cause.

## Owner-approved publication - 9 November 2026

- The owner explicitly requested promotion after being told about the earlier local soak warnings.
- Runtime candidate: `702219a5154a81a4a6543b65ed13db9d14d24112`.
- Full release-branch CI passed: run `42684594031`, including the release browser set.
- All eight extra regression jobs passed: run `42684593586`, including the 15-match soak.
- Staging publication passed: run `42684593496`; its resolve/build selected `702219a5` for `/test/`.
- `npm run promote -- 702219a5154a81a4a6543b65ed13db9d14d24112` moved `live` to that exact
  candidate. No server change or migration is needed; deployed server version 106 is compatible.
- This documentation-only update triggers the supported publisher from `futa0.5-online`, which
  republishes the selected live candidate. Runtime files are identical to `702219a5`; staging's
  documentation SHA may differ. Both CI gates and the deployment environment policy remain active.
- Confirm the publisher's resolve/build/deploy result before calling it live. Direct website/API
  requests remain proxy-blocked here, so publication evidence is GitHub's existing deployment logs,
  not a fresh hosted browser or physical-device check. Do not claim the local soak issue was fixed.

Local evidence: `/tmp/presence-discard-final-journey.log`, `/tmp/opponent-discard-final-reviewed.log`,
`/tmp/opponent-discard-offline2.log`, `/tmp/opponent-discard/`,
`/tmp/presence-discard-full-check.log`.
