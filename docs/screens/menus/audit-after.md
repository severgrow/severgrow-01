# Menu audit (after)

Every value is measured from `getComputedStyle` / `getBoundingClientRect` on the built `web/dist`
(CHANNEL=futa05), not read off the CSS source. Column width is in px; padding and gap are the
column's own; centre offset is the column centre minus the viewport centre (0 = centred); heading
is font-size/line-height/letter-spacing (+ weight and text) in px; `wordmark→buttons` is the
main-menu wordmark's bottom to the buttons block's top; buttons list `height` (+ radius `r`) for
each visible control; overflow is column scrollHeight − clientHeight (0 = nothing to scroll).

| surface | viewport | column w | pad T/B | gap | centre | heading fs/lh/ls weight "text" | wordmark→buttons | buttons (h/r) | overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main menu | 360x640 | 328 | 32 / 32 | 14 | 0 | 41.4/38.09/-1.24 800 "Futasaku" | 28 | menu-online:56r999 menu-new:56r999 menu-tutorial:44r999 menu-settings:44r999 | 0 |
| difficulty pick | 360x640 | 328 | 32 / 32 | 14 | 0 | 23.2/25.52/-0.28 700 "Choose difficulty" | – | levels .level-grid .difficulty-tile:56r999 levels .level-tile:56r999 levels-back:44r50 | 0 |
| online hub | 360x640 | 328 | 32 / 32 | 14 | 0 | 23.2/25.52/-0.28 700 "Play online" | – | online-create:56r999 online-find:56r999 online-join-open:56r999 online-back:44r50 | 0 |
| online join | 360x640 | 328 | 32 / 32 | 14 | 0 | 23.2/25.52/-0.28 700 "Join a duel" | – | online-join-submit:56r999 online-join-back:44r50 | 0 |
| online waiting / searching | 360x640 | 328 | 32 / 32 | 14 | 0 | 23.2/25.52/-0.28 700 "Waiting for a friend" | – | online-share:56r999 online-copy:44r999 online-cancel-match:44r999 online-waiting-back:44r50 | 0 |
| online matched card | 360x640 | 288 | 14.4 / 14.4 | NaN | 0 | 16.8/24.86/NaN 700 "Opponent found" | – | online-matched-now:56r999 online-matched-later:56r999 | 0 |
| settings sheet | 360x640 | 328 | 0 / 0 | NaN | 0 | 20/22/-0.24 700 "Settings" | – | sheet-settings #test-sound:36r999 sheet-settings #test-vibration:36r999 sheet-settings #restart-tutorial:36r999 | 0 |
| pause menu | 360x640 | 328 | 0 / 0 | 8 | 0 | 20/22/-0.24 700 "Paused" | – | gm-resume:44r999 gm-new:44r999 gm-howto:44r999 gm-settings:44r999 gm-main:44r999 | 0 |
| how to play (Match Intel glass) | 360x640 | 348 | 0 / 0 | NaN | 0 | – | – |  | 0 |
| live duel HUD strip | 360x640 | 198 | 1 / 1 | 2 | -23 | 12.8/14.08/NaN 700  | – |  | 0 |
| install invitation sheet | 360x640 | 328 | 0 / 0 | 8 | 0 | 20/22/-0.24 700 "Grow FUTASAKU on your home screen" | – | install-accept:56r999 install-never:48r999 | 0 |
| main menu | 390x844 | 358 | 32 / 32 | 14 | 0 | 43.65/40.16/-1.31 800 "Futasaku" | 28 | menu-online:56r999 menu-new:56r999 menu-tutorial:44r999 menu-settings:44r999 | 0 |
| difficulty pick | 390x844 | 358 | 32 / 32 | 14 | 0 | 23.76/26.14/-0.29 700 "Choose difficulty" | – | levels .level-grid .difficulty-tile:56r999 levels .level-tile:56r999 levels-back:44r50 | 0 |
| online hub | 390x844 | 358 | 32 / 32 | 14 | 0 | 23.76/26.14/-0.29 700 "Play online" | – | online-create:56r999 online-find:56r999 online-join-open:56r999 online-back:44r50 | 0 |
| online join | 390x844 | 358 | 32 / 32 | 14 | 0 | 23.76/26.14/-0.29 700 "Join a duel" | – | online-join-submit:56r999 online-join-back:44r50 | 0 |
| online waiting / searching | 390x844 | 358 | 32 / 32 | 14 | 0 | 23.76/26.14/-0.29 700 "Waiting for a friend" | – | online-share:56r999 online-copy:44r999 online-cancel-match:44r999 online-waiting-back:44r50 | 0 |
| online matched card | 390x844 | 318 | 14.4 / 14.4 | NaN | 0 | 16.8/24.86/NaN 700 "Opponent found" | – | online-matched-now:56r999 online-matched-later:56r999 | 0 |
| settings sheet | 390x844 | 358 | 0 / 0 | NaN | 0 | 20/22/-0.24 700 "Settings" | – | sheet-settings #test-sound:36r999 sheet-settings #test-vibration:36r999 sheet-settings #restart-tutorial:36r999 | 0 |
| pause menu | 390x844 | 358 | 0 / 0 | 8 | 0 | 20/22/-0.24 700 "Paused" | – | gm-resume:44r999 gm-new:44r999 gm-howto:44r999 gm-settings:44r999 gm-main:44r999 | 0 |
| how to play (Match Intel glass) | 390x844 | 378 | 0 / 0 | NaN | 0 | – | – |  | 0 |
| live duel HUD strip | 390x844 | 228 | 1 / 1 | 2 | -23 | 12.8/14.08/NaN 700  | – |  | 0 |
| install invitation sheet | 390x844 | 358 | 0 / 0 | 8 | 0 | 20/22/-0.24 700 "Grow FUTASAKU on your home screen" | – | install-accept:56r999 install-never:48r999 | 0 |
| main menu | 768x1024 | 420 | 32 / 32 | 14 | 0 | 68/62.56/-2.04 800 "Futasaku" | 28 | menu-online:56r999 menu-new:56r999 menu-tutorial:44r999 menu-settings:44r999 | 0 |
| difficulty pick | 768x1024 | 420 | 32 / 32 | 14 | 0 | 32/35.2/-0.38 700 "Choose difficulty" | – | levels .level-grid .difficulty-tile:56r999 levels .level-tile:56r999 levels-back:44r50 | 0 |
| online hub | 768x1024 | 420 | 32 / 32 | 14 | 0 | 32/35.2/-0.38 700 "Play online" | – | online-create:56r999 online-find:56r999 online-join-open:56r999 online-back:44r50 | 0 |
| online join | 768x1024 | 420 | 32 / 32 | 14 | 0 | 32/35.2/-0.38 700 "Join a duel" | – | online-join-submit:56r999 online-join-back:44r50 | 0 |
| online waiting / searching | 768x1024 | 420 | 32 / 32 | 14 | 0 | 32/35.2/-0.38 700 "Waiting for a friend" | – | online-share:56r999 online-copy:44r999 online-cancel-match:44r999 online-waiting-back:44r50 | 0 |
| online matched card | 768x1024 | 340 | 14.4 / 14.4 | NaN | 0 | 16.8/24.86/NaN 700 "Opponent found" | – | online-matched-now:56r999 online-matched-later:56r999 | 0 |
| settings sheet | 768x1024 | 736 | 0 / 0 | NaN | 0 | 20/22/-0.24 700 "Settings" | – | sheet-settings #test-sound:36r999 sheet-settings #test-vibration:36r999 sheet-settings #restart-tutorial:36r999 | 0 |
| pause menu | 768x1024 | 736 | 0 / 0 | 8 | 0 | 20/22/-0.24 700 "Paused" | – | gm-resume:44r999 gm-new:44r999 gm-howto:44r999 gm-settings:44r999 gm-main:44r999 | 0 |
| how to play (Match Intel glass) | 768x1024 | 756 | 0 / 0 | NaN | 0 | – | – |  | 0 |
| live duel HUD strip | 768x1024 | 606 | 0 / 0 | 2 | -23 | 12.8/14.72/NaN 700  | – |  | 0 |
| install invitation sheet | 768x1024 | 736 | 0 / 0 | 8 | 0 | 20/22/-0.24 700 "Grow FUTASAKU on your home screen" | – | install-accept:56r999 install-never:48r999 | 0 |
| main menu | 1280x800 | 420 | 32 / 32 | 14 | 0 | 68/62.56/-2.04 800 "Futasaku" | 28 | menu-online:56r999 menu-new:56r999 menu-tutorial:44r999 menu-settings:44r999 | 0 |
| difficulty pick | 1280x800 | 420 | 32 / 32 | 14 | 0 | 32/35.2/-0.38 700 "Choose difficulty" | – | levels .level-grid .difficulty-tile:56r999 levels .level-tile:56r999 levels-back:44r50 | 0 |
| online hub | 1280x800 | 420 | 32 / 32 | 14 | 0 | 32/35.2/-0.38 700 "Play online" | – | online-create:56r999 online-find:56r999 online-join-open:56r999 online-back:44r50 | 0 |
| online join | 1280x800 | 420 | 32 / 32 | 14 | 0 | 32/35.2/-0.38 700 "Join a duel" | – | online-join-submit:56r999 online-join-back:44r50 | 0 |
| online waiting / searching | 1280x800 | 420 | 32 / 32 | 14 | 0 | 32/35.2/-0.38 700 "Waiting for a friend" | – | online-share:56r999 online-copy:44r999 online-cancel-match:44r999 online-waiting-back:44r50 | 0 |
| online matched card | 1280x800 | 340 | 14.4 / 14.4 | NaN | 0 | 16.8/24.86/NaN 700 "Opponent found" | – | online-matched-now:56r999 online-matched-later:56r999 | 0 |
| settings sheet | 1280x800 | 426 | 0 / 0 | NaN | 0 | 20/22/-0.24 700 "Settings" | – | sheet-settings #test-sound:36r999 sheet-settings #test-vibration:36r999 sheet-settings #restart-tutorial:36r999 | 0 |
| pause menu | 1280x800 | 426 | 0 / 0 | 8 | 0 | 20/22/-0.24 700 "Paused" | – | gm-resume:44r999 gm-new:44r999 gm-howto:44r999 gm-settings:44r999 gm-main:44r999 | 0 |
| how to play (Match Intel glass) | 1280x800 | 398 | 0 / 0 | NaN | +433 | – | – |  | 0 |
| live duel HUD strip | 1280x800 | 1118 | 0 / 0 | 2 | -23 | 12.8/14.72/NaN 700  | – |  | 0 |
| install invitation sheet | 1280x800 | 426 | 0 / 0 | 8 | 0 | 20/22/-0.24 700 "Grow FUTASAKU on your home screen" | – | install-accept:56r999 install-never:48r999 | 0 |

## Notes

- General: the live-duel challenge pop-up, the "Go live" pill and the end window are injected only when a live server session exists, so they are not rendered here; their tokens are audited from source (web/src/online/live/ui.ts, web/src/online/online-css.ts) in the report.
- 360x640: #online-waiting did not open (needs the server); revealed it to measure CSS
- 390x844: #online-waiting did not open (needs the server); revealed it to measure CSS
- 768x1024: #online-waiting did not open (needs the server); revealed it to measure CSS
- 1280x800: #online-waiting did not open (needs the server); revealed it to measure CSS
