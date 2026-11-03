# Sphere Test — /test/ only

`FEATURES.sphereTest` requires `futa05` AND the first `/test/` route segment. The separate
**SPHERE TEST** menu key opens deterministic mock data. It does not replace real Territory, change
its approved 15% projection, or use real ownership, Seeds, challenges or progression. Production
remains pinned to `06a4ed56`. Do not promote this experiment.

## Architecture

`web/src/sphere/geometry.ts` constructs a frequency-10 icosahedral dual: **1,002 cells, 990 hexagons,
12 pentagons**, 2,000 shared corners and 3,000 shared edges. Integer barycentric identities provide
stable IDs without floating-point coordinate deduplication. Spherical triangle circumcentres form
the corners, sorted in each cell's tangent plane with outward winding.

Native WebGL 1 draws one indexed cell mesh, shared edges and a small selected outline. No library,
texture atlas or postprocess. The final lazy view chunk is 19.56kB (8.24kB gzip); its menu entry is
1.13kB (0.64kB gzip). GL buffers occupy **400,392 bytes**. Shared coordinates prevent cracks;
depth testing, face culling and a front-horizon test hide back borders. Directional matte light,
restrained edges and existing palette colours sit below the game's unchanged global grain.
Five coherent mock countries, separate outposts and unknown regions are deterministic and local.

Picking finds the nearest actual rendered fan triangle, using the framebuffer's actual aspect and
rotation. It does not choose a nearest cell centre. Geometry is independent of UI and backend.

## Interaction and cost

Quaternion trackball rotation has no pole singularity. Deliberate flicks get short decaying inertia;
slow drags stop precisely and a new touch interrupts. Pinch/wheel zoom keep the planet centred,
including a full-globe minimum. Resize rebases active input without resetting orientation.
Dragging/cancellation never selects. The colour-hex key focuses the largest mock holding by the
shortest rotation, preserving zoom. Keyboard: arrows rotate, plus/minus zoom, Enter selects,
Home focuses land, Escape returns. Focus returns to the menu key; the view contains its tab order.

Geometry/renderer load only after a tap. Frames run only for input, finite motion/pulse or resize.
No idle loop. Raster density is capped; measured slow frames may temporarily lower it, then restore
full detail at rest. Geometry, picking, controls and grain never change. Reduced motion stays still.
The menu becomes inert without resizing its real map/camera. The existing challenge centre uses
its own stop/start lifecycle to pause presence/inbox activity while the mock view is open.

Exit aborts listeners, disconnects the observer, cancels frames and frees GL buffers/program/context.
Context restoration preserves orientation, zoom and selection. Unavailable WebGL has a quiet message
and a functioning back key. No new poller, subscription, dependency or account system.

## Verification

Tests prove counts, IDs, symmetric side adjacency, connectivity, winding, two faces per edge,
Euler characteristic 2, area 4π, every pentagon's picking, tilted/empty/hidden picks, stable antipodal
quaternions, shortest returns and deterministic clusters/outposts.
Browser checks cover 320×568, 390×844, 844×390, 768×1024 and 1440×1000: mouse/touch, pinch/wheel limits,
precise pentagons, camera-still selection, empty taps, full rotation, interrupted inertia, slow
release, resizing, context loss/restore, reduced motion, fallback, idle and repeated cleanup.
They compare the real menu map camera before/after and check that `/`, `/2/`, `/3/` have no entry.
Chromium uses native CDP two-finger input. Mobile WebKit reuses the existing Territory suite's
trusted multi-touch transport through `helpers/webkit-touch.ts`; it fails explicitly if the pinned
Playwright adapter stops being available. Desktop WebKit retains native wheel checks. A portable
controlled-pointer variant is additionally exercised in local Chromium. None of these are a
physical iOS-device check.
Network assertions use a pre-existing guest fixture and prohibit writes during the mock interval;
ordinary app bootstrap/return presence is outside it. No test touches Supabase.

Local Chromium uses software graphics. This is not physical iPhone or hardware-GPU verification.
The hosted WebKit suite explicitly reports fallback-only verification if its runner lacks WebGL;
such a result must not be called interactive Safari verification. Device evaluation belongs on
`/test/`, before any decision to integrate the prototype into real Territory.

```sh
node --import tsx web/e2e/sphere-test.ts
SPHERE_PERF=1 SPHERE_CPU=4 node --import tsx web/e2e/sphere-test.ts
node --import tsx web/e2e/sphere-test-ios.ts
```

## Measured local result and visual evidence

The final adaptive renderer passed the Chromium interaction suite at all five sizes. A separate
390×844 run with **4× CPU throttling and software WebGL** measured **50ms median / 66.7ms p95**
(maximum 166.6ms) during motion. One adaptive resolution reduction occurred; full detail returned
at rest. This software-GPU result is a limitation, not a claim of 60fps on phones. Native iOS/GPU
performance still needs device evaluation. Idle frame count did not grow.

After five entry/exit cycles and garbage collection, DOM nodes were 3,093 → 3,076 and listeners
636 → 623, with two documents unchanged. JS heap was about 6MB; GL buffers 400,392 bytes.
These are Chromium instrumentation results, not a direct GPU-memory profiler reading.

Reviewed captures: [menu](screens/sphere-test/menu-test-390.png),
[phone front](screens/sphere-test/sphere-front-390.png),
[desktop](screens/sphere-test/sphere-front-1440.png),
[back/horizon](screens/sphere-test/sphere-back-390.png),
[pentagon selection](screens/sphere-test/sphere-pentagon-390.png),
[close view](screens/sphere-test/sphere-close-390.png),
[landscape](screens/sphere-test/sphere-rotated-landscape.png).
The global grain remains above the globe and controls. No cracks or rear borders were visible
in the reviewed poses. This does not replace interactive real-device review.

The first hosted run exposed an unsupported mobile-WebKit wheel call in the test driver. The
corrected driver retains all zoom-limit assertions using the engine-appropriate inputs above.
Its separate existing Living Territory WebKit check reported a 1,073ms scheduling delay on the
unchanged 300ms return track. No transition code, timing token or assertion was relaxed. The same
current-source Chromium regression passed all 231 checks locally; hosted checks must pass again
before publication.
