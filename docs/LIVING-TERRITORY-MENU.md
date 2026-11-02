# Living Territory menu

Feature branch: `feature/living-territory-menu`. Based on `futa0.5-online` at `a7d47e79`.
This feature is prepared for review; merging or deployment requires the owner's approval.

## One world, two presentations

The existing `WorldView` remains the only renderer. Its existing SVG and viewport stay in place
behind the main menu, then gain contrast and the shared `.996 → 1` material settle when Territory
opens. The camera's `viewBox` does not change on navigation. The reverse transition dims that same
map and brings the menu back. There is no screenshot stand-in, second canvas, camera copy or
end-of-animation swap.

In menu mode the Territory *screen* remains logically `hidden`, `inert` and `aria-hidden`. A narrowly
scoped CSS exception paints only its decorative map; controls remain invisible without changing the
viewport's layout. This preserves the lobby's existing logical visibility checks. Outside the menu
or Territory the map is hidden normally. One filtered observer handles menu-only doorways such as
PLAY; ordinary screen changes use one event wired after `hideLobbySurfaces()` in `main.ts`.

The existing screen-exit animation still owns the Territory → duel fade. The game itself never
receives a transition. Menu exit callbacks carry a generation guard; rapid navigation cannot hide a
newly returned menu. Focus moves to Back on entry and returns to Territory on exit. OS and in-game
reduced motion settle immediately. App/tab/BFCache return settles the current presentation.

## Real data, bounded work

`living-world-source.ts` shares one in-flight public read between the menu, profile and Territory.
It starts before identity or pending Seed settlement, so neither blocks the backdrop. Existing
validated `world-memory` storage supplies a provisional map immediately. The first server answer
replaces device memory even when its revision is lower; subsequent older revisions cannot rewind
fresh state. Same-revision colour/name/dispute updates remain valid.

There is no menu poll, Realtime subscription or animation loop. Menu shows and foreground returns
use the existing read path. Territory keeps its existing active refresh. Its poll stops in the menu,
and map CSS animations pause there. The same SVG root, gesture listeners and ResizeObserver survive
real data updates; only artwork changes. An empty map releases its detached surface/listeners and
can recover to one valid renderer later. Failure leaves a cached map available, or the normal
background if nothing is known. Loading/empty/error text reuses the existing notice lane and copy.

The entry is natively disabled only until its click handler is attached, not until network data
arrives. A real delayed-module browser regression covers the formerly lost early tap.

## Camera policy

A remembered/manual camera wins. Otherwise, the first menu view uses an actual owned tile near the
centre of the player's largest connected holding. This avoids centring the empty gap between
scattered claims. Ties resolve geographically, independently of server cell order. Without holdings,
the existing world framing is used. Existing fit/zoom/resize/clamp rules retain true hex geometry;
claiming a tile or returning to the menu does not refocus the player. Storage remembers presentation,
never ownership or spendable state.

## Composition and polish review

The brand, fonts, key hierarchy, grain and materials are unchanged. At normal heights the logo and
title/action stack share a three-rhythm gap instead of distributing an arbitrary empty band.
Short screens retain the existing compact layout and touch-target sizes.

The final review favoured a small number of practical improvements:

- Keep one physical surface and preserve a deliberate camera instead of adding a decorative zoom.
- Prefer a real tile in a stable holding over an attractive but empty midpoint.
- Guard early taps, interrupted exits and keyboard focus without adding captions or controls.
- Hide the backdrop behind unrelated destinations; keep the existing duel-exit choreography.
- Release empty-map observers/listeners and recover cleanly when real geography returns.

## Visual evidence

| View | Before | After |
| --- | --- | --- |
| Phone | [Original menu](screens/living-territory/before-phone.png) | [Living menu](screens/living-territory/menu-phone.png) · [Territory](screens/living-territory/territory-phone.png) |
| Desktop | [Original menu](screens/living-territory/before-desktop.png) | [Living menu](screens/living-territory/menu-desktop.png) · [Territory](screens/living-territory/territory-desktop.png) |

Additional inspected views: [Large Text](screens/living-territory/large-text.png),
[landscape](screens/living-territory/landscape.png), [PWA-mode emulation](screens/living-territory/pwa.png),
[scattered holdings](screens/living-territory/scattered-holdings.png).
These use real local HTTP economy state and the production renderer. They are test fixtures, not
screenshots of the production database. Physical iPhone hardware has not been tested here.

## Reproducing the checks

```sh
npm ci
npm run check
CHANNEL=futa04 npm run web:build
CHANNEL=futa04 node scripts/check-channel-assets.mjs
PW_CHROMIUM=/path/to/chromium npx tsx web/e2e/living-territory.ts
npx tsx web/e2e/living-territory-ios.ts
```

The new suite covers phone, short phone, Large Text, PWA-mode emulation, tall phone, tablet,
desktop and landscape; single/scattered/no holdings; cached/uncached failure; slow and unavailable
authentication; empty-map recovery; exact camera and SVG identity across every sampled transition
frame; rapid/interrupted navigation; manual zoom; a new authoritative claim; reduced motion; rotation;
keyboard focus; code-bootstrap delay; and absence of menu map polling. Each dev instance has an
isolated Vite cache so parallel local previews cannot trigger each other's dependency reloads.

CI runs it in Chromium and WebKit and retains screenshots. The existing Territory menu, challenge,
gesture and iOS gesture suites remain in the matrix. The challenge suite requires the futa05 build
with its documented closed-port placeholder API; it does not build itself.

No backend deployment, migration, authentication change or engine change is needed.

## Local interactive preview

```sh
npx tsx scripts/preview-living-territory.ts
```

Open `http://localhost:5187/` on the machine running it (or forward workspace port 5187).
`PREVIEW_PORT` selects another port. The preview uses the real in-memory HTTP Territory service with
local guest identities, holdings and Seeds. Its API is proxied through the same origin, so only one
port needs forwarding. It does not contact the live database. No preview code or fixture data is imported by the shipped app.

## Verification recorded in this worktree

- Full `npm run check`: **371 test files passed, 3,750 tests passed**, one expected failure,
  66 optional skips; TypeScript passed.
- Focused source/camera/menu/lobby-exit/import-cycle regressions: **35 tests passed**.
- Living Territory browser pass: **120 checks passed**, including the slow-controller and
  obsolete-coast regressions. No uncaught page exceptions.
- Existing Territory menu, challenges and gesture browser suites passed.
- Both futa04 and futa05 builds passed; the futa04 asset-isolation guard passed. The futa05
  guard must receive the same public `VITE_*` settings used for its build.
- Browser screenshots were inspected for phone, desktop, short landscape, Large Text and
  emulated standalone mode. [Recovered coast](screens/living-territory/recovered-coast.png)
  shows a stale remembered camera clamped after current geography replaced cached bounds.

The slow-import and obsolete-coast checks were observed failing before their respective fixes and
passing afterwards. The shared-map read test was deliberately updated for the shared promise;
its one-read/no-poll guarantee remains, with an additional real 12.5-second browser assertion.

The Territory → duel browser regression passed in both normal and reduced motion: only the game
remained visible, the map/sheet/keys were gone, and the defender's balance was unchanged.
Both channel asset guards passed (futa04: 100 files; futa05: 104 files).

The 4× CPU smoothness probe initially missed its pan budget (83ms p95). An unchanged-base comparison
passed (pan 17ms / pinch 33ms), and the controlled feature repeat passed (pan 33ms / pinch 17ms;
required ≤34ms). The repeat measured zero idle style recalculations/layouts, unchanged-refresh SVG
retention and a 25ms tap response. These are shared-workspace Chromium measurements, not a promise
about every physical phone; the initial miss is recorded rather than hidden or weakened.

A final first-entry profile found another avoidable cost: the menu had already read the wallet,
but opening Territory rebuilt tile artwork when that balance arrived again. The view now accepts
that same-player menu read while inert, and the known-identity entry performs one private metadata
refresh. A fresh server balance still replaces the prepared value. Wrong-player, active-screen and
non-menu writes are refused by focused tests. The browser suite checks tile-node retention,
one wallet read on entry and a genuinely changed server balance.

On the local preview's 4× CPU first-entry sample, this preparation reduced the observed longest frame
from about 246ms to about 70ms while retaining the exact camera and reaching full opacity. Removing
filters or moving the fade to an HTML wrapper did not improve the measured result, so those extra
material changes were not adopted. This is a measured software-browser improvement; physical-device
performance remains to be checked.

The interruption pass also holds a real Grow request until after Back and the menu's earlier read.
Once the server acknowledges it, the view queues a fresh pass through the existing menu reader,
so both the map and counters catch up. This is an acknowledgement-triggered refresh, not a poll;
Grow/Sell/colour/achievement completions can use the same path. A closing/game presentation does
not start a menu refresh, and inactive Grow does not leave a paused ripple behind. The regression
was observed timing out before this fix and passing afterwards.

Camera measurements use resolved layout dimensions from the map viewport. Decorative SVG scale
must not be fed back into logical camera bounds through transformed `getBoundingClientRect()`
measurements. A focused regression supplies rounded/scaled SVG bounds and verifies that the
logical aspect, pixel width and exact `viewBox` remain those of the layout viewport.
