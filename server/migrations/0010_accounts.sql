-- FUTASAKU 0.5 — accounts: "Continue with Google".
--
-- One table links a sign-in (today only Google, through Supabase Auth) to an EXISTING players row.
-- Signing in never creates a second player for someone who already has one: a guest who signs in
-- keeps the same player id, so every match and the whole history stay theirs (docs/ACCOUNTS.md §6).
--
-- What is stored: the provider name and the Supabase Auth user id (an opaque uuid). No email, no
-- name, no photo — the email lives only in Supabase Auth (auth.users) and on the player's device.
-- "Delete my Google sign-in" removes this row and the auth.users row.
--
-- Additive and idempotent. P-21: RLS on, every right revoked from anon/authenticated, nothing in the
-- realtime publication.

create table if not exists player_identities (
  provider    text    not null check (provider in ('google')),
  subject     text    not null check (char_length(subject) between 1 and 200),
  player_id   uuid    not null references players (id) on delete cascade,
  created_at  bigint  not null,
  primary key (provider, subject),
  unique (player_id, provider)
);

alter table player_identities enable row level security;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on player_identities from %I', client_role);
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
      execute 'alter publication supabase_realtime drop table player_identities';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
  end if;
end $$;

-- Privacy housekeeping (the privacy policy promises it): rate-limit counters are keyed by IP address
-- for sign-in / guest creation, so rows older than two days are deleted every night. Only on
-- Supabase, where pg_cron exists (0005); a plain Postgres skips this block. cron.schedule with a job
-- NAME replaces the job of that name, so re-running this file never adds a second job.
do $rate_limit_cleanup$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule(
      'futasaku-rate-limit-cleanup',
      '23 4 * * *',
      $cmd$delete from public.rate_limits where window_start < (extract(epoch from now()) * 1000)::bigint - 2 * 86400000$cmd$
    );
  end if;
end
$rate_limit_cleanup$;
