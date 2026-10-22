# Territory challenges — the design pass

The loop exists in the handoff as seven phrases: *hostile takeover, adjacency/connector rule,
24 h timer, resolved by a linked duel, first-confirmed-wins, timer ring*. Nothing is in code.
This is the design pass that line asks for, written against the schema and UI that already exist.

**Status: awaiting four decisions (bottom). Nothing built yet on purpose.**

## The one thing that is not a coding decision

`docs/WORLD-MAP.md` states the world's central promise:

> Each claim costs exactly 100 Seeds. **Owners never lose cells** through map claims, account
> renames, or game results.

A hostile takeover *is* losing cells through a game result. So this feature deliberately reverses
a documented invariant, and there are **9 real claims** in production (RYK × 8, Lidwingo × 1), each
paid for with 100 Seeds. That is the owner's call, not an implementer's, which is why it is
question 1 below rather than a default I pick.

The design below is written so the loop is *safe* — nobody loses property to a timer, a bug or a
disconnect, only to a duel they chose to play — and so the reversal is narrow and auditable.

## The loop, in one paragraph

You may challenge a **neighbour's tile that shares a hex side with your own territory**. The
challenge is a formal, staked invitation: you put 100 Seeds behind it, and the defender has **24 h**
to answer. Decline, or let the timer run out, and the challenge **lapses and your Seeds come back** —
the defender keeps their tile. Accept, and the two of you are handed a **linked duel** (the existing
match engine, unchanged). When that duel finishes, **either player may confirm the result, and the
first confirmation settles it**: the winner takes the tile, and the 100-Seed stake follows the win.
Then the map is redrawn for both, and the loser's territory is one cell smaller.

Why this shape:

- **The tile moves only after a real game, or after silence.** As BUILT (owner's decision, 2026-10-21)
  an unanswered challenge is a FORFEIT: after 24 h the challenger takes the tile. See the warning
  below, because this is the one rule that can cost an absent player their ground.
- **It is a stake, not a fee.** Both sides wager value ≈ 100 (one a tile, one the Seeds), so the
  risk is symmetric even though the objects differ.
- **First-confirmed-wins is a feature, not a race to exploit.** It means a player whose connection
  dropped at the end of a duel still loses or wins the tile correctly, because the other side's
  confirm is enough. The settlement is idempotent — the second confirm is a no-op that returns the
  same result.

### ⚠ The forfeit rule, stated plainly

`expireChallenges` moves the tile to the challenger when a pending challenge passes `expires_at`,
and refunds the challenger's own stake. Consequences, all accepted deliberately by the owner:

- A player who is ill, travelling or simply not logging in **loses paid tiles without playing**.
- Anyone can park three challenges on a quiet neighbourhood and collect it daily for free.
- The defence is social (the defender gets 24 h of notice in the rail and can decline, which keeps
  the tile) and economic (the challenger risks 100 Seeds per attempt, returned only on a win or a
  decline).

The exposure is one constant: `WORLD_CHALLENGE_FORFEIT_MS` in `server/src/seeds/config.ts`. Raising
it to 72 h or 7 days is a one-line change with no schema impact. If this ever ships to players who
are not the owner, that constant should be revisited first.

## Rules, stated exactly

1. **Who.** Any owned cell whose owner is not you.
2. **Where (the adjacency/connector rule).** The target must share a **hex side** with at least one
   cell you own — a shared *frontier edge*. A corner does not count; neither does a cell across the
   water. This is the same `worldNeighbours` relation the claim rule already uses, read from the
   other side, so there is one adjacency truth in the codebase and no second geometry.
3. **One at a time.** You may hold at most **3 outgoing** challenges and the defender at most **3
   incoming**, and **one per cell** — enforced by a partial unique index, exactly as
   `live_challenges_one_pending_idx` already does for duels. This is what stops a 274-cell map
   turning into a notification war.
4. **Cost.** The challenger escrows **100 Seeds**. It is debited on *send* (so you cannot promise
   money you spent) and refunded on lapse/decline. On a win it returns to you; on a loss it is paid
   to the defender. Seeds are only ever moved, never created or destroyed by this feature.
5. **The timer.** 24 h from send. A cell may be challenged again only after its previous challenge
   is closed, so a defender with one aggressive neighbour cannot be spammed.
6. **Resolution.** Accept creates a match with `kind = 'territory'` and both players seated; the
   challenge stores `match_id`. When the match finishes, **either** participant may `POST
   /v1/world/challenges/:id/confirm`. The first confirm applies the transfer in one transaction and
   records `winner_id`; later confirms return the stored result. A challenge with no finish after
   **7 days** closes as `stale` and refunds (never transfers).
7. **Never on rock.** Rock holds no tile, so it cannot be contested — enforced by the same
   `worldCell` lookup claims already use.

## Data (one table, one migration)

Modelled directly on `live_challenges`, which already solved the same concurrency problems:

```sql
create table if not exists world_challenges (
  id             uuid primary key default gen_random_uuid(),
  cell_id        text not null references world_claims(cell_id) on delete cascade,
  challenger_id  uuid not null references players(id) on delete cascade,
  defender_id    uuid not null references players(id) on delete cascade,
  status         text not null default 'pending'
                 check (status in ('pending','accepted','declined','expired','resolved','stale')),
  stake          integer not null check (stake > 0),
  created_at     bigint not null,
  expires_at     bigint not null,
  responded_at   bigint,
  match_id       uuid references matches(id) on delete set null,
  winner_id      uuid references players(id) on delete set null,
  resolved_at    bigint,
  check (challenger_id <> defender_id)
);
-- ONE open challenge per cell: the same trick the duel table uses.
create unique index if not exists world_challenges_one_open_idx
  on world_challenges (cell_id) where status in ('pending','accepted');
create index if not exists world_challenges_defender_idx on world_challenges (defender_id, status);
create index if not exists world_challenges_challenger_idx on world_challenges (challenger_id, created_at desc);
```

The escrow is a `seed_ledger` row (`category = 'world_challenge'`, negative on send) plus a wallet
debit in the same transaction as the insert — the existing `claim()` path already does exactly this
shape, so it is a copy of a proven pattern rather than a new one. Refunds and payouts add the
matching positive row. No new ledger semantics.

## API (extends the existing router)

`GET /v1/world` gains nothing — pending challenges are **not** public, because they are between two
players and the map is public. Instead:

```
POST   /v1/world/challenges            { cellId, requestId }   -> challenge
GET    /v1/world/challenges            -> { incoming: [...], outgoing: [...] }
POST   /v1/world/challenges/:id/respond { accept: boolean }    -> challenge
POST   /v1/world/challenges/:id/confirm                        -> { settled, winnerId, cellId }
```

Every write takes a request id and replays its original result on duplicate, the same idempotency
contract claims already honour. All four require a bearer token; none expose a balance.

## The screen (minimal, distinct, FUTASAKU)

The map already carries the whole visual language: grained ground, hexes as coloured glass, cream
ink, one `--territory` accent. The challenge layer adds **three** things and no new colours.

- **The frontier.** When a cell of yours is selected and a rival tile touches it, that tile gains a
  hairline in `--territory` plus a small notched corner mark. Nothing else changes; the map stays a
  map. Tapping it opens the challenge sheet instead of the claim bar.
- **The timer ring.** The signature element. A thin ring **traced along the hex's own outline**
  (the same 6-point `hexPath` the tiles use, so it is the cell's shape, not a circle stuck on top),
  draining clockwise from full to empty over the 24 h. It is `stroke-dasharray` animated on the
  path, so it costs one attribute and no layout. Under 6 h it starts a slow breath; on expiry it
  collapses to nothing over 400 ms. On the challenge list each row carries a small version of the
  same ring, so one shape means one thing everywhere.
- **The challenge sheet.** Two states, one sentence each: *"RYK holds this ground. Stake 100 Seeds
  and give them 24 h?"* with one key — `CHALLENGE` — and, for the defender, `ACCEPT` / `DECLINE`
  with the staked amount and the remaining time spelled out. No second button appears until the
  duel is confirmed, where the single line is *"TAKE THE GROUND"*.

Motion rules already in force apply: no new continuous animation beyond the ring, `reduce-motion`
stops the breath (the ring still shows its drained length), and nothing is announced by movement
alone.

## What this does NOT change

`src/engine/` untouched — no rule, deck, scoring or bot change. The linked duel is the existing
match engine with `kind = 'territory'`; a duel is a duel. Claims, the ledger's immutability, the
`/v1/world` payload shape and the 274-cell geometry are all unchanged.

## Four decisions needed before code

## The four decisions — ANSWERED by the owner, 2026-10-21, and built this way

1. **May a played duel transfer a paid tile?** → **Yes, the winner takes the cell.** Code.
2. **If the defender never answers within 24 h?** → **Forfeit: the challenger takes the tile.**
   Code (`expireChallenges`). The warning above applies.
3. **The stake?** → **Challenger escrows 100; the winner takes it and the tile.** Code.
4. **What counts as "adjacent / connected"?** → **A shared hex side with your territory.** Code.

Everything below describes the build that followed.

## What was actually built

| Layer | Where |
| --- | --- |
| Migration | `server/migrations/0014_world_challenges.sql` — table, one-open-per-cell partial index, `matches.kind`, `world_claims.source = 'challenge'`, RLS locked down |
| Store | `server/src/seeds/{types,memory,postgres,config}.ts` |
| Service | `server/src/seeds/service.ts`, `server/src/service.ts` |
| Routes | `server/src/seeds/router.ts` — send/list/respond/confirm, bearer only, no balance exposed |
| Match link | `server/src/storage/{types,postgres}.ts` — a `kind='territory'` match, settled only when finished |
| Client | `web/src/online/{challenge-view,challenge-copy}.ts`, `world-view.ts`, `online-css.ts`, `lobby-ui.ts` |
| Edge | `supabase/functions/duel/bundle.ts` — rebuilt, **not deployed** |

## Verification — what was actually run

- `tsc` clean for root, web and admin.
- **2544 unit tests pass**; the only failure is `tests/engine/v05-adversarial.test.ts` ADVERSARIAL 8,
  which needs `npx` (absent on this machine) and is green in CI.
- `server/tests/territory-challenges.test.ts` + `web/tests/territory-challenges.test.ts`: **21/21**.
- `web/e2e/territory-challenges.ts`: **84 checks, 0 failures, 0 page errors** on a clean rebuild at
  320×568, 360×640 and 390×844.
- `web/e2e/world-pan.ts` 56 and `web/e2e/world-map-header.ts` 175, both clean.

## What is still NOT proven — read before deploying

1. **The Postgres path has run locally, not on Supabase.** On 2026-10-22 all 15 migrations
   (0014 included) applied from scratch to a local Postgres 16, a re-run was a no-op, and
   `server/tests/territory-postgres.integration.test.ts` passed 5/5 through the real service and
   SQL store: accept → duel → two simultaneous confirms (exactly one settles), a defender win, the
   24 h forfeit, the 7-day stale close, and two challengers racing for one tile, with Seeds conserved
   in every case. `pg_cron`/`pg_net` and the `anon`/`authenticated` roles were local stand-ins, so the
   three Supabase-ownership checks in `postgres.integration.test.ts` could not pass there. **Still
   apply the migration to a staging copy of the real schema first** - the live data and Supabase's
   own roles are what that local run could not cover.
2. **No two-real-account pass.** The browser suite stubs every API call. Nobody has watched a real
   challenge go from send to a transferred tile against the live API.
3. **Nothing is deployed.** No migration applied, no Edge deploy, not on the publishing branch.
4. **Forfeit and stale are lazy** — they run on map/challenge reads and the daily `/v1/sweep`, not on
   a scheduler. A challenge past its deadline does not change state until someone reads.
5. **Chromium emulation only.** No Safari, no real device. See the companion programme.
6. **If the contested cell moved on before settlement**, the challenge still resolves and pays out
   but the tile does not move. Safe, but a silent difference worth knowing.
7. **No challenger push on accept** — the defender opens the duel immediately; the challenger finds
   it on the 12 s poll and taps `OPEN DUEL`.

## What still has to happen before a player sees this

1. Apply `0014_world_challenges.sql` to a **staging copy** of the production schema and back up the
   live database first. Run `REQUIRE_DATABASE=1 npx vitest run server/tests/seeds-postgres.integration.test.ts
   server/tests/territory-postgres.integration.test.ts` against it.
2. A **two-real-account pass** on that staging API: send, decline, and accept → duel → confirm, with
   both wallets watched. Nothing in CI covers this and no unit test can.
3. Rebuild and deploy the Edge bundle only after 1 and 2, then verify `/v1/health?db=1` and
   `/v1/world` exactly as the map deploy was verified.
4. A live certification on the real site, then the device sweep in the companion doc — the timer ring
   and the challenge sheet are added to that matrix the day they land.

Until 1–3 are done this is a branch, not a feature.


## The phone check, in the same breath

Companion: `docs/DEVICE-AND-QUALITY-CHECKS.md` — the iPhone/iPad/Android matrix that has never been
run, plus the performance, feel and satisfaction pass. The timer ring and the challenge sheet are
added to that sweep the day they land.
