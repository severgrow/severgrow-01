# iOS home-screen flash audit (0.83 polish pass)

Read-only audit of the standalone launch path as of **2026-11-07** on branch
`misc-polish-futa05`. Startup files (`web/index.html`, `web/src/player/boot-cover.ts`,
`web/src/player/startup.ts`) were mid-WIP when this was written; this note documents findings
only and does not change product code.

**Follow-up (same day):** H5 is addressed in `web/src/style.css` —
`html.space-first, html.space-first body { background: #0e0f10 }` (no `:where()`), pinned by
`web/tests/charcoal.test.ts`. Soil `--c-bg` remains for boards/panels.

Owner goal: charcoal `#0e0f10` immediately → one ~1 s fade into the fully composed menu. No
white/grey flash, no unfinished planet, no double fade. Same on **futasaku.com** and **/test/**.

## Launch timeline (what can flash, in order)

| Phase | Who paints | What current code intends |
| --- | --- | --- |
| 1. Native launch chrome | iOS | `apple-touch-startup-image` charcoal PNGs, or (if no exact size match) white / icon zoom |
| 2. Navigation handoff | Service worker + WebKit | Gap between splash dismiss and first HTML byte. A stalled network navigate paints **white** |
| 3. First HTML byte | Inline `#first-ground` | `html` / `body` `#0e0f10` + `color-scheme: dark` + `theme-color` |
| 4. Dark hold | `data-startup="waiting"` (futa05 / `v075` only) | Body `opacity:0; visibility:hidden` until fonts + planet paint, or **1.5 s** fail-open |
| 5. Reveal | `player/startup.ts` | One **1000 ms** body opacity fade. `#boot-cover` stays **hidden** while waiting so entrances do not stack |
| 6. After reveal | Main CSS | See residual risk: soil `#18191a` can return on `html` / `body` |

`/test/` staging is the same `CHANNEL=futa05` build as the live root (moved by
`scripts/compose-test-route.mjs`). It **does** register `futa04-sw.js` (the `IS_TEST` skip in
`main.ts` is the old `CHANNEL=test` / `futa-test` experiments, not the staging route). The worker
gives `/test/` its own cache prefix `futa05test-`.

## Root-cause hypotheses (with evidence)

### H1 — Page ground was soil grey before charcoal (strong for “grey”)

**Before this WIP (HEAD):** `#first-ground` set bare `html{background:#18191a}` and only
`html:where(.space-first)` / `html.space-first body` used `#0e0f10`. `theme-color` was `#18191a`.

**WIP now:** bare `html` / `body` / waiting styles / `theme-color` all `#0e0f10`. Unit pins in
`web/tests/boot-cover.test.ts` rewritten for that rule.

Soil `#18191a` is visibly greyer than charcoal. On a standalone open, that first HTML frame (and
Chrome/Safari chrome tinted by `theme-color`) reads as a **grey flash** even when nothing is
“white”. Matches owner reports on both live and `/test/` after a fresh Add to Home Screen.

### H2 — Native white when splash media does not match (strong for classic “white”, weak for 15 Pro)

`web/src/logic/splash.ts` lists 20 devices × portrait/landscape = **40** images.
`web/index.html` link set matches 40/40. Files under `web/public/splash/` exist; sampled PNGs are
solid `#0e0f10` (RGB 14,15,16), including iPhone 15 Pro `393×852@3` → `launch-1179x2556.png`.

If a **new** iPhone size is missing from `SPLASH_DEVICES`, iOS falls back to white or a zoom of the
home-screen icon. That is still the honest native failure mode for unlisted devices; it does not
explain a 15 Pro if these assets are what the installed app actually fetched.

### H3 — White gap while navigation waits on the network (strong historically; mitigated when cached)

`web/public/futa04-sw.js` (the worker futa05 registers) documents the owner rule: iOS shows a blank
**white** page between the launch image and first paint, so navigate answers a **cached**
`index.html` immediately and refreshes in the background. Cache writes use `waitUntil` and do not
block the response. Navigation preload is enabled on activate.

**Fresh Add to Home Screen / empty cache:** there is no shell yet → navigate still waits on the
network → white gap remains until dark HTML arrives. That is a native+SW limit, not fixed by the
fade.

Note: `docs/STARTUP-GROUND.md` still describes an **800 ms** network-stall path. The live worker
source and `web/tests/navigation-startup.test.ts` already pin **cache-at-once** (the 800 ms path
was retired). Treat STARTUP-GROUND’s navigation paragraph as stale relative to `futa04-sw.js`.

Legacy `web/public/sw.js` is network-first and is **not** what futa05 registers.

### H4 — Cached multitasking / home-screen snapshot (native, not fixable in JS)

iOS can briefly show a saved snapshot of an older bright menu on relaunch. Docs correctly say: do
not delete the app or saves to “fix” it; one background/foreground cycle may refresh the
snapshot. The old resume boot-cover curtain was **removed** (it re-darkened on every app switch);
that trade-off leaves snapshot chrome to the OS.

### H5 — After the gate lifts, main CSS can put soil back on `html` (remaining page-side gap)

`web/src/style.css`:

- `--c-bg: #18191a`
- `html { background: var(--c-bg); }` and `body { background: var(--c-bg); }`

While `data-startup="waiting"` is set, `html[data-startup="waiting"]` (attribute specificity) keeps
charcoal over that rule. When `startup.ts` **deletes** `data-startup` and starts the 1 s fade:

- the attribute shield is gone
- `#first-ground`’s `html:where(.space-first)` has **zero** specificity from `:where()`, so the
  later `html { background: var(--c-bg) }` wins
- `#texture` under `html.space-first:not(.space-lit)` is charcoal, but any uncovered strip
  (safe-area, status bar with `black-translucent`, letterboxing) can still flash **soil grey** at
  reveal time

WIP fixed the **first byte**; it has not yet pinned `style.css` / `--c-bg` for the space-first
shell to charcoal for the whole session. This is the clearest remaining code gap vs the owner goal
that is still under the page’s control.

### H6 — Double fade / unfinished planet (largely addressed in current WIP)

- Gate waits for fonts + `futasaku:planet-painted` (or 1.5 s fail-open).
- `liftBootCover` no-ops its entrance when `dataset.startup === 'waiting'` (`cover.hidden = true`).
- Fade constants aligned: `STARTUP_FADE_MS = 1000`, `BOOT_COVER_FADE_MS = 1000`,
  `BOOT_COVER_MAX_MS = 1500` (was 400 / 300 / 1200 at HEAD).

Comment drift only: `startup.ts` still says “then 400 ms” in a comment; `index.html` boot-cover
comment still says “max 1.2 s”. Harmless if constants stay correct.

## What the current WIP already changed

From `git diff` against HEAD (startup-related only):

1. `#first-ground` / waiting body / `theme-color`: `#18191a` → `#0e0f10`.
2. `STARTUP_FADE_MS` 400 → 1000; boot cover fade 300 → 1000; max 1200 → 1500.
3. `docs/IOS-LAUNCH-20261106.md` rewritten to the charcoal → one fade goal and native limits.
4. Brand preload swapped toward the paint wordmark (menu composition / logo swap — adjacent to
   “composed menu”, not the flash colour itself).
5. Tests (`boot-cover.test.ts`) already expect the new charcoal-first and 1 s fade rules.

Unchanged in this pass (and already on the good path): splash asset set, manifest
`background_color` / `theme_color` `#0e0f10`, `futa04-sw.js` cache-at-once navigate,
shared live+/test/ startup gate.

## Remaining native / product limits (honest)

- Native launch image and snapshots **precede** all page JS.
- Exact `device-width` / `device-height` / DPR / orientation match required for splash links.
- First install with **empty** SW cache can still show white until HTML arrives.
- Playwright / desktop WebKit **cannot** certify the OS launch screen.
- `apple-mobile-web-app-status-bar-style: black-translucent` draws page colour under the status
  bar; any soil/`--c-bg` regression shows there.
- Existing home-screen installs may keep an old snapshot or an old cached shell until the worker
  refreshes `index.html` in the background — one or two cold launches after publish.

## Suggested page-side follow-ups (for the primary agent — not done here)

Prefer these only after startup WIP settles (no mtime churn):

1. Keep charcoal after reveal: e.g. `html.space-first, html.space-first body { background: #0e0f10 }`
   in main CSS **without** `:where()`, or rebind `--c-bg` under `.space-first` to `#0e0f10` if soil
   is no longer wanted as the page ground (board soil tokens can stay separate).
2. Refresh stale comments (400 ms / 1.2 s) and align `docs/STARTUP-GROUND.md` navigate text with
   `futa04-sw.js` (cache-at-once, not 800 ms).
3. Do **not** reintroduce a resume curtain unless the owner asks; snapshot issues are OS-side.

## Verification checklist (physical iPhone — required)

Do this on a real device after the build is on the target host. Browser emulation is not enough.

### Shared setup

- [ ] Note iOS version and model (confirm splash media exists for that CSS size in `splash.ts`).
- [ ] Confirm deployed HTML has `#first-ground` / `theme-color` `#0e0f10` (View Source or
      downloaded `index.html`), not `#18191a`.
- [ ] Confirm `apple-touch-startup-image` links and `/splash/launch-*.png` return charcoal.
- [ ] Reduced-motion off for the “~1 s fade” check; repeat once with Reduce Motion on (instant).

### A. futasaku.com (live) — home screen

- [ ] **Fresh install:** remove the home-screen icon if present → Safari → Share → Add to Home
      Screen → open from the icon (cold). Expect: charcoal splash → dark hold → one ~1 s fade into
      composed menu. Note any white gap before dark HTML (empty cache).
- [ ] **Warm relaunch:** leave the app, reopen from the icon without killing. Expect no second full
      entrance; no re-darkening curtain.
- [ ] **Cold kill:** swipe away from app switcher → reopen. Expect charcoal → one fade; no white;
      no soil-grey step when the menu appears.
- [ ] **Background snapshot:** home, then reopen: brief OS snapshot is OK; must not stick on a
      bright unfinished menu.

### B. futasaku.com/test/ — home screen (separate icon)

- [ ] Add **test** as its own home-screen bookmark (scope `/test/`).
- [ ] Repeat fresh / warm / cold-kill checks from A.
- [ ] Confirm TEST badge only; same charcoal → ~1 s fade behaviour as live once this SHA is what
      `/test/` serves.
- [ ] Confirm `/test/` worker cache (`futa05test-`) does not break live, and vice versa.

### C. Safari tab (control)

- [ ] Cold load in Safari (not standalone): dark first paint, no white blink; fade rules may differ
      slightly from installed-app chrome but must not flash white/grey.

### D. Automated (already in repo — run when green, do not claim without running)

- [ ] Unit: `boot-cover`, `splash`, `charcoal`, `startup-gate`, `navigation-startup`.
- [ ] Browser: `planet-matte` / startup-ground cases; WebKit `sphere-test-ios` where applicable.
- [ ] Record: physical pass/fail per host (live vs `/test/`), model, iOS build, and SHA from
      `/test/release.json` or live `release.json`.

## Audit boundary

- No promote, no version bump, no CI / planet / brand asset edits in this helper pass.
- No startup code edits: primary agent still owns those files.
- Physical iPhone was **not** available to this audit; white/grey on device remains an acceptance
  check after publish.
