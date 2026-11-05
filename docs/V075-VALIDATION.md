# v0.75 refinement — local verification

This is a local review record, not a release announcement. Base: `e657a8ac`.
The owner initially reconfirmed the hold, then relayed Claude's 08:34 GMT deployment confirmation
and cleared it. Publishing to `/test/` is authorised after checks; production promotion is not.
Worktree: `/workspace/futasaku-v075-worlds`; branch: `feature/v075-four-worlds`.

## Environment and scope

Node 24, system Chromium, Linux software graphics. Phone frame probes use 4× CPU slowdown;
they are synthetic runner measurements, not physical-phone FPS. Chromium covers narrow portrait,
landscape and desktop. WebKit is absent; no physical iOS Safari or installed-PWA claim is made.
Online chat verification uses two authenticated clients against the local test API and Realtime
simulator. Production Supabase/database integration is not configured here. No server changes.

## Final results

| Area | Local result |
| --- | --- |
| TypeScript | Passed for engine/server, web and admin |
| Full unit run | 402 files passed; 4,054 tests passed; three existing simulation cases timed out; one expected failure and 66 optional skips |
| Isolated timeout rerun | All 29 tests passed in 41s across both affected files and the final material/motion tests; original timeouts unchanged |
| Worlds | 226 checks passed: all 25 owner pairings at four sizes, selection, ownership shading, normal/reduced-motion switching, no page errors |
| Match chat | 93 checks passed, including two authenticated clients, reconnection, drafts, IME, permissions, block/mute/report and desktop/mobile docks |
| Living Territory | 231 checks passed, including rapid Back, continuity, focus, delayed/offline/auth recovery and ownership refresh |
| Critical game/cockpit | Passed; includes 883 cockpit and 3,185 pile-layout assertions, critical flows and candidate checks |
| Information/tutorial intel | Passed, including replay, save/resume and seeded openings |
| Lessons | Levels 1–10 and the robustness/Bloom/restart/layout/tier groups passed in the full run; final reading-floor/redesign group passed on rerun at 390×844 and 360×640 |
| Territory challenges | Passed against the in-memory API with the suite's required futa05 endpoint configuration |
| Legacy touch gestures | All checks passed, including native touch double-tap toggle, pan, jitter, selection/release and no page scrolling |
| PLAY fade | Passed immediate controls, 1500ms fade, interrupted return, retained-frame freeze, cleanup and simulated persisted PWA resume |
| Channels/panels | Passed `/`, `/2/`, `/3/`, `/test/` preference isolation; pane scroll memory, focus/draft retention and interrupted close/reopen |
| Builds/assets | futa04, futa-test and futa05 passed; deterministic SVG generation and baked source/output hashes verified |
| Planet | Final full rerun passed: four viewports, exact selection, wheel/pinch/double tap, repeated visits, one canvas, menu continuity, 1500ms PLAY cleanup, reduced motion and no-WebGL fallback |
| Settings | Six local sizes passed, including Large Text and landscape. The remote extra suite timed out once; its precondition now waits for mounted game/account controls and retains all visual assertions, with public failure-state diagnostics |

The first material gallery stalled while SVG atlases were rasterised; the baked version passed.
The first lesson reading-floor probe took screenshots before its timed tap. It now measures the
actual explanation age and dispatches the early pointer events in one page task, then checks the
same refusal/acknowledgement. Gameplay taps and later intentional dismissal still run normally.
Native double gestures are submitted together instead of adding renderer/host round-trip latency;
the original product gesture window, zoom assertions and reading minimum are unchanged. The legacy
release test now chooses a tile whose centre is actually hittable, rather than an off-window node.

The card-motion suite passed on the current build; the reference run itself intermittently missed
a transient cut caption. No card motion budget was increased. All initial failures are retained in
the local logs; the results above distinguish corrected harness/configuration runs from first runs.
The Planet suite also hit one intermittent repeated-entry settle timeout before its final complete
pass. The strict 15s criterion remains; failure snapshots/visibility diagnostics are now captured.
WebKit/Safari verification is left to the repository's existing CI jobs; it was not run locally.
The initial pushed commit `f2d22d98` subsequently passed the complete main GitHub CI workflow,
including the WebKit jobs. Final publication status belongs to the delivery report rather than
this pre-publication snapshot.

## Performance findings

The unchanged reference also misses the existing 34ms tail-frame budget on cold Draw. A focused
software-graphics reference run measured 416.7ms p95; earlier reference runs varied substantially.
The serial three-run classic root probe measured 450.0ms mean p95 (416.6–466.7ms). This is not a
pass or evidence of sustained 60fps. A hardware-accelerated phone check remains necessary.

| Probe | Runs | Cold-Draw p95, ms | Idle style work, ms/s |
| --- | ---: | ---: | ---: |
| Current classic root | 3 | 450.0 mean | 6.2 mean |
| Test classic | 1 | 383.3 | 3.5 |
| Ocean | 1 | 383.3 | 11.0 |
| Forest | 1 | 383.3 | 7.7 |
| Magic Fields | 1 | 483.3 | 6.7 |
| Volcanic | 1 | 350.0 | 5.1 |

[Raw probe output](qa/v075-worlds/phone-perf.json) includes the unchanged focused reference.
Single runs do not establish that one world is faster than another. These results do not
establish a performance improvement or meet the 34ms cold-Draw budget.
They describe the baked-art checkpoint before the final tiny field-path seam alignment and finite
skin-swap acknowledgement; they are not measurements from the deployed site.

Idle checks pass: zero application frames requested per second, 0.5 style recalculations/s,
no idle paint-property animations. Hidden views have zero running animations. The existing
25 compositor animations remain; no particle count or decorative render loop was added.

The four baked terrain atlases total 288,718 bytes and load only when selected. Maximum individual
atlas: Forest, 177,712 bytes; Ocean is 23,448 bytes; Magic Fields is 23,610 bytes; Volcanic is 63,948 bytes.
One decoded 768px RGBA atlas is approximately 2.25MiB, not a measured GPU allocation. Planet
materials use no texture atlas or extra draw pass. The crossed-swords coordinates add 207,360
bytes to the existing 5,762-cell mesh; they use the existing buffer-disposal path.

Measured layout hotspots produced small fixes: skip the hidden legacy guide's entrance/layout
read; measure hand rectangles together; stop rereading viewport geometry during sky holds;
track mechanical counter animations and settle them when hidden. No motion token, game rule,
bot version, topology, turn timer, ownership or reward code changed.

## Scope boundaries

New worlds and their stored preference are `/test/` only. Other channels retain the default
appearance. Remote saved cosmetic ids are not transported yet: the renderer supports separate
player materials, but an unassigned opponent uses classic FUTASAKU. Campaign skin rotation,
account-level cosmetic sync and themed replay exports remain future work.

See [architecture and previews](V075-WORLDS.md) for the material seam and safe integration steps.
After the hold is lifted, recheck the latest release line, integrate the focused commits, rerun
the relevant gates, and publish to `/test/` through `futa0.5-online`. Never push to `main` or
force-push the release line. Do not promote these experiments automatically.
