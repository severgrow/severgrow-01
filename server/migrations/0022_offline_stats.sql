-- THE OFFLINE GAME RECORD, COUNTED ACROSS DEVICES (owner, 2026-11-01).
--
-- WHY A TABLE. A duel played offline lives only in localStorage on the device that played it, so
-- the server has never heard about it. The Profile screen shows three lifetime numbers — games,
-- win rate, longest streak — and they must be the account's, not one browser's. Each signed-in
-- device now posts its running totals; this table holds the server's copy.
--
-- ONE ROW PER (PLAYER, DEVICE) with that device's CUMULATIVE counters, never a delta. An upsert
-- replaces the row, and the API never lets a counter go down (`greatest`), so a stale or racing
-- snapshot can repeat progress but never erase it.
--
-- `best_streak` is that device's longest run. A streak is local to the run that set it, so the
-- account's longest streak is MAX(best_streak) across devices, never a sum. Games, wins, losses
-- and draws are sums.
--
-- Additive and idempotent. RLS on with no anon/authenticated policies, exactly like every other
-- table: only the service role (the API server) may read this. Never edit an earlier migration.
create table if not exists offline_stats (
  player_id uuid not null references players(id) on delete cascade,
  device_id text not null,
  played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  best_streak integer not null default 0,
  updated_at bigint not null,
  primary key (player_id, device_id)
);

-- The only read is the caller's aggregate over all their devices, so player_id alone is the index
-- that matters.
create index if not exists offline_stats_player_idx on offline_stats (player_id);

alter table offline_stats enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on offline_stats from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on offline_stats from authenticated';
  end if;
end $$;
