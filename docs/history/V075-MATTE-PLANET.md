# v0.75 — matte controls and Planet refinement

v0.75 remains the baseline. This supersedes the rejected four-world experiment documented in
V075-WORLDS.md; those old preview images are historical, not active assets.

## Changes

1. Removed Ocean, Forest, Magic Fields and Volcanic assets, selector, renderer/shader integrations
   and build generator. Classic FUTASAKU art is restored. Retired saved ids safely fall back to it.
   Only the pure owner/environment cosmetic model remains, with no runtime import or extra loading.
2. Menu, suggested PLAY/LEVEL, campaign and difficulty keys share one matte material. Suggestions
   add a slight amber halo, without a different fill, outline or weight. Menu, footer and difficulty
   labels also share their size and tracking; the narrower Planet-label override is removed. Per-key
   backdrop blur removed.
3. Planet chat is Global chat from its initial accessible markup onward. One bounded, identity-scoped
   memory page warms during menu/Planet preparation, paints while hidden and is reused immediately
   when opened. In-flight reads are shared; late account responses are ignored. Closed chat has no
   polling timer. Visible polling/backoff, sending and moderation retain the existing backend.
4. Active Planet submenu keys sit inward with the quiet backlight, replacing the bottom stripe.
5. The actual online screen owns the corner logo, even when an asynchronous brand flag is stale.
6. Planet drags now keep geographic north upright during input. Longitude wraps; latitude gently
   resists near the poles. Drag, pinch and wheel end exactly at the last input pose/zoom: no inertia,
   roll correction or recenter after release. This supersedes the earlier free-rotation/settle choice
   after player testing found its movement distracting. Zoom keeps its surface anchor where possible;
   at the pole limit, a stable upright view takes priority. Swords use the same geographic tangent
   basis, now with clean tapered tips and no widened shoulders. The existing star timer is cancelled
   on interaction, freeze, hide and disposal. Geometry and topology are unchanged.
7. Difficulty/current-level controls share the same key vocabulary, retaining their current sizes,
   keyboard focus and disabled states.
8. Board shadow and turn glow share a joined closed silhouette. Subpixel endpoints are welded using
   the existing pixel-grid tolerance. Three faint painted edge strokes feather the underlay, with no
   filter on the moving board; tile art, digits and the fine indicator stay crisp. No new render loop.
9. First `/test/` startup waits for the app, fonts and first real Planet paint, then fades in once
   over one second. A 3.5s fail-open prevents indefinite black. Deep-linked games skip the Planet
   requirement; reduced motion skips the fade. Navigation and PWA resumes do not replay it.

10. Opening a linked duel from Planet challenges uses one 700ms dark doorway (350ms out/in),
    preparing the duel at its opaque midpoint. The existing grain stays above it. Duplicate requests
    share one launch; Escape/navigation/background cancel safely before entry. Reduced motion enters
    immediately. No board transform, new renderer, permanent loop or backend change.

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

### Initial batch local checks (49dc1d6d)

- `npm ci` passed. TypeScript passed for engine/server, web (including browser suites) and admin.
- Full unit run: 403 files / 4,060 tests passed; three unchanged simulation cases timed out at the
  original 60s limit. Their three files reran alone: all 42 tests passed, with unchanged limits.
- Focused outline, orientation/zoom anchor, feed, startup, stamp and retired-style tests: 19 passed.
  Final focused run including display/LED and pinned motion contracts: 76 tests across 11 files passed.
- New browser contract passed 320×568, 390×844, 844×390 and 1440×900: matching matte materials,
  coherent app/font/planet reveal, warmed messages present synchronously at opening, no closed-chat
  polling, reading-position recovery after a late hidden response, one visible logo, recessed keys,
  north-up drags with exact release/scroll endpoints, unchanged tap orientation and one closed duel perimeter.
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

### Follow-up after player testing

- Replaced post-release roll settling with north-up input and exact drag/scroll endpoints; sharpened
  sword tips, added the 700ms challenge doorway and finished menu-label typography consistency.
- All TypeScript projects and futa04/futa05 production builds/asset isolation passed.
- 29 focused orientation, stamp, lobby-exit and pinned/shared-motion tests passed.
- The complete `planet-matte` browser contract passed all four viewports again, including actual
  label typography, fast drag release and wheel endpoints, reduced motion and bounded startup recovery.
  Its seven doorway scenarios passed: single launch, Escape, navigation, preview ownership,
  background, reduced motion and failed-opening cleanup. The opaque page background stays untouched;
  the existing film grain's higher layer covers the doorway without duplication.
- The zoom trace exposed a genuine layout race: a late mobile status message changed the panel
  height from 454px to 403px before the wheel event. Phone readouts now share the map's grid cell,
  clear of the menu and selection controls, so empty/long messages cannot resize the camera viewport.
  A real-browser regression changes the message length and checks the panel's exact bounds. It
  failed before the fix (403px → 290.5px → 403px) and passed after it (454px throughout). The
  complete targeted 320px Planet suite then passed, including anchoring and menu continuity.
- Fresh full local check: 404 files / 4,065 tests passed; unchanged Level 10 and seeded Bloom
  simulations timed out. Rerunning those files alone passed all 93 lessons and six Bloom cases;
  one Bloom simulation still exceeded 60s. Both complete GitHub unit/build gates on 1cc712f1 and
  0217294a passed. Three additional diagnostic-helper tests prove errors retain nonzero exit codes.
  No simulation, assertion, timeout or PINNED value was relaxed.
- Earlier software-browser runs hit startup's existing 3.5s fail-open. The full final contract above
  passed without changing that bound. An initial broad Planet run missed one narrow-phone anchor
  measurement; its focused rerun measured 0.3px (under the unchanged 6px limit), and proved upright
  dragging plus an exact release pose. That rerun counted one late paint in its idle sampling window.
  Timing assertions and frame/anchor limits remain unchanged; full browser CI is still a release gate.

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
