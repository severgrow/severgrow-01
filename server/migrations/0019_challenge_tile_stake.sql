-- FUTASAKU 0.5 — free Territory challenges: the challenger puts a TILE at stake (owner, 2026-10-29).
--
-- "make challenging free. make it clear, that if you lose, you lose the tile that you challenged
--  with and opponent takes it. so challenging is like putting your tile at stake."
--
-- WHAT CHANGES
--   * `stake_cell_id` records the challenger's own tile, auto-chosen nearest the contested tile.
--     It is PLAIN text, deliberately NOT a foreign key to world_claims: a tile can be sold, moved by
--     the owner from the dashboard, or taken by another settlement, and an `on delete cascade` would
--     DELETE the challenge row (silently erasing a live duel's stake), while `on delete set null`
--     would erase the very record the settlement needs. Validation lives in code
--     (server/src/seeds/stake.ts), and every settlement re-checks the holder under its row lock.
--   * `stake` is KEPT: it is the historical record for rows created before this migration (they
--     escrowed 50 Seeds) and it makes old data readable. New challenges are written with stake = 0.
--     The old `check (stake > 0)` is replaced with `check (stake >= 0)`, guarded so a re-run is a
--     no-op. That is why the swap below drops every CHECK constraint on this table that mentions
--     `stake` before adding the new one: a re-run finds only the `>= 0` form and replaces it with
--     the identical rule.
--
-- Additive and idempotent. NEVER edit earlier migrations.

-- ---------------------------------------------------------------- the stake column

alter table world_challenges add column if not exists stake_cell_id text;

-- A settlement and a sale both ask "is this cell a stake?", so give that lookup its own index.
create index if not exists world_challenges_stake_cell_idx
  on world_challenges (stake_cell_id) where stake_cell_id is not null;

-- The lazy automatic settlement scans accepted challenges whose linked duel may have finished.
create index if not exists world_challenges_accepted_idx
  on world_challenges (status) where status = 'accepted';

-- ---------------------------------------------------------------- relax the historical stake check

do $$
declare
  existing record;
begin
  -- Drop any check constraint on this table whose definition mentions `stake` (the historical
  -- `stake > 0` and, on a re-run, this migration's own `stake >= 0`).
  for existing in
    select conname
      from pg_constraint
     where conrelid = 'world_challenges'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%stake%'
  loop
    execute format('alter table world_challenges drop constraint %I', existing.conname);
  end loop;
  alter table world_challenges add constraint world_challenges_stake_check check (stake >= 0);
end $$;
