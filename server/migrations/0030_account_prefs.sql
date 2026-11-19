-- SETTINGS, LESSON PROGRESS AND TIPS FOLLOW THE ACCOUNT (owner decision 2026-11-18, accounts pass).
-- Additive only: one new table, nothing existing is altered. A server without it answers 404 on
-- /v1/players/me/prefs and the page keeps its own copy, so any deploy order is safe.
--
-- One small JSON document per player (server/src/account-prefs.ts): each synced setting with the
-- time it was chosen, the tips already seen, and the lesson progress. Merged, never overwritten.
create table if not exists account_prefs (
  player_id uuid primary key references players(id) on delete cascade,
  doc jsonb not null default '{}'::jsonb,
  updated_at bigint not null
);

alter table account_prefs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on account_prefs from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on account_prefs from authenticated';
  end if;
end $$;
