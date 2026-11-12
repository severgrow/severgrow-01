-- FUTASAKU 0.5 — Territory challenges (a paid tile may change hands through a linked duel).
--
-- Additive and idempotent. NEVER edit earlier migrations.
--
-- Two model changes ride with the new table:
--   * `matches.kind` marks a territory duel apart from an ordinary duel. Existing rows default to
--     'duel', so no historical match changes meaning.
--   * `world_claims.source` gains 'challenge': a tile that moved because a duel settled was TAKEN,
--     not bought. Play never deletes a claim, only re-owns it, so no purchase is orphaned.
--   * ...and 'admin': a tile the owner placed or moved from the dashboard (docs/ADMIN.md §3a). Only
--     that edit may also clear a claim outright.
--
-- Security is the same lock-down as 0006: row level security with no policies, every right revoked
-- from anon/authenticated, default privileges stay revoked, and nothing enters the realtime
-- publication. Challenge rows are private to the two participants.

alter table matches add column if not exists kind text not null default 'duel';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_kind_check') then
    alter table matches add constraint matches_kind_check check (kind in ('duel', 'territory'));
  end if;
end $$;

-- ---------------------------------------------------------------- world challenges

create table if not exists world_challenges (
  id             uuid    primary key default gen_random_uuid(),
  -- The contested cell. The claim row keeps its identity when ownership moves.
  cell_id        text    not null references world_claims (cell_id) on delete cascade,
  challenger_id  uuid    not null references players (id) on delete cascade,
  defender_id    uuid    not null references players (id) on delete cascade,
  status         text    not null default 'pending'
                         check (status in ('pending', 'accepted', 'declined', 'expired', 'resolved', 'stale')),
  -- The challenger's escrow, debited on send. `seed_ledger` is the signed truth.
  stake          integer not null check (stake > 0),
  -- The idempotency key of the send that created this row: a replayed request returns it.
  request_key    text    not null,
  created_at     bigint  not null,
  -- 24 hours after created_at: the defender's answer deadline.
  expires_at     bigint  not null,
  responded_at   bigint,
  -- The linked duel, once the defender accepts.
  match_id       uuid    references matches (id) on delete set null,
  -- Set only when the settlement actually happened (first-confirmed-wins).
  winner_id      uuid    references players (id) on delete set null,
  resolved_at    bigint,
  check (challenger_id <> defender_id),
  unique (challenger_id, request_key)
);

-- ONE open challenge per cell, enforced by the database itself (the same trick
-- `live_challenges_one_pending_idx` uses). A cell may be contested again only after it closes.
create unique index if not exists world_challenges_one_open_idx
  on world_challenges (cell_id) where status in ('pending', 'accepted');
create index if not exists world_challenges_defender_idx on world_challenges (defender_id, status);
create index if not exists world_challenges_challenger_idx on world_challenges (challenger_id, created_at desc);
-- The sweeper's due scan: pending answers and accepted challenges that went stale.
create index if not exists world_challenges_expiry_idx on world_challenges (status, expires_at);

-- ---------------------------------------------------------------- claims may be taken

-- The 0011 check only knew legacy/purchase. Guarded so a re-run is a no-op.
alter table world_claims drop constraint if exists world_claims_source_check;
alter table world_claims add constraint world_claims_source_check
  check (source in ('legacy', 'purchase', 'challenge', 'admin'));

-- ---------------------------------------------------------------- security (P-21)

alter table world_challenges enable row level security;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on world_challenges from %I', client_role);
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
      execute 'alter publication supabase_realtime drop table world_challenges';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
  end if;
end $$;
