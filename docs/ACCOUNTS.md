# Accounts — decision-ready plan (FUTASAKU 0.5, branch `futa0.5-online`)

**Status: a proposal for you to sign off, not a decision.** Written 2026-10-14 by a worker who
**read the code and the schema**. Nothing here is deployed; no application code, `server/`, `web/`
or `src/` file was changed, no Edge function was deployed, no database row was written, and
`docs/BACKEND.md` was not touched (another worker owns it).

The question this answers: *a player clears their browser storage and their matches vanish. What do
we build so that stops happening — and is the current link safe to share yet?* (Share verdict is in
[`SHARE-READINESS.md`](SHARE-READINESS.md).)

Everything below is grounded in what the code actually does. Where I could not be certain, I say so.

---

## 1. What ALREADY exists today (the real finding)

**There is a device link-code path, and it already works — but it is a *transfer*, not a *recovery*.**

The Settings sheet has a block titled **"Use my matches on another browser"**
(`web/index.html`, `#online-link-block`; words in `src/strings.ts`, `ONLINE.linkCodeTitle`). It has
two buttons: **Make a link code** and **Enter a link code** (`web/src/online/lobby-ui.ts`).

The mechanics, read from the code:

- **Make a link code** → `POST /v1/players/me/link-code` (`server/src/fetch-app.ts`). The server
  generates an **8-character** Crockford-base32 code (`LINK_CODE_LENGTH` in `src/invite-code.ts`,
  re-exported as `config.linkCodeLength`), stores only its **SHA-256 hash** in the
  `device_link_codes` table (`server/migrations/0002_deadlines_lists.sql`), and returns the plain
  code once (`server/src/service.ts`, `createLinkCode`).
- **Enter a link code** → `POST /v1/players/link` → `redeemLinkCode`. It mints a **brand-new token
  for the same player id** and the new browser stores it as its online identity
  (`web/src/online/identity.ts`, `adopt`). The **old token is never moved or revoked** (this is
  P-3): after a redeem, **both** devices can still play as that player.
- **Single use, 10-minute life.** `redeemLinkCode` marks `used_at` and requires
  `used_at is null and expires_at > now` in one atomic `UPDATE`
  (`server/src/storage/postgres.ts`). `linkCodeTtlMs = 10 * 60 * 1000`
  (`server/src/config.ts`).
- **Rate limited**: 10 link codes per player per hour; 20 redemptions per IP per hour
  (`RATE_LINK_CODE_PER_PLAYER_PER_HOUR`, `RATE_LINK_REDEEM_PER_IP_PER_HOUR`).

**How far does that actually get a player?** It lets someone who is **still holding their old
device** open the new one and carry the identity across within a 10-minute window. That is a *move
my matches to another browser* tool.

It is **not** a recovery code, for two reasons that matter:

1. The code is shown **on the device that already has the identity**. If that device's storage is
   already gone, so is the code. You must generate the code *before* losing storage, and copy it.
2. It **expires after 10 minutes**. You cannot write it down today and use it next week.

So: a guest **cannot** reclaim their identity after their only device's storage is cleared. There is
no "forgot everything" path today.

**Is there already an account/identity table?** Yes — but it is only a *label*, not a login.
`server/migrations/0001_init.sql` defines `players(id, kind, display_name, created_at, upgraded_at)`
with `kind in ('guest','account')`. `POST /v1/players/me/upgrade` (`service.upgradePlayer`) flips
`kind` to `account` and sets `upgraded_at`, keeping the same id and all matches. **But**:

- It takes only a `displayName`, which is passed through `natureName(...)` — it adds **no email, no
  password, no OAuth link**. So `kind='account'` today grants no new way to sign in.
- **No UI calls it.** `DuelClient.upgrade()` exists in `server/src/client.ts`, but nothing in
  `web/` invokes it. So in the shipped product there are, in practice, **only guests**.
- There is **no** `email`, `password_hash` or `auth_user_id` column anywhere (grep of
  `server/migrations` + `server/src/storage/types.ts` returns none). Supabase Auth is **not** used:
  the Edge function runs with `--no-verify-jwt` and its own opaque bearer tokens
  (`docs/DEPLOY-ONLINE.md`).

There is also a **self-heal** path, but it makes the loss *worse*, not better: if the server ever
answers `401` for a stored token, the client deletes the stored identity and **quietly creates a
fresh guest**, then shows `ONLINE.identityReset` ("Your sign-in was reset. Earlier matches are
gone.") — `web/src/online/identity.ts` (`recover`) and `web/src/online/lobby-ui.ts`.

**Bottom line for §1:** the owner's goal is *partly* already met only when both devices are in hand
at the same time. The catastrophic case — cleared storage / lost device — is **not** covered.

---

## 2. The problem, stated precisely (and what is actually lost)

A guest's whole online identity is one `localStorage` record:

| Key | Holds | Source |
| --- | --- | --- |
| `severgrow.duel.identity.v1` | `{ token, playerId, displayName, kind }` | `web/src/online/identity.ts` |
| `severgrow.duel.session.v1` | the per-match resume session | `server/src/client.ts` |
| `severgrow.save.v7` | the offline / solo save | `web/src/logic/persist.ts` |
| `severgrow.duel.draft.v1.<matchId>` | an in-progress turn draft | `web/src/online/draft.ts` |
| `severgrow.duel.firstCard.v1`, `…starterRevealed.v1.*` | one-time UI flags | `web/src/online/lobby.ts`, `starter-reveal.ts` |

The server authenticates purely by `sha256(token)` via the `player_tokens` table
(`server/src/service.ts`, `authenticate`). If the browser's `severgrow.duel.identity.v1` is gone,
there is **no way to prove you are that player** — the token existed only in that browser.

**What is lost when storage is cleared:**

- **The identity itself** (the token) — permanently, unless a link code was made first. This is the
  real loss.
- **Access to every match** the player owns: waiting, active, and finished history. The next visit
  silently makes a **new** guest (`createGuest`), with a **new** nature name and an **empty** list.
- **In-progress duels become unreachable to that player.** They are **not** deleted from the
  database: the other player still sees the match and its deadline, and it will still resolve —
  by the 24-hour turn deadline (with one grace, `TURN_GRACE_PER_PLAYER=1`), i.e. effectively a
  **timeout loss** for the ghosted side.
- **The solo save** (`severgrow.save.v7`) is lost too if "clear site data" is used — that is
  offline progress, separate from online.

**What is NOT lost:** nothing is removed server-side when storage is cleared. The old `players` row,
its `player_tokens` hashes and its `match_participants` rows all remain. The sweeper only deletes
**guest players with no matches** older than 30 days
(`GUEST_MAX_AGE_MS`; SQL `not exists (… match_participants …)`) — so a player with matches is never
purged, just orphaned.

**Quantify "progress":** there is **no XP, rank, rating or ladder** (deliberately out of scope —
`docs/ONLINE-PLAN.md`). So the only things lost are: the identity, the match list/history, and any
active matches. "Progress" beyond that does not exist to lose.

---

## 3. The options, with honest tradeoffs

### Option 1 — provider-free "recovery code" (upgrade the link code)

**What it is.** Add a **durable** backup code a guest can create and keep (e.g. 12–16 characters,
valid for days/months or until used). It is the same idea as the existing link code but **built to
survive a lost device**, not just a 10-minute hand-off. Redemption mints a token for the same player
id, exactly like `redeemLinkCode` does now.

**Effort: small.** Reuse the shape of `createLinkCode` / `redeemLinkCode` and the hashed-code idea.
Recommend a **new** table (e.g. `recovery_codes`) plus one constant rather than loosening the
link-code TTL, so the two concepts stay separate the way `INVITE_CODE_LENGTH` and `LINK_CODE_LENGTH`
already are. One migration + two endpoints + a Settings button + tests. The
`docs/BACKEND.md` "one home per constant" pattern applies.

**Risk: low.** A leaked recovery code is a takeover, exactly like a link code, so it must be long
and rate-limited — but that machinery already exists.

**Owner dashboard clicks: none.**

**Privacy policy: none needed.** No personal data is collected — a code is an opaque random string.

**What can go wrong:** a very long-lived code is a standing secret, so you need a revoke/rotate path;
and the honest weakness is **the player must save the code somewhere**. If they lose the code and
the device, nothing can help them. This is the classic "backup key" UX problem.

### Option 2 — "Recover with Google" (Supabase Auth / Google OAuth)

**What it is.** A Google button that links the current guest's player row to a Google identity; on a
new device, sign in with Google → look the player up → mint a token. Offered **only as a recovery
option**, not as the main login (the owner's earlier "low-risk shape").

**Effort: large — and it is not a dashboard toggle.** This is the honest correction to a common
assumption. The app does **not** use Supabase Auth today: the Edge function is deployed with
`--no-verify-jwt` and authenticates its own tokens against `player_tokens`. So the work is:

1. A **schema change** to link a Supabase Auth user to a `players` row (new
   `players.auth_user_id uuid unique`, or a `player_identities` table) + migration with RLS and the
   `revoke … from anon, authenticated` guard (P-21).
2. **Token verification in the API**: the service must verify a Supabase Auth JWT and map it to a
   player, alongside the existing bearer-token path.
3. **New endpoints**: link Google to the current player; sign-in by Google → player → token.
4. **Client auth**: the browser needs the OAuth flow (there is no `supabase-js` dependency today —
   `package.json` has only `pg`; the public `VITE_SUPABASE_ANON_KEY` build variable already exists,
   so a raw REST flow or adding the SDK are both possible).
5. **UI + tests** (button, first-run, error states, server/e2e suites).

**Owner dashboard clicks: yes** (his Google account and the Supabase dashboard — see §5).

**Privacy policy: yes.** Google sign-in yields an email address / name — personal data. Google's
OAuth consent screen also wants an app name, support email and (when published) a privacy-policy
URL.

**What can go wrong:** a mis-typed redirect URI locks everyone out; "Google-only" excludes players
without a Google account; iOS Home-Screen apps keep separate storage so those users must still sign
in per container; and it adds a real new surface (JWT verification, session handling) to a system
that currently has one authentication path.

### Option 3 — email + password

**What it is.** Supabase Auth (or custom) email/password sign-in.

**Effort: large, plus ongoing operations.** Passwords bring a reset flow, and reset emails require
**transactional email**: Supabase's built-in SMTP is rate-limited and not meant for production, so
you would need a provider (Resend/SendGrid/Postmark/Amazon SES), a **sending domain with DNS
records**, and deliverability upkeep. Supabase also puts an email **rate limit** on its built-in
mailer.

**Owner dashboard clicks: yes**, and more of them (Supabase Auth email settings + a third-party
email account + DNS).

**Privacy policy: yes** (email addresses are personal data).

**What can go wrong:** reset emails landing in spam, support burden, enumeration/abuse, and the most
moving parts of the three.

### Comparison

| | Option 1 — recovery code | Option 2 — Recover with Google | Option 3 — email + password |
| --- | --- | --- | --- |
| Rough effort | Small (days) | Large (build + wire OAuth) | Large + ongoing ops |
| Owner clicks | None | Supabase + Google Cloud | Supabase + email provider + DNS |
| Email deliverability | N/A | N/A | Must maintain |
| Privacy policy | Not required | Required | Required |
| New schema | Yes (small) | Yes | Yes |
| Personal data | None | Email/name | Email |
| Impersonation risk | Code leak (long, rate-limited) | Low (Google proves it) | Low–medium (resets/enumeration) |
| Main failure mode | Player loses the code | Redirect config; no-Google users | Spam/support; complexity |
| Works with no Google account | Yes | **No** | Yes |
| Reuses existing code | **Yes** (link-code shape) | Partly (token mint) | Partly |

---

## 4. Recommendation (proposal — pending your sign-off)

**Recommendation: build Option 1 now; keep Option 2 ("Recover with Google") as your post-playtest
destination.**

One-line reason: of the three, **only Option 1 needs nothing from you, collects no personal data,
and reuses machinery that already exists** — and it directly fixes the "clear storage = new player"
loss, which is the actual gap today.

How this squares with your earlier intent (which I found in the transcripts and am honouring, not
overriding):

- You parked **Google sign-in as "Recover with Google" until after the playtest**, and you decided
  **names + accounts are one piece of work, not two**. Nothing here changes that. The
  two-phone playtest (`docs/PLAYTEST-0.5.md`) has **not been run** as far as this repo shows (its
  results table is blank), so "after playtest" has not arrived — which is exactly why I do not
  recommend building the OAuth integration tonight.
- Option 1 is the **interim guard** that makes sharing safer now, without pre-empting the Google
  work. When Google lands, the recovery code can stay as the **no-Google fallback** (Option 2 alone
  locks out anyone without Google) — so it is not throwaway.
- If you would rather build **one** system only, then Option 2 is the one to build — the tradeoff is
  that nothing protects players until the whole OAuth integration is done.

**What I am asking you to approve:** *"Build the durable recovery code (Option 1) now; keep
Recover-with-Google (Option 2) as the post-playtest plan."* Or: *"Skip straight to Google."*

---

## 5. Exact manual steps for the recommended option

### Option 1 (recovery code) — what you must click

**Nothing.** No dashboard, no external provider, no email, no DNS. This is the whole point of the
recommendation. A worker can do every part of it (migration, endpoints, Settings UI, tests), exactly
as the link-code work was done. You would only be asked to **review the wording** the player sees.

### Option 2 (Recover with Google) — the steps only you can do

These **need you** because they use **your Google account** and the **Supabase dashboard**. A worker
cannot do them (and must never be given the client secret — it lives only inside Supabase).

**A. Supabase (project FUTASAKU)**

1. Open <https://supabase.com/dashboard> → project **FUTASAKU**.
2. Left sidebar → **Authentication** → **Providers** → **Google** → enable it.
3. Paste the **Client ID** and **Client Secret** from step B below → **Save**.
4. Copy the **Callback URL** shown on that page — it is
   `https://wbfrbeedlvjercrukngn.supabase.co/auth/v1/callback` (you need it in step B3).
5. Left sidebar → **Authentication** → **URL Configuration** → set the **Site URL** and add the
   app origins to **Redirect URLs** (`https://severgrow.github.io`, and any custom domain).

**B. Google Cloud Console**

1. <https://console.cloud.google.com> → create or pick a project.
2. **APIs & Services** → **OAuth consent screen** (newer UI: **Google Auth Platform**): fill App
   name, User support email, Developer contact email; add the scopes `openid`, `…/userinfo.email`,
   `…/userinfo.profile`. While in "Testing" mode, add your own address as a test user. (Publishing
   eventually asks for a **privacy policy URL** — that ties back to the policy work.)
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID** →
   Application type **Web application** →
   - **Authorized JavaScript origins**: your site origins (`https://severgrow.github.io`, and the
     custom domain when it exists).
   - **Authorized redirect URIs**: add the Supabase callback URL from **A4**.
   - **Create** → copy the **Client ID** and **Client Secret** into Supabase (step A3).

**C. What a worker can do (no secrets needed).** Everything in the repo: the migration, JWT
verification + endpoints, the client OAuth glue, the Settings/UI button, and all tests — using the
public anon key and the existing test harness. The secret never leaves Supabase, so the worker never
sees it.

---

## 6. Identity-migration design (upgrade the guest IN PLACE)

The key fact that makes this cheap: **a match belongs to a `players.id`** via
`match_participants.player_id`, and a guest already has a `players` row. So an upgrade must **attach
a credential to the existing row**, never create a second player.

Design:

1. The device still authenticates with its current token (unchanged).
2. The player taps *Recover with Google* / *create a recovery code*.
3. The server **links the credential to `player.id`**:
   - Option 1: insert a `recovery_codes` row (`code_hash`, `player_id`, expiry) — no change to
     `players` at all.
   - Option 2: set `players.auth_user_id` (or insert into `player_identities`) **on the same row**,
     and flip `kind` to `'account'` + `upgraded_at` — the shape `upgradePlayer` already uses.
4. On a new device, redeeming the code / signing in with Google resolves to that **same
   `player.id`** and mints a fresh token (exactly what `redeemLinkCode` does today). Nothing in
   `match_participants` is touched, so **every match and the whole history survive**.

**Schema change needed:**

- Option 1: one new table `recovery_codes` (RLS on, `revoke all from anon, authenticated`), plus a
  code-length constant. `players` unchanged.
- Option 2: `players.auth_user_id uuid unique` (nullable) **or** a `player_identities`
  `(player_id, provider, subject)` table — recommend the table for future providers, the column for
  speed. Any new table also needs RLS + the revoke guard.

**Do not** create a new `players` row on recovery — that is the mistake that would split a player's
history in two.

---

## 7. Impersonation and name-collision risk (honest)

Names are **not unique and cannot be**, today:

- Display names come from `natureName()` in `server/src/nature-names.ts`: **20 adjectives × 20 nouns
  = 400 possible names** ("MapleFox", "BloomGrove", …). A guest's name is derived from its random
  id; a rename derives from `id + ':' + input`. There is **no uniqueness constraint**.
- With only 400 names, duplicates are near-certain well before the site is busy (birthday effect).
  Earlier work already noted two different players can both be "BloomGrove" — that is a
  **guaranteed** outcome at scale, not a rare bug.
- A name is shown to the opponent as `opponentName` in the match list and on the finish screen
  (`vs <name>`). Because names collide and are **not** an authentication factor, a player can be
  **mistaken for, or deliberately mimicked by** another with the same name. The real trust anchor in
  this system is the **invite link/code and the match id**, never the name.
- The current design avoids **free text** on purpose (no moderation surface, `docs/BACKEND.md`
  rule 8). If accounts later allow **chosen** names, you inherit moderation, impersonation,
  Unicode/spoofing and reserved-name problems.

**Recommendation to fold into the accounts work:** decouple *identity* from *display name*. Keep a
stable per-player **discriminator** (e.g. the first 4 characters of the player id, shown as
`BloomGrove #7QK2`) or a chosen name **plus** discriminator, and show it wherever a name appears in a
match list / finish screen. If you keep auto-generated names, make that explicit in copy so players
do not treat the name as "me".

---

## 8. Evidence (what I read)

- `src/invite-code.ts` — `INVITE_CODE_LENGTH = 4`, `LINK_CODE_LENGTH = 8`.
- `server/src/service.ts` — `createGuest`, `authenticate`, `createLinkCode`, `redeemLinkCode`,
  `upgradePlayer`, the 10-open-match cap, `GUEST_MAX_AGE_MS`.
- `server/src/config.ts` — link-code TTL, waiting expiry, rate-limit defaults, open-match cap.
- `server/src/fetch-app.ts` — the routes (`/v1/players/me/link-code`, `/v1/players/link`,
  `/v1/players/me/upgrade`).
- `server/src/ids.ts`, `server/src/nature-names.ts` — code/token/name generation.
- `server/migrations/0001_init.sql`, `0002_deadlines_lists.sql` — `players`, `player_tokens`,
  `device_link_codes`, RLS/revoke.
- `server/src/storage/postgres.ts` — single-use redemption, the 30-day no-match guest sweep.
- `web/src/online/identity.ts`, `web/src/online/lobby-ui.ts`, `src/strings.ts`, `web/index.html` —
  the Settings link-code block, the self-heal path and its wording.
- `docs/DEPLOY-ONLINE.md`, `docs/ONLINE-PLAN.md`, `docs/ONLINE-SHIP-STATUS.md`,
  `docs/PLAYTEST-0.5.md` — JWT gate off, free-tier limits, "matches live on the device".
