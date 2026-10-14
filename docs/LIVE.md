# FUTASAKU live duels (futa-test and the `/futa0.5/` preview)

> **Status pointer:** [`ONLINE.md`](ONLINE.md) is the index; this is the reference for live duels.

Branch `futa0.5-online` (merged; the live work came from `futa0.5-live`). Not in the locked build, not
in `main`, `dev` or `futa0.4`. The product build (`CHANNEL=futa04`) never shows any of this.

## Which builds carry it (reversible)

`liveDuelsEnabled()` (`web/src/online/live/flag.ts`) turns live duels on for:

- `CHANNEL=futa-test` (the experiment copy), and
- `CHANNEL=futa05` (the `/futa0.5/` online preview), and
- any build made with `VITE_LIVE_DUELS=1` (the browser tests).

The owner asked for `/futa0.5/` to carry everything ("0.5 should be the main one with everything"),
so `futa05` was ADDED to that list on 2026-10-14. This reverses the other session's deliberate
test-only gate. **It is a one-line revert:** remove `'futa05'` from `CHANNELS_WITH_LIVE_DUELS` in
`web/src/online/live/flag.ts`. The product `futa04` build stays off either way.

## What it is, in plain words

Two players who already share an online match can switch that **same match** to a short clock:
**60 seconds per turn** instead of 24 hours. (Owner's change, 2026-10-14: it was 45 seconds.) The board, the cards, the score and the rules do not
change. Real time is **high-stakes: you cannot step away from it.** Leaving real time forfeits the
match (you lose, reason `resigned`), and running out of time loses it (reason `timeout`). There is no
way back to 24-hour turns once it starts. Closing the tab is not an escape: the clock keeps running
on the server, so you lose by timeout. Normal (24-hour) duels are untouched and stay forgiving —
leaving them is free, and their first missed turn only warns and extends.

## The flow

1. **Real time.** In a match whose opponent has the app open, a quiet `Real time` label appears in
   the status strip at the top (plain text: no chip, no frame). Disabled states: **In real time**
   (you or them), **Not available**
   (they switched challenges off), **Busy** (they are in the tutorial), **Try real time again later** (too
   many tries). Hidden when they are offline.
2. **Waiting.** Tapping it sends a challenge; the label becomes `Waiting 40s · Cancel` (on wide
   screens `Waiting for <name>` with the seconds counting down and the animated ellipsis). One open challenge per match.
3. **The pop-up.** The other player sees it **anywhere** in the app — a computer game, another
   online match, the menu — in the same dark glass as Match Intel: their name, "wants a real time duel",
   "Same match · each turn has a countdown", a short **Leaving real time loses** warning (with the fuller rule
   under it), a thin ring counting down the 45-second expiry, and two 44 px buttons: **Accept** and
   **Not now**. A soft two-note chime and a light buzz (only if Sound /
   Vibration are on). While it is open, the game underneath ignores taps.
   - It never appears **during a drag or a Bloom paint** (it waits as long as that lasts), and it
     waits for an **animation or the opponent's turn replay** to finish (at most 10 seconds).
   - It never appears **during the tutorial**; the challenger sees "Busy".
4. **Not now / no answer.** The challenger sees a quiet "<name>: Not now" or "No answer" line.
5. **Accept.** Both screens play a 600 ms moment: both homes pulse, the plain `m:ss` clock appears in
   the header, a short sound. The real-time clock starts.
6. **Where you were is kept.** If you accepted from a computer game, that game is saved exactly as it
   was (the normal Continue save). From another online match, its unsent moves stay in that match's
   own session storage. The app remembers "Back to your game".
7. **The end.** When the duel ends (a resignation, a real-time timeout, or the board itself), a glass
   window offers **Back to your game** (or match / menu) and, after a finished match, **Rematch**.
   If both press Rematch, a **new** match starts, already live (the engine's usual lottery decides
   who starts), and "Back to your game" still points at what you were doing before.

## The live clock

- The remaining time is ALWAYS shown in the header's status strip (the owner's "invisible box"
  between the menu button and the logo), written into that strip's own time slot as `m:ss`, in the
  material of whose turn it is. It is not a live region: the words change every second and only the
  thresholds are announced. Leaving live hands the slot back to the 24-hour urgency rule.
- A thin arc drains around the home of the player whose turn it is, fitted inside the tile. The
  arc's LENGTH is the time left and its colour runs green → orange → red across the turn — the same
  on both homes, because the colour means time and the home it sits on says whose turn it is. It
  gains weight near the end. The chip shows seconds under 10, a soft tick plays each second under 5
  on your turn, and the screen edge glows faintly (not with Reduce motion). Screen readers hear
  "N seconds left" only at 10, 8, 6, 4, 2 and "Time's up".
- **The server keeps the time.** A turn's clock starts when the previous turn was thrown **plus a
  6-second allowance** to watch that turn's replay (no replay-length report exists in the current
  client, so the fixed allowance is used). Draw / Grow / Throw inside a turn never reset it.
- **Going live mid-turn:** the player whose turn it is gets the live limit **plus 15 seconds**.
- **Time's up:** the server plays the rest of that turn — Draw from the deck (the throw pile only if
  the deck is empty), skip Grow, throw the card just drawn — always choosing from the engine's own
  legal moves, using only that player's own view. That player gets a **strike**.
- **Time's up while you are CONNECTED = you lose.** If the clock runs out on your turn and your
  heartbeat is fresh, the match is finished immediately: you lose, reason `timeout`. There is no
  strike and no return to 24-hour play. The winner is told at once (the same status-change ping every
  ending publishes), so they never sit on a finished board.
- **Dropping out gets a grace ladder** (real-time only). A player whose heartbeat has gone stale is
  *reconnecting*, and the OPPONENT sees **Opponent reconnecting** with the shared animated ellipsis in
  the header strip. When the absent player's turn clock would expire the ladder runs — one step per
  decision, all inside the same row-locked tick:
  | step | what happens |
  | --- | --- |
  | 1 | the turn clock is **extended by 10 s** (`LIVE_RECONNECT_GRACE_MS`) — the grace is ADDED, it never burns the player's turn |
  | 2 | still gone: that ONE turn is **auto-played** by the server (draw, skip the Grow, throw the drawn card) and the match continues |
  | 3 | the absent player's **next** turn gets only **5 s** (`LIVE_RECONNECT_SHORT_MS`) |
  | 4 | still gone: the match is **LOST** by the disconnected player, reason `timeout` |
  The ladder is per ABSENCE: a successful reconnect resets it, so every fresh drop gets the full 10 s
  again. It never accumulates inside one absence.
- **Both players drop at once** (within `LIVE_BOTH_OFFLINE_WINDOW_MS`, 3 s): no ladder starts.
  Instead the match is **held for up to a minute** (`LIVE_BOTH_OFFLINE_HOLD_MS`, counted from the
  moment the simultaneous drop is detected). If ONE player comes back inside that minute, the other
  gets the ordinary 10 s ladder. If NEITHER comes back, the normal dropout outcome applies: the seat
  that was on the clock times out and loses (`timeout`) — deterministic, no new rule.
- **Leave real time = you resign.** The pause-menu **Leave live** item asks **"Leave and lose this
  real-time duel?"** and, on confirm, finishes the match with the leaver as the loser, reason
  `resigned`. Cancelling does nothing. There is no cooldown and no grace: the match is simply over for
  both players.
- **Walking away is not an escape.** Only the explicit leave button forfeits outright. Closing the tab
  or switching apps does **not** itself end the match — but the clock keeps running on the server, so a
  player who has gone quiet runs the ladder and loses.

## Limits

One open challenge per match · after a "Not now", the same player waits 2 minutes · after 3
"Not now"s in one match, 30 minutes · 30 challenges per player per hour · the Settings switch
**Allow live challenges** (default on) makes you "Not available".

## How to tune it (no code change)

Set these as environment variables (local server) or **Edge Function secrets** (Supabase). Values
are milliseconds unless noted.

| Setting | Default | What it does |
| --- | --- | --- |
| `LIVE_TURN_MS` | `60000` | The live turn length. **This is the one to tune.** (`LIVE_TURN_MS_DEFAULT` in `server/src/live/config.ts` is the one source of truth; every number the client shows comes from the server's `limitMs`.) |
| `LIVE_REPLAY_ALLOWANCE_MS` | `6000` | Time to watch the previous turn before the clock runs |
| `LIVE_ENTRY_ALLOWANCE_MS` | `15000` | Extra time for the current player when both go live |
| `LIVE_CHALLENGE_TTL_MS` | `45000` | How long a challenge waits for an answer |
| `LIVE_PRESENCE_STALE_MS` | `45000` | No heartbeat for this long = offline (and therefore "dropped") |
| `LIVE_RECONNECT_GRACE_MS` | `10000` | First drop: the turn clock is extended by this, then the turn is auto-played |
| `LIVE_RECONNECT_SHORT_MS` | `5000` | The absent player's NEXT turn: this much grace, then the match is lost |
| `LIVE_BOTH_OFFLINE_WINDOW_MS` | `3000` | Two presences going stale this close together = a simultaneous drop |
| `LIVE_BOTH_OFFLINE_HOLD_MS` | `60000` | How long a simultaneous drop holds the match before the normal outcome |
| `LIVE_NOT_NOW_COOLDOWN_MS` | `120000` | Wait after a "Not now" |
| `LIVE_DECLINE_LIMIT` (count) / `LIVE_DECLINE_WINDOW_MS` | `3` / `1800000` | Declines per match before the long wait |
| `LIVE_CHALLENGES_PER_PLAYER_PER_HOUR` (count) | `30` | Abuse cap |

**Removed (2026-10-14):** `LIVE_LEAVE_GRACE_MS`, `LIVE_LEAVE_COOLDOWN_MS`,
`LIVE_LEAVE_COOLDOWN_TURNS` and `LIVE_STRIKES_TO_END`. Leaving real time now forfeits and a real-time
timeout now loses, so there is no grace, no cooldown and no strike escape hatch. The old
`live_strikes_*` / `live_cooldown_*` columns stay in the schema (no risky migration); nothing reads or
writes them.

## Where the shared waiting animation lives (for the header/strip lane)

The animated ellipsis the strip shows for a connecting or waiting state is implemented ONCE, in
`web/src/online/live/wait-dots.ts`, and exported:

```ts
import { WAIT_DOTS_CSS, WAIT_DOTS_CLASS, waitDots } from './online/live/wait-dots.js';
```

`WAIT_DOTS_CLASS` (`futasaku-wait-dots`) + `WAIT_DOTS_CSS` are the CSS-only treatment (three dots
revealed in sequence; steady under `.reduce-motion` and `prefers-reduced-motion`), and `waitDots()`
builds the markup. It is used by the real-time strip's **Opponent reconnecting** notice
(`[data-live="reconnect"]`, 20 characters — the dots are the animation, never part of the string).
**Do not add a second dots animation**: import this one so every waiting state looks the same.

**Exact clicks to change the turn length on Supabase:** open the Supabase dashboard → your
FUTASAKU project → **Edge Functions** (left menu) → **Secrets** (sometimes under *Manage secrets*)
→ **Add new secret** → Name `LIVE_TURN_MS`, Value e.g. `30000` → **Save**. The next request uses
it (no redeploy needed for a secret change on current Supabase; if it does not apply, redeploy the
`duel` function once).

## Where the code is

- Server: `server/src/live/` (rules, autoplay, service, router, memory + Postgres stores, wiring),
  migration `server/migrations/0006_live_duels.sql` (the brief said "0003"; 0003–0005 were taken) and
  `0008_live_reconnect.sql` (the reconnect ladder columns).
- Client: `web/src/online/live/` (listener, pop-up, pill, HUD, end window, return targets, channel,
  `wait-dots.ts` — the shared animated ellipsis).
- Tests: `server/tests/live-*.ts`, `web/tests/live-center.test.ts`,
  `web/tests/live-reconnect-copy.test.ts`, `web/e2e/live-duels.ts` (`npm run e2e:live`) and
  `web/e2e/live-reconnect.ts` (`npx tsx web/e2e/live-reconnect.ts` — the reconnect ladder in two real
  browsers). Screenshots: `docs/screens/live/` (+ `e2e-run.txt`, the last full run).

## Every touch outside the new folders

Each is a small hook (≤ 10 lines per file), listed so the smoothness work can be checked against it.

| File | Change | Why |
| --- | --- | --- |
| `server/src/storage/types.ts` | `liveManaged?: boolean` on `MatchRecord` (+1 comment) | lets the expiry decision know the live layer owns the deadline |
| `server/src/storage/postgres.ts` | `rowToMatch` reads `liveManaged` from the live columns; `expiryDecision` skips `liveManaged` rows (one condition) | the 24-hour grace/timeout rule never acts on a live match — same single row-locked decision point |
| `server/src/storage/memory.ts` | same one condition; `livePeek` + `liveSetClock` (5 lines) | the memory adapter's atomic step |
| `server/src/fetch-app.ts` | optional `live` router in deps; 2 lines at the top of `handle` | new endpoints live in their own router file |
| `server/src/http.ts` | pass `live` through (2 lines) | same |
| `server/src/index.ts` | 1 import, 2 changed lines, 1 added | wire the live layer (Node) |
| `server/src/edge-entry.ts` | 1 import, 2 changed lines, 1 added | wire the live layer (Edge) |
| `web/src/main.ts` | 6 lines after the lobby is installed: dynamic `import()` of the live module, with three ways back (open a match, continue the computer game, menu) | the only mount point |
| `web/src/online/lobby-ui.ts` | expose the existing `openMatch` on the controller (2 lines) | open the live match from anywhere |
| `web/src/player/glass-surface.ts` | `export const glassBaseCss` (3 lines, appended) | the challenge window wears the same glass; intel/tutorial modes untouched |
| `src/strings.ts` | `LIVE` word list (appended) | all player words live in one file |
| `package.json` | `"e2e:live"` script | run the browser proof |

**Not touched:** the replay gate, the animation queue, the turn reveal, the sync polling cadence,
steps-from-events, the perspective layer, the render path, `src/engine/`. The live module only
reads the page through the existing read-only `window.__severgrow` test hooks and the online
session handle. Ring placement uses the existing perspective helper (`mapKey`) for both seats.

## Deploying to the API (what a person must do)

1. Apply the migration: `npm run server:migrate` with the project's `DATABASE_URL` in `.env`
   (it is additive and safe to re-run). Applied on the FUTASAKU project on 2026-10-14.
2. Rebuild and deploy the Edge bundle: `npm run server:build-edge`, then deploy the `duel` function
   (`supabase functions deploy duel`). Rebuilt and deployed on 2026-10-14 (the live routes now
   answer `401`, not `404`).
3. Build the client in one of the live channels: `CHANNEL=futa05 npm run web:build` (the `/futa0.5/`
   preview) or `CHANNEL=futa-test npm run web:build` (the experiment copy), or any build with
   `VITE_LIVE_DUELS=1`.
4. Security advisors: Supabase dashboard → **Advisors** → **Security Advisor** → **Refresh**. Expect
   only the known informational `rls_enabled_no_policy` lines (intended: no client may read these
   tables at all).
