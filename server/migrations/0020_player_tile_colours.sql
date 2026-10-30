-- Your tile colour (owner, 2026-10-30): "create 20 different colours ... so player can choose what
-- color are their tiles ... persist the choice server-side so it follows the player to another
-- device".
--
-- One row per player, and only when they actually CHOOSE a colour. A player with no row keeps the
-- palette colour derived from their id (src/tile-colours.ts), so the existing map is re-coloured by
-- the deployment of that palette alone — this table adds the personal override, it does not seed
-- anything.
--
-- `colour_id` is the palette SLOT (0..19 today) and the palette is append-only, so an id keeps its
-- meaning for ever. The upper bound is deliberately loose: adding colours later must not need a
-- migration, and a row written by a newer server is ignored by an older one rather than breaking a
-- map read.
create table if not exists player_tile_colours (
  player_id uuid primary key references players(id) on delete cascade,
  colour_id smallint not null check (colour_id >= 0 and colour_id < 64),
  chosen_at bigint not null
);

-- Same posture as the other economy tables: nothing reaches this table except the Edge function.
alter table player_tile_colours enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on player_tile_colours from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on player_tile_colours from authenticated';
  end if;
end $$;
