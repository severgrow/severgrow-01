# Online build guards + the `/futa0.5/` config false alarm

Branch `futa0.5-online`. Two things are recorded here: why the live `/futa0.5/` bundle was
believed to be "missing its online config" (it was not), and the hard guards now added so a
genuinely empty online config can never ship silently again.

## 1. The live bundle DID carry its config

Inspecting the live `/futa0.5/` at `release.json` commit `f78689be14`:

- `web/dist/index.html` references **11 entry chunks** (anim, board, channel, effects, engine-ext,
  geom, index, layout, led-flavour, names, strings). None of those contain the Supabase host — by
  design, because the whole online layer is **lazily imported**.
- The entry chunk `index-*.js` dynamically imports `online-*.js` and `config-*.js`. Those lazy chunks
  **do** contain the config, e.g. `assets/config-Cw-XWR-u.js`:

  ```
  VITE_DUEL_API_URL: https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel
  VITE_SUPABASE_URL: https://wbfrbeedlvjercrukngn.supabase.co
  VITE_SUPABASE_ANON_KEY: eyJhbGci…  (present)
  ```

  and `assets/online-*.js` contains `realtime/v1/websocket`.

So a scan that only downloads the 11 chunks named in `index.html` is a **false negative**: those
files legitimately do not contain the online config. The online config lives one dynamic-import hop
away. A crawl that follows dynamic imports finds it:

```
release.json commit: f774172d88c17f9604457180541702385fb5ce8c
js crawled: 40   host: [online-Bw5hJHut.js, config-Cw-XWR-u.js]
                 duel: [online-Bw5hJHut.js, config-Cw-XWR-u.js]
                 ws:   [online-Bw5hJHut.js]
ALL 3 MARKERS PRESENT: true
```

The producing workflow is `.github/workflows/futasaku04-preview.yml` → job `build` → step
**`Build /futa0.5/ preview channel`** (`working-directory: futa05`). Its run log shows the env was
non-empty at build time (`VITE_DUEL_API_URL` = the Supabase URL, `VITE_SUPABASE_URL` set, anon key
redacted), and the built chunk names match the deployed ones byte-for-byte. No wiring fix was
needed.

The five repository variables are **repository-scoped** (`actions/variables` → `total_count 4`,
exact names `FUTA05_API_URL`, `VITE_DUEL_API_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`);
the only environment is `github-pages` (deploy job, unrelated). Repo-scoped variables are visible to
every job, so environment scoping is not a factor. **Log evidence that the env reached the build**
(run `38419581633` step `Build /futa0.5/ preview channel`, and the same block in the deploy run):

```
env:
  CHANNEL: futa05
  VITE_FIND_OPPONENT: 1
  VITE_DUEL_API_URL: https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel
  VITE_SUPABASE_URL: https://wbfrbeedlvjercrukngn.supabase.co
  VITE_SUPABASE_ANON_KEY: ***   (non-empty; GitHub masks the value)
```

## 2. Hard guards (the real deliverable)

`scripts/check-channel-assets.mjs` now, for `CHANNEL=futa05` only:

- asserts `VITE_DUEL_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are all non-empty;
- asserts the **built output** actually contains `functions/v1/duel`, `realtime/v1/websocket` and the
  Supabase host, scanning **every emitted JS file** (the script already concatenates all of
  `web/dist/assets/*.js`, so lazy chunks are covered — the exact trap above).

Both workflows that build `/futa0.5/` now fail loudly instead of shipping a config-less bundle:

- `futasaku04-preview.yml` (the step that produces the live dist): the old
  `node scripts/check-channel-assets.mjs || true` (which made the check toothless) is gone, and a
  `for v in VITE_DUEL_API_URL VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY` non-empty loop runs first.
- `futa05-preview.yml` (artifact-only build): same change.

Neither touches `pages.yml` or the locked `futa0.4` / Main build path.

**The stale-workflow-copy gap, closed in the build itself.** `futasaku04-preview.yml` also triggers
on pushes to `futa0.4`, and GitHub runs the workflow file from the **ref that triggered the run**.
`futa0.4`'s copy still has the old `|| true` checker, so a `futa0.4` push would rebuild `/futa0.5/`
with a checker that cannot fail the step. To make the guard independent of which ref triggered the
run, `web/vite.config.ts` now refuses to build `CHANNEL=futa05` without the three variables:

```ts
if ((process.env.CHANNEL ?? '') === 'futa05') {
  const required = ['VITE_DUEL_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;
  const missing = required.filter((key) => !(process.env[key] ?? '').trim());
  if (missing.length > 0) throw new Error(`CHANNEL=futa05 build requires ${missing.join(', ')} …`);
}
```

`npm run web:build` is never `|| true`-guarded, so a throw here always fails the deploy step, no
matter how old the workflow copy is. Locally: `CHANNEL=futa05 npm run web:build` exits 1 with the
message above; with the variables set it builds; the default `futa04` build is untouched.

The reliable trigger for `/futa0.5/` is therefore a push to `futa0.5-online` (or
`workflow_dispatch` on `futa0.5-online`), which uses this branch's workflow copy.

Negative-tested locally: with no config the checker fails with
`CHANNEL=futa05 build requires VITE_DUEL_API_URL`; with the env present but a config-less dist it
fails with `futa05 build is missing "functions/v1/duel"`.

## 3. Live evidence

`web/e2e/online-live-ping-latency.ts` drives the **deployed** site against the live Edge API:

- create-duel succeeds, find-opponent succeeds, and neither shows `Something went wrong. Try again.`;
- both clients open the `realtime/v1/websocket`;
- a full turn by the on-turn client crosses a turn boundary, the server's broadcast arrives as a
  ping frame, and the waiting client's `/view` refetch lands far under the 900 ms `POLL_WAITING_MS`
  safety net (measured across runs: ~15 ms, 34 ms, 111 ms, 737 ms, 760 ms — the safety-net poll
  cadence itself is ~1.5 s), proving the duel is **ping-driven**, not poll-driven.

