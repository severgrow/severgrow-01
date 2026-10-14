# FUTASAKU online duels — start here

**Status: built and shipped** on the `/futa0.5/` preview (branch `futa0.5-online`). This page is the
index, so a future reader lands on the current document first instead of a dated report. Online duels
and live duels are built, deployed and playable; the locked `futa0.4` build and `main`/`dev` are
untouched.

## Where to read the truth

| Question | Document |
| --- | --- |
| Current status · verification | [`ONLINE-SHIP-STATUS.md`](ONLINE-SHIP-STATUS.md) (dated verification snapshot) and [`ONLINE-POLISH.md`](ONLINE-POLISH.md) (latest pass) |
| Deploy, secrets, keep-alive cron, rate limits | [`DEPLOY-ONLINE.md`](DEPLOY-ONLINE.md) |
| The wire contract | [`NETWORK-CONTRACT.md`](NETWORK-CONTRACT.md) |
| Backend: endpoints, storage, security, what is left | [`BACKEND.md`](BACKEND.md) |
| Live duels (challenge → real time) | [`LIVE.md`](LIVE.md) |
| Find opponent · parked search · timeout grace | [`FIND-OPPONENT.md`](FIND-OPPONENT.md) |
| Invites (link-first, 4-character codes) | [`INVITE-FLOW.md`](INVITE-FLOW.md) |
| Finish-screen parity with offline | [`ONLINE-VS-OFFLINE-FINISH.md`](ONLINE-VS-OFFLINE-FINISH.md) |
| Two-phone playtest script | [`PLAYTEST-0.5.md`](PLAYTEST-0.5.md) |
| Online vs offline differential audit | [`ONLINE-VS-OFFLINE.md`](ONLINE-VS-OFFLINE.md) |
| Turn-word / gate smoothness evidence | [`ONLINE-SMOOTHNESS.md`](ONLINE-SMOOTHNESS.md) |

## What is current (verified)

- **Realtime pings drive the duel.** The Edge function publishes a broadcast when a turn completes;
  the waiting client refetches on the ping and polls `/view?since=` only as the safety net (900 ms
  while it is the opponent's turn, 2 s otherwise, 30 s while hidden). Measured refetch after the
  ping: 15 / 34 / 111 / 737 / 760 ms, all under the 900 ms poll cadence.
- **A reconnect replays the missed turns.** The driver distinguishes a `live` turn (poll/ping while
  visible → a full readable pace) from a `gap` (a resume, a tab return or a network comeback →
  buffered and replayed at 2× with Skip). It does not jump straight to the current board.
- **The sweeper runs on a schedule.** The Supabase-native `pg_cron` job `futasaku-keepalive` runs
  **daily** at 06:17 UTC (migration `0007_daily_sweeper.sql`, after 0005 installed it every 2 days),
  calling `GET /v1/health?db=1` (a real DB round trip) and then `POST /v1/sweep`. Daily means an
  expired-but-unvisited match is cleaned up within a day instead of up to two. The old GitHub Actions
  keep-alive workflow was **deleted** (workflows only run from the default branch, so it never fired).
- **CORS is locked** to `PRODUCTION_CORS_ORIGIN = 'https://severgrow.github.io'` on the deployed Edge
  function; `*` is only the local/dev default.
- **Codes:** invite codes are **4 characters** (`INVITE_CODE_LENGTH`); device link codes are
  **8** (`LINK_CODE_LENGTH`) — independent constants with a regression test.
- **Rate limits are NAT-friendly and tunable** (`RATE_*` env vars / Edge secrets).
- **Live duels ship** on `CHANNEL=futa-test` and now the `futa05` preview (`/futa0.5/`); migration
  `0006_live_duels.sql` is applied.
- **A standard online duel has a real Rematch as the finish screen's first, primary action** (owner
  ask, 2026-10-14). `#go-rematch` is labelled `ONLINE.rematch` ("Rematch"); tapping it tears the
  finished session down first (`tearDownOnlineDuel`), then creates a **new** match and surfaces the
  existing invite/share screen (the same 4-character code + `Share invite` as Create a duel) — the
  plan's "a fresh invite to the same friend". `Back to matches` (`#go-other`) and `Menu` (`#go-menu`)
  remain as secondary exits, and `Share` is unchanged. There is no presence plumbing for async duels,
  so the opponent is **not** pinged: they join the new duel by the shared code/link, exactly as they
  joined the first one. The live end window's rematch (`LIVE.rematch`) pings because live has a
  challenge channel; the flow the player sees (tap Rematch → a waiting surface for the same opponent)
  is the same. Proof: `web/tests/online-rematch.test.ts` + `web/e2e/online-duel-two-browser.ts`
  (finish → Rematch → fresh code → the other side joins and plays).

## Still open (do not report these as fixed)

- **Presence (Online / Away) is not wired** — the indicator is deliberately hidden rather than faked.
- A slow **retained-heap drift** (~270 KB per match in a long-lived tab; only a reload releases it).
- An intermittent **seat-1 Bloom painting stall** (~1 run in 3, cause unidentified).
- **The opponent's replayed turn carries less cockpit personality online than offline** (verified
  2026-10-14 against the code). The catch-up steps are queued for the shared `AnimQueue` **without**
  `markMoment()` / `displayEventForPlay()`, so the smart-cockpit LED announcements and the "big
  moment" banners/anticipation do **not** fire for an opponent's turn online — while a player's OWN
  move still gets them (`web/src/main.ts`, the online branch of `afterPlay` vs `humanPlayOnline` /
  the driver `onChange`). Drag, cut animations and sounds DO run (same `AnimQueue` / `playStep`).

## Dated reports (accurate for their run; kept for the audit trail)

These carry a short note at the top for anything that has since changed — the history is intact:

[`ONLINE-REPORT.md`](ONLINE-REPORT.md) (2026-10-12) ·
[`DATABASE-VERIFICATION.md`](DATABASE-VERIFICATION.md) (2026-10-12) ·
[`ONLINE-SIMULATION.md`](ONLINE-SIMULATION.md) (2026-10-13) ·
[`ONLINE-SOAK-200.md`](ONLINE-SOAK-200.md) (2026-10-13) ·
[`ONLINE-DEVICE-MATRIX.md`](ONLINE-DEVICE-MATRIX.md) (2026-10-13) ·
[`ONLINE-VS-OFFLINE.md`](ONLINE-VS-OFFLINE.md) (2026-10-13) ·
[`ONLINE-VS-OFFLINE-FINISH.md`](ONLINE-VS-OFFLINE-FINISH.md) (2026-10-13, the fix pass) ·
[`CONSOLIDATION.md`](CONSOLIDATION.md) (2026-10-13).
