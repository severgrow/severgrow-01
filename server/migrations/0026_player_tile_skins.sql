-- A player's public Planet land appearance. Ownership and tile colour remain authoritative in
-- their existing tables. Only a deliberate choice creates a row; existing accounts keep the
-- previous plain-colour appearance until they choose a skin.
create table if not exists player_tile_skins (
  player_id uuid primary key references players(id) on delete cascade,
  skin_id text not null check (skin_id in ('forest', 'ash', 'water', 'toxic')),
  chosen_at bigint not null
);

alter table player_tile_skins enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on player_tile_skins from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on player_tile_skins from authenticated';
  end if;
end $$;
