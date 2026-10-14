-- FUTASAKU 0.5 — real-time RECONNECT state (the grace ladder and the both-offline hold).
--
-- Owner's ruling (2026-10-14): a real-time timeout loses the match. That made a brief connectivity
-- blip fatal, so the owner specified a forgiveness ladder. This migration adds the columns that
-- ladder needs on `matches` (the SAME row the live layer already locks for every decision):
--
--   live_reconnect_stage_seat0/1 — how far this seat is through the ladder in its current absence:
--       0 = no grace used yet            -> the turn clock is extended by LIVE_RECONNECT_GRACE_MS
--       1 = the long grace was spent     -> the turn is auto-played once (the existing autoplayer)
--       2 = the turn was auto-played     -> the deadline is extended by LIVE_RECONNECT_SHORT_MS
--       3 = the short grace was spent    -> the match is LOST (`timeout`)
--     It RESETS to 0 on a successful reconnect: the ladder is per absence, never cumulative.
--   live_reconnect_since_seat0/1 — the seat's `players.presence_at` value when the ladder started.
--     A different `presence_at` means the absence is new (a reconnect, or a fresh drop), so the
--     stage is reset. That makes the per-absence reset a pure function of the row, with no extra
--     write path and no chance of a stale stage carrying into a later absence.
--
-- The both-offline hold needs NO column: it is DERIVED from the two `presence_at` stamps (both
-- stale, within LIVE_BOTH_OFFLINE_WINDOW_MS of each other) plus the current deadline, so it is
-- idempotent by construction and cannot drift.
--
-- Additive and idempotent. The superseded strike/cooldown columns from 0006 are left in place (no
-- risky drop); nothing reads or writes them any more.
--
-- P-21: no new table and no new grant. The columns are NOT readable by the Supabase client roles
-- (the table-wide revokes from 0002/0006 still stand); the guard is re-issued for consistency.

alter table matches add column if not exists live_reconnect_stage_seat0 integer not null default 0;
alter table matches add column if not exists live_reconnect_stage_seat1 integer not null default 0;
alter table matches add column if not exists live_reconnect_since_seat0 bigint;
alter table matches add column if not exists live_reconnect_since_seat1 bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_live_reconnect_stage_check') then
    alter table matches add constraint matches_live_reconnect_stage_check check (
      live_reconnect_stage_seat0 between 0 and 3 and live_reconnect_stage_seat1 between 0 and 3
    );
  end if;
end $$;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on all tables in schema public from %I', client_role);
      execute format('revoke all on all sequences in schema public from %I', client_role);
      execute format('revoke all on all functions in schema public from %I', client_role);
      execute format('alter default privileges in schema public revoke all on tables from %I', client_role);
      execute format('alter default privileges in schema public revoke all on sequences from %I', client_role);
      execute format('alter default privileges in schema public revoke all on functions from %I', client_role);
    end if;
  end loop;
end $$;
