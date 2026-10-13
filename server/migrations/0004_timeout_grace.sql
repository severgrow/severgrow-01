-- Futasaku 0.5 — timeout grace (one grace period per player per match).
--
-- Product rule: the FIRST time a player misses their turn deadline they are warned and the
-- deadline is extended by one full turn window; only a later timeout from that same player
-- finishes the match with reason 'timeout'. The grace count is per seat, per match.
--
-- Additive and idempotent. NEVER edit 0001-0003.
--
-- P-21: the queue/grace state lives on `matches` (already RLS-protected). No new table is created,
-- but the default-privileges guard is re-issued so any future object in public stays closed to the
-- Supabase client roles.

alter table matches add column if not exists grace_used_seat0 integer not null default 0;
alter table matches add column if not exists grace_used_seat1 integer not null default 0;
alter table matches add column if not exists grace_periods integer not null default 1;
-- 0 means "not set yet": backfill from each row's own turn clock so old matches keep the rule
-- "one grace = one turn window" without a hard-coded 24h.
alter table matches add column if not exists grace_extension_ms bigint not null default 0;

update matches set grace_extension_ms = turn_timeout_ms where grace_extension_ms = 0;

-- ---------------------------------------------------------------- security (P-21)

alter table matches enable row level security;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on matches from %I', client_role);
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
