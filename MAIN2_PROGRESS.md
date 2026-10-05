# Main2.0 / Test2 progress

## DONE

- 2026-10-05: Actual remote heads verified: Main `4833bf000110e3edb148a7264398e2ab81eb4b44`, Dev `fa674ff89e9bc1cae30b84bbf6dd307eb78bcd6b`, Main2.0 `5ad790c441c9388a3e86913940c3e61013c349f6`.
- No candidate bundle or source export exists in the attachments/workspace. Rebuilt from actual repository; historical `9f75b402` results are not used as proof.
- True merge `ed94abd587dc3445b64e3bd3e9bcda870a913fb4` preserves Main and onboarding history, merging pinned Dev `fa674ff89e9bc1cae30b84bbf6dd307eb78bcd6b`. No Main or Dev ref changed.
- Classic parity: 27 complete games, three seeds (1, 42, 219682080) per level 1–9; 3,640 actions. Every state/event, legal action, exact bot choice and replay matched protected Main. Coverage includes Draw, Bloom, Sprout, Strengthen, Fruit, Overgrow, Sever, Strangle, Discard and GameEnd.
- `f3a14e5`: original golden fixtures retained. Assert disabled Lab defaults (`board:null`, `reshuffleDiscard:false`), normalize only those config fields for historical hashes. Engine and bots unchanged after merge.
- Explicit live/test/test2 product policy, own `main2:` local/session storage; approved player modules moved out of Lab architecture. Experimental query parameters and DESIGN assets excluded from Test2.

## IN PROGRESS

- Publishing verified Main2.0 and the durable combined Main/Test/Test2 artifact; awaiting actual CI and public-site verification.

## DECISIONS NEEDED

- None. The owner explicitly authorized necessary permissions and asked to continue without further approval.
- Main's narrowly scoped deployment exception is `.github/workflows/pages.yml` alone. It builds each version from its own checkout; no Main game code is merged or edited. The composer adapts only offline routing in the generated Main worker.

## KNOWN ISSUES

- Real-device Safari bars/safe areas and Android performance remain unverified.
- DESIGN/V3 experimental raster flaws remain Dev-only.

## TEST RESULTS (fresh, not historical)

- Node 24.19 / npm 11.9; clean lockfile installation succeeded.
- Final `npm run check`: 107 files, 1,133 passing tests + 1 existing expected failure, 350.30 seconds. Typecheck repeated after the final pointer/recovery changes passed.
- Original Classic golden fixtures and hash assertions retained; 27 complete parity games / 3,640 actions passed against protected Main.
- Feature/storage policy: 5/5 pass. Live, Test and Test2 builds passed; candidate/legacy asset isolation passed.
- Existing browser suites: smoke 39/39, painting 25/25, overhaul 13/13, monkey run, empty-turn 9/9, Fruit cards 33/33 passed. Pro pass initially found a rotation discontinuity; after fixing stale pointer coordinates, full Pro pass 37/37 passed without weakening assertions.
- Final Test2 critical flow: 180/180 checks at 360×640, 390×664, 390×844, 430×932, 768×1024, 1280×800, 1440×900, 1600×980 and 1920×1080. Real Draw, target preview/tap-again, engine equality, Undo, Throw, opponent turn, resume, Pause info, ownership marks, tool exclusion and other-channel saves checked.
- Final HTTPS quality flow: 321/321 checks. Soil/Moss/Ink, left/right, large text, low detail, reduced motion, keyboard, loaded fonts/equal-width numerals, hands 5/8/10, corrupt/obsolete/blocked saves, six guided tutorial moves, complete-game statistics, scoped offline launch/resume and cache coexistence passed.
- Persistent entry/dynamic-font module failures recover exactly once; success resets the same raw channel key, allowing later upgrades to recover. Missing font files do not reload the app. Both original reload failures fixed and verified.
- Legal target regression seed219682080 cleared at phone heights 664 and 844; camera uses actual usable height and teaching panels avoid legal targets/homes/step plate.
- Main's protected checkout and the current Dev checkout have no tracked changes. Dev advanced independently to `845531549c6f297ec49eb86ab0344fe3ab46cc90` (V3 art/recovery experiments); publish that at Test without importing unapproved V3 into Test2. The integrated Dev SHA remains the pinned merge `fa674ff89e9bc1cae30b84bbf6dd307eb78bcd6b`.

## NOT YET VERIFIED

- Remote CI, Pages deployment, exact published candidate SHA and actual public browser flows.
- Real iPhone Safari bars/safe areas, rotation on real devices and Android Chrome performance.

## Feature inventory

| Category | Actual contents / Test2 disposition |
|---|---|
| MAIN ONLY | Existing root release, backup engine, legacy type/dock/Confirm/tools and unprefixed saves; preserved on protected Main |
| DEV ONLY | Experimental development settings, comparison controls and new V3 art; excluded from Test2 |
| SHARED | Deterministic Classic rules, bots 1–9, existing artwork, palettes, cards, game/session/settings logic |
| LAB ONLY | Custom BoardSpec maps/configs, reshuffle, longer games, presets/share tools; unavailable in Test2 |
| DESIGN ONLY | Illustrated V2 forest/volcano subclass and public PNG assets; excluded from Test2 bundles |
| WATCH ONLY | Spectating/takeover and speed tools; excluded from Test2 |
| SUPERSEDED | Fraunces/Jakarta and Bricolage/Figtree, older step guidance and phone layout revisions; retained for Dev comparison/history |
| CANDIDATE FOR TEST2 | Besley/Commissioner/Numerals, Pro phone layout, Full step plate, desktop coach, slim header/Pause info, tap-again+Undo, smart camera/map fade, hidden Replay/weak tools, retained owner shapes, independent saves and cache recovery |
