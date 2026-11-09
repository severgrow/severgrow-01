# Online experience refinement - verified local candidate

Baseline: `91b7ce06961dbe5b5232d753b7bd3ead0ca9954f`.
Branch: `fix/online-experience-refinement`.
Checkout: `/workspace/futasaku-online-refinement`.
Owner authorises the finished verified release, including promotion.
Server version 106 is deployed. Website staging is `42fd4f47`; live remains `91b7ce06`.
See the release investigation below before promoting.

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

## Server deployment (done 2026-11-09, Claude) — the website is NOT released

- Deployed source: commit `130f95d6823c9d8682ae52c0331cba45bd0f1bc4` (this branch, built on
  `91b7ce06` = the current `futa0.5-online` and `live`, so no newer server fix was lost; nothing to
  integrate). `npm run server:build-edge` reproduced the committed bundle byte for byte.
- `supabase functions deploy duel --project-ref wbfrbeedlvjercrukngn --no-verify-jwt`: "Deployed
  Functions", `duel` version 106 ACTIVE. `/v1/health?db=1` ok (transaction pooler). No migration.
- Before deploying: server suites 772 passed; local Postgres integration 28 passed (1 local-only
  privilege check fails identically without this change).
- Verified on the LIVE server with throwaway guests (match resigned afterwards), Realtime frames read
  over the real websocket — 13/13 passed:
  - authenticated `GET /v1/players/me` works;
  - an active normal match's `GET /live` returns `live:false, limitMs:30000` before Blitz (= the
    server's 30 s Blitz clock);
  - an ordinary heartbeat (`announce` absent) broadcasts nothing;
  - `announce:true` reaches ONLY the opponent's `player:<id>` topic (`{kind:'presence'}`), not the
    sender, not a third player;
  - a non-participant cannot announce into the match, read it (403 NOT_A_PARTICIPANT) or invite
    (404 CHALLENGE_NOT_FOUND);
  - the invitation reaches the invited player; acceptance starts Blitz (`live:true, limitMs:30000`)
    and pings the challenger and the match; a Blitz move pings the match channel.
- Not verified: the Edge function logs (the Management API `logs.all` endpoint is retired and the
  replacement did not expose function log tables to this token). Indirect evidence: every expected
  broadcast arrived during verification and none went to the wrong player.
- Compatibility note: the presence hint is published on the existing `challenge` broadcast event with
  payload `{kind:'presence'}`. The CURRENT live page treats any `challenge` frame as "re-read the
  inbox", so until this frontend ships an opponent's lifecycle presence costs it one inbox read.
  Harmless; the new page handles it.
- Next (Codex): steps 3–6 below — integrate onto `futa0.5-online` (still at `91b7ce06`), wait for
  exact-SHA CI and /test, then promote and confirm both markers. Do not claim live before that.

## Website release investigation (2026-11-09)

- `/test/` publisher run `42658539967` succeeded for `42fd4f47`; primary release CI
  `42658540020` passed. The publisher built the root from `91b7ce06` and staging from `42fd4f47`.
- Extra regression run `42658539884` failed its five-match retained-heap slope guard
  (337 / 1,523 KB per match; limit 1,024). Promotion is held, not bypassed.
- An extended 15-match candidate run measured tail slopes 143 / 146 KB per match and final
  heaps 13.41 / 13.76 MB. The unchanged baseline measured 112 / 117 KB per match and
  13.35 / 13.43 MB. Both passed the same memory limits. The candidate also encountered one
  40-second catch-up wait failure at match 9, turn 3. This remains under investigation.
- Both extended runs exposed false listener drift in the diagnostic probe. Native abort-signal
  cancellation does not invoke the JavaScript remove wrapper. The probe now handles this and
  matches removals by callback identity; duplicate registrations and already-aborted signals
  follow native behaviour. A standalone browser contract reproduced the failure before the fix
  and passes afterwards. CI runs that contract before the soak and now covers 15 matches with
  the same thresholds. No gameplay listener cleanup or guard was removed.
- Metadata reads in the live controller rebuilt a full driver snapshot just to obtain an immutable
  match ID. A weak session cache avoids that work. Actual-driver microbenchmarks of 500 reads
  took 361-519 ms before and 0.09-0.76 ms after, with 500 snapshots reduced to at most one.
  These are metadata-loop measurements, not frame-rate or whole-match speed claims.
- The corrected-probe 15-match run completed all 60 turns with correct boards and no repeat
  replay timeout, but FAILED two guards: tail heap slope 1,193 / 94 KB per match and listener
  drift -3..51 against the existing +/-40 limit. Seat 0's heap jumped from 13.58 MB after match
  13 to 26.12 MB after match 14, then 23.56 MB after match 15. This is unresolved; do not
  promote or describe the metadata optimisation as fixing the replay or memory issue.
- Follow-up `npm run check` completed successfully (exit 0), as did final typechecks, the native
  listener contract, futa04/futa-test builds and asset-isolation checks. No physical-device
  verification was available. Follow-up changes are held on the feature branch while the soak is
  red; they have not replaced the deployed staging candidate or reached the release branch.
- The environment still blocks direct site/API access; the saved network-settings draft must
  be applied, or Cursor must perform staged verification. Do not describe this candidate as live.

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
