# Match notifications (web push)

**Status: built on `feat/match-notifications`, NOT deployed, and DARK by default.** No migration has
been applied, no Edge function deployed and no secret set. Until the owner does the steps at the
bottom, `/v1/health` carries no `push` block, the Settings row never appears, and every `/v1/push`
route is a 404.

This is the smallest complete slice of the two gaps the plan called P-12:

- **A — nothing told a player it was their turn.** The only signal was the tab title, if they came
  back. Now the server can push "your turn in a duel" to the opponent's device.
- **B — a Territory challenge could expire in silence, and the challenger was never told when one
  was accepted.** Now the defender gets a "challenge is waiting" push, a 12 h and a 1 h nudge before
  their answer window closes, and the challenger gets one "challenge accepted" push.

There are exactly **four** events. Nothing else is sent: no chat, no Seeds, no marketing.

| Event | Who is told (server side) | Once-only key |
| --- | --- | --- |
| `turn` | the opponent of the player whose page asked, when the turn is now theirs | `turn:<matchId>:<turnStartRevision>` |
| `challenge` | the defender, when a pending challenge exists | `challenge:<id>:sent` |
| `challenge-accepted` | the challenger, when the defender's page reports `accepted` with a linked match | `challenge:<id>:accepted` |
| `challenge-12h` / `challenge-1h` | the defender, through the reminder sweep | `challenge:<id>:12h` / `:1h` |

## The rules this feature keeps

- **The server decides.** A page only calls `POST /v1/push/nudge` ("look now"). The recipient, the
  words and the dedupe key are computed in `src/notifications.ts` from the caller's own match rows
  (`listMatchesForPlayer`, projected through the same gated turn the board uses) and from
  `WorldEconomyService.challenges`. A request can never name a recipient, a title or a body.
- **Once, and never twice.** `push_sends` has `primary key (player_id, dedupe_key)`; the claim is
  taken *before* the send, so two tabs, a poll and a cron run cannot duplicate an event. A failed
  send is never retried (at most once, best effort).
- **Identity-scoped, one device one owner.** `push_subscriptions` has `primary key (endpoint)`: a
  phone used by two accounts is re-pointed to the account that enabled notifications last, and the
  former account stops receiving that device's pushes in the same statement. The page also stamps the
  local opt-in with the player id: when a DIFFERENT account signs in on the phone, it unsubscribes the
  browser at once (the push service then answers 410 and the server drops the row) and leaves the new
  account OFF. Notifications are opt-in per device **and** per identity.
- **Never on the game's path.** The client fires `nudgePush` and does not await it; the server
  swallows every send failure into a counter; the service worker swallows a bad payload. No push can
  block a turn, a reveal, a render or a tap.
- **Absent browser APIs are normal.** The Settings row is hidden unless `/v1/health` answers with
  `push.enabled` **and** the page has `Notification` + `serviceWorker` + `PushManager` in a secure
  context. iPhone Safari before a Home Screen install shows the honest "add to Home Screen first"
  line instead of a dead switch, a denied permission is shown as denied, and every registration has a
  5 s ceiling so a missing worker cannot wedge the switch.
- **One switch.** `PUSH_ENABLED` (plus the VAPID pair) is the whole feature; unset or `0` makes it
  dark server-side without a code change. The page also keeps a per-device, per-identity opt-in
  (`severgrow.push.enabled.v1` holds the player id it was enabled for), off by default, which only
  this Settings row writes.
- **Suppression while visible.** The service worker does not show a notification when a game window
  is visible: a player already looking at the board is not buzzed about it.
- **Silence on iOS where it cannot work.** The row says "add to Home Screen" rather than promising a
  notification the platform will not deliver.

## Routes

All are 404 while the feature is dark.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/push/status` | bearer | `{ subscribed: n }` — this player's devices |
| `POST` | `/v1/push/subscriptions` | bearer | register this browser `{ endpoint, keys: { p256dh, auth } }` |
| `DELETE` | `/v1/push/subscriptions` | bearer | remove this browser `{ endpoint }` (owner only) |
| `POST` | `/v1/push/nudge` | bearer + per-player limit | "look now" → `{ sent }` |
| `POST` | `/v1/push/dispatch` | `x-futasaku-push: <PUSH_DISPATCH_TOKEN>` + per-IP limit | the 12 h / 1 h sweep → `{ due, sent }` |

The reminder sweep exists only when `PUSH_DISPATCH_TOKEN` is set; without it the route does not
exist. It reads at most `PUSH_DISPATCH_LIMIT` (200) pending challenges, oldest deadline first.

`/v1/health` gains one public block while the feature is on:

```json
{ "push": { "enabled": true, "publicKey": "<VAPID public key, base64url>" } }
```

That is the **public** key only (it is public by design). The private key never appears in any
response, log or row.

## Storage (migration `0031_push_notifications.sql`)

- `push_subscriptions(player_id, endpoint PK, p256dh, auth, user_agent, created_at, last_seen_at)` —
  one browser endpoint, one owner.
- `push_sends(player_id, dedupe_key, kind, claimed_at, PK (player_id, dedupe_key))` — the once-only
  ledger.

Both tables have RLS on and every privilege revoked from `anon` / `authenticated`, following
`0030_account_prefs.sql`. Nothing is added to the Realtime publication. The rows are small; old
`push_sends` rows may be pruned later from the daily sweep (not done here).

## What the owner must do (in this order)

1. **Generate a VAPID pair** (once; keep the private key secret). Either:

   ```sh
   npx web-push generate-vapid-keys
   ```

   or with no extra dependency:

   ```sh
   node -e "const c=require('node:crypto').webcrypto;(async()=>{const k=await c.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const p=new Uint8Array(await c.subtle.exportKey('raw',k.publicKey));const j=await c.subtle.exportKey('jwk',k.privateKey);const b=u=>{let s='';for(const x of u)s+=String.fromCharCode(x);return Buffer.from(s,'binary').toString('base64url')};console.log('VAPID_PUBLIC_KEY='+b(p));console.log('VAPID_PRIVATE_KEY='+j.d)})()"
   ```

2. **Set the Edge secrets** (Supabase dashboard → Edge Functions → Secrets, or `npx supabase
   secrets set`). Do not commit them and do not paste them into a chat:

   | Secret | Value |
   | --- | --- |
   | `PUSH_ENABLED` | `1` — the one switch. `0` or absent = the whole feature is dark |
   | `VAPID_PUBLIC_KEY` | the public key from step 1 (base64url) |
   | `VAPID_PRIVATE_KEY` | the private key from step 1 (base64url) — SECRET |
   | `VAPID_SUBJECT` | a contact: `mailto:…` or `https://futasaku.com` |
   | `PUSH_DISPATCH_TOKEN` | a random string, only if the reminder sweep will run — SECRET |

   Optional tuning: `PUSH_TTL_SECONDS` (default 86400), `RATE_PUSH_NUDGE_PER_PLAYER_PER_HOUR` (180),
   `RATE_PUSH_DISPATCH_PER_IP_PER_HOUR` (240), `PUSH_DISPATCH_LIMIT` (200).

3. **Apply the migration** (`0014`/`world_challenges` must already be applied):

   ```sh
   npm run server:migrate          # applies 0031 once, in its own transaction
   ```

4. **Rebuild and deploy the Edge bundle** (the routes and the sender ride the existing `duel`
   function):

   ```sh
   npm run server:build-edge
   npx supabase functions deploy duel --project-ref wbfrbeedlvjercrukngn --no-verify-jwt --use-api
   ```

   Then check `GET /v1/health` lists `push.enabled: true` and the public key.

5. **Decide how the 12 h / 1 h sweep runs.** Nothing calls it yet (deliberately: no new scheduler
   and no secret in a migration). Pick one:
   - hand-run / an external cron, every 10–15 minutes:
     ```sh
     curl -fsS -X POST "https://<project>.supabase.co/functions/v1/duel/v1/push/dispatch" \
       -H "x-futasaku-push: $PUSH_DISPATCH_TOKEN"
     ```
   - or a Supabase `pg_cron` + `pg_net` job that sends the same request (store the token as a
     database setting, never in a migration file). Until then, the "challenge is waiting" push and
     every turn push still work from live traffic; only the two timed nudges wait for a sweep.

6. **Test on a phone**: open Settings → "Match notifications" (only visible once the server is on),
   turn it on, allow the prompt. Then make a move in a duel with the opponent's tab closed, or send a
   Territory challenge. The service worker shows the notification; tapping it opens the game.

**To turn it off**: set `PUSH_ENABLED=0` (or remove the secret). `/v1/health` stops advertising
push, the Settings row disappears, and no send can happen. Existing rows stay; they are inert.

## What is deliberately NOT done

- No chat, Seeds, achievement, rematch or "your deadline is close" notifications.
- No scheduler shipped in a migration (see step 5) and no pruning job for `push_sends`.
- No `pushsubscriptionchange` recovery: if the browser rotates an endpoint, the next Settings open
  detects the missing subscription and turns the device off honestly, rather than silently keeping a
  dead row. Re-enabling creates a fresh one.
- No iOS badge: the installed app's icon count uses the Badging API where it exists and is set from
  the same Territory count the lamps use; iPhones do not have the API today.
- No notification preferences beyond one per-device switch (no per-event toggles, no quiet hours).
- No localized copy: the server authors the four English lines; the game is English today.
- No token or key in the repo: the page reads the public key from `/v1/health` at runtime.

## Verification (this branch)

`npm run check`, the two `web:build` variants and `scripts/check-channel-assets.mjs` are required and
run for this change. The new tests are:

- `tests/notifications.test.ts` — the pure decision: recipient, once-only key, the 12 h/1 h boundary,
  no notification for a closed/own/expired row.
- `server/tests/push.test.ts` — the service and store: identity scoping on one endpoint, no claim
  without a device, a failing sender is a counter, 410 removes a dead device, the reminder sweep,
  the routes (dark, token-gated) and the migration's RLS/revoke/primary keys.
- `server/tests/webpush.test.ts` — the transport: the VAPID JWT verifies with the public key and the
  aes128gcm body decrypts with the browser's own private key; 410 and a refused fetch are calm.
- `web/tests/push-notifications.test.ts` — the client's absent, denied, install-first, broken
  subscribe and disable paths, plus the nudge throttle.
