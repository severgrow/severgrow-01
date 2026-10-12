-- Futasaku 0.5 Phase 2 — deadlines, turn-gated views, lists, rate limits, device link codes.
-- Additive and idempotent. NEVER edit 0001_init.sql.
--
-- P-21: every new table gets RLS enabled and anon/authenticated revoked. Default privileges
-- for future tables/sequences/functions in public are also revoked from those roles.

-- ---------------------------------------------------------------- matches: turn clock + gated snapshot

alter table matches add column if not exists turn_deadline_at bigint;
alter table matches add column if not exists turn_timeout_ms bigint not null default 86400000;
alter table matches add column if not exists turn_start_revision integer not null default 0;
alter table matches add column if not exists turn_start_state jsonb;
alter table matches add column if not exists expires_at bigint;

create index if not exists matches_turn_deadline_idx
  on matches (turn_deadline_at)
  where status = 'active' and turn_deadline_at is not null;

create index if not exists matches_expires_at_idx
  on matches (expires_at)
  where status = 'waiting' and expires_at is not null;

-- ---------------------------------------------------------------- participants: presence + list index

alter table match_participants add column if not exists last_seen_at bigint;

update match_participants
   set last_seen_at = joined_at
 where last_seen_at is null;

alter table match_participants
  alter column last_seen_at set default 0;

-- Not-null after backfill for existing rows; new inserts always supply a value.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'match_participants'
       and column_name = 'last_seen_at' and is_nullable = 'YES'
  ) then
    update match_participants set last_seen_at = coalesce(last_seen_at, joined_at, 0);
    alter table match_participants alter column last_seen_at set not null;
  end if;
end $$;

create index if not exists match_participants_player_idx on match_participants (player_id);

-- ---------------------------------------------------------------- rate limits (Postgres-backed; Edge has no memory)

create table if not exists rate_limits (
  bucket       text   not null,
  window_start bigint not null,
  count        integer not null default 0 check (count >= 0),
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------- device link codes (P-3)

create table if not exists device_link_codes (
  id           uuid   primary key default gen_random_uuid(),
  code_hash    text   not null unique,
  player_id    uuid   not null references players (id) on delete cascade,
  created_at   bigint not null,
  expires_at   bigint not null,
  used_at      bigint
);
create index if not exists device_link_codes_player_idx on device_link_codes (player_id);
create index if not exists device_link_codes_expires_idx on device_link_codes (expires_at);

-- ---------------------------------------------------------------- security (P-21)

alter table rate_limits        enable row level security;
alter table device_link_codes  enable row level security;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format(
        'revoke all on rate_limits, device_link_codes from %I',
        client_role
      );
      execute format(
        'alter default privileges in schema public revoke all on tables from %I',
        client_role
      );
      execute format(
        'alter default privileges in schema public revoke all on sequences from %I',
        client_role
      );
      execute format(
        'alter default privileges in schema public revoke all on functions from %I',
        client_role
      );
    end if;
  end loop;
end $$;

-- Never put authoritative tables in the Realtime publication (P-21).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Best-effort: drop any accidental membership; ignore if the table was never added.
    begin
      execute 'alter publication supabase_realtime drop table matches';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
    begin
      execute 'alter publication supabase_realtime drop table match_participants';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
    begin
      execute 'alter publication supabase_realtime drop table match_moves';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
    begin
      execute 'alter publication supabase_realtime drop table players';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
    begin
      execute 'alter publication supabase_realtime drop table player_tokens';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
    begin
      execute 'alter publication supabase_realtime drop table rate_limits';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
    begin
      execute 'alter publication supabase_realtime drop table device_link_codes';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
  end if;
end $$;
