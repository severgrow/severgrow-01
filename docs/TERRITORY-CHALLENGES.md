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

- **It never punishes absence.** A 24 h timer that hands a stranger your paid tile while you are
  asleep is how you lose a player forever. Here the timer only ends an *unanswered invitation*.
- **The tile moves only after a real game.** No forfeits, no mails, no auctions. The thing that
  decides ownership is the thing the game is about.
- **It is a stake, not a fee.** Both sides wager value ≈ 100 (one a tile, one the Seeds), so the
  risk is symmetric even though the objects differ.
- **First-confirmed-wins is a feature, not a race to exploit.** It means a player whose connection
  dropped at the end of a duel still loses or wins the tile correctly, because the other side's
  confirm is enough. The settlement is idempotent — the second confirm is a no-op that returns the
  same result.

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

1. **May a played duel transfer a paid tile?** (This reverses the documented "owners never lose
   cells … through game results".)
   - **A. Yes — winner takes the cell** (the design above). *Recommended.*
   - B. No transfer: the challenge is for Seeds only, the map stays permanent.
   - C. Transfer, but the loser is automatically compensated 100 Seeds.
2. **If the defender never answers within 24 h:**
   - **A. It lapses, stake refunded, tile stays.** *Recommended.*
   - B. The challenger takes the tile by forfeit (free land grab, and punishable by absence).
3. **The stake:**
   - **A. Challenger escrows 100; the winner takes it and the tile.** *Recommended.*
   - B. Free to challenge (the defender risks property for nothing).
   - C. Both sides stake 100.
4. **What counts as "adjacent / connected":**
   - **A. A shared hex side with your territory.** *Recommended.*
   - B. Any of your cells within 2 hexes.
   - C. Any rival tile anywhere (no geometry).

## Build order once decided

1. Migration + `world_challenges` store methods, with tests that prove one-open-per-cell and that
   Seeds conserve across send → refund and send → payout.
2. Router routes with idempotent replay; a two-player integration test (send, decline, refund).
3. `kind = 'territory'` match linkage + the confirm settlement transaction (the only place ownership
   changes), then a test that a second confirm cannot transfer twice.
4. The frontier mark, the timer ring, the two-state sheet, and the challenge list.
5. Edge bundle rebuild, then the same certification discipline as the map: claims gate, `/v1/health`,
   a live two-account pass, and the real-device sweep in the companion doc.

## The phone check, in the same breath

Companion: `docs/DEVICE-AND-QUALITY-CHECKS.md` — the iPhone/iPad/Android matrix that has never been
run, plus the performance, feel and satisfaction pass. The timer ring and the challenge sheet are
added to that sweep the day they land.
