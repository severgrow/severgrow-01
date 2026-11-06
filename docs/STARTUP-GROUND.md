# One coherent startup for live and test

The owner's reference is the working `/test/` launch: a black-to-menu fade lasting one second,
with the planet already behind the wordmark. Reuse that experience on the live root.

Baseline: published 0.82 app `ce74bd11` (startup code inherited from 0.81), report branch
`11248112`. The owner reproduced the flash after a fresh Add to Home Screen on an iPhone 15 Pro
with the latest iOS. This is not explained away as an old installation.

## Gaps reproduced

- The real readiness gate in the HTML ran only on `/test/`. Live used a separate cover which
  could begin fading after 1.2 seconds even without a planet frame.
- With no saved world, the menu did not mount its planet until the public map request succeeded.
- A service-worker navigation could wait indefinitely for a stalled radio. Even a successful
  response waited for its cache write before reaching the page.

New regressions failed against those original paths before implementation. The 0.81 product
also failed the browser test requiring a coherent root reveal with the public map request held.

## Focused changes

Live and test now use the same existing readiness gate and unchanged 1,000ms reveal. The app,
fonts and a real planet paint (or the existing graphics-unavailable fallback) must be ready;
no artificial minimum wait was added. The 3.5-second
failure fallback remains. A planet build hides the retired flat underlay from the first HTML
styles, including after that fallback. The explicit flat-map diagnostic retains its old renderer.

A fresh menu paints only unexplored terrain while ownership loads. It invents no players, claims,
known/growable land or authority. Real data updates the existing renderer when it arrives; actions
still depend on the existing authoritative world. Geometry, lighting and camera rules are unchanged.

Independent presentation chunks download together and mount in their original order. The two
menu-critical dynamic chunks are preloaded by their generated build paths on futa05 only.

Navigation still prefers a timely network page. With a cached shell, an 800ms network stall opens
that shell while the single fresh read completes in the background. Cache writes no longer block
HTML delivery. Browser navigation preload is reused where supported, without duplicate fetches.
No polling, forced reload, save deletion, cache-prefix change, API caching or database change.
The native launch images are unchanged, matching the owner's working `/test/` reference.

## Measurements and verification

Three alternating before/after samples after one excluded shader warm-up. Chromium 154, software
GPU, 393x852 at DPR 1, 2x CPU, 80ms latency, 2MiB/s, identical saved public map and no concurrent
work. The local fixture serves uncompressed assets. These are controlled browser comparisons,
not physical iPhone launch timings. Raw samples: `evidence/startup-ground.json`.

| Median, navigation start to | 0.81 | Follow-up |
| --- | ---: | ---: |
| App ready | 2,819ms | 2,449ms |
| First planet paint | 4,599ms | 3,808ms |
| Fully revealed coherent menu | 5,743ms | 4,871ms |

The coherent reveal improved by approximately 872ms (15%). The reveal animation remains one
second. Do not describe this as a one-second total cold network load on every device.

The browser regression verifies both actual route paths, with no saved world and the public API
held, then verifies a real service-worker-controlled reload while its fresh navigation is held.
Chromium requires an actual rendered planet; WebKit reports explicitly when its environment uses
the existing graphics-unavailable fallback, matching the established sphere suite's contract.
A storage sentinel survives. Another case holds the planet import past all reveal deadlines and
checks the actual flat renderer exists but is not painted. Resume/dark-snapshot/no-script tests
remain. `planet-matte` runs the new cases in Chromium; `sphere-test-ios` runs them in WebKit.
Navigation unit tests exercise the real worker source: stalled network, fresh response with a
blocked cache write, offline, no cached shell, navigation preload and authoritative API bypass.

Reviewed captures: `screens/startup-ground/root-fresh.png` and
`screens/startup-ground/late-planet-fallback.png`. The latter is deliberately a blocked-download
failure case, not the normal menu. Captures simulate viewport geometry; they are not device photos.

## Verification boundary

No physical iPhone is connected. The iOS system launch screen before HTML cannot be certified by
Chromium or desktop WebKit. The fresh-install white flash remains a device acceptance check after
publication; do not call it conclusively fixed from a DOM assertion. The implementation deliberately
reuses the working test route, rather than adding a second native splash system or extending fades.

Run full typechecks/unit tests, product builds/asset checks and the exact-source release browser
matrices before publication. Record the final published source and publisher separately; a moved
`live` branch is not deployment proof. Existing 0.8, 0.81 and 0.82 tags remain immutable.
