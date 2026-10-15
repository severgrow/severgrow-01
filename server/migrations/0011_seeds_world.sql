-- Seeds/world v1. New tables preserve 0009_world_map.sql as historical data.
-- The migration runner keys the FULL filename, so both historical 0009 files are distinct.
create table if not exists seed_wallets (
  player_id uuid primary key references players(id) on delete restrict,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned bigint not null default 0 check (lifetime_earned >= 0),
  lifetime_spent bigint not null default 0 check (lifetime_spent >= 0),
  world_invitation_seen boolean not null default false
);

create table if not exists seed_ledger (
  id uuid primary key,
  player_id uuid not null references players(id) on delete restrict,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  category text not null,
  source_key text not null,
  economy_version integer not null,
  created_at bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(player_id, source_key)
);
create index if not exists seed_ledger_player_time_idx on seed_ledger(player_id, created_at desc);

-- A zero-award receipt still records a processed result and the reason. A slot is used only by
-- a valid completed match that actually receives Seeds; rejected/forfeit results consume none.
create table if not exists seed_reward_receipts (
  player_id uuid not null references players(id) on delete restrict,
  source_key text not null,
  mode text not null check (mode in ('queue','friend','training','campaign')),
  opponent_id uuid references players(id) on delete set null,
  utc_day date not null,
  awarded integer not null check (awarded >= 0),
  denial text,
  economy_version integer not null,
  created_at bigint not null,
  primary key(player_id, source_key)
);
create index if not exists seed_receipt_day_idx on seed_reward_receipts(player_id, utc_day, mode);

create table if not exists training_seed_tickets (
  id uuid primary key,
  player_id uuid not null references players(id) on delete restrict,
  seed bigint not null,
  bot_level smallint not null check (bot_level between 1 and 9),
  created_at bigint not null,
  expires_at bigint not null,
  used_at bigint,
  unique(player_id, id)
);
create index if not exists training_seed_tickets_player_idx on training_seed_tickets(player_id, created_at desc);

create table if not exists world_claims (
  cell_id text primary key,
  owner_id uuid not null references players(id) on delete restrict,
  claimed_at bigint not null,
  purchase_request_key text,
  source text not null check (source in ('legacy','purchase')),
  unique(owner_id, purchase_request_key)
);
create index if not exists world_claims_owner_idx on world_claims(owner_id);
create table if not exists world_meta (
  version integer primary key check (version = 1),
  revision bigint not null default 0
);
insert into world_meta(version, revision) values (1, 0) on conflict do nothing;

-- Preserve all old holders in the centre of the expanded landmass. Old matches retain their
-- original world_tiles rows; no match or player data is deleted or renumbered.
insert into world_claims(cell_id, owner_id, claimed_at, source)
select ((cell % 8) - 4)::text || ',' || ((cell / 8) - 4)::text, owner_id, awarded_at, 'legacy'
  from world_tiles
on conflict (cell_id) do nothing;
update world_meta set revision = (select count(*) from world_claims) where version = 1;

do $$
declare t text;
begin
  foreach t in array array['seed_wallets','seed_ledger','seed_reward_receipts','training_seed_tickets','world_claims','world_meta'] loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on %I from anon', t); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on %I from authenticated', t); end if;
  end loop;
end $$;
