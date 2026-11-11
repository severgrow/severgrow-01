The main menu now shows the player's actual Territory through the existing SVG renderer. Opening
Territory brings that same map to full clarity and reveals its controls; returning dims it behind the
menu. The SVG, camera, geography and manual zoom remain continuous in both directions.

The change also shares the public map read/cache, frames a real owned tile on first visit, tightens
the logo/title rhythm and handles early taps, interrupted navigation, keyboard focus, app return,
empty maps and stale remembered coastlines. No new gameplay rules, dependencies or backend rollout.

Validation: full check (3,750 tests), 120 feature-browser checks, both production-channel builds and
asset guards, existing Territory menu/challenge/gesture suites, normal/reduced-motion Territory-to-duel
regression, and the 4× CPU probe (controlled repeat passed; its first pan timing miss is documented).
Chromium and WebKit continuity suites are added to CI with screenshot artifacts. Physical iPhone
hardware remains unverified.

[Design, screenshots and detailed verification](https://github.com/severgrow/severgrow-01/blob/feature/living-territory-menu/docs/LIVING-TERRITORY-MENU.md) ·
[Cursor integration guide](https://github.com/severgrow/severgrow-01/blob/feature/living-territory-menu/docs/history/CURSOR-LIVING-TERRITORY-HANDOFF.md)

Prepared as an isolated feature branch for review. Do not merge or deploy without owner approval.
