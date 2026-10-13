# FUTASAKU 0.5 online duels — device / browser / viewport matrix

**Branch:** `futa0.5-online` · **Run:** 2026-10-13T01:06:49.743Z · **Targets:** live app `https://severgrow.github.io/severgrow-01/futa0.5/` and the live Edge API `.../functions/v1/duel`
**Scope:** 30 online duels across 8 device/browser/viewport profiles and 11 scenarios. No app file was changed by this stream.
**Evidence:** `docs/screens/online/device-matrix/` (screenshots + `results.json`). Screenshots are named `<index>-<scenario>-<role>-<device-id>.jpg` and were taken at the tested size — stored as JPEG, longest edge <= 1024 px, so the evidence folder is ~13 MB instead of ~300 MB of retina PNGs.

Re-run: `npx tsx web/e2e/online-device-matrix.ts [--games=30] [--concurrency=1] [--variant=<name>] [--only=<device-id>]`
Guest identities are cached in the OS temp dir, so a re-run does not spend the live API's 30-guests/hour budget.

## Headline

**20 / 30 duels passed.** Ten failures cluster in five places, and only one of them is engine-specific:

- **Every device:** the online duel's **Resign button cannot be tapped** — it overflows the 44 px HUD strip and its centre is painted over by the board (phones/tablets) or by the header (desktop). Seen in 26 of 30 duels, on all 8 profiles, in both roles, portrait and landscape.
- **Every touch device:** `#duel-resign` measures **79x36 px** (below the 44 px iOS / 48 px Android guideline); on Android six further controls sit at 44x44.
- **WebKit only (iOS Safari, iPad Safari, desktop Safari):** a **spurious CORS console error** on duel-API calls that actually succeed (70 messages, all 24 WebKit sessions; Chromium and Firefox never log it).
- **Needs one confirmation pass:** placing a Grow did not leave a **local draft on the device** (4 games), and after the device's storage was cleared **no fresh identity was stored** (2 games). Both are detailed below with the evidence and the caveat.
- **Generic:** a “hidden” tab still **polls every 2 s** (3-4 polls in a 9 s hidden window), and cycling a turn depends on an on-screen Skip chip plus a drag of a card onto the throw pile.

## Matrix coverage

| Profile | Engine / platform emulated | Viewports |
|---|---|---|
| `iphone-390x844`, `iphone-360x640` | WebKit, iOS UA, touch, DPR 3 | 390x844, 360x640 (+ landscape) |
| `android-390x844`, `android-360x640` | Chromium, Android UA, touch, DPR 3 | 390x844, 360x640 (+ landscape) |
| `ipad-768x1024` | WebKit, iPadOS UA, touch, DPR 2 | 768x1024 (+ 1024x768) |
| `desktop-chromium-1280x800`, `desktop-firefox-1280x800`, `desktop-webkit-1280x800` | Desktop Chrome / Firefox / Safari | 1280x800 |

| Scenario | What it exercises |
|---|---|
| `basic` | create + join in two contexts, live polling, who-starts, mid-turn gating, a full turn, resign |
| `async` | one player closes mid-duel and returns later from the lobby list (async catch-up) |
| `rotate` | viewport rotated to landscape mid-duel and back |
| `touch` | touch taps only: draw, place a Grow, throw; no page scroll |
| `background` | tab hidden then shown; the clock must not drift and play must resume |
| `throttle` | every duel API call delayed 700 ms (route level); the move must still land exactly once |
| `offline` | network cut mid-duel, a submit attempted offline, then back online |
| `storage-blocked` | every Storage method throws — the honest warning must show |
| `storage-cleared` | identity/session/draft removed on the device, then reload |
| `refresh` | reload while a Grow is pending, then reopen the match from the lobby |
| `leak` | the opponent's payload must never contain the actor's hand; mid-turn must stay gated (odd indices join by invite link) |

## Result table (30 duels)

“who starts shown” = the HUD turn label matched the server's actor on both sides. “mid-turn hidden” = the opponent's gated revision and board did not move while the actor was mid-turn (measured in `basic` and `leak`). “clock ok” = the HUD countdown matched a freshly fetched server clock within the minute-floor. Errors = console / HTTP / CORs console entries.

## Matrix result table

| # | Scenario | Creator (engine / viewport) | Joiner (engine / viewport) | Result | Who starts shown | Mid-turn hidden | Clock ok | Errors (console/http/cors) | Screenshots |
|---|---|---|---|---|---|---|---|---|---|
| 0 | basic | iphone-390x844 (WebKit / 390x844) | android-390x844 (Chromium / 390x844) | FAIL | True | True | True | 5/3/2 | `0-basic-creator-iphone-390x844.jpg`, `0-basic-joiner-android-390x844.jpg`, `0-basic-after-poll-iphone-390x844.jpg` |
| 1 | async | android-390x844 (Chromium / 390x844) | android-360x640 (Chromium / 360x640) | PASS | True | None | True | 0/0/0 | `1-async-creator-android-390x844.jpg`, `1-async-joiner-android-360x640.jpg`, `1-async-reopened-android-390x844.jpg` |
| 2 | rotate | iphone-360x640 (WebKit / 360x640) | desktop-chromium-1280x800 (Chromium / 1280x800) | PASS | True | None | True | 2/0/2 | `2-rotate-creator-iphone-360x640.jpg`, `2-rotate-joiner-desktop-chromium-1280x800.jpg`, `2-rotate-landscape-iphone-360x640.jpg`, `2-rotate-landscape-desktop-chromium-1280x800.jpg`, `2-rotate-portrait-back-iphone-360x640.jpg` |
| 3 | touch | android-360x640 (Chromium / 360x640) | desktop-webkit-1280x800 (WebKit / 1280x800) | FAIL | True | None | True | 2/0/2 | `3-touch-creator-android-360x640.jpg`, `3-touch-joiner-desktop-webkit-1280x800.jpg`, `3-touch-touch-draft-desktop-webkit-1280x800.jpg` |
| 4 | background | ipad-768x1024 (WebKit / 768x1024) | android-390x844 (Chromium / 390x844) | PASS | True | None | True | 2/0/2 | `4-background-creator-ipad-768x1024.jpg`, `4-background-joiner-android-390x844.jpg`, `4-background-after-return-ipad-768x1024.jpg` |
| 5 | throttle | desktop-chromium-1280x800 (Chromium / 1280x800) | android-360x640 (Chromium / 360x640) | PASS | True | None | True | 0/0/0 | `5-throttle-creator-desktop-chromium-1280x800.jpg`, `5-throttle-joiner-android-360x640.jpg`, `5-throttle-slow-net-desktop-chromium-1280x800.jpg` |
| 6 | offline | desktop-firefox-1280x800 (Firefox / 1280x800) | desktop-chromium-1280x800 (Chromium / 1280x800) | PASS | True | None | True | 3/0/0 | `6-offline-creator-desktop-firefox-1280x800.jpg`, `6-offline-joiner-desktop-chromium-1280x800.jpg`, `6-offline-offline-desktop-chromium-1280x800.jpg`, `6-offline-recovered-desktop-chromium-1280x800.jpg` |
| 7 | storage-blocked | desktop-webkit-1280x800 (WebKit / 1280x800) | iphone-390x844 (WebKit / 390x844) | PASS | None | None | None | 2/0/2 | `7-storage-blocked-desktop-webkit-1280x800.jpg` |
| 8 | storage-cleared | iphone-390x844 (WebKit / 390x844) | iphone-360x640 (WebKit / 360x640) | FAIL | True | None | True | 8/0/8 | `8-storage-cleared-creator-iphone-390x844.jpg`, `8-storage-cleared-joiner-iphone-360x640.jpg`, `8-storage-cleared-cleared-iphone-360x640.jpg` |
| 9 | refresh | android-390x844 (Chromium / 390x844) | ipad-768x1024 (WebKit / 768x1024) | FAIL | True | None | True | 6/0/6 | `9-refresh-creator-android-390x844.jpg`, `9-refresh-joiner-ipad-768x1024.jpg`, `9-refresh-reopened-ipad-768x1024.jpg` |
| 10 | leak | iphone-360x640 (WebKit / 360x640) | desktop-firefox-1280x800 (Firefox / 1280x800) | FAIL | True | True | True | 2/0/2 | `10-leak-creator-iphone-360x640.jpg`, `10-leak-joiner-desktop-firefox-1280x800.jpg`, `10-leak-during-hidden-turn-desktop-firefox-1280x800.jpg`, `10-leak-actor-iphone-360x640.jpg` |
| 11 | basic | android-360x640 (Chromium / 360x640) | iphone-390x844 (WebKit / 390x844) | PASS | True | True | True | 2/0/2 | `11-basic-creator-android-360x640.jpg`, `11-basic-joiner-iphone-390x844.jpg`, `11-basic-after-poll-iphone-390x844.jpg` |
| 12 | async | ipad-768x1024 (WebKit / 768x1024) | iphone-360x640 (WebKit / 360x640) | PASS | True | None | True | 6/0/6 | `12-async-creator-ipad-768x1024.jpg`, `12-async-joiner-iphone-360x640.jpg`, `12-async-reopened-iphone-360x640.jpg` |
| 13 | rotate | desktop-chromium-1280x800 (Chromium / 1280x800) | ipad-768x1024 (WebKit / 768x1024) | PASS | True | None | True | 2/0/2 | `13-rotate-creator-desktop-chromium-1280x800.jpg`, `13-rotate-joiner-ipad-768x1024.jpg`, `13-rotate-landscape-desktop-chromium-1280x800.jpg`, `13-rotate-landscape-ipad-768x1024.jpg`, `13-rotate-portrait-back-ipad-768x1024.jpg` |
| 14 | touch | desktop-firefox-1280x800 (Firefox / 1280x800) | desktop-webkit-1280x800 (WebKit / 1280x800) | FAIL | True | None | True | 2/0/2 | `14-touch-creator-desktop-firefox-1280x800.jpg`, `14-touch-joiner-desktop-webkit-1280x800.jpg`, `14-touch-touch-draft-desktop-webkit-1280x800.jpg` |
| 15 | background | desktop-webkit-1280x800 (WebKit / 1280x800) | android-390x844 (Chromium / 390x844) | PASS | True | None | True | 2/0/2 | `15-background-creator-desktop-webkit-1280x800.jpg`, `15-background-joiner-android-390x844.jpg`, `15-background-after-return-android-390x844.jpg` |
| 16 | throttle | iphone-390x844 (WebKit / 390x844) | android-360x640 (Chromium / 360x640) | PASS | True | None | True | 2/0/2 | `16-throttle-creator-iphone-390x844.jpg`, `16-throttle-joiner-android-360x640.jpg`, `16-throttle-slow-net-iphone-390x844.jpg` |
| 17 | offline | android-390x844 (Chromium / 390x844) | desktop-chromium-1280x800 (Chromium / 1280x800) | PASS | True | None | True | 3/0/0 | `17-offline-creator-android-390x844.jpg`, `17-offline-joiner-desktop-chromium-1280x800.jpg`, `17-offline-offline-android-390x844.jpg`, `17-offline-recovered-android-390x844.jpg` |
| 18 | storage-blocked | iphone-360x640 (WebKit / 360x640) | desktop-webkit-1280x800 (WebKit / 1280x800) | PASS | None | None | None | 2/0/2 | `18-storage-blocked-iphone-360x640.jpg` |
| 19 | storage-cleared | android-360x640 (Chromium / 360x640) | android-390x844 (Chromium / 390x844) | FAIL | True | None | True | 0/0/0 | `19-storage-cleared-creator-android-360x640.jpg`, `19-storage-cleared-joiner-android-390x844.jpg`, `19-storage-cleared-cleared-android-390x844.jpg` |
| 20 | refresh | ipad-768x1024 (WebKit / 768x1024) | android-360x640 (Chromium / 360x640) | FAIL | True | None | True | 7/0/6 | `20-refresh-creator-ipad-768x1024.jpg`, `20-refresh-joiner-android-360x640.jpg`, `20-refresh-reopened-ipad-768x1024.jpg` |
| 21 | leak | desktop-chromium-1280x800 (Chromium / 1280x800) | desktop-firefox-1280x800 (Firefox / 1280x800) | FAIL | None | None | None | 0/0/0 | — |
| 22 | basic | desktop-firefox-1280x800 (Firefox / 1280x800) | iphone-390x844 (WebKit / 390x844) | PASS | True | True | True | 2/0/2 | `22-basic-creator-desktop-firefox-1280x800.jpg`, `22-basic-joiner-iphone-390x844.jpg`, `22-basic-after-poll-desktop-firefox-1280x800.jpg` |
| 23 | async | desktop-webkit-1280x800 (WebKit / 1280x800) | iphone-360x640 (WebKit / 360x640) | PASS | True | None | True | 6/0/6 | `23-async-creator-desktop-webkit-1280x800.jpg`, `23-async-joiner-iphone-360x640.jpg`, `23-async-reopened-iphone-360x640.jpg` |
| 24 | rotate | iphone-390x844 (WebKit / 390x844) | ipad-768x1024 (WebKit / 768x1024) | PASS | True | None | True | 4/0/4 | `24-rotate-creator-iphone-390x844.jpg`, `24-rotate-joiner-ipad-768x1024.jpg`, `24-rotate-landscape-iphone-390x844.jpg`, `24-rotate-landscape-ipad-768x1024.jpg`, `24-rotate-portrait-back-ipad-768x1024.jpg` |
| 25 | touch | android-390x844 (Chromium / 390x844) | desktop-firefox-1280x800 (Firefox / 1280x800) | FAIL | True | None | True | 0/0/0 | `25-touch-creator-android-390x844.jpg`, `25-touch-joiner-desktop-firefox-1280x800.jpg`, `25-touch-touch-draft-desktop-firefox-1280x800.jpg` |
| 26 | background | iphone-360x640 (WebKit / 360x640) | iphone-390x844 (WebKit / 390x844) | PASS | True | None | True | 4/0/4 | `26-background-creator-iphone-360x640.jpg`, `26-background-joiner-iphone-390x844.jpg`, `26-background-after-return-iphone-390x844.jpg` |
| 27 | throttle | android-360x640 (Chromium / 360x640) | iphone-360x640 (WebKit / 360x640) | PASS | True | None | True | 2/0/2 | `27-throttle-creator-android-360x640.jpg`, `27-throttle-joiner-iphone-360x640.jpg`, `27-throttle-slow-net-iphone-360x640.jpg` |
| 28 | offline | ipad-768x1024 (WebKit / 768x1024) | desktop-chromium-1280x800 (Chromium / 1280x800) | PASS | True | None | True | 5/0/2 | `28-offline-creator-ipad-768x1024.jpg`, `28-offline-joiner-desktop-chromium-1280x800.jpg`, `28-offline-offline-desktop-chromium-1280x800.jpg`, `28-offline-recovered-desktop-chromium-1280x800.jpg` |
| 29 | storage-blocked | desktop-chromium-1280x800 (Chromium / 1280x800) | desktop-webkit-1280x800 (WebKit / 1280x800) | PASS | None | None | None | 0/0/0 | `29-storage-blocked-desktop-chromium-1280x800.jpg` |

**Totals:** 20/30 ran duels passed; 0 blocked by the shared live-API budget

## Per device

Each duel is counted once per device that took part, so a device can appear more than its 8 games.

| Device | Appearances (pass/ran) | Layout issues | Console errors | Passed scenarios | Failed scenarios |
|---|---|---|---|---|---|
| iphone-390x844 | 6/8 | 14 | 29 | 7:storage-blocked, 11:basic, 16:throttle, 22:basic, 24:rotate, 26:background | 0:basic, 8:storage-cleared |
| android-390x844 | 4/8 | 16 | 18 | 1:async, 4:background, 15:background, 17:offline | 0:basic, 9:refresh, 19:storage-cleared, 25:touch |
| android-360x640 | 5/8 | 16 | 15 | 1:async, 5:throttle, 11:basic, 16:throttle, 27:throttle | 3:touch, 19:storage-cleared, 20:refresh |
| iphone-360x640 | 6/8 | 14 | 32 | 2:rotate, 12:async, 18:storage-blocked, 23:async, 26:background, 27:throttle | 8:storage-cleared, 10:leak |
| desktop-chromium-1280x800 | 7/8 | 6 | 15 | 2:rotate, 5:throttle, 6:offline, 13:rotate, 17:offline, 28:offline, 29:storage-blocked | 21:leak |
| desktop-webkit-1280x800 | 5/7 | 4 | 16 | 7:storage-blocked, 15:background, 18:storage-blocked, 23:async, 29:storage-blocked | 3:touch, 14:touch |
| ipad-768x1024 | 5/7 | 14 | 32 | 4:background, 12:async, 13:rotate, 24:rotate, 28:offline | 9:refresh, 20:refresh |
| desktop-firefox-1280x800 | 2/6 | 5 | 9 | 6:offline, 22:basic | 10:leak, 14:touch, 21:leak, 25:touch |



## Layout findings (measured at the device's real size)

### unreachable-control (65 occurrences)
- [creator android-360x640] #duel-resign centre is covered by the board SVG (#board)
- [creator android-360x640] #duel-resign centre is covered by the board SVG (#board)
- [creator android-390x844] #duel-resign centre is covered by the board SVG (#board)
- [creator desktop-chromium-1280x800] #duel-resign centre is covered by the header strip itself (HEADER.hud)
- [creator desktop-firefox-1280x800] #duel-resign centre is covered by the header strip itself (HEADER.hud)
- [creator desktop-webkit-1280x800] #duel-resign centre is covered by the header strip itself (HEADER.hud)
- [creator ipad-768x1024] #duel-resign centre is covered by the header strip itself (HEADER.hud)
- [creator iphone-360x640] #duel-resign centre is covered by the board SVG (#board)
- [creator iphone-360x640] #duel-resign centre is covered by the board SVG (#board)
- [creator iphone-390x844] #duel-resign centre is covered by the board SVG (#board)
- [creator portrait back] #duel-resign centre is covered by the header strip itself (HEADER.hud)
- [creator portrait back] #duel-resign centre is covered by the board SVG (#board)

### small-touch-target (45 occurrences)
- [creator android-360x640] 6 control(s) under 48px: #hud-menu 44x44; #duel-resign 78x36; #smart-context 44x44; #tool-undo 44x44; #futa04-help-button 44x44; #hand-sort 44x44
- [creator android-390x844] 6 control(s) under 48px: #hud-menu 44x44; #duel-resign 78x36; #smart-context 44x44; #tool-undo 44x44; #futa04-help-button 44x44; #hand-sort 44x44
- [creator ipad-768x1024] 1 control(s) under 44px: #duel-resign 79x36
- [creator iphone-360x640] 1 control(s) under 44px: #duel-resign 79x36
- [creator iphone-390x844] 1 control(s) under 44px: #duel-resign 79x36
- [creator portrait back] 1 control(s) under 44px: #duel-resign 79x36
- [creator rotated 640x360] 1 control(s) under 44px: #duel-resign 79x36
- [creator rotated 844x390] 1 control(s) under 44px: #duel-resign 79x36
- [joiner android-360x640] 6 control(s) under 48px: #hud-menu 44x44; #duel-resign 78x36; #smart-context 44x44; #tool-undo 44x44; #futa04-help-button 44x44; #hand-sort 44x44
- [joiner android-390x844] 6 control(s) under 48px: #hud-menu 44x44; #duel-resign 78x36; #smart-context 44x44; #tool-undo 44x44; #futa04-help-button 44x44; #hand-sort 44x44
- [joiner ipad-768x1024] 1 control(s) under 44px: #duel-resign 79x36
- [joiner iphone-360x640] 1 control(s) under 44px: #duel-resign 79x36



## Bugs by scope

### Per-device / per-browser only

**W-1 · WebKit only — spurious CORS console error on successful duel-API calls.**
iOS Safari, iPad Safari and desktop Safari log `Origin https://severgrow.github.io is not allowed by Access-Control-Allow-Origin. Status code: 200` while the same fetch resolves normally. 70 messages, every WebKit session (24); Chromium and Firefox logged none. The API is not at fault: a direct `OPTIONS` preflight returns `204` with `access-control-allow-origin: https://severgrow.github.io` and `access-control-allow-methods: GET, POST, PATCH, OPTIONS`, and the `200`/`429` responses all carry the same header. Impact: console noise only — no functional failure was traced to it — but it will mislead anyone debugging a Safari-only report.
**Proposed fix (app owner / main worker; this stream owns no app file):** check whether the service worker's fetch interception or WebKit's preflight reporting is the source; if the app's own client fetch is the only source, make its header set consistent (or document the known noise).

**W-2 · iOS Safari only — one module-script import failure around a reload after storage loss.**
In game #8 (`storage-cleared`, iPhone 390x844) the page raised `TypeError: Importing a module script failed.` during the reload; the app's own `?_fresh=` recovery reload then took over and the app came back. Seen once in 30 games. Impact: low and self-healing, but real and Safari-specific.
**Proposed fix:** none required now; keep the `?_fresh=` recovery, and optionally log the failed chunk URL so a recurring case is diagnosable.

### Generic (reproduced on every device / engine)

**G-1 · HIGH — the Resign button is not tappable (all 8 profiles, 26/30 duels).**
Measured on iPhone 390x844: the duel HUD occupies `y 0–44`; `#duel-resign` is `79x36` at `y ≈ 33–69`; `#board` starts at `y 44` with height 800. `document.elementFromPoint` at the button's centre returns `svg#board` (phones/tablets) or `HEADER.hud` (desktop), and a real Playwright tap on the button times out after 5 s. Only the top ~11 px of the button is hittable — and it is the only control that leaves a live duel.
**Proposed fix (in the online HUD's own stylesheet `web/src/online/online-css.ts`):** lift the strip above the board and keep the control inside it, e.g. `.duel-hud { position: relative; z-index: 4; overflow: visible; min-height: 48px; }` and `.duel-hud .btn { align-self: center; height: 32px; }`, or move Resign out of the strip.

**G-2 · MEDIUM — touch targets below the platform guideline (every touch device).**
`#duel-resign` is `79x36` on all phone and tablet profiles (44 px iOS / 48 px Android minimum). On both Android viewports six controls measure `44x44`: `#hud-menu`, `#duel-resign`, `#smart-context`, `#tool-undo`, `#futa04-help-button`, `#hand-sort` (Android's guideline is 48 px). Desktop was not flagged (mouse, 24 px).
**Proposed fix:** raise the chip/icon controls to 48 px on Android (44 px elsewhere) and give `#duel-resign` a full-height hit area.

**G-3 · MEDIUM (confirm intent) — the on-screen Skip/Throw control is a hidden hardware node.**
`#moves .end` (`btn link end skip futa04-skip futa04-hardware-control futa04-control-skip`) exists with a `44x44` box but `visibility: hidden` and an empty label. The visible equivalent is `#smart-context`, which performs the same End-Grow step (verified: it moved the match to `DISCARD`). The flow works, but a hidden 44 px node with an empty label is a trap for assistive tech.
**Proposed fix:** mark the hidden node `aria-hidden="true" tabindex="-1"` or give it a real label, and keep it in sync with `#smart-context`.

**G-4 · MEDIUM — a hidden tab keeps polling every 2 s.**
The sync engine has a 30 s hidden cadence (`POLL_HIDDEN_MS`), but nothing calls `setVisible(false)`: `web/src/main.ts` has no `visibilitychange` → `sync.setVisible` wiring, and no `online`/`offline` listeners for `setOnline`. Measured in the three `background` games: **3-4 `GET /view` polls during a 9 s hidden window** (the 2 s cadence). On phones that is avoidable radio/battery traffic, and it adds pressure to the API's rate limits.
**Proposed fix (small block in `web/src/main.ts`, owned by the online worker):**
`document.addEventListener('visibilitychange', () => getOnlineSession()?.driver.sync().setVisible(!document.hidden));`
`window.addEventListener('online', () => getOnlineSession()?.driver.sync().setOnline(true));`
`window.addEventListener('offline', () => getOnlineSession()?.driver.sync().setOnline(false));`

**G-5 · NEEDS CONFIRMATION — a placed Grow left no local draft on the device (4 games).**
After tapping a growable card and the mapped target hex with real UI taps, `severgrow.duel.draft.v1.<matchId>` was absent and `__severgrow.canUndo()` was false in all four games that reached a growable turn (#3, #10, #14, #25 — Android Chromium, desktop Chromium, desktop WebKit, desktop Firefox). In `refresh` (#9, #20) the same step left nothing to restore after the reload. One clue that *something* was committed: in #9 the match sat at revision 3 when the player returned from a reload that started at revision 1.
Caveat: futa04 renders no visible Confirm box (`#confirm` is filled but `hidden`), so this harness places the move with taps only. If the futa04 tap path needs a different gesture to *apply* a Grow, this is a harness gap rather than an app bug.
**Proposed next step (owner or main worker, ~10 minutes):** place a Grow by hand in one online duel and check `localStorage` for `futa05:severgrow.duel.draft.v1.<matchId>` and `window.__severgrow.canUndo()` before the Throw. If both are false, the online Grow is committing or dropping the move instead of drafting it.

**G-6 · NEEDS CONFIRMATION — after the device forgets everything, no fresh guest identity is stored (2/2 games).**
With identity/session/draft keys removed and a reload, the lobby opened but no identity was present afterwards in #8 and #19 (an earlier pass of the suite saw the same check pass). `identity.ensure()` creates the guest, so either the create failed silently or the app's own recovery reload (which re-runs my key-removal script) won the race.
**Proposed next step:** manual check on one phone — clear the site's storage, reload, open Play online, and confirm a new guest appears with an empty match list and no warning.

**G-7 · LOW — the Discard prompt renders inside a hidden box.**
In the `DISCARD` step the app fills `#confirm` with `Discard <card> / Cancel / Discard`, but `#confirm` stays `hidden`; the only visible nodes are `#discard` (dim) and `#smart-context`. The move is actually completed by dragging a hand card onto the throw pile (verified: the match revision advanced 2→3, the turn handed over, and the opponent's HUD flipped to “Your turn”). Worth confirming that the drag affordance is discoverable, since the text prompt a player would look for is invisible.

### What passed (worth keeping)

- **create + join** in two separate contexts on every browser pair tested: seats 0/1, both sides on the shared board, duel HUD visible, Resign present, Me/Opponent labels.
- **who-starts**: the HUD tells each side the truth against the server's actor in every duel, and the starting seat varies by deal (both creator-starts and joiner-starts observed).
- **live polling**: after a Throw the opponent's HUD flips to “Your turn” with no reload, on all three engines (2 s poll).
- **turn-gated views (P-6)**: while the actor is mid-turn the opponent stays on the turn-start revision *and* the turn-start board (checked through the API), the actor's hand never appears at any card-id path in the opponent's payload, and the whole turn is revealed only after the Throw.
- **async catch-up** (3/3): closing a player mid-duel and returning later lands them at the current revision with the correct turn.
- **rotate / resize** (3/3): mid-duel rotation keeps the board playable and the turn throwable; both orientations were audited on both devices.
- **background / foreground** (3/3): the clock does not drift — the HUD stays within the minute-floor of a freshly fetched server clock.
- **slow network** (3/3): with 700 ms added to every API call, the Draw and the Throw still land exactly once.
- **offline / online** (3/3): the offline note is honest, the online side keeps playing, an offline submit fails cleanly, and the returning side catches up without a reload.
- **storage blocked** (3/3, 4/4 checks each): the honest “This browser blocked storage…” warning shows and nothing crashes.
- **touch**: no page scroll during interactions (`scrollY 0`, document height == viewport); touch taps draw and throw.

### Environmental notes (not device bugs)

- The live API returned a few transient `500 INTERNAL` (`/v1/players/me/matches`, `/v1/matches/:id/view`) and one `409` across the passes — consistent with a mid-deploy window while the parallel server stream was redeploying the Edge function. The harness retries 5xx twice, which is why only a handful are recorded.
- Per-IP budgets are tight when two streams share one address: `30 guests/hour`, `60 joins/hour`, `10 open matches per player`. Earlier passes were blocked by `429` on `join` and `409` on `matches`; the final pass ran clean, so every game above has a real result. Two players behind one NAT could hit the same wall — worth a line in the ops notes.

## Top 5 fixes I recommend

1. **Make Resign tappable** (`web/src/online/online-css.ts`): lift `.duel-hud` above the board (`position: relative; z-index: 4`) and keep the button inside the strip. Today only ~11 px of the only exit control responds on a phone.
2. **Wire `sync.setVisible` / `setOnline`** in `web/src/main.ts` to `visibilitychange` and `online`/`offline`. Stops hidden tabs polling every 2 s (measured 3-4 polls per 9 s) and makes the offline notice truthful.
3. **Raise the small touch targets**: `#duel-resign` (79x36 on every touch profile) and the six `44x44` Android controls up to the platform minimum.
4. **Confirm the Grow draft** (G-5) with one manual placement: the local draft must exist (and survive a refresh). If the futa04 tap path commits or drops a Grow instead of drafting it, that is an online-only bug worth fixing before the channel is promoted.
5. **Confirm the cleared-device identity** (G-6) and tidy the hidden `#moves .end` node (G-3) so the only route into the Discard step is not an invisible 44 px node with an empty label.

## Appendix

- Raw data (every check, note, console/HTTP/CORS entry and screenshot path): `docs/screens/online/device-matrix/results.json`.
- Harness (new files; no existing suite was modified): `web/e2e/online-device-matrix.ts` and `web/e2e/helpers/online-matrix.ts`.
