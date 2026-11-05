# v0.75 — matte controls and Planet refinement

v0.75 remains the baseline. This supersedes the rejected four-world experiment documented in
V075-WORLDS.md; those old preview images are historical, not active assets.

## Changes

1. Removed Ocean, Forest, Magic Fields and Volcanic assets, selector, renderer/shader integrations
   and build generator. Classic FUTASAKU art is restored. Retired saved ids safely fall back to it.
   Only the pure owner/environment cosmetic model remains, with no runtime import or extra loading.
2. Menu, suggested PLAY/LEVEL, campaign and difficulty keys share one matte material. Suggestions
   add a slight amber halo, without a different fill, outline or weight. Per-key backdrop blur removed.
3. Planet chat is Global chat from its initial accessible markup onward. One bounded, identity-scoped
   memory page warms during menu/Planet preparation, paints while hidden and is reused immediately
   when opened. In-flight reads are shared; late account responses are ignored. Closed chat has no
   polling timer. Visible polling/backoff, sending and moderation retain the existing backend.
4. Active Planet submenu keys sit inward with the quiet backlight, replacing the bottom stripe.
5. The actual online screen owns the corner logo, even when an asynchronous brand flag is stale.
6. Planet trackball rotation and inertia remain free. After release, screen roll settles upright
   over 220–480ms without changing the viewed centre or zoom. Zoom settles about its surface anchor
   so the ground stays under the pointer/fingers. A new gesture interrupts it. Reduced
   motion settles directly. Near a pole, heading is held to avoid a singular flip. Swords use the
   matching geographic tangent basis, with blade tips northward. The existing slow star timer is
   cancelled on interaction, freeze, hide and disposal; a cancelled touch cannot start a busy loop
   while another finger remains down. Geometry and topology are unchanged.
7. Difficulty/current-level controls share the same key vocabulary, retaining their current sizes,
   keyboard focus and disabled states.
8. Board shadow and turn glow share a joined closed silhouette. Subpixel endpoints are welded using
   the existing pixel-grid tolerance. Three faint painted edge strokes feather the underlay, with no
   filter on the moving board; tile art, digits and the fine indicator stay crisp. No new render loop.
9. First `/test/` startup waits for the app, fonts and first real Planet paint, then fades in once
   over one second. A 3.5s fail-open prevents indefinite black. Deep-linked games skip the Planet
   requirement; reduced motion skips the fade. Navigation and PWA resumes do not replay it.

The performance pass also fixed an LED reel race: a queued update could start a transition after
the page was hidden. Pending/running reels now settle on hide; foreground display timings are unchanged.

No game rules, bot versions, progression, server code, migrations, ownership or rewards changed.
No server deployment is required. Truly cold/slow networks can still need the existing connecting
state: cached messages are instant; the page does not invent messages that have not arrived.

## Integration and release

Worktree: `/workspace/futasaku-v075-worlds`; branch: `feature/v075-matte-planet`.
Based on `60ca54e4` from `futa0.5-online`. Preserve future concurrent updates by checking the release
head before fast-forwarding. Push through `futa0.5-online` for `/test/`; do not push main or force.
Production promotion is separate and requires the owner's explicit instruction.

Important paths: `polish-075.css`, `online/global-chat-feed.ts`, `online/territory-chat.ts`,
`player/startup.ts`, `player/branding.ts`, `sphere/upright.ts`, `sphere/planet.ts`,
`sphere/challenge-stamp.ts`, `ui/outline.ts` and `ui/board.ts` (all under `web/src/`).
`web/e2e/planet-matte.ts` is added to CI for the current interaction/material contract.

## Verification

This is local verification, not a claim of direct hosted-device testing. Browser automation uses system
Chromium and software graphics, not a physical phone. WebKit coverage belongs to the existing CI
jobs; physical iOS Safari/PWA verification is not available in this environment.

### Completed local checks

- `npm ci` passed. TypeScript passed for engine/server, web (including browser suites) and admin.
- Full unit run: 403 files / 4,060 tests passed; three unchanged simulation cases timed out at the
  original 60s limit. Their three files reran alone: all 42 tests passed, with unchanged limits.
- Focused outline, orientation/zoom anchor, feed, startup, stamp and retired-style tests: 19 passed.
  Final focused run including display/LED and pinned motion contracts: 76 tests across 11 files passed.
- New browser contract passed 320×568, 390×844, 844×390 and 1440×900: matching matte materials,
  coherent app/font/planet reveal, warmed messages present synchronously at opening, no closed-chat
  polling, reading-position recovery after a late hidden response, one visible logo, recessed keys,
  centre-preserving upright drag settle, unchanged tap orientation and one closed duel perimeter.
- First reveal also passed reduced motion, delayed-font fail-open (one announcement) and module
  failure fail-open. The final four-viewport run also passed real pointer presses, ivory primary ink, touch
  cancellation, rendered duel outlines and the hidden-page LED regression.
- Existing Planet suite: 147 assertions passed across phone/landscape/desktop, precise selection,
  wheel/pinch/double-tap zoom, immediate Back, repeated entry, no idle map rendering, reused canvas,
  reduced motion and no-WebGL fallback. The desktop wheel anchor moved 0.4px (unchanged <6px limit).
- PLAY fade passed early navigation, immediate controls, retained-canvas 1500ms fade, interruption,
  cleanup, reduced motion and simulated persisted-page resume.

- Match chat: 93 checks passed with two authenticated local clients and the Supabase wire simulator,
  including delivery, retries, history, drafts, IME, mute/block/report, presence, focus and cleanup.
- Living menu: 231 checks passed. Territory menus and touch gestures passed; challenge suite passed
  against its local API fixture, including narrow phones and landscape. No live economy calls.
- Critical suite passed, including 883 cockpit, 3,253 pile-layout and 225 candidate checks; information
  suite passed 168 checks. Draw/Throw, Bloom, cut, reduced motion and Bomb motion checks passed.
- Settings visual suite passed. After the hidden-LED fix, all 883 foreground cockpit checks passed
  again. futa04/futa05/futa-test builds and channel asset checks passed.

Some software-browser runs missed transient cockpit/cut states or the Planet's strict settling /
frame-scheduling bounds. Assertions and timing limits were retained. Failure diagnostics were added;
final reruns passed. The new upright/zoom interaction and subpixel perimeter failures were actual
implementation issues found during this pass and fixed before delivery. No PINNED motion values changed.

### Performance findings

[Raw measurements](qa/v075-matte/performance.json) retain the initial comparison, interleaved controls
and the final hidden-LED fix. Chromium software graphics, DPR 3, 4× CPU slowdown, 390×844, three cold
Draw samples per main group. These are runner measurements, not phone FPS.

Both versions miss the existing 34ms cold-Draw p95 budget. The initial reference ranged 350–483ms;
interleaved reference samples later ranged 1,067–6,550ms. Candidate samples overlap that broad range;
the final guard-fix samples ranged 400–2,267ms. This noisy runner cannot establish a frame-rate
improvement or certify physical-phone performance. That performance budget remains unmet here.

Idle game-requested frames stayed at 0/s, idle paint-property animations at zero, and the existing
25 compositor animations / 31 filter count did not increase. No new blur layer was added. The initial
candidate's hidden probe exposed two LED reel animations; the guard fix and direct browser regression
pass, with zero running animations in all three final hidden-page probes. Their idle style work
averaged 8.2ms/s (below the unchanged 15ms/s budget). Browser and physical-device limitations above
remain; the performance probe's frame-time failure is disclosed rather than presented as a pass.

### Release

Publish through the existing `futa0.5-online` CI/Pages workflow to `/test/`. No production promotion
or server deploy is part of this pass. Delivery reports the exact pushed SHA and publication result.
The local feature branch can be integrated by fetching the reachable release commit; do not rely on
a path on this cloud machine being available to Cursor.
