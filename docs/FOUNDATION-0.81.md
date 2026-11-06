# FUTASAKU 0.81 foundation

## Recovery and scope

Original live 0.8: `15f80b7c06f2908611624ba6e5b25e2980e6e8f1`, preserved as the annotated
GitHub tag `v0.8-preserved-20261106`. The lockfile, assets, build scripts and configuration references
are part of that source checkpoint. No credentials are captured. The installed-app follow-up starts
at `e8f6ca72`; see `IOS-LAUNCH-20261106.md` for native-iOS limits.

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

## Implementation constraints

Reuse `INTERFACE_MOTION`, `PINNED`, dark-glass and instrument tokens. Keep state authoritative and
presentation separate. Preserve the established animation timings; optimise work rather than
removing the designed beats. Cache by visual inputs, invalidate on setup/material/geometry changes,
and prove changed tiles still repaint. No new runtime dependencies or production telemetry service.

## Verification record

In progress. Record actual results, environment, measurements and limitations here before release.
Chromium automation is available locally. Physical iPhone/Android testing is not available;
GitHub WebKit runs cover the Safari engine but are not physical-device verification.

### Visual guard

`futa04-information` now also runs `board-retained` and `futa04-intel-rework`. The latter compares
12 complete screenshots at 320x568, 390x844, 844x390 and 1280x800 with reviewed 24x24 RGB composition
baselines in `web/e2e/baselines/intel.json`. Mean channel error must be <=8/255 and p99 <=42/255 to
tolerate subpixel font/grain differences while catching missing surfaces, changed layout or material.
Semantic, viewport, focus and geometry assertions remain independent and are not replaced by pixels.
The full PNGs are retained in CI's `foundation-081-screens` artifact. For an intentional design change,
run `UPDATE_VISUAL_BASELINE=1 PW_CHROMIUM=<chromium> node --import tsx web/e2e/futa04-intel-rework.ts`,
inspect the full-size captures, then commit both the intended change and updated baseline. Never
set the update variable in CI or automatically accept a failed comparison.

## Restore

Use a fresh checkout of `v0.8-preserved-20261106`, `npm ci`, then the existing channel build and
release workflow with the existing environment configuration. Do not overwrite a dirty checkout.
The original commit remains on release ancestry. For an owner-requested live rollback use
`npm run promote -- 15f80b7c06f2908611624ba6e5b25e2980e6e8f1` and republish from the approved
`futa0.5-online` workflow as `RELEASE-FLOW.md` specifies. A moved ref alone is not deployment proof.
