# Making the GitHub repository private: plan, cost and flip checklist

Owner-facing. Written 20 November 2026, before the 21 November demo. The repository is **still
public** and this document changes nothing by itself; it records the agreed plan.

## Why the flip is postponed

The demo is on 21 November. Changing the repository's visibility touches the account plan, the
billing budget, GitHub Pages and every workflow that publishes the site or reads the published
bytes. Any one of those going wrong can leave futasaku.com stale or missing during the demo.
So: demo first, flip afterwards, and never flip on the day of a release.

## What "private" costs and what it does not hide

- GitHub Pages on a **private** repository requires a paid plan: **Pro**, **Team** or
  **Enterprise**. It is not available on Free.
- A Pages site built from a private repository is **still a public website**. futasaku.com,
  /test/ and /admin/ stay reachable by anyone with the address; only the source code becomes
  private.
- On a **Free** plan the Pages site would stop being published, and the publish pipeline would
  break with it: [`check-pages-parity.mjs`](../scripts/check-pages-parity.mjs) and
  [`promote.mjs`](../scripts/promote.mjs) read the live published files from
  `https://severgrow.github.io/severgrow-01/` (the same paths the publish workflow uses in
  [`futasaku04-preview.yml`](../.github/workflows/futasaku04-preview.yml)). No published bytes,
  no parity check, no trusted promote.

Plan status: the token used here has only `gist`, `read:org` and `repo` scopes, so the plan could
not be read. The owner must check GitHub -> Settings -> Billing and plans; the plan name must be
`pro`, `team` or `enterprise`, not `free`.

## What one push really costs (measured)

One push to `futa0.5-online` currently bills about **218 minutes, roughly $1.31**, split as:
CI 115, publish 20, server 18, extra regressions 61. Sources: the job graphs in
[`ci.yml`](../.github/workflows/ci.yml), [`futasaku04-preview.yml`](../.github/workflows/futasaku04-preview.yml),
[`deploy-server.yml`](../.github/workflows/deploy-server.yml) and
[`extra-regressions.yml`](../.github/workflows/extra-regressions.yml).

Observed rate 15-20 November: about **12.7 pushes a day** (70 push-triggered CI runs in that
window). At that rate the cost is about 2,770 billed minutes a day, roughly $16.60 a day or
**$500 a month** - far past the ~3,000 included minutes on Pro.

## Agreed cadence and the honest budget note

Batching to about **one release push a day** is the agreed rule. That is ~218 minutes a day,
about 6,540 a month. Pro includes ~3,000 minutes, so one push a day **still runs about 2.2 times
the allowance**: expect roughly $21 a month in overage, plus the plan fee. Fewer pushes, or a
self-hosted runner, are the only ways to bring that down without deleting tests.

## Test tiering (a proposal, to apply only after the demo)

Nothing here is changed yet, and no suite is ever deleted - duplicates are only stopped from
running twice.

| Tier | When | Suites | Cost |
| --- | --- | --- | --- |
| Blocking | every push | check, builds, futa04-critical, lessons-3, turn-guide, territory-menu, territory-gestures, sphere-test, planet-login, cold-start-slow (Chromium and WebKit), online presence, google-return (both engines) | ~61 min |
| Release-branch only | push to `futa0.5-online` | the full release gate already in [`ci.yml`](../.github/workflows/ci.yml) (`browser-release`) | ~22 min |
| Nightly | once a day | visual checks and WebKit duplicates, plus [`extra-regressions.yml`](../.github/workflows/extra-regressions.yml) | ~107 min |
| Manual | before a release | soak, seeds-settle, pwa | no CI cost |

## Flip checklist, in order

1. Confirm the paid plan (`pro` / `team` / `enterprise`).
2. Set a billing spending limit and a payment method.
3. Record the baseline: `/BUILD_SHA`, `/test/BUILD_SHA`, `/test/release.json`, and the HTTP codes.
4. Prove a deploy works **while still public** (one manual publish, same SHA before and after).
5. Flip the repository to private.
6. Verify the site serves the **same SHAs** as the baseline.
7. Re-prove a full publish and a promote.
8. Rollback: make the repository public again; the last published site stays as it was.

## Decisions only the owner can make

- The monthly spending limit, and whether ~$21 overage a month is acceptable.
- Whether to keep a nightly run, or run those checks only on release.
- Whether a self-hosted runner is preferable to paying for minutes.
- Whether an open repository helps credibility in the demo room.
- Whether `/admin/` should stay deployed.

## Note on editing workflows

No workflow file is touched until after the demo, and any future change lands only after the
current CI is green. Workflow edits are not part of the flip.

Sources: [`ci.yml`](../.github/workflows/ci.yml), [`futasaku04-preview.yml`](../.github/workflows/futasaku04-preview.yml),
[`deploy-server.yml`](../.github/workflows/deploy-server.yml), [`extra-regressions.yml`](../.github/workflows/extra-regressions.yml),
[`docs/RELEASE-FLOW.md`](RELEASE-FLOW.md), [`scripts/check-pages-parity.mjs`](../scripts/check-pages-parity.mjs),
[`scripts/check-pages-parity-root.mjs`](../scripts/check-pages-parity-root.mjs),
[`scripts/promote.mjs`](../scripts/promote.mjs).
