# RESUME HERE — 20 November 2026, 16:55

Written at shutdown. Demo is **Saturday 21 November, ~50 people**. Read this first, then
`docs/PLAYTEST.md` (the runbook) and `docs/RELEASE-FLOW.md`.

## Where the release line stands

| | |
| --- | --- |
| `/test/` serves | `124db862` — verified working |
| live (`futasaku.com`) | `ddf8ec17` — **not promoted** |
| Server / Edge | deployed at `124db862`, proven by `/v1/health` |
| Branch head `futa0.5-online` | `124db862` |

Nothing is broken. If the demo started right now it would work.

**Before people arrive:** open `/test/`, load the Planet and the achievements list (cold first
read measured ~24 s in a bad server moment, warm ~0.4 s). Then run `npm run demo:monitor` from
`/Users/patryk/sg-futa-alert` and leave it visible.

## Branches ready to land (all pushed, all green)

| Branch | Head | What | Verified |
| --- | --- | --- | --- |
| `integrate/demo-signin-led` | `1c386a17` | Sign-in patience + LED fixes | full suite 535/5,177; Google suite Chromium **and** WebKit incl. the 3.5 s case; cockpit suite |
| `fix/online-moment-beat` | `83b28eba` | Opponent's big online move gets the offline beat/banner | full suite; 2-browser replay suite 9/9 |
| `fix/landscape-hand-targets` | `d0ed47bf` | Two-row hand on short landscape (33pt → 59pt strips, map untouched) | 44pt gate now a real passing test at 2 sizes; 834 browser checks |
| `ops/demo-alert` | `b0f99970` | `npm run demo:monitor` — server vs site vs phone | 25 tests; ran live, all 3 targets UP |
| `fix/api-error-cors` | `d85ae5ce` | Node adapter's last-resort 500 had no CORS | 7 tests |
| `feat/match-notifications` | `7c9ae2b0` | Web push for your turn + challenge nudges. **DARK** — needs VAPID keys, 4 Edge secrets, migration 0031, Edge deploy | full suite green |

Merge order if you land them: moment beat → CORS → landscape → sign-in/LED → notifications
(notifications last; it needs the deploy steps). **One push at the end**, not one per merge —
each push costs a full ~218-minute CI run.

## Work in progress — NOT verified, do not trust

| Branch | Head | State |
| --- | --- | --- |
| `feat/six-beautifiers` | see `git log` | Six refinements written + a test file, committed as WIP at shutdown. **No verified full-suite run** — two attempts were killed (EXIT=143) and the machine was contended. |
| `fix/bomb-animation-frame` | see `git log` | Bomb card clipping + shared `web/src/logic/strike.ts` curve (test asserts one module, imported, never a copy). WIP commit, **not verified**. |
| `fix/oppgrow-rectangle` | `124db862` | **Nothing done.** Only a throwaway probe, deleted. The rectangle during the opponent's grow is still unfixed. |
| `feat/more-animation-joy` | `13541cd2` | 3 commits (strengthen tile answer, turn-start hand glow, score click). Never had a verified full run. |

## Open owner actions

1. **Sign-in on `/test/`** — if it misbehaves in the room, wait a few seconds and tap
   *Try Google again*. The fix exists on `integrate/demo-signin-led` but is not deployed.
2. **Promote** — only on the owner's word. `/test/` → live is ~20 minutes.
3. **Repo private** — ~2 days. Needs **Settings → Billing and plans** to say `pro`+, plus a
   payment method and a spending limit. See `docs/REPO-PRIVATE.md`.
4. **`DATABASE_URL` secret** (optional) so migrations apply automatically. None pending today.

## Known-broken, not ours, do not chase

- `web/e2e/futa04-display-glow.ts` — fails on clean base too (stale 6s wait). Not in any workflow.
- `scripts/compose-futa05-preview.mjs` — fails in a fresh worktree (no built dist). Environmental.
- `docs/PLAYTEST.md` rate limits were resized for ~50 testers on shared wifi (120 creates/hour,
  400 joins, 200 guests).

## Worktrees

Everything lives under `/Users/patryk/sg-futa-*`. `sg-futa-handoff` is the main release checkout
(clean at `124db862`). `sg-futa-base` is a clean base at `124db862` for before/after comparisons.
All worktrees are clean; nothing is uncommitted.
