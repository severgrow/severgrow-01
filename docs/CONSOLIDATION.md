# FUTASAKU 0.5 consolidation — online + tutorial + display glow

> **Status pointer:** [`ONLINE.md`](ONLINE.md) is the index for the online-duels work. This is a dated consolidation record; live duels landed afterwards.

One combined best version on `futa0.5-online`, verified green as a whole and shipped to the
live `/futa0.5/` preview. `/futa0.4/`, `main` and `dev` are untouched.

- **Consolidation merge tip** (contains online + tutorial + glow): `5f8ba074da47dd5c62302ab187e8692ad5d47b19`
- **Tutorial merge commit:** `8e91520952351cc5d3f7fc913fb0365f16399329`
- **Display-glow merge commit:** `5f8ba074da47dd5c62302ab187e8692ad5d47b19`
- **Live `/futa0.5/`:** <https://severgrow.github.io/severgrow-01/futa0.5/> — built from the
  `futa0.5-online` tip, i.e. the consolidation merge above plus this evidence/report commit

---

## What was merged

### 1. `origin/futa0.5-tutorial` (`555067b`) → `futa0.5-online`

One "Tutorial" menu entry, the lesson list and the in-match "?" removed, the moves reference
moved into Match Intel as a second "How to" tab, and the idempotent `showScreen` boot fix.

**Conflicts: none.** The tutorial branch was cut from `79e8a9f`, and the online branch's only
`main.ts` change since then was the honest computer-fallback block near the lobby import — a
different region from the tutorial's edits. Git auto-merged; I then verified both change sets
survived by inspection rather than trusting the clean merge:

| File | Online change that had to survive | Tutorial change that had to survive | Result |
| --- | --- | --- | --- |
| `web/src/main.ts` | `startComputerGame` fallback in the lobby wiring | `howToReferenceHtml` import, idempotent `showScreen` (`shownScreen`, `!same`), `startTutorialFromMenu`, `openHowToReference`, `INTEL_TABS`/`openIntel(tab)`, `appReady`, removal of `syncTutorialMenu`/`startExtraLesson`/`bind('hint-btn')`/`bind('go-lessons')`/`go-lessons` line | both present; no dangling references |
| `src/strings.ts` | `ONLINE` punchy copy (`searchParkedTitle`, `graceYourWarning`, shorter errors) | new `HELP` block (`tutorial`, `intelTab`, `howToTab`, `howToTitle`, `tutorialFinal`) | both present (different regions) |
| `web/index.html` | online hub/waiting/join, `online-search-options`, `online-matched` | `#menu-tutorial` renamed + `aria-expanded`/`aria-controls` dropped, `menu-lessons-list`, `#hint-btn`, `#go-lessons` removed | both present; removed ids gone |
| `web/src/player/glass-surface.ts` | — (online did not touch it) | Match Intel two-tab bar (`intel-tabs`, `intel-tab[data-intel-tab]`, `howToHtml`) | tutorial version present |
| `web/src/player/player-css.ts` | — (online did not touch it) | `#hint-btn` rules removed | tutorial version present |

### 2. `origin/futa04-display-glow` (`e1ee9c7`) → `futa0.5-online`

The display→keys **reflected-light** optics: light falls on the matte keys from above (thin top-edge
catch, seam light, one-row decay) instead of each key animating its own glow. Also tight rims on the
board's own re-prompt cues.

> Note: the owner described this branch's tip as `fed32a5`; the actual fetched tip is `e1ee9c7`,
> two doc-only commits further on (`f4a970a` adds the glow QA frames/notes, `e1ee9c7` corrects two
> measured ranges in `docs/DISPLAY-GLOW.md`). Both are included.

**Conflict: one, in `docs/DECISIONS.md`** — both branches appended an entry at the end of the file.
Resolved by keeping **both** sides (the two tutorial entries and the display-glow entry), and
correcting the glow entry's closing line to record that it is now merged into `futa0.5-online`.

**Only code file the glow branch changes:** `web/src/player/smart-cockpit.ts` (mode clean-merged,
so the glow version is the surviving behaviour). `web/src/style.css` and `web/src/player/branding.ts`
were **not** touched by the glow commits, so the conflicts the owner anticipated there did not occur —
those files' online changes simply passed through untouched.

Verified in the merged `smart-cockpit.ts`:

- **No self-emission** — `smart-chrome-pulse` / `smart-chrome-alarm`, the per-mode `--chrome-glow` /
  `--chrome-hot` blocks and their keyframes are gone; `futa04-hardware-reflect` is narrowed to
  `#smart-led::before` (the display bezel catching its own flash) only.
- **Reflected light survives** — `#smart-led-spill` paints rims, seams and a one-row falloff with a
  two-layer intersected mask; `#smart-led-spill-cells` retired; `--spill-opacity` `.14–.18`.
- **Board re-prompt cues kept as the glow branch left them** — tight rims, not the old outward
  halos: `idle-urgency-draw` → `0 0 0 1px … , 0 1px 4px rgba(242,237,224,.20)`; `idle-urgency-grow`
  → opacity only (the `brightness()` bump removed); `idle-urgency-throw` → `0 0 0 1px … , 0 1px 4px
  rgba(220,70,45,.34)` with scale `1.04`. Not "restored".

### Extra futa0.4 commits that arrived

**None.** `origin/futa0.4`'s tip (`304f891`) is already an ancestor of `futa0.5-online`, and the glow
branch is based on exactly `304f891` — so the glow merge brought the four glow-branch commits above
(`3d5cbfe` optics, `f4a970a` QA, `fed32a5` approval note, `e1ee9c7` doc correction), a new e2e file
(`web/e2e/futa04-display-glow.ts`) and `docs/screens/glow/**`, but **no additional futa0.4 product
commits**. Nothing online or tutorial regressed: the only glow code file is `smart-cockpit.ts`, which
neither the online nor the tutorial work touched.

`src/engine/` was not changed by either merge. The one diff vs `futa0.4` in `src/engine/events.ts`
(`hidePrivateEvents` extraction, `eventsFor` delegating to it) predates the merges — it came from the
online backend commit `65b0110` and preserves the hidden-information semantics. The rules version
stays `futasaku0.4-strength-draw`.

---

## Verification (real commands, real results)

| Command | Result |
| --- | --- |
| `npm run check` | **green** — 161 files passed, **1598 passed + 1 expected fail**; 483.5s. The bot-simulation suites (`tests/bots/levels`, `bloom-bands`, `fruitcards`) passed. |
| `npm run server:db-test` | **21 passed** (1 file), 22.8s — ran, did not skip |
| `npm run server:verify` | **VERIFICATION PASSED** (21 DB tests + in-process end-to-end smoke) |
| `npx tsx web/e2e/futa04-tutorial-flow.ts` | passed ("Complete tutorial, touch-controlled free turn, and eight responsive layouts passed") |
| `npx tsx web/e2e/futa04-tutorial-lock.ts` | `futa04-tutorial-lock: ok` |
| `npx tsx web/e2e/futa04-information.ts` | 168 information checks passed |
| `npx tsx web/e2e/futa04-tutorial-intel.ts` ×5 | **5/5 passed** — the previously-flaky suite is green on the merged tip |
| `npx tsx web/e2e/futa04-smart-cockpit.ts` | 882 smart cockpit checks passed |
| `npx tsx web/e2e/futa04-micro-polish.ts` | passed |
| `npx tsx web/e2e/futa04-display-glow.ts` | pass; 22 frames per phase |
| `npx tsx web/e2e/online-find-opponent-states.ts` | passed (parked search, honest offers, computer fallback, matched prompt, duel opens) |
| `npx tsx web/e2e/online-starter-chip.ts` | passed (exactly-once lottery, perspective chip, refresh/async) |
| `BASE_URL=http://localhost:4207 STUB=1 npx tsx web/e2e/online-lobby-overlay.ts` | passed (hub/waiting/join as real screens at 4 viewports) |
| `npx tsx web/e2e/combined-shots.ts` | passed; combined evidence written to `docs/screens/combined/` |
| `CHANNEL=futa04 npm run web:build` + `node scripts/check-channel-assets.mjs` | built; `futa04: asset isolation passed (78 files)` |
| `CHANNEL=futa05 npm run web:build` + `node scripts/check-channel-assets.mjs` | built; `futa05: asset isolation passed (79 files)` |

The DB-backed suites ran against the configured Supabase database; no rows were created by the browser
suites (they use an in-memory `MatchService` or a stubbed `duel-stub.invalid` API), and the transient
`vite preview` servers were shut down after use.

### Still-open

- **Device/browser matrix spot-check against the live site** is the only item not run locally as part
  of this pass; it drives the live Edge API and the live `/futa0.5/` build, so it is run after the
  deploy (see below). Everything else is green.

---

## Screenshots

`docs/screens/combined/`, at `390x844` and `1280x800`:

- `menu-*.png` — main menu with the single "Tutorial" entry
- `online-hub-*.png` — the "Play online" submenu
- `invite-*.png` — the created-duel invite screen
- `duel-strip-*.png` — the live duel board with the trimmed status strip (no Resign / who-starts / deadline chips)
- `match-intel-howto-*.png` — Match Intel on its "How to" tab
- `cockpit-glow-*.png` — the cockpit panel with the reflected-light optics

Regenerate with `npx tsx web/e2e/combined-shots.ts` (it builds a local `CHANNEL=futa05` app against an
in-memory duel API, so it needs no network).

---

## Live `/futa0.5/`

Pushing `futa0.5-online` runs `.github/workflows/futasaku04-preview.yml`, which builds `/futa0.5/`
from the pushed tip (`CHANNEL=futa05`, `VITE_FIND_OPPONENT=1`), recomposes it into the existing Pages
tree via `scripts/compose-futa05-preview.mjs`, and rebuilds Main/Test/Test2 at their **published**
SHAs with a byte-parity check. `pages.yml` and the locked `/futa0.4/` deploy path are not modified.

- **Before:** `/futa0.5/` `release.json` commit `40ec874…`, `BUILD_SHA` `40ec874…`
- **After:** `/futa0.5/` `release.json` commit and `BUILD_SHA` equal the deployed `futa0.5-online`
  tip (the consolidation merge `5f8ba07…` plus the evidence/report commit)

`/futa0.4/`, `main` and `dev` were not modified, merged into, reset, rebased or deployed.

Edge function: no server code changed in either merge (`server/` and `supabase/` are byte-identical to
`40ec874`), so no Edge redeploy was required; the live Edge health + `?db=1` are smoke-tested instead.

---

## What is NOT green

Nothing in `npm run check`, the DB/server suites, or the browser suites is red. The single item
deferred is the live device/browser matrix spot-check, which can only run against the deployed
`/futa0.5/` + Edge API and is run immediately after the deploy.
