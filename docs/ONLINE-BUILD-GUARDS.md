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
away.

The producing workflow is `.github/workflows/futasaku04-preview.yml` → job `build` → step
**`Build /futa0.5/ preview channel`** (`working-directory: futa05`). Its run log shows the env was
non-empty at build time (`VITE_DUEL_API_URL` = the Supabase URL, `VITE_SUPABASE_URL` set, anon key
redacted), and the built chunk names match the deployed ones byte-for-byte. No wiring fix was
needed.

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

Negative-tested locally: with no config the check fails with
`CHANNEL=futa05 build requires VITE_DUEL_API_URL`; with the env present but a config-less dist it
fails with `futa05 build is missing "functions/v1/duel"`.

## 3. Live evidence

`web/e2e/online-live-ping-latency.ts` drives the **deployed** site against the live Edge API:

- create-duel succeeds, find-opponent succeeds, and neither shows `Something went wrong. Try again.`;
- both clients open the `realtime/v1/websocket`;
- a full turn by the on-turn client crosses a turn boundary, the server's broadcast arrives as a
  ping frame, and the waiting client's `/view` refetch lands in **~15 ms** — far under the 900 ms
  `POLL_WAITING_MS` safety net, proving the duel is **ping-driven**, not poll-driven.
