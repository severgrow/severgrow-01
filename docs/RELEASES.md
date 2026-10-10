# Releases: Main, Test and Test2

All three versions publish together in one GitHub Pages artifact:

| Channel | Branch | Address | Build | Storage |
| --- | --- | --- | --- | --- |
| Main | `main` | https://severgrow.github.io/severgrow-01/ | `npm run web:build` | legacy keys |
| Test | `dev` | https://severgrow.github.io/severgrow-01/test/ | `CHANNEL=test npm run web:build` | `test:` |
| Test2 | `Main2.0` | https://severgrow.github.io/severgrow-01/test2/ | `CHANNEL=test2 npm run web:build` | `main2:` |

The default-branch Pages workflow builds protected Main from its own checkout, current Dev
from its own checkout, and the verified candidate from Main2.0. It never merges game code
into Main or pushes to Dev. Main pushes, Dev's completed “Test copy pushed” workflow,
and successful Main2.0 CI trigger the same deployment workflow. Every deployment includes
all three directories; no competing Pages publisher may overwrite another channel.

Candidate publication requires the full unit/type check, original Classic per-action parity,
asset isolation, and nine-viewport browser critical flow. Additional local HTTPS quality checks
cover palettes, fonts, hand sizes, keyboard controls, tutorial, statistics, corrupt/blocked storage,
scoped offline resume, and repeated missing-asset recovery. Record actual results and outstanding
real-device checks for this version in `docs/FUTASAKU_0_3_BASELINE.md`.
Older Test2 results remain in `MAIN2_PROGRESS.md` at source commit
`89d438c1b3fca253292d1b8a9eabffcf5e2da315`.

`scripts/compose-pages.mjs` changes only offline routing in Main's generated worker: it excludes
both child directories and deletes only Main-owned obsolete caches. Main gameplay source stays
unchanged. Test2's worker controls only its own directory/cache; Test stays online-only.
Release manifests identify all deployed commits and distinguish the Dev revision merged into
Test2 from the current experimental Dev revision published alongside it.

The owner authorized the minimal default-branch Pages workflow exception to retain `/test2/`.
That authorization does not permit merging candidate game code into Main. The ordinary strict
Main promotion process still requires an explicit request, passing checks, and a reviewed PR.

## Futasaku preview routes

The current game is also published from the allowed `futa0.3` Pages ref, without
replacing Main, Test or Test2. Each preview has its own address, saves and
offline cache. Both routes are built from that ref's commit.

| Version | Address | Storage | Offline cache |
| --- | --- | --- | --- |
| Futasaku 0.3 | https://severgrow.github.io/severgrow-01/futasaku-03-preview/ | `futasaku03:` | `futasaku03-` |
| Futasaku 0.4 | https://severgrow.github.io/severgrow-01/futasaku-04-preview/ | `futasaku04:` | `futasaku04-` |
