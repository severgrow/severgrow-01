# Main2.0 / Test2 progress

## DONE

- 2026-10-05: Actual remote heads verified: Main `4833bf000110e3edb148a7264398e2ab81eb4b44`, Dev `fa674ff89e9bc1cae30b84bbf6dd307eb78bcd6b`, Main2.0 `5ad790c441c9388a3e86913940c3e61013c349f6`.
- No candidate bundle or source export exists in the attachments/workspace. Rebuilt from actual repository; historical `9f75b402` results are not used as proof.
- True merge `985f03ff11c1dd795deeb9807f7902f112054332` preserves Main and onboarding history, merging pinned Dev `fa674ff89e9bc1cae30b84bbf6dd307eb78bcd6b`. Main gameplay and the Dev ref were preserved.
- Classic parity: 27 complete games, three seeds (1, 42, 219682080) per level 1–9; 3,640 actions. Every state/event, legal action, exact bot choice and replay matched protected Main. Coverage includes Draw, Bloom, Sprout, Strengthen, Fruit, Overgrow, Sever, Strangle, Discard and GameEnd.
- `e4eea71`: original golden fixtures retained. Assert disabled Lab defaults (`board:null`, `reshuffleDiscard:false`), normalize only those config fields for historical hashes. Engine and bots unchanged after merge.
- Explicit live/test/test2 product policy, own `main2:` local/session storage; approved player modules moved out of Lab architecture. Experimental query parameters and DESIGN assets excluded from Test2.

## IN PROGRESS

- Candidate uploaded via the connected GitHub app; each published tree matched its tested local tree byte-for-byte. Direct git push has no credential helper, so connector-created commits have distinct author/time hashes while preserving the same parents, complete upstream history and source trees.
- Main deployment exception `f65811fff679882fcb5625d6e053fcade4af0589` changes only `.github/workflows/pages.yml`; candidate publication waits for successful CI at its exact SHA. Obsolete candidate runs cannot publish.
- GitHub candidate run `37328923647`: full unit/type/all-channel build job passed; browser job passed smoke 39/39 and painting 25/25, then hit a null box in the existing overhaul driver. Driver now reads a target key atomically and clicks the stable hex with Playwright waiting; all policy/Undo/geometry assertions retained and 13/13 local checks pass (18/18 policy cases). Independent browser suites run on separate CI runners, with fail-fast disabled so every suite reports. No application code changed in this follow-up.
- Publishing verified Main2.0 and the durable combined Main/Test/Test2 artifact; awaiting actual CI and public-site verification.

## DECISIONS NEEDED

- None. The owner explicitly authorized necessary permissions and asked to continue without further approval.
- Main's narrowly scoped deployment exception is `.github/workflows/pages.yml` alone. It builds each version from its own checkout; no Main game code is merged or edited. The composer adapts only offline routing in the generated Main worker.

## KNOWN ISSUES

- Real-device Safari bars/safe areas and Android performance remain unverified.
- Optional V3 is now present in Test2 from the concurrently maintained Beta branch; this information pass preserves it and keeps the original look as the default.

## TEST RESULTS (fresh, not historical)

- Node 24.19 / npm 11.9; clean lockfile installation succeeded.
- Final `npm run check`: 107 files, 1,133 passing tests + 1 existing expected failure, 350.30 seconds. Typecheck repeated after the final pointer/recovery changes passed.
- Original Classic golden fixtures and hash assertions retained; 27 complete parity games / 3,640 actions passed against protected Main.
- Feature/storage policy: 5/5 pass. Live, Test and Test2 builds passed; candidate/legacy asset isolation passed.
- Existing browser suites: smoke 39/39, painting 25/25, overhaul 13/13, monkey run, empty-turn 9/9, Fruit cards 33/33 passed. Pro pass initially found a rotation discontinuity; after fixing stale pointer coordinates, full Pro pass 37/37 passed without weakening assertions.
- Final Test2 critical flow: 189/189 checks at 360×640, 390×664, 390×844, 430×932, 768×1024, 1280×800, 1440×900, 1600×980 and 1920×1080. Real Draw, target preview/tap-again, engine equality, Undo, Throw, opponent turn, resume, Pause info, ownership marks, tool exclusion and other-channel saves checked. Final checks also assert the first-time tip overlaps none of the legal Sprout hexes or home artwork.
- Final HTTPS quality flow: 321/321 checks. Soil/Moss/Ink, left/right, large text, low detail, reduced motion, keyboard, loaded fonts/equal-width numerals, hands 5/8/10, corrupt/obsolete/blocked saves, six guided tutorial moves, complete-game statistics, scoped offline launch/resume and cache coexistence passed.
- Persistent entry/dynamic-font module failures recover exactly once; success resets the same raw channel key, allowing later upgrades to recover. Missing font files do not reload the app. Both original reload failures fixed and verified.
- Legal target regression seed219682080 cleared at phone heights 664 and 844; camera uses actual usable height and teaching panels avoid legal targets/homes/step plate. A compact horizontal tip reuses the existing grid treatment where a tall phone tip has no free area; full text and its acknowledgement stay available.
- Main's protected checkout and the current Dev checkout have no tracked changes. Dev advanced independently to `f24c4d9befd21d044cf18a9bb98bb77734586c2c` (V3 art/recovery experiments); publish that at Test without importing unapproved V3 into Test2. The integrated Dev SHA remains the pinned merge `fa674ff89e9bc1cae30b84bbf6dd307eb78bcd6b`.

## NOT YET VERIFIED

- Remote CI, Pages deployment, exact published candidate SHA and actual public browser flows.
- Real iPhone Safari bars/safe areas, rotation on real devices and Android Chrome performance.

## Feature inventory

| Category | Actual contents / Test2 disposition |
|---|---|
| MAIN ONLY | Existing root release, backup engine, legacy type/dock/Confirm/tools and unprefixed saves; preserved on protected Main |
| DEV ONLY | Experimental development settings and comparison controls; unavailable in Test2. Optional V3 art is also available in Test2. |
| SHARED | Deterministic Classic rules, bots 1–9, existing artwork, palettes, cards, game/session/settings logic |
| LAB ONLY | Custom BoardSpec maps/configs, reshuffle, longer games, presets/share tools; unavailable in Test2 |
| DESIGN ONLY | Illustrated V2 forest/volcano subclass and public PNG assets; excluded from Test2 bundles |
| WATCH ONLY | Spectating/takeover and speed tools; excluded from Test2 |
| SUPERSEDED | Fraunces/Jakarta and Bricolage/Figtree, older step guidance and phone layout revisions; retained for Dev comparison/history |
| CANDIDATE FOR TEST2 | Besley/Commissioner/Numerals, Pro phone layout, Full step plate, desktop coach, slim header/Pause info, tap-again+Undo, smart camera/map fade, hidden Replay/weak tools, retained owner shapes, independent saves and cache recovery |

### Concurrent Test2 integration
Preserved incoming commit 51640aa7 and its optional V3 look; the original look remains the default. Added the V3 browser flow to the independent CI matrix. The default Main game is untouched. This integration requires fresh CI and public verification before it is reported live.

## Test2 information pass — 5 October 2026

### DONE
- Reviewed the supplied phone screenshots: independent turn/step/discard messages overlapped; coaching was squeezed to 140px, truncating the suggestion and wrapping Show me where into multiple lines.
- Test2 alone now has one reserved information area above the playable map: large, faint Draw/Grow/Throw text and one subordinate notice. No glass capsules, competing turn pill or duplicate idle message.
- Moved the original coach/tip nodes into an explicitly opened accessible help sheet. Complete instructions, labelled progress, 44px controls, Show me where, separate coach-off, Escape/Tab and focus return remain available. Teaching yields to an active move, inspection, Pause and results.
- Routine notices clear on interaction; significant cuts and home danger retain priority. No message node can cover a playable tile.
- Fixed desktop long Bloom/Skip text overflowing toward the throw pile; wrapping stays inside the existing column. Replayed the affected complete game: 101 UI actions, no failures.
- Fixed lessons opened from How to play before a game starts, including the previously inactive Bloom Show tip link.
- Preserved concurrent Beta visual commits without editing their art or renderer. No engine, bot, rule, card, score, save schema or Main source changes in this pass.

### TEST RESULTS
- Full npm run check: 107 files, 1,133 tests passed and one existing expected failure; typecheck passed.
- Observed 20 complete browser games: 1,449 human actions (1,407 real UI, 42 assisted), 2,953 total game actions, 3,472 distinct sampled message frames; zero message overlap, blocked control or overflow frames. Complex Bloom actions used the existing session hook; one desktop EndAct initially needed assistance and was fixed/rechecked separately. Original observations remain available in the release review.
- Test2 critical gameplay: 189 checks across nine viewports passed; information/help: 126 checks passed, including lessons opened before a game; V3: 22 checks passed.
- HTTPS palette/storage/offline/teaching/recovery: 327 checks passed. Main, Dev and Test2 builds and asset isolation passed; Test2 information/help chunks absent from both other channels.

### IN PROGRESS
- Publishing the reviewed information change to Main2.0; exact candidate CI and public-site checks must complete before it is reported live.

### NOT YET VERIFIED
- Real iPhone/Android hardware.
- Exact newly published information commit on the public URL.

## Test2 board and turn-flow polish — 6 October 2026

### IMPLEMENTED
- Removed owner shape marks through Test2's channel policy, preserving art, strength numbers, connections and accessible tile descriptions.
- Removed the reserved instruction row and both 68/84px layout deductions. The existing fit calculation now uses the complete viewport: normal phones use approximately 95–96% map width, with control/safe margins preserved. No map coordinates or geometry changed.
- Centred large uppercase Draw/Grow/Throw prompts directly over the board, with a transparent background, pointer-through hit testing and a 140ms fade. They yield to active card, target and Bloom selection. Kept concise notices and the full Help sheet, and bounded Hint's tap target inside the board.
- Valid Sprout/Strengthen card-and-target pairs and completed Bloom shapes execute immediately in Test2, including Confirm moves=Always. Invalid/partial shapes spend nothing; Undo and other-channel input branches remain intact. Coach/list previews retain explicit position selection.
- Preserved concurrent Main2.0 artwork and cache fixes through ccccea9a26da462f02796dfe264b498ba18f74eb; no engine, bot, card, rule, score, save-schema, Main/Dev ref or workflow changes in this pass.

### VALIDATION / IN PROGRESS
- Root and web typechecks passed. Final targeted interaction, session, paint and guide rerun passed all 51 tests after baseline synchronization. Channel policy regression coverage checks that Main ownership marks remain enabled and Test2 marks are disabled.
- Local full npm run check: 106 files passed; 1,132 tests passed, one existing expected failure, and one environment failure (ADVERSARIAL 8: spawnSync npx EPERM). This is not a green full check; exact-head CI must pass unchanged checks.
- Main, Dev and Test2 builds succeeded. Live/Test2 asset isolation passed; current manifest-hash guard is rechecked after preserving concurrent cache work.
- Added real UI QA for Forest/Volcano turns, Bloom/Sprout and Undo, phase cues, Skip, invalid input, exact engine/bot equality, save replay, other-channel storage and layout at nine viewports. It runs through the existing Test2 critical CI suite, without workflow edits.
- Local browser execution is blocked by the workspace sandbox; permission execution did not complete. Browser assertions and visual screenshot review must finish through the existing CI before completion/live claims.

### NOT YET VERIFIED
- Exact-head remote CI/browser results and newly published public Test2 build.
- Real iPhone Safari and Android hardware.
