# FUTASAKU 0.81 foundation

## Recovery and scope

Original live 0.8: `15f80b7c06f2908611624ba6e5b25e2980e6e8f1`, preserved as the annotated
GitHub tag `v0.8-preserved-20261106`. The lockfile, assets, build scripts and configuration references
are part of that source checkpoint. No credentials are captured. The installed-app follow-up starts
at `e8f6ca72`; see `IOS-LAUNCH-20261106.md` for native-iOS limits.
The original successful publisher was [42220234782](https://github.com/severgrow/severgrow-01/actions/runs/42220234782),
resolving both root and test to 15f80b7c. Preserve the existing GitHub build-variable bindings;
the source tag does not back up secrets or a production database.

Work branch: `release/v0.81-foundation`, isolated in `/workspace/futasaku-v081`.
Owner authorised a complete verified release and live promotion on 6 November 2026.
Engine rules, accounts, economy, ownership, save keys and database schema are protected.

## Audit and acceptance ledger

| Area | Starting evidence | Acceptance |
| --- | --- | --- |
| Installed launch | Saved bright menu precedes existing dark cover | Painted readiness, one reveal, dark suspension snapshot, reduced motion; physical iOS limitation disclosed |
| Move smoothness | Motion-cost probe confirms expensive full board rebuilds; original timings retained | Retain unchanged art, measure before/after under the same throttle, run move/lesson/online browsers |
| Texture lifecycle | Superseded world layers can keep publishing and retaining blob URLs | Cancel superseded work, release resources, ignore stale publication |
| Match Intel | Three tabs repeat readouts; seat assumptions; live updates replace focused controls | Public-only relative facts, useful hierarchy, stable keyboard/focus and reading position |
| Navigation and overlays | Existing shared interface motion and dark glass are established | Rapid reversal, reduced motion, no stranded surfaces or extra idle loops |
| Stability | Deterministic engine and existing reward/reconnect protection | Full unit/type checks and existing multiplayer, save, replay, onboarding regressions |
| Visual evidence | Existing screen suites and deterministic fixtures | Phone/tablet/desktop captures reviewed, bounded deterministic regression checks |
| Release | Both release refs initially 15f80b7c | Exact-SHA CI, staging, promotion, approved publisher, ROOT_SHA confirmation |

## Recent changes retained

- Planet geometry, north-up input, selection, connected rankings and seamless handoff.
- Classic materials only; rejected world assets stay removed. Dormant cosmetic identity remains.
- Matte controls, warm suggestion light, shared glass and 650ms PLAY background transitions.
- Global chat warm cache and identity isolation; existing chat turn security.
- Replay sprite/texture fixes, frame calibration, global grain and consistent type.
- 0.8 nonblocking own-action presentation, connected 300ms Bloom, heavier Bomb/Blast and sized cuts.
- Recorded sound palette, opt-in audio, haptics, charcoal ground and quiet frame guard.

## What 0.81 changes

- Installed-app snapshots and first composition share the existing dark ground and one reveal.
- Tile art keeps its DOM identity until owner, strength, home or material readiness changes.
  Setup/orientation invalidates it; undo removes it. Unchanged halos/gold/contours do not restart.
  Temporary Bloom contours still compact into the stable outline at the original settling point.
- Product moves skip the unused legacy corner measurement. Root presentation data and inherited
  styles are published only when different, without delaying real turn changes.
- Superseded world painters cancel timers, free canvases/blob URLs and ignore late or out-of-order
  encodes. Diagnostic history is bounded. These are presentation resources, not game-state caches.
- Card presentation mounts early and once. A failed face leaves that suit's text/symbol visible
  without suppressing healthy art. Compatibility wording never rewrites chat or player text.
- Now shows three immediate facts; Cuts, unseen Bombs and the public card record are folded into
  Match record. The clock appears once. Recent meaningful moves are bounded to four.
- Tips starts with the ranked decisions and their evidence, without duplicate readouts. Rules
  remains the existing expandable reference, linked from each tip. No invented prediction or hidden
  opponent information. The reference label also works when Bomb lessons are unavailable.
- Intel tabs support arrows/Home/End, per-tab reading positions, labelled tab panels and stable
  focus during live updates. Closing cancels deferred rule scrolling. Its keyboard events stay
  with the reader; Escape no longer cancels a picked card or skips a move underneath it.
- Public Intel derives paired counts and default move attribution from the viewing seat. The
  application's online adapter already normalises seats; direct model callers are now safe too.
- Reviewed composition baselines, retained-art/asset regressions and full-size CI artifacts protect
  the presentation. Extra regressions now run on release branches as well as fixes and staging.
- The existing motion-cost tool can record CPU profiles, actual phase-only long tasks, style/layout
  work and repeated samples. It remains a measuring tool, never a rule or production telemetry.

No new feature panels, settings, dependency, skin, reward, database object or gameplay rule is added.

## Implementation constraints

Reuse `INTERFACE_MOTION`, `PINNED`, dark-glass and instrument tokens. Keep state authoritative and
presentation separate. Preserve the established animation timings; optimise work rather than
removing the designed beats. Cache by visual inputs, invalidate on setup/material/geometry changes,
and prove changed tiles still repaint. No new runtime dependencies or production telemetry service.

## Verification record

Recorded before release: clean lockfile install, all three strict TypeScript projects, product
builds and asset isolation (futa04:106 files; futa05:109), zero known production dependency
vulnerabilities, 168 information checks, retained-art/strength/undo/resize cases, partial art and
unchanged chat/name checks, 159 Intel checks, 13 play-through checks and installed/browser/BFCache/
JavaScript-disabled launch checks. No engine, bot, server, migration or lockfile diff from 0.8.
The final full local check under Node 20.20.2 passed: 420 files, 4,159 tests, one expected failure
and 66 credential/fixture-dependent skips across six files (426 files / 4,226 tests total).

The first local Node 24.19 run had 4,158 passing tests and one 60s level-9 simulation timeout;
an isolated run also exceeded that limit. The same case passed in 28.07s under CI's Node 20.20.2
without changing code or timeout. Use the matching runtime when reproducing CPU-heavy simulation
results. The complete unit/type suite and browser matrix must be green on the final release SHA.
The preceding `aace0ffe` milestone passed CI 42232629267 (19 jobs) and extra regressions
42232629303 (6 jobs), including WebKit. Final commit runs, screenshots and the successful
publisher's exact ROOT_SHA/TEST_SHA are the release evidence in GitHub Actions.

Physical iPhone/Android testing and credential-dependent live-database integration are not
available here. WebKit covers the Safari engine, not a physical home-screen launch. Native iOS
snapshots precede JavaScript; see `IOS-LAUNCH-20261106.md`. No server rollout is needed for this pass.

### Performance evidence

Full raw samples and methodology: [`evidence/0.81-motion.json`](evidence/0.81-motion.json).
Chromium 154, Linux headless, 390x844, 4x CPU slowdown, three serial samples per move on each build,
with no concurrent suites. Baseline is e8f6ca72 (0.8 plus the launch fix; identical duel rendering).
The probe now measures the action phase, excluding startup long tasks. Values below are medians.

| Move | Style work, ms: 0.8 / 0.81 | Longest task, ms: 0.8 / 0.81 | Frame p95, ms: 0.8 / 0.81 |
| --- | --- | --- | --- |
| Blast | 1298 / 1157 | 427 / 291 | 67 / 83 |
| Bomb | 1427 / 1275 | 545 / 446 | 83 / 100 |
| Huge cut | 1468 / 1433 | 884 / 707 | 117 / 133 |
| Bloom | 667 / 548 | 342 / 206 | 83 / 83 |

Bloom's board-only paint median falls from 32.45ms to 12.2ms (62% less). Fewer root mutations and
retained art are independently asserted, not inferred from noisy frame gaps. Frame p95 is mixed,
including container outliers (one baseline Blast sample:533ms), and does not establish a general
frame-pacing improvement. No universal 60fps or real-phone battery claim is made. The entry bundle
remains about 169kB gzip; no runtime dependency or large texture download is added. A future pass
should profile remaining whole-page style/layout at step boundaries on physical phones before
attempting a wider render refactor or changing the deliberately paced move choreography.

### Visual guard

Current captures: [`screens/match-intel/`](screens/match-intel/).
Actual 0.8 captures from the same seeded fixture: [`screens/foundation-081-before/`](screens/foundation-081-before/).

`futa04-information` now also runs `board-retained` and `futa04-intel-rework`. The latter compares
15 complete screenshots at 320x568, 390x844, 844x390, 768x1024 and 1280x800 with reviewed 24x24 RGB composition
baselines in `web/e2e/baselines/intel.json`. Mean channel error must be <=8/255 and p99 <=42/255 to
tolerate subpixel font/grain differences while catching missing surfaces, changed layout or material.
Semantic, viewport, focus and geometry assertions remain independent and are not replaced by pixels.
The full PNGs are retained in CI's `foundation-081-screens` artifact. For an intentional design change,
run `UPDATE_VISUAL_BASELINE=1 PW_CHROMIUM=<chromium> node --import tsx web/e2e/futa04-intel-rework.ts`,
inspect the full-size captures, then commit both the intended change and updated baseline. Never
set the update variable in CI or automatically accept a failed comparison.
Normal captures show pointer/touch presentation; separate keyboard captures retain visible focus.
A negative-control capture hides the reader and must fail comparison, proving a dark empty screen
cannot silently pass as the intended window. Normal runs write screenshots under `/tmp/v081-intel`
so verification does not dirty the checked-in review images.

## Final source

Resolve the frozen polished source with `git rev-parse v0.81^{commit}` after release. Keep both
`v0.81` and `v0.8-preserved-20261106` fixed; later fixes get a new tag. The working branch is
`release/v0.81-foundation`, integrated by fast-forward into `futa0.5-online`; `live` selects the
owner-authorised promotion. A successful approved-branch publisher and matching release hashes,
not merely a branch move, confirm deployment.

## Restore

Use a fresh checkout of `v0.8-preserved-20261106`, `npm ci`, then the existing channel build and
release workflow with the existing environment configuration. Do not overwrite a dirty checkout.
The original commit remains on release ancestry. For an owner-requested live rollback use
`npm run promote -- 15f80b7c06f2908611624ba6e5b25e2980e6e8f1` and republish from the approved
`futa0.5-online` workflow as `RELEASE-FLOW.md` specifies. A moved ref alone is not deployment proof.

## Startup device feedback follow-up

Fresh-install feedback on an iPhone 15 Pro confirmed that the startup issue was not fully solved.
The production readiness path differed from `/test/`; see [STARTUP-GROUND.md](STARTUP-GROUND.md)
for the focused follow-up, reproductions and the native-device verification boundary.
