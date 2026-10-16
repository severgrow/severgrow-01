# FUTASAKU Admin dashboard (v1)

A read-only operations dashboard for the owner, served at **`/admin/`** on the site. It reads the
same database the game writes, through its own narrowly scoped API, and it can change exactly one
thing: **report triage**.

- **Status: built, not published.** The migration is written and **unapplied**; the `/admin/` route is
  **not** wired into the Pages deploy and is **not** linked from the game. Publishing is the owner's
  call (see *Rollout* below).
- **Never linked from the player menu**, and no player-facing string mentions it.

---

## 1. How it is separate from the game

| | game | dashboard |
|---|---|---|
| sources | `web/src/` | `admin/src/` |
| Vite root | `web/` | `admin/` |
| build output | `web/dist/` | `web/dist-admin/` |
| entry | `web/index.html` | `admin/index.html` |
| routes | `/`, `/futa0.5/`, … | `/admin/` |

Nothing in `web/src/` or `src/` imports anything from `admin/`, and no game bundle references
`/admin/` — both are asserted by `admin/tests/format.test.ts` ("the dashboard is a separate build"),
so a future edit cannot quietly fold the dashboard into the player bundle. The dashboard ships
**no service worker** and **no manifest**, so it never enters an install flow.

Build and preview:

```sh
VITE_DUEL_API_URL=https://<project>.supabase.co/functions/v1/duel npm run admin:build   # → web/dist-admin
npm run admin:preview
npm run admin:dev
```

`VITE_DUEL_API_URL` is the only build input, and it is a **public API address**, not a key.

---

## 2. Authorization — the part that matters

Every request to `/v1/admin/*` is authorized **server-side**, on the server, before anything is read:

1. the `Authorization: Bearer <token>` header is resolved to a player (`MatchService.authenticate`);
   a missing or unusable token is **401**;
2. that player's **id** is looked up in `config.adminPlayerIds`; a player who is not on the list is
   **403** before the store is touched, so an unauthorized caller learns nothing but "no".

The allow-list is **never** taken from the client. The dashboard has no admin flag, no role cookie, no
`?admin=1`, no email check, and the token is never read from the URL (it would end up in history,
referrers and screenshots). The server resolves the caller's identity and compares ids — nothing else.
Both refusals are tested for **every** endpoint in `server/tests/admin.test.ts` (no token → 401, a
normal player's token → 403, the admin's token → 200).

### Setting the allow-list (no code change, no redeploy of new code)

`ADMIN_PLAYER_IDS` — a comma-separated list of player ids:

```sh
# Edge (production)
supabase secrets set ADMIN_PLAYER_IDS=37e3d4d0-a34c-45b3-bc61-992fcf392912,<second-player-id>
# Node server / local
ADMIN_PLAYER_IDS=37e3d4d0-a34c-45b3-bc61-992fcf392912 npm run server:dev
```

- **Adding a second admin needs no new code** — set the variable (Edge) or the env var (Node) and the
  new id works on the next request. Edge secrets are read once per isolate at boot, so give it a
  minute to roll over.
- Unset → the founding owner (`DEFAULT_ADMIN_PLAYER_IDS`, the one account in the database).
- Entries that are not shaped like a uuid (an email, a name, a truncated paste) are **dropped**, and a
  list that parses to nothing **locks every admin route** rather than opening them. An empty value is
  never read as "allow everyone".
- The list is printed in the server's boot line (ids are not secrets); the dashboard never shows it.

### What the browser holds

The player's **normal bearer token**, and nothing else. It is read from where the game already keeps
it on that device (`futa05:severgrow.duel.identity.v1`, or the `futa04:`/unprefixed variants), or
pasted by the owner into the gate (kept in `sessionStorage` for that tab). **No service-role key and
no database credential is ever built into, fetched by, or sent to the browser** — the API holds the
database access, exactly like every other endpoint. `admin/tests/format.test.ts` fails if any admin
source so much as mentions `service_role`, `DATABASE_URL` or a connection string, and the built
assets are scanned the same way.

Existing RLS is untouched: the new tables follow the same lock-down as `0002`/`0006`/`0009`/`0011`
(RLS on, every right revoked from `anon`/`authenticated`, not in the realtime publication). No policy
was relaxed to make any of this work.

---

## 3. The API

All routes require an allow-listed bearer token. `X` marks a mutation.

| route | returns |
|---|---|
| `GET /v1/admin/session` | who you are, rules version, the caps the UI states (page size, CSV cap, tag-scan limit) |
| `GET /v1/admin/whats-new` | the stored "last looked" cursor and the counts since it |
| `POST /v1/admin/seen` **X** | records the cursor (never in the future, never backwards) |
| `GET /v1/admin/overview` | the Overview screen in one response |
| `GET /v1/admin/ops` | stuck states, rules-version drift, build ranking, guest→account funnel |
| `GET /v1/admin/reports` | `feedback_reports` + triage, filtered and paginated (keyset) |
| `GET /v1/admin/reports.csv` | the same rows as CSV, same filters, same fields, capped |
| `POST /v1/admin/reports/:id/triage` **X** | status (`new`/`reviewing`/`resolved`) + private note; audited |
| `GET /v1/admin/player?q=` | nickname, tag (`#7QK2`) or player id lookup |
| `GET /v1/admin/matches[/:id]` | match list, and one match's result, participants and move timeline |
| `GET /v1/admin/ledger` | the Seeds ledger, filtered and paginated |
| `GET /v1/admin/economy` | minted vs spent, per category, receipts and denials, caps in force |
| `GET /v1/admin/world` | the map, recent claims and the day index the replay steps through |
| `GET /v1/admin/campaign` | verified campaign clears, per opaque level id and per chapter |

Every list is `order by … limit …` with a hard page cap (`MAX_PAGE`, 200) and, where the table grows,
a **keyset cursor** (`created_at|id`) rather than an offset. Nothing scans a full table:
`rate_limits` and `match_moves`, the two fastest-growing tables, are only ever touched by count.

**Fields each screen needs, and no more.** No endpoint returns a token, a token hash, the Google
subject, an email, an invite code, `matches.state`, deck order or a hand. The admin match endpoint
returns *how many* events a move produced, never the event payloads (they are the unfiltered
server-side record and can contain the opponent's hidden draw). This is asserted by tests, not just
intended.

**The one mutation** is report triage. Each change appends a row to `admin_audit` (who, what, when,
old→new status, the note *length*). The note text itself is **not** copied into the audit row: it
already lives on the report, and duplicating player-adjacent text into a second table is how private
text ends up somewhere nobody expected. No wallet adjustments, no tile transfers, no bans, no map
publishing, no gameplay change.

---

## 4. Every metric: exact, or unavailable

### Exact (a stored row, counted)

| figure | source |
|---|---|
| Completed matches today / 7 days, by mode | `matches` where `status='finished'`, split by the row's own `open_queue` / live columns |
| Match status counts | `matches.status` |
| Reports and crashes, today and 7 days | `feedback_reports.created_at`, `kind` |
| Worst build | `feedback_reports` grouped on the **normalised** build (see below) |
| Seeds awarded / spent (7 days and lifetime) | `seed_ledger` deltas; `seed_wallets` for the lifetime totals |
| World claims, owners, per-day claims | `world_claims` |
| The world replay at a day | every claim with `claimed_at` on or before that day (cumulative — a tile is never released) |
| Verified campaign first clears | `seed_reward_receipts` (`mode='campaign'`), awarded vs denied |
| Reward denials and their reasons | `seed_reward_receipts.denial` |
| Ledger per category, minted/spent/net | `seed_ledger` |
| Player record, wallet, tiles, rewards | `players`, `seed_wallets`, `seed_ledger`, `world_claims`, `seed_reward_receipts` |
| Stuck states | `matches` past `turn_deadline_at` / `expires_at`; guests matching the sweeper's own cleanup predicate |
| Rules drift | `matches.rules_version` grouped against `CURRENT_RULES_VERSION` |
| Guest → account | `players.kind`, `created_at`, `player_identities` |
| Health | the same storage ping `/v1/health?db=1` already uses |

### Unavailable, and shown as unavailable rather than guessed

- **Active users, retention, engagement, DAU/MAU.** The database keeps no trustworthy per-player
  last-seen history. `players` has no such column, and live-duel `presence_*` is current state, not a
  history. The Overview screen says so in a labelled panel. **No such metric is displayed.**
- **Campaign/Training matches in the match counts.** They never create a `matches` row; they are
  counted on the Campaign screen from their reward receipts. The Overview panel says so.
- **A level nobody has ever played.** It leaves no row anywhere, so the dashboard cannot distinguish
  "not yet cleared" from "not yet reached". `AdminCampaign.completeLevelListKnown` is always `false`
  and the screen prints that, rather than implying a complete level list.
- **A level's number for a level that only ever produced denials.** The number is recorded by the award
  path when it *pays*; where it is absent the screen shows "not recorded" and places it in no chapter.
- **A per-day upgrade series from `players.upgraded_at`.** Accounts that predate migration `0010` have
  `NULL` there. The dashboard reports how many accounts carry it and **switches the daily series to
  `player_identities.created_at`**, which is recorded for every link. It says which it used.
- **Whether `seed_wallets` and `seed_ledger` agree.** The dashboard shows both totals side by side and
  says a difference points at a settlement that never committed. It does not silently pick one.

### How a build string is normalised

A report's `build` is compound: `index-DYGB0cL9.js · 0.5.0 · futasaku0.4-strength-draw`. Grouping on
the raw string fragments a single deploy into one row per asset hash, so the dashboard groups on the
**first two segments** — the emitted asset plus the client version — which is what "the worst shipped
build" means. The third segment (the rules/channel label) is displayed **beside** the key, not inside
it. One implementation (`server/src/admin/types.ts normalizeBuild`) is shared by the server filter and
the dashboard, so the CSV's build filter and the build panel cannot disagree.

### The CSV export

`text/csv`, the same filters as the Reports screen, **the same field allowlist** — the header is
exactly `id,created_at,kind,status,build,player_id,player_tag,player_name,message,context,user_agent,note`.
It is capped at **`CSV_MAX_ROWS` = 5,000** rows (stated on screen and in the session payload), and it
is authorized by the same bearer check as the JSON view (asserted: 403 for a normal player, 200 for
the admin). One CSV-specific hardening: a cell starting with `=`, `+`, `-`, `@` or a tab/CR is prefixed
with an apostrophe so a spreadsheet cannot execute player-authored text. **The JSON path is untouched**
by that rule (a test asserts the literal message still appears in JSON).

---

## 5. The eight extras, and where they live

| extra | where | data |
|---|---|---|
| "Since you last looked" counters | Overview | new reports / crashes / claims / matches since `admin_seen.seen_at` |
| Stuck-state panel | Health & ops | expired `active` matches, expired `waiting` matches, cleanup-eligible guests — the windows are read from the server's own config, not guessed |
| Rules-version drift | Health & ops | `matches.rules_version` grouped; anything not `CURRENT_RULES_VERSION` |
| Guest → account funnel | Health & ops | `players.kind`/`created_at` + `player_identities.created_at`, with the `upgraded_at` caveat |
| Economy balance | Seeds & world | `seed_wallets` lifetime totals, `seed_ledger` by category, receipts/denials, and **minted-per-Seed-spent** (with the caps in force read from the economy's own constants) |
| Worst-build view | Overview + Health & ops | `feedback_reports` grouped on the normalised build, crashes vs reports |
| CSV export | Reports | the same authorized endpoint and field list, capped at 5,000 |
| Report triage | Reports | the single mutation, with `admin_audit` |

Windows actually found in the code (not guessed): the sweeper deletes a guest older than **30 days**
with no match, no Seeds, no ticket and no tile (`GUEST_MAX_AGE_MS` in `server/src/service.ts`); a
waiting match expires after **48 h** (`waitingExpireMs`); a turn deadline is **24 h**
(`turnTimeoutMs`). The stuck panel prints whichever values the running config has.

---

## 6. Migration — written, NOT applied

`server/migrations/0012_admin.sql` adds three tables and nothing else. It is **unapplied**; applying
it is part of the rollout the owner must approve.

| table | why |
|---|---|
| `admin_seen(admin_player_id, seen_at)` | the "since you last looked" cursor, deliberately **server-side** so it is the same from any machine (the `npm run feedback:recent` marker is a local file, which is exactly the limitation this avoids) |
| `feedback_triage(report_id, status, note, updated_at, updated_by)` | triage state. A report with no row is `new` — the API `LEFT JOIN`s and coalesces, so **no backfill is needed** and an old report can never be lost by the feature |
| `admin_audit(id, actor_id, action, target_type, target_id, detail, created_at)` | the record of every change |

`0012` is additive and idempotent (`create table if not exists`), follows the same RLS lock-down as its
predecessors, and never edits an earlier migration.

```sh
npm run server:migrate -- --status     # shows 0012_admin.sql as pending
npm run server:migrate                 # applies it (ONLY after approval)
```

**Until it is applied**, the dashboard's triage and "seen" writes will fail (503/500 on those two calls)
and the report list will read as if every report were `new` — the read screens otherwise work, because
`feedback_triage` is only ever `LEFT JOIN`ed.

---

## 7. Rollout — prepared, not done

1. **Apply `0012_admin.sql`** (owner approval).
2. **Set `ADMIN_PLAYER_IDS`** if the owner wants anyone besides themselves (optional; the default is
   already the owner's id).
3. **Publish the dashboard at `/admin/`.** The composer side is **already in place and tested**
   (`scripts/compose-futa05-preview.mjs` takes an optional fourth argument, `adminDist`);
   the CI side is deliberately **NOT applied**, because the preview workflow runs on every push and
   applying it would publish the dashboard without the approval above.

   The exact change to `futasaku04-preview.yml` (in the `futa05` build job) when the owner approves:

```yaml
      - name: Build the admin dashboard
        working-directory: futa05
        env:
          VITE_DUEL_API_URL: ${{ vars.VITE_DUEL_API_URL || vars.FUTA05_API_URL }}
        run: npm run admin:build          # → futa05/web/dist-admin

      # In the existing "Compose routes…" step, pass the admin build as the 4th argument:
      #   node futa05/scripts/compose-futa05-preview.mjs site futa05/web/dist "$(git -C futa05 rev-parse HEAD)" futa05/web/dist-admin
```

   With that line absent (today's state), the composer prints `/admin/ = not included` and the site
   is **byte-identical** to what it deploys now — asserted by `tests/compose-futa05-preview.test.ts`
   ("does NOT publish /admin/ unless a build is passed to the composer").

   When it is present, the composer: copies the build to `site/admin/`; adds `admin` to
   `SIBLING_ROUTES` so the "move Main to /firststep/" step cannot sweep it away; teaches the **root**
   worker to ignore `/admin/` (without that, a visit to `/admin/` would be cached as the root's
   offline index); and refuses a build that would not work from a subdirectory (an absolute asset
   path, a missing entry file, or a service-worker registration).

   Each deploy recomposes the whole site from scratch, so **whichever branch pushes last decides
   whether `/admin/` is present**. While only the futa0.5-online workflow carries the step, a
   `futa0.4` push would drop `/admin/` until the next `futa0.5-online` deploy. Enabling it on both
   lines therefore means one small commit on `futa0.4` too — the owner's call, and not part of this
   change.
4. **Verify after deploy:** `https://www.futasaku.com/admin/` loads, the owner's token is accepted,
   and the same URL with a normal player token shows *Access denied*.

`/admin/` is `noindex, nofollow`, unlinked from the game, and mentioned in no player-facing string.

---

## 8. Tests

| suite | covers |
|---|---|
| `server/tests/admin.test.ts` | authorization on **every** endpoint (no token → 401, player → 403, admin → 200); the empty allow-list locking everything; a second id in the list; the allow-list parser (and that junk can never become an admin); triage + audit; filters, keyset pagination, the limit clamp; the CSV header/cap/formula hardening; `normalizeBuild`; the economy ratio with no denominator; the campaign shaper (recorded rows, opaque ids, incomplete list); and that no secret or hidden-state column can reach a payload |
| `admin/tests/format.test.ts` | the pure formatting/replay logic; **no game source imports `admin/`**; the dashboard carries no key or connection string; its own Vite root and output; and a stylesheet check that it introduces no colour, radius or shadow outside the app's own tokens |
| `web/e2e/admin-dashboard.ts` | the built page in Chromium against a real local API: the access-denied screen for a normal player, all six screens plus Health & ops, "since you last looked", triage + the note really stored, CSV 200/403, the 183-hex map and a cumulative replay, keyboard navigation, and no horizontal overflow at 390 px |
| `tests/compose-futa05-preview.test.ts` | the composer publishes `/admin/` **only** when handed a build, puts it at the site root (never inside `/firststep/`), teaches the root worker to ignore it, and refuses a build that could not work from a subdirectory |

```sh
npm run check                                    # includes both unit suites
PW_CHROMIUM=… npx tsx web/e2e/admin-dashboard.ts # the browser pass
```

---

## 9. Judgement calls (decided for the owner)

- **Report triage status is stored in its own table** rather than new columns on `feedback_reports`, so
  the existing table's lock-down and shape are untouched and no report can be lost by the feature.
- **The audit row records the note's length, not its text** (see §3).
- **The economy's "inflation ratio" is minted ÷ spent**, and is shown as `—` when nothing has been
  spent — a ratio without a denominator is not `0` or `1`.
- **A tag search is bounded to the 2,000 most recently created players.** The tag is a hash of the
  player id (`src/player-tag.ts`), so it cannot be indexed or reversed; the screen states the bound and
  suggests the id for a very old player.
- **Health is a read of what already exists** (the storage ping), not a monitoring system: nothing here
  alerts anyone.
- **`/admin/` is served at `/admin/` on the composed site**, not as a separate host — it is on the same
  origin as the game, which is what lets it reuse the token the game already stored on that device.
