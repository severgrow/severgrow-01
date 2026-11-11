# Installed-app launch (updated 2026-11-07)

## Goal

Standalone home-screen launches on both **futasaku.com** and **/test/**: charcoal `#0e0f10`
immediately → one subtle ~1 s fade into the fully composed menu. No white/grey flash, no old logo,
no unfinished planet, no double fade.

## What the page controls

1. **First byte** (`index.html` `#first-ground`): `html` / `body` background `#0e0f10` (was the
   greyer soil `#18191a`, which read as a grey flash before `space-first` CSS arrived).
2. **`theme-color`**: `#0e0f10` (matches the manifest).
3. **`apple-touch-startup-image`**: plain charcoal PNGs for every listed iPhone/iPad size
   (`web/src/logic/splash.ts`, `web/public/splash/`). Verified solid `#0e0f10`.
4. **Startup gate** (`player/startup.ts`): body stays hidden until fonts + planet paint (or the
   1.5 s fail-open), then **one** 1000 ms fade. Boot cover is hidden whenever
   `data-startup="waiting"` so the two entrances never stack.
5. **Manifest** `background_color` / `theme_color`: `#0e0f10`.

## Native iOS limits (honest)

Native launch chrome **precedes** page JavaScript:

- If a device’s exact `apple-touch-startup-image` media query is missing, iOS may show a white
  default or a zoom from the home-screen icon snapshot.
- Cached **snapshots** from earlier opens can briefly show an old bright menu until the next
  background/foreground cycle refreshes them. Do not delete app or save data to “fix” that.
- Browser / Playwright emulation is **not** a physical home-screen launch. Physical iPhone
  verification remains required after this pass.

## Verification

Unit: `boot-cover`, `splash`, `charcoal`, `startup-gate`. Browser: installed-app / PWA viewport
suites where present. Physical iPhone: add to Home Screen on both live and `/test/`, cold-kill,
relaunch, confirm charcoal → ~1 s fade, no white/grey.
