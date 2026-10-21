# Work saved as patches (not as branches)

Two local commits could not be pushed as their own branches on 2026-10-21. The push was rejected
by GitHub, not by git:

> refusing to allow an OAuth App to create or update workflow
> `.github/workflows/futasaku03-preview.yml` without `workflow` scope

GitHub scans every commit reachable from a **new** ref, including old ancestors that already exist
on other remote branches. Both commits sit on histories that contain a workflow edit, so the whole
branch is refused. The credential stored on this machine is an OAuth App token without the
`workflow` scope, so no branch with that history can be created. Nothing was force-pushed and no
existing branch was rewritten.

Both patches were produced with `git format-patch -1`, so they restore the exact commit (message,
author, date, diff):

| Patch | Original commit | Where it lives locally | What it is |
| --- | --- | --- | --- |
| `led-display.patch` | `d154f640a7291947a2f1aff0816b43dbda0f033b` | worktree `/Users/patryk/severgrow-led`, branch `led-display`, parent `afed6b7` | Cockpit LED: sparse, fresh flavour, shorter and clearer messages (8 files, +299/−80) |
| `admin-publish-pending.patch` | `f33163d` | branch `admin-publish-pending` in the main checkout | Publish the admin dashboard at `/admin/` on the futa0.5 deploy (CI workflow only, 11 lines) |

## Restoring one

```sh
# pick a base; the LED work was written against afed6b7, the admin change against futa0.5-levels-31-70
git -C <worktree> checkout -b <name> <base>
git -C <worktree> am /path/to/docs/saved/<patch>
```

If the LED patch no longer applies to today's cockpit (`web/src/player/*`), use `git am -3` and
resolve by hand: it was a presentation-only change (band colours, message length, flavour) and the
shipped cockpit has moved on since. It is archived for reference, not queued for landing.
