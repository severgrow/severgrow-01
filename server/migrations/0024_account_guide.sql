-- ACCOUNT GUIDE PROGRESS (owner, 2026-11-09).
--
-- The in-game guide (web/src/player/guide.ts) remembers which teaching windows a player has opened
-- and how many games they have started with it on, so the "seen" list follows a signed-in account
-- to other devices. ONE row per player; the API merges (union of beats, higher game count), so a
-- lagging device can never take a beat back.
--
-- Additive and idempotent. RLS on with no anon/authenticated policies, exactly like every other
-- table: only the service role (the API server) may read this. Never edit an earlier migration.
create table if not exists account_guide (
  player_id uuid primary key references players(id) on delete cascade,
  seen jsonb not null default '[]'::jsonb,
  games integer not null default 0,
  updated_at bigint not null
);

alter table account_guide enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on account_guide from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on account_guide from authenticated';
  end if;
end $$;
