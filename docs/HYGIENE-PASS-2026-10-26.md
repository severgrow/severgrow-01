# Code hygiene pass — 2026-10-26

A zero-behaviour-change pass: verify the historical architecture findings against today's code,
make only the changes that can be proven safe, and write down the rest with a plan. The game must
look, play and save exactly as before.

- **Baseline:** `futa0.5-online` @ `c1c4c07` — the commit live on futasaku.com when the pass began.
- **Branch / worktree:** `refactor/futasaku-code-hygiene`, in its own `git worktree`.
- **Not merged, not deployed.** Integration is the owner's call.

## 1. Verified audit — the historical findings, checked against today

| Historical finding | Today | Verdict |
| --- | --- | --- |
| `main.ts` ~3,900 lines | **10,790 lines**; 618 top-level declarations (329 functions); **206 module-level `let`s**; 149 imports | **Worse, and the real problem is the shared state**, not the length (see §3) |
| `Storage.prototype` patch in `channel.ts` | Still there; prefixes `getItem/setItem/removeItem` on local **and** session storage per channel | **Still present — load-bearing** for every player's saves (see §4) |
| Injected CSS in `player/information.ts` | Still injected — and so are 19 other feature modules | A deliberate, consistent **feature-owns-its-styles** pattern, not drift |
| Accumulated override layers | `style.css`: 8,026 lines, 1,498 rules; **0 exact duplicate rules, 0 repeated declarations**; 66 selectors defined in more than one place (layered overrides); 17 `!important` | Overrides are intentional cascade; merging them changes which rule wins |
| Circular imports | 3 cycles found by `madge` — all **type-only in one direction** (erased at compile time) | **No runtime cycles.** Now pinned by a test |
| Dead code | 3 one-line re-export shims nothing imports; ~940 lines of archived skin code nothing imports; 3 small modules used only by tests; 471 unused-export lines (mostly types) | Shims removed; the rest kept and listed (§5) |
| Type safety | `strict` + `noUnusedLocals/Parameters` on; `as any` ×2, `: any` ×9, `as unknown as` ×20, no `@ts-ignore` | Good. No action |
| Linting | No linter configured | Noted; not added (new dependency, repo-wide diff) |

## 2. What this pass changed

| Commit | Change | Behaviour change |
| --- | --- | --- |
| `c3cff4d` | `web/tests/storage-prefix-contract.test.ts` — pins the storage patch's full observable contract | none (test only) |
| `c460ea2` | `web/tests/import-cycles.test.ts` — fails on any runtime import cycle; proven to catch a planted one | none (test only) |
| `38829d5` | Removed `web/src/lab-mode/guide.ts`, `web/src/lab-mode/thumb.ts`, `web/src/names-core.ts` (one-line re-exports, imported by nothing) | none — unreachable from every entry point |
| (this commit) | `docs/ARCHITECTURE.md` (module map, mount pattern, styles, storage, parallel work); a short pointer in `AGENTS.md`; this report | none |

## 3. Why `main.ts` was not split in this pass

Measured with the TypeScript compiler (dependency closure of every top-level declaration):

- Only **~400 of 10,790 lines** never touch the shared module-level state, directly or through helpers.
- Every large section (lessons, layout, input, painting a Bloom, the drag layer, the product menu)
  reaches a single connected core of **~7,000 lines** through that state.
- The largest group that could move out *with* the state only it uses is **~190 lines** (the
  lesson plate and example cards) — and that region was edited 4 days ago.
- `main.ts` had **104 commits in the week before this pass**; any move collides with parallel work.

Moving code without moving its state would change who owns the state — out of scope here. The
safe route is the two-step plan in §6.

## 4. Why the storage patch was not removed

Every save, setting, identity and progress key is read and written through the patch, so its exact
behaviour *is* the save format. Findings:

- 23 direct `localStorage`/`sessionStorage` item calls in 8 files, plus the duel client's
  `browserStorage()`; all use only the three patched methods.
- Nothing calls `key()`, `length` or `clear()` (the unpatched members) today.
- No third-party library writes to storage.
- The patch is not idempotent: a second copy of `channel.ts` on the page would prefix twice.

A replacement is feasible but needs a browser save-compatibility test (write with the old build,
read with the new) that this pass cannot run against real players' data. The contract is now pinned
by tests so the replacement can prove equivalence; the plan is §6.

## 5. Kept on purpose (reported, not deleted)

- `web/src/ui/skin/SkinBoardView.ts` (816 lines) and `web/src/skins/forestVolcanoV3.ts` (123 lines):
  imported by nothing; `AGENTS.md` says skins will return later. Owner decision.
- `web/src/logic/levels-ui.ts`, `web/src/ui/levelIcons.ts`, `web/src/logic/colorcheck.ts`: used only
  by tests (and a palette report script). Removing them means removing tests too — owner decision.
- `main.ts`: 75 `addEventListener` vs 7 `removeEventListener`. Most bind once at boot to permanent
  elements; whether any are added repeatedly is a bug hunt, not a refactor — not changed here.

## 6. Deferred — the plans

### Split `main.ts` (two steps, in a quiet window)

1. **Move the state, not the code.** Create `web/src/app/state.ts` exporting one object that holds
   the session-level variables (`session`, `settings`, `coach`, `queue`, `epoch`, …). Rewrite
   `session` → `app.session` throughout `main.ts`. Purely mechanical (one find-and-replace per
   variable, checked by the compiler) — but it touches hundreds of lines, so do it when **no other
   agent is editing `main.ts`**, in one commit, with the full CI browser matrix.
2. **Then move sections, one per commit**, lowest coupling first: the product menu (~380 lines),
   the drag layer (~550), painting a Bloom (~800), the layout (~1,700), the lessons (~1,200). Each
   becomes a module that imports `app` and exports what `main.ts` calls. Relocation only.

### Replace the storage patch

1. Add `web/src/logic/storage.ts`: a `KeyValue` adapter that applies `STORAGE_PREFIX` explicitly,
   identical to the patch (contract tests must pass against it unchanged).
2. Move the 8 files and the duel client's `browserStorage()` onto it (the client takes the prefix as
   a parameter — it must not import `channel.ts`).
3. Add a guard test: no direct `localStorage`/`sessionStorage` item calls outside the adapter.
4. Browser save-compatibility test: save with the previous build, load with the new one, every channel.
5. Only then remove the patch from `channel.ts`.

### Styles

Leave the 66 multiply-defined selectors as they are unless a screen is being redesigned anyway; then
merge that screen's rules with before/after screenshots. Do not consolidate CSS for its own sake.

## 7. Verification

**The decisive check — the game players receive is unchanged.** With the build timestamp pinned
(`DEPLOYED_AT`), every channel built from this branch is **byte-for-byte identical** to the same
channel built from the live commit `c1c4c07`: futa04 (118 files), futa05 (119), futa-test (118) and
live (78). The pass changes only tests and documentation, plus three files no build ever included —
so appearance, behaviour, saves, network contracts and performance are unchanged by construction.

The full suite was still run before and after (same script, same machine):

| Check | Baseline `c1c4c07` | After `38829d5` |
| --- | --- | --- |
| Typecheck (root, web, admin) | pass | pass |
| Unit tests (`vitest`) | 3,131 passed, 0 failed, 65 skipped | 3,140 passed, 0 failed, 65 skipped (+9 new) |
| Builds + asset isolation: futa04 / futa05 / futa-test / live | 4/4 pass | 4/4 pass |
| Bundle size (JS / CSS), futa04 | 1,227,925 B / 135,244 B | identical |
| Bundle size (JS / CSS), futa05 | 1,226,283 B / 132,147 B | identical |
| Browser: smoke, painting, overhaul, fruitcards, propass, monkey | pass | pass |
| Browser: emptyturn | fail — timing (580/623 ms vs a 600 ms band) | pass |
| Browser: futa04-critical | pass | fail once (a double-tap timing check at 1920px), then **pass ×3** on re-run |
| Browser: futa04-information | fail — one ink-rule pixel check | pass |
| Browser: futa04-motion | fail — "a Severe cut flinches its neighbours (0)" | pass |
| Browser: futa04-tutorial-intel, tutorial-lock, cut-severe, lessons-3 | pass | pass |
| Browser: replay-offline, replay-duel, replay-video, replay-campaign, online-replay-turn | pass | pass |
| Browser: replay-surprises | 2 fail — the headless share-sheet stub | same 2 fail |

Every red row is environmental, not a regression: the builds are identical, the same checks pass in
GitHub CI on `c1c4c07`, and each flips between runs on this machine (a newer Chromium, 153, than
CI's). `replay-surprises`' share checks fail identically before and after.

Not available here: a performance benchmark beyond bundle sizes (none exists; identical builds make
one moot), the database-backed server suites (no database configured in this environment), and the
device matrix against the live site.

## 8. Integration

- Visible branches: every active feature branch on GitHub is already merged into `futa0.5-online`
  (0 commits ahead), so nothing pushed conflicts.
- This branch changes: two new test files, three deleted files nothing imports, two new docs and a
  few lines appended to `AGENTS.md`. **It does not touch `main.ts`, `style.css`, `strings.ts` or any
  game code** — the only conflict possible is with someone else editing `AGENTS.md`'s end, resolved
  by keeping both.
- Unpushed local work (e.g. Cursor on the owner's Mac) cannot conflict except through `AGENTS.md`.
- To integrate: fast-forward or merge `refactor/futasaku-code-hygiene` into `futa0.5-online` after
  CI is green on it. Deploying is a separate, owner-approved step.
