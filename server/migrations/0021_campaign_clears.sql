-- ACHIEVEMENTS — the shape of a verified Campaign clear (owner, 2026-10-30:
-- "achievments should also include online games, campaign ... a level without a single undo,
-- clearing a level first try").
--
-- WHY A TABLE. The campaign proof is replayed by the server and then reduced to one receipt
-- (`campaign:c<chapter>-<level>` / `lesson:10`); the action log itself is not kept. The two campaign
-- craft achievements ("Clean hands": a clear with no draws from the throw pile; "Quick work": a
-- clear in twelve turns or fewer) need a few measured facts that survive the request. This table
-- stores ONLY those facts, derived from the verified action log — never from a browser-supplied
-- number.
--
-- ONE ROW PER PLAYER AND LEVEL, holding the best attempt (fewest turns, fewest throw draws, most
-- Blooms, fewest other grows). A replay that is not better updates nothing that matters.
--
-- NOT A HISTORY AND NOT A REPLACEMENT for receipts: progression, the map's level and the achievement
-- receipts all keep their existing sources. This table exists solely for the two clear-shape
-- achievements. It is additive and idempotent; never edit an earlier migration.
create table if not exists campaign_clears (
  player_id uuid not null references players(id) on delete cascade,
  -- The Campaign level id (`c1-03`) or the final lesson (`lesson-10`), exactly as the proof names it.
  level_key text not null,
  -- The ordered Campaign level number (1..70), read from the authored level at verification time.
  level_number smallint not null check (level_number > 0),
  -- State.turnNumber when the win landed, from the replayed engine state.
  turns integer not null check (turns >= 0),
  -- Draw actions from the throw pile by the human player, counted in the verified action log.
  throw_draws integer not null check (throw_draws >= 0),
  -- Human Bloom actions, and every other human grow action (Sprout / Fruit card / Mega Bomb).
  blooms integer not null check (blooms >= 0),
  grows integer not null check (grows >= 0),
  finished_at bigint not null,
  primary key (player_id, level_key)
);

-- The achievements read is one lookup by player; the primary key already serves it, so no second
-- index is needed.

-- Same posture as the other economy tables: nothing reaches this table except the Edge function.
alter table campaign_clears enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on campaign_clears from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on campaign_clears from authenticated';
  end if;
end $$;
