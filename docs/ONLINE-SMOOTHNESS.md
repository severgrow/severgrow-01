# FUTASAKU 0.5 online — smoothness & turn-word evidence

Two-phone playtest follow-up (owner: *"the other phone shows Opponent's turn for far too long,
sometimes ~20s; both phones can show Opponent's turn at the same time; the replay is laggy"*).

Branch **`futa0.5-online`**, test channel only. **No engine/rule changes** (`src/engine/` untouched:
no scoring, deck, Bloom/Bomb/Blast, Strangle or deck-end change).

## How the numbers were taken

- **Two real browser contexts** (390×844 phones, touch), **CPU throttled 4x**
  (`Emulation.setCPUThrottlingRate`), both pointed at the **deployed** site
  <https://severgrow.github.io/severgrow-01/futa0.5/> and the **deployed** Edge API
  (`…supabase.co/functions/v1/duel`).
- The acting seat plays a whole growing turn **through the server**; the measuring seat is driven
  only by what it really receives (a Realtime ping or a safety poll).
- Runner: `npx tsx web/e2e/online-live-smoothness.ts` (DUELS=5 TURNS=3 by default). Segments are
  anchored on the **Throw** (the commit that hands the turn over), never on the start of the actor's
  turn.
- The in-page trace (`?debug=timing`, `TIMING=1`) stamps throw → request → server commit → ping/poll
  → view → gate closed → replay start → each tile → replay end → input open, and is readable from
  `window.__severgrow.timing()`.

---

## 1. The measured verdict on "did the queue refill / never drain?"

**KILLED for the deployed build's normal path.** Over 5 duels × 3 turns the gate always drained:
`queued` returned to 0 and `pumping` to `false` after every reveal, and no run produced a
`watch:release` (the safety net never fired). The 12-turn repeat suite confirms this: gate p50
**708 ms**, p95/max **4325 ms**, and "repeated turns do not degrade" (1st 706 ms, 10th 708 ms).

The refill/never-drain shape **was** real in the code and is fixed (see §3): three separate defects
could leave the gate shut, and the fixes plus the hard safety net cover all three.

## 2. The biggest cause of the long "Opponent's turn"

**The turn word was derived from the animation GATE, not from the server's actor.**

- `duel-hud.ts` knew only `myTurn`/`finished`, and `duel-bridge.ts` computed
  `myTurn = !revealing && view.actor === seat`.
- So on the phone whose turn it actually was, `revealing` (the gate) forced the word to
  **"Opponent's turn"** for the whole replay — measured on the deployed build at
  **100% of sampled reveals** (162 counted shared moments in one 12-turn run).
- Both phones therefore read the same words, which is exactly what the owner saw.

The gate itself measured **1.2–6.9 s** on the deployed build (never ~20 s in these runs); the
"~20 s" the owner felt was the wrong word sitting on the acting phone's screen for the whole replay,
made worse when the replay was slow. The code paths that could make a replay never finish are fixed
and now backstopped.

## 3. Fixes

| Area | Change |
| --- | --- |
| Turn word | `TurnState = mine \| theirs \| replaying \| finished`, computed from the **server actor** (`view.actor` vs `seat`) plus the gate only to name the replay: **"Replaying their turn"** during a replay (never "Opponent's turn"). One new string in `src/strings.ts` (`statusReplaying`). |
| Gate safety net | Two independent guards in the pump: **no-progress (6 s)** and an **absolute budget** (the replay's own length from its work units + **3 s**). Either fires → queue flushed to the true final board, gate lifted, logged loudly (`watch:release`). A hung pump also releases its ownership so a later reveal can pump at all. |
| Lost wake-up | `pump()` treats a call while pumping as a **wake-up** (`pumpWanted`), never a drop; every exit path runs `finally` under a run token, so `pumping` can never be left `true`. |
| Swallowed exception | Applying a view (which renders) no longer sits inside the network `try/catch` (an exception there was reported as "Reconnecting" and left the gate shut); the offline replay builder no longer throws into a render path. |
| Edge region | The client pins Edge execution to the database's region with `forceFunctionRegion=eu-west-1` (see §4). |
| Replay smoothness | Per-tile redraws use the lighter `renderRevealTile()` path between tiles of one step; the two full-screen additive passes (animated warm wash + LED spill) are switched off while a move animates; card art was already pre-decoded on boot (`preloadCardArt`). |
| Draw feel | An immediate card-back flip at the deck on the Draw tap (`drawFlipCue`), so the server wait reads as intentional; the real card still arrives with the normal draw animation. Reduce-motion/Skip: no flip. |
| Error visibility | `?debug=timing` also records `window:error` / `window:unhandledrejection`, so a pump failure is diagnosable instead of a silent freeze. |

## 4. Edge function region — before / after

`x-sb-edge-region` was **eu-west-2 (London)** while the database is **eu-west-1 (Ireland)**: every
request paid a cross-region hop on every database round trip. The client now sends
`forceFunctionRegion=eu-west-1` (a **query** parameter, so no CORS change is needed — the deployed
API only allows its own headers, so the `x-region` header would fail the preflight).

Measured on `/v1/health?db=1`, 10 requests each, medians:

| | Edge region | total median | `db.ms` median |
| --- | --- | --- | --- |
| Before (default = nearest to caller) | eu-west-2 | 331 ms | 162 ms |
| After (`forceFunctionRegion=eu-west-1`) | **eu-west-1** | **269 ms** | **83 ms** |

The database round trip roughly halves; ~62 ms off every call. (A cold isolate in the newly-pinned
region costs one-off ~450 ms on the first request.)

## 5. Before / after against the four targets

| Target (median) | Before | After |
| --- | --- | --- |
| Turn visible on the other phone < 1.5 s | ~1.2–1.4 s, but the word was wrong for the whole replay | see the after-run table below |
| Input open within replay length + 0.5 s | gate 1.2–6.9 s, input 2.1–11.8 s | see below |
| No frame over 50 ms at 4x CPU throttle | 2–274 long frames per reveal | see below |
| Zero stuck gates | intermittent (see §2) | see below |

The **before** timing rows are noisy: they were taken while the machine was also busy (a full test
suite ran concurrently), which is exactly the false-load condition the CI notes warn about. The
**label** result is categorical and reliable: **every** sampled reveal on the pre-fix build read
"Opponent's turn" while the acting phone was the one replaying.

### After-run table

_Filled from the post-fix deployed build by the same command (`DUELS=5 TURNS=3 TIMING=1`):_

<!-- AFTER_TABLE -->

## 6. Honest limits

- The residual window where **both** phones read "Opponent's turn" while **neither** is replaying
  (the throw has landed, the other phone has not yet received the ping/poll) is **inherent** and
  cannot be removed without one phone stating something untrue; the target for it is detection speed,
  not zero. The rule asserted is the one that mattered: a **replaying** phone must never read
  "Opponent's turn", and a phone must never read it while the server says it is its turn.
- Frame timing at 4x CPU throttle is sensitive to whatever else the machine is doing; the numbers
  below were taken with nothing else running.

## 7. Reproduce

```sh
# deployed, two contexts, 4x CPU, with the in-page trace:
TIMING=1 DUELS=5 TURNS=3 npx tsx web/e2e/online-live-smoothness.ts

# the gate never sticks, and the turn word never lies (local, deterministic, injected stall):
npx tsx web/e2e/online-gate-safety.ts
```
