# Share-readiness — is the link safe to share yet?

Written 2026-10-14, branch `futa0.5-online`. Plain English, one page. All numbers below were read
from `server/src/config.ts` and the schema, not guessed.

**Verdict: safe to share with friends you can help; not yet safe to post publicly.** The game works
and the backend is hardened, but a player who clears their browser storage loses everything and
cannot get it back (see [`ACCOUNTS.md`](ACCOUNTS.md)). Until there is an account or a durable
recovery code, every share should come with the warning *"don't clear your browsing data."*

## What works today

- Create a duel, share the link or a **4-character** invite code, join, play, resign, rematch.
- Play over time (24-hour turns) or live; refresh/reconnect replays missed turns.
- Find opponent (open queue); the sweeper cleans up abandoned matches daily.
- Hidden information is truly hidden (opponent's hand/deck never sent).
- Security is solid: RLS on every table with anon/authenticated revoked, tokens stored only as
  hashes, CORS locked to known origins, per-IP **and** per-player rate limits.
- TLS in transit (HTTPS bearer tokens); the database secret lives on the Edge function only.

## What is still guest-only

- **No accounts.** `players.kind` can say `account`, but there is no email, password or OAuth — so
  in the shipped product everyone is a guest.
- A match is **tied to the device** (a token in `localStorage`). Clearing site data = a new, empty
  player; the old matches become unreachable and the other side effectively wins on timeout.
- The **only** move-device tool is the 8-character link code, which is **single-use and expires in
  10 minutes** and must be made on the device that still has the identity. It cannot recover a
  wiped or lost device.
- **No push notifications** — you only learn it is your turn by opening the site. Presence
  (Online/Away) is deliberately hidden, not faked.
- Solo play is unaffected (it lives in the same browser's `severgrow.save.v7`).

## Current hard limits (real values)

| Limit | Value | Where |
| --- | --- | --- |
| Open matches per player | **10** | `maxOpenMatchesPerPlayer` |
| Guest creation | **200 / IP / hour** | `RATE_GUEST_PER_IP_PER_HOUR` |
| Joins | **60 / player / hour**, **400 / IP / hour** | `RATE_JOIN_*` |
| Actions | **120 / player / minute** | `RATE_ACTIONS_PER_PLAYER_PER_MINUTE` |
| Link codes | **10 / player / hour** create; **20 / IP / hour** redeem; **10-min** life; single-use | `RATE_LINK_*`, `linkCodeTtlMs` |
| Invite codes | 4 chars, **permanent** (the unique index never recycles a code — the pool only shrinks) | `INVITE_CODE_LENGTH`, `matches_invite_code_key` |
| Waiting match expiry | **48 hours** | `waitingExpireMs` |
| Turn deadline | **24 hours**, one grace per player | `turnTimeoutMs`, `TURN_GRACE_PER_PLAYER` |
| No-match guest cleanup | **30 days** | `GUEST_MAX_AGE_MS` |
| Infrastructure | One shared free-tier Supabase project: ~**60** DB connections (~50 usable), **500 MB** database, **500k** Edge calls/month; storage grows unpruned (~26 KB/match) | `docs/DEPLOY-ONLINE.md`, `ONLINE-SHIP-STATUS.md` |

Every rate limit is tunable with a `RATE_*` secret; none were changed by this note.

## Known rough edges (not blockers, but real)

- A slow retained-heap drift in a long-lived tab (~270 KB per match; a reload clears it).
- An intermittent seat-1 Bloom painting stall (~1 run in 3; unresolved).
- An opponent's replayed turn online carries less of the "big moment" presentation than offline.
- The free project can pause if idle — the daily `pg_cron` keep-alive prevents this, but a long
  outage has no alerting (there are no metrics or alerts, only one log line per request).
- Names come from **only 400 nature names**, so two players can share a name (see `ACCOUNTS.md` §7)
  — a name is not proof of who someone is.

## What would need to be true before sharing more widely

1. **A recovery path that works after storage is cleared** — a durable recovery code (cheap) or
   Google sign-in (bigger). Without it, a single "clear browsing data" is unrecoverable.
2. **A privacy policy / terms** once any personal data is collected (Google or email sign-in).
3. **Some monitoring** — at minimum an alert if the API or the keep-alive stops answering.
4. **A capacity check** — the free tier's ~50 usable connections and 500 MB are fine for friends,
   not for a public post; storage is never pruned.
5. **Decide what a name means** — unique names or a discriminator, so two "BloomGrove"s are
   distinguishable.

Until (1) and (2)–(5) land, share privately with people you can personally help.
