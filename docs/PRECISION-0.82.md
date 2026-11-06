# FUTASAKU 0.82 precision pass

## Baseline and recovery

Based on verified live 0.81, `65d78bf1f731342b5e6d814b82a1857c10e9dcde`, immutable tag `v0.81`.
The approved [publisher](https://github.com/severgrow/severgrow-01/actions/runs/42246339305)
succeeded with that source for both root and test. Release CI 42246339144 and extra checks
42246339056 passed. Original 0.8 remains `v0.8-preserved-20261106` at `15f80b7c`.

Work branch `release/v0.82-precision`, isolated at `/workspace/futasaku-v082`.
The owner subsequently authorised automatic promotion of this pass after verification.
Use `RELEASE-FLOW.md`; an approved publisher and exact ROOT_SHA/TEST_SHA, not branch movement,
are deployment proof. Resolve final source from `v0.82` after the successful release.

## Ten practical improvements

1. A legal winning Grow or Bloom is recognised, including defended home sides and a Bloom closing
   several sides at once. That finish ranks first and stands alone. Separate alternative actions
   are never added together. A regression applies the actual engine action and proves the win.
2. Bloom advice respects the Grow already used this turn, while preserving Bloom's extra-action rule.
3. Takeover suggestions require an actual legal move with this hand, on this turn. They no longer
   assume a stronger future card or duplicate the more useful cut recommendation.
4. Bomb advice names a reachable card strength and its configured Grow cost. The generic claim
   that any touched tile can be removed is gone. Homes remain immune; rules do not change.
5. Planet challenge headings drop the old Territory label and redundant pricing emphasis; the
   stake warning, deadline and consequences remain. Endgame copy acknowledges gold's double score.
   Quiet advice no longer asserts an unproved absence of large cuts. Copy stays centralised in `src/strings.ts`, without forced line breaks.
6. View board now permits read-only Match Intel in normal completed matches. Now shows the actual
   won/lost/draw result; finished Tips offers no future moves. Existing result and review controls
   are reused, with no extra button or metric. Guided tutorial restrictions remain intact.
7. Rules preserves keyboard focus on its reading body during a real live-state update, in addition
   to 0.81's tab/tip/rule-button focus protection. Reading position and reduced motion stay intact.
8. Both map gesture paths use the input event's monotonic timestamp. The sphere also requires
   taps to be spatially close, starts with no phantom previous tap, and keeps dragging, cancelled
   input and keyboard Enter separate from double-tap zoom. Rotation and camera limits do not change.
9. Verification photographs real Settings, after the launch cover has gone. End-scroll checks use
   the real bottom and painted scroll state, with an additional exact-position assertion. Native
   WebKit input/delivery clocks and fade paint gaps are logged without changing timing thresholds.
10. README now describes the current product, source boundaries and actual release flow. The old
    onboarding-branch README is preserved under `docs/history/README-before-0.82.md`, clearly historical.

The established typography, glass, buttons, palette, motion durations, effects and gameplay stay.
No new panels, permanent loops, dependencies, privileged browser credentials or database changes.
No production analytics are added. New gesture traces exist only in the browser test fixture.

## Performance investigation

The same `motion-cost.ts` fixtures, Chromium 154, 390x844 mobile viewport and 4x CPU throttle were
used in serial three-sample blocks. Raw samples and methodology are in `evidence/0.82-motion.json`.

The profile identified viewport measurements and style/layout work at step boundaries. Two small
experiments were evaluated: event-invalidated viewport measurements and unchanged hand/HUD DOM
writes. Neither established a reliable overall frame/style gain. Both were removed, including
new cache/listeners/helpers. The final animation hot paths retain 0.81's implementation.
The only `main.ts` change enables Intel after View board.

Median style work / frame p95 in milliseconds, three samples per move in each block:

| Move | Initial 0.81 | Final 0.82 | Later 0.81 control |
| --- | --- | --- | --- |
| Blast | 1027 / 100 | 1021 / 50 | 1178 / 83 |
| Bomb | 1527 / 133 | 1664 / 150 | 1326 / 117 |
| Huge Cut | 1433 / 117 | 1536 / 250 | 1291 / 117 |
| Bloom | 531 / 83 | 723 / 100 | 570 / 100 |

Some final values are worse. These small, variable blocks justify neither an overall speed-up
nor a universal no-regression claim. Both control and final data are retained instead of selecting
favourable samples. The 0.81 rendering implementation is preserved; remaining stalls require
physical-device profiling, not a speculative rewrite.

Do not describe 0.82 as a frame-rate optimisation or claim universal 60fps. These throttled
container samples include substantial scheduling variation. Physical mobile profiling is needed
before another render refactor; preserve the choreography and effects in the meantime.

## Visual and regression evidence

Focused regressions cover real winning Blooms, spent Grow, current-hand takeover legality,
Bomb cost, relative final outcome, completed-match advice and double-tap boundaries.
The browser case plays a real winning Grow, dismisses the normal first-win install invitation,
uses View board, then inspects Now and Tips. The reading-focus case uses a real legal Draw.
The clock-fault case uses trusted CDP touch input with input timestamps while the page wall clock
advances between handlers. Original trusted drag, pinch and double-tap checks remain unchanged.

Settings previously could be captured underneath the intentional black launch cover. The test
now awaits actual reveal and checks paint visibility. It scrolls to `scrollHeight` and awaits
painted frames rather than assuming 1000px is the bottom or 80ms always contains a scroll frame.
All cue, geometry, target-size and contrast assertions remain; exact end position is now checked.

Representative captures: `screens/precision-082/`, including the same challenge fixture before/after
copy refinement, the settled PLAY submenu, Settings at 320px/Large Text and a real completed-match
review. Separate early transition and settled captures keep animation frames from being mistaken
for final layout defects. Existing Intel composition baselines stay in
force, including the missing-reader negative control. No baseline is automatically accepted.
The complete exact-SHA main and extra CI matrices remain release gates, including WebKit,
lessons, motion, accounts, reconnect, teardown, PWA, Planet and replay checks.

## Limits and protected systems

The isolated 0.81 WebKit timing failures passed unchanged on subsequent exact-source runs.
Using handler wall time for a gesture was a real fragility and is corrected. The isolated late
fade has not been conclusively reproduced as a product defect; its production timing is unchanged,
its existing assertion remains, and the additional frame-gap evidence helps diagnose recurrence.
Do not claim all runner timing variability has been eliminated.

Physical iPhone/Android and native home-screen launch verification are unavailable here.
Local WebKit download is blocked by environment network policy; GitHub runs the Safari engine.
Credential-dependent live-database checks remain unavailable. No server rollout is required.
Accounts, rewards, ownership, saved progress, engine/bot code, lockfile and 0.81 launch shielding
are protected. Follow the foundation and release documents for a tested rollback.

## Candidate checks executed before submission

Strict typecheck passed. The 34 focused unit regressions and 167 final Match Intel browser
checks passed. Chromium motion, trusted gestures (including the input-clock fault case),
Planet/menu/chat/challenge/replay checks, challenge viewports/reduced motion and all six Settings
cases passed. Product builds and asset isolation passed for futa04 (107 files) and configured
futa05 (110 files). Representative captures were inspected, not just generated.

The full Node 20 check and exact-source remote matrices are additional mandatory release gates.
Their final results and the approved publisher run are recorded with the immutable release tag
after successful publication; this source document does not pre-claim those outcomes.
