# Online experience refinement - verified local candidate

Baseline: `91b7ce06961dbe5b5232d753b7bd3ead0ca9954f`.
Branch: `fix/online-experience-refinement`.
Checkout: `/workspace/futasaku-online-refinement`.
Owner authorises the finished verified release, including promotion. This candidate is NOT deployed.

## What changed

- Successful identity writes and online-session entry notify the existing live controller immediately.
  The five-second identity discovery timer is gone. Raw storage events are filtered to the current
  channel's identity key or a full clear, avoiding cross-tab probe loops and cross-channel wakeups.
- Presence writes serialize. Entry, foreground and socket join publish authenticated opponent hints;
  ordinary heartbeats remain quiet. Recipients come from server membership, with no private payload.
- Status and inbox reads coalesce, then drain hints received during an outstanding request, including
  a failed request. Reconnect repairs state; hidden pages pause reads. Existing fallback remains.
- Replaced sockets, stopped listeners and identity replacements ignore stale callbacks. No second
  presence model, extra socket or permanent one-second normal-match poll was added.
- Duplicate sends are guarded; failed acceptance/decline remains retryable. Inbox/HTTP acceptance
  races cannot launch a match twice. A finite timer closes at authoritative invitation expiry.
- Backend status reports the actual configured Blitz limit before acceptance. UI removes its wrong
  sixty-second fallback. Connected timeout completes a turn; explicit Leave forfeits, as before.
- Edge delivery registers started work with `EdgeRuntime.waitUntil`, detects rejected REST responses
  and reports failures without waiting for the broadcast on the committed-move response path.
- Waiting shows exactly Practice match, actual Level N, Invite a friend. Standard equal buttons,
  shorter copy, one quiet status. Back cancels the server queue; external cancellation returns home.
- Confirm/incoming/end windows share matte/amber controls, smaller insignia, finite surface motion,
  keyboard focus containment, accurate consequences and measured HUD-logo clearance.
- Private chat restores the corner mark using its existing measured clearance.
- Ritual seats and measures against the actual centre tile again after gathering, before kanji.
  No gameplay, engine, ownership, progression, account, economy or migration changes. No dependency.
  `main.ts` is untouched. LIVE.md identifies the current contract separately from historical notes.

## Measured comparison

See [machine-readable summary](ONLINE-REFINEMENT-MEASUREMENTS.json).
Same local fixtures, browsers and conditions; one sample per seat/invitation arrangement.

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Eligibility after both boards open, range | 4.532-6.489 s | 0.761-2.424 s |
| Eligibility median, four arrangements | 6.210 s | 1.491 s |
| First invitation while an older inbox request is held | 26.675 s | 0.233 s |
| Healthy invitation cases | 28-188 ms | 27-63 ms |
| Normal requests/minute, both clients | 37 | 37 |
| Blitz requests/minute, both clients | 145 | 145 |

Each request window warmed for 11 seconds then measured for 60. This is not a production SLA or
physical-device benchmark. The simulator proves invalidation/lifecycle behaviour, not hosted
Supabase delivery. Earlier contended runs exceeded the unchanged 2500ms gate; the isolated four-case
run passed it. Software-rendered cold board entry still includes multi-second work. End-state
observation varied up to 6.8 seconds. No claim of solving every rendering bottleneck.

## Verification actually performed

- `npm ci` completed with Node 20. Final strict web/server/admin typechecks passed.
- Full `npm run check`: 4,376 passed, one expected failure, 66 optional skips; its sole unexpected
  failure pinned the old invitation wording. Updated that owner-requested copy expectation and
  reran it with the related suites: 131 tests across nine files passed, including import cycles.
- All eleven multiplayer scenarios verified, including UI turns, immediate Draw delivery, return
  to an identical computer game, preserved unsent match draft, Busy Live, decline/expiry, connected
  timeout, leave/forfeit, rematch, legacy preference repair and replay deferral. Five layout families
  passed popup containment, 44px targets and no horizontal overflow.
  The full run found a random draft fixture that legitimately auto-committed EndAct. The corrected
  focused run uses a legal optional-Bloom position and proves identical stored draft, unchanged
  server revision and identical returned board. No application rule was changed to satisfy it.
- Replay overlap is controlled with browser time before the real turn arrives, not a fake busy
  flag. The inbox arrives while the actual replay waits; popup remains deferred until resume.
- Private chat: 93 browser checks passed, including access/turn permissions, retry/deduplication,
  offline persistence, reconnect, UI/keyboard geometry, logo clearance and teardown.
- Waiting browser checks passed pairing, queue cancellation, external cancellation, practice and
  resumability; all five families passed equal controls, reachable actions and overflow checks.
- Existing ritual browser suite passed in isolation, including skip, cancel, rotation, supersede,
  pagehide, reduced motion and the unchanged 120ms frame-gap guard (max 83.2ms, p95 33.4ms).
  A prior run contending with other suites had max 149.9ms; no threshold was loosened.
- Centre measurements at Retina DPR 2 passed 390x844, 1024x768, 1280x720, 1280x800, 1440x900 and
  1920x1080, max 0.012 CSS px during emergence/hold. Resize during exit passed at 0.007px.
  Filing the pile during the kanji's final fade is intentional and excluded from landing geometry.
- Four account/guest seating/invitation arrangements passed the exact journey, including a held
  older inbox response. Final smoke repeated entry/invite/accept/chat/end after the storage guard;
  two real tabs produced bounded unrelated-key events [0,1], with no probe loop.
- Futa04 motion passed Draw/Throw, Bloom, Small/Huge cut, reduced motion and Mega Bomb. Its recorder
  previously cleared flinches after waiting for their phase; only that late reset was removed.
- Futa04 product build and asset isolation passed (109 files). Futa05 build/asset guard uses a local
  non-production configuration with the production URL shape. Server bundle rebuilt successfully.
- Phone and landscape waiting/popup screenshots were inspected. Five-family popup evidence is
  under `/tmp/online-blitz-final`, chat under `/tmp/online-chat-final`, waiting under
  `/tmp/online-waiting-final`, centring under `/tmp/ritual-centering`.

## Five surgical audit findings

1. Edge broadcast work could be abandoned after a response and non-2xx delivery went unnoticed.
2. Old socket callbacks could tear down a replacement; generation/socket ownership now guards them.
3. Failed accept could permanently suppress retry; stopped/stale accept could start the wrong UI.
4. Externally cancelled searches could strand an empty waiting screen because teardown changed the
   mode before checking it. Browser reproduction failed before and passed after the correction.
5. The ritual's gather target could become stale while desktop layout settled. Re-measure at handoff.

Final review also added channel-specific storage-event filtering, protecting multiple tabs from
recursively reacting to the storage availability probe. Existing game settings and rules remain.

## Limitations and release hold

- No physical MacBook, iPhone, Android or native Safari check. Owner's ordinary-start Chrome/MacBook
  misalignment was not reproduced on native Mac; Retina Chromium measurements are not native proof.
- Account classification is an actual local API identity classified in the store, not an external
  authentication-provider signup. Optional real-database suites were skipped, no schema changed.
- Hosted Realtime, live server health and both deployed website markers are NOT yet verified.
- Environment readiness still reports no deployment secret and no allowed deployment hosts.
  The existing configuration draft contains required domains but is not applied. Credentials belong
  in environment settings, never in this file or chat. Exact-SHA GitHub CI must pass before release.

## Safe release order

1. Rebuild the server bundle if server sources change: `npm run server:build-edge`.
2. With configured access, deploy `duel` to project `wbfrbeedlvjercrukngn` using the existing
   Supabase workflow (`--no-verify-jwt`), then verify health and the pre-invite limit response.
   No migration is required. SERVER FIRST: the old server returns null before Blitz.
3. Fetch current release heads. Integrate the feature without overwriting other agents. Fast-forward
   `futa0.5-online` only if still an ancestor, otherwise integrate and re-run applicable checks.
4. Wait for exact-SHA CI and /test publication; inspect the staged two-client journey.
5. Promote the verified SHA using `npm run promote -- <sha>`. Run the approved-source
   "Publish futasaku.com" workflow from `futa0.5-online` again.
6. Confirm resolve/build/deploy logs and both `release.json` markers before claiming live.
   A moved live ref alone is not publication. Stop if a critical gate fails; do not bypass it.
