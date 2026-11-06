# Task for Cursor: deploy the server (Supabase `duel` function) — 2026-11-04

Read `AGENTS.md` first. This task needs a machine that can log in to Supabase (the cloud agent
could not: no `SUPABASE_ACCESS_TOKEN`, and its network blocks `*.supabase.co`).

## Why

`futa0.5-online` (latest commit) carries server changes that are written and tested
but **not deployed**. Until the `duel` Edge Function is redeployed, players see the old rules:

| Owner asked for | Old server does | New server does |
|---|---|---|
| "I should be able to grow anywhere" on THE PLANET | Only tiles next to the known map; far tiles read "OUT OF REACH FOR NOW" | Any free planet hexagon (`growAnywhere: true` in `GET /v1/world`) |
| Selling a tile pays 50 Seeds | Pays 100 | Pays 50 (`saleReturn: 50` in `GET /v1/world`) |
| Level 10 is a "real first game, big board" | Only confirms (and pays 100 Seeds for) the old small-map opening | Confirms the new full-board game too, and still the old one |
| "Remove the skipping growth in all levels" (bots-v0.11) | Knows only bot `bots-v0.10`: the page HOLDS every Seeds proof won against the new bots (Campaign, Training, level 10) until the server lists `bots-v0.11` | Verifies both `bots-v0.10` and `bots-v0.11`, lists both in `GET /v1/health` `features`; held proofs are then paid on the player's next menu visit |

**Deploy the server BEFORE the owner promotes the new level 10.** Until then, a level 10 win from the
new page cannot be confirmed, and its 100 Seeds are not paid.

**No database migration is needed for this.** Both rules live in server code
(`server/src/world.ts` `PLANET_GROWTH`, `server/src/seeds/config.ts` `tileSaleReturn`). Planet tile
ids are plain text in `world_claims.cell_id`, which has no format check.

## Steps

```sh
git fetch origin futa0.5-online && git checkout futa0.5-online && git pull --ff-only
npm ci

# 1. The committed bundle must match the source. Expect NO diff after rebuilding.
npm run server:build-edge
git status --short supabase/functions/duel/bundle.ts   # must print nothing
```

**2. Check the latest migrations are on the live database.** Run this in the Supabase dashboard → SQL editor:

```sql
select
  to_regclass('public.player_tile_colours') is not null as m0020_tile_colours,
  to_regclass('public.campaign_clears')     is not null as m0021_campaign_clears,
  to_regclass('public.offline_stats')       is not null as m0022_offline_stats,
  exists (select 1 from information_schema.columns
          where table_name = 'world_challenges' and column_name = 'stake_cell_id') as m0019_stake;
```

- **All `true`:** go to step 3.
- **Any `false`:** run that one file from `server/migrations/` in the SQL editor, then re-check.
  These files only add things and are safe to run twice.
- Never edit an old migration.
- Never drop anything.

```sh
# 3. Deploy (CLI login opens a browser once)
npx supabase login
npx supabase functions deploy duel --project-ref wbfrbeedlvjercrukngn --no-verify-jwt

# 4. Verify
curl -sS 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/health?db=1'
#    expect "ok" and db.ok
curl -sS 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/world' | grep -o '"growAnywhere":true\|"saleReturn":50'
#    expect both strings printed
curl -sS 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/health' | grep -o '"bots-v0.11"'
#    expect "bots-v0.11" printed (the page sends held Seeds proofs only once it sees this)
BASE_URL=https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel npm run server:smoke
```

5. Open futasaku.com/test/ → THE PLANET and check these by hand:
   - Tap a far, empty hexagon: it offers the Grow key.
   - Tap your own tile: the key reads `SELL · +50`.

## Rules while doing this

- **One deploy at a time.** A redeploy drops duels in progress, so deploy at a quiet moment. Do not
  run load tests at the same time (`docs/DEPLOY-ONLINE.md`, "Only one driver at a time").
- **Branches:** do not push to `main`, `dev` or `Main2.0`. Do not force-push `futa0.5-online`. Do not
  run `npm run promote` unless the owner says "promote".
- **Secrets:** do not print or commit any of them (`DATABASE_URL`, access tokens, keys).
- **If something fails:** stop and report the exact error. Rollback = check out the previous
  `futa0.5-online` commit, run `npm run server:build-edge`, and deploy again.
- **Report to the owner in plain English:** what was deployed, what each check showed, and anything
  not checked.

The server is shared by /test and the live site. Old pages keep working against it, because the new
fields are optional. One known mismatch: until the owner promotes, the live page's sell key still
describes the sale as "+100" in its hidden label, while the server pays 50. Tell the owner, so they can
promote soon after the deploy.

---

## 2026-11-06: BLITZ replaces Real time (redeploy the `duel` function)

Owner: "BLITZ replaces real time ... they have 21 seconds each and see their moves". The page side is live
with the next promote; the SERVER side needs this redeploy (no migration):

- `server/src/live/config.ts`: `LIVE_TURN_MS` default 60 s -> **21 s** (an `LIVE_TURN_MS` secret, if set
  in Supabase, still wins — remove it or set it to `21000`).
- `server/src/live/service.ts`: a CONNECTED player whose clock runs out no longer loses — the turn is played
  out by the autoplayer and the match goes on. A player who stays disconnected through the reconnect ladder
  still loses; leaving still forfeits.
- `server/src/live/autoplay.ts`: the auto-played turn throws the LOWEST number card (a Bomb only if nothing
  else), not the drawn card.

Steps: `npm run server:build-edge` must print no diff on `supabase/functions/duel/bundle.ts` (it was rebuilt
in commit d1144ae7's parent), then `supabase functions deploy duel`. Check: `GET /v1/health` responds; a
Blitz duel's clock reads 21:00.

Until this is deployed, online Blitz shows the server's old 60 s clock and a timeout still loses. Moves are
already sent one by one (the page commits each move at once in a Blitz duel; no server change was needed for
that).
