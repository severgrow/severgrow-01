-- WHERE A PLAYER IS (owner, 2026-11-20: "country flag should be shown on each player profile
-- publicly in the planet or elsewhere tapped"). Additive only: one new table, nothing existing is
-- altered, so a page or server from before this keeps working.
--
-- One row per player, written ONCE at sign-in (or guest creation) from the edge's own geo header
-- (`cf-ipcountry`, server/src/geo.ts) and read by the public profile. It is the only place a country
-- is stored: a visitor's profile read never performs a geo lookup, and no IP address is kept.
--
-- The check constraint is the last line of defence: only a real two-letter code can be stored. A
-- missing row means "unknown", which the client renders as NO flag rather than a guessed one.
create table if not exists player_countries (
  player_id uuid primary key references players(id) on delete cascade,
  country text not null check (country ~ '^[A-Z]{2}$'),
  updated_at bigint not null
);

alter table player_countries enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on player_countries from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on player_countries from authenticated';
  end if;
end $$;
