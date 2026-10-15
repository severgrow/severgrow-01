-- FUTASAKU 0.5 — WORLD MAP SEED (spike): the shared map a finished duel can mark.
--
-- The smallest proof that a duel RESULT can leave a PERMANENT MARK on a SHARED map other players
-- can see. ONE row per finished duel that produced a winner = ONE tile. This is deliberately NOT a
-- territory system: no regions, no income, no per-hex combat, no claim/defend rules.
--
-- Placement is decided entirely by the server (server/src/world.ts) from the match id and the two
-- seats, so a client can never place, move or choose a tile. The table only records the decision:
--
--   cell        the fixed grid cell, 0..63 (the map is an 8x8 grid, identical for every player)
--   match_id    the finished duel that earned the tile — UNIQUE, so one duel can award at most one
--               tile no matter how many times the finish is observed (idempotency in the database)
--   owner_id    the winner who holds the cell right now
--   awarded_at  epoch ms, always supplied by the server
--   took_over   true when this tile was TAKEN from the opponent by beating them (the challenge rule)
--
-- `cell` is the primary key: one owner per cell, so the map can never show two names on one hex.
-- A later win that takes the cell over UPDATES that row (the previous match's tile is replaced, so
-- the unique match_id stays honest: a finished duel always maps to at most one live tile).
--
-- Additive and idempotent. No existing table is altered; a player who never opens the map sees no
-- change at all.
--
-- P-21: same lock-down as 0002/0006 — RLS on with no policies, every right revoked from
-- anon/authenticated, default privileges stay revoked, and nothing is added to the realtime
-- publication (the world map is plain REST reads, never table replication).

create table if not exists world_tiles (
  cell        smallint primary key check (cell >= 0 and cell < 64),
  match_id    uuid    not null unique references matches (id) on delete cascade,
  owner_id    uuid    not null references players (id) on delete cascade,
  awarded_at  bigint  not null,
  took_over   boolean not null default false
);

-- "Which tiles does this player hold?" — the challenge rule reads this on every finished duel.
create index if not exists world_tiles_owner_idx on world_tiles (owner_id);

alter table world_tiles enable row level security;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on world_tiles from %I', client_role);
      execute format('revoke all on all tables in schema public from %I', client_role);
      execute format('revoke all on all sequences in schema public from %I', client_role);
      execute format('revoke all on all functions in schema public from %I', client_role);
      execute format('alter default privileges in schema public revoke all on tables from %I', client_role);
      execute format('alter default privileges in schema public revoke all on sequences from %I', client_role);
      execute format('alter default privileges in schema public revoke all on functions from %I', client_role);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime drop table world_tiles';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
  end if;
end $$;
