-- ACCOUNT CAMPAIGN PROGRESS SNAPSHOT (owner, 2026-11-08).
--
-- WHY A TABLE. Campaign progress is otherwise device-local (`severgrow.campaign.progress.v3`). A
-- signed-in account must keep the FURTHER-AHEAD place across phone and desktop, including best
-- attempts on the open level — not only the verified first-clear receipt highest.
-- This table stores ONE snapshot per player: completed level ids + best attempts.
--
-- FURTHER-AHEAD ONLY. The API merges with that rule in application code; a lagging POST must not
-- erase an ahead row. This migration adds only this table — economy and map tables stay on their
-- own routes and are never written here.
--
-- Additive and idempotent. RLS on with no anon/authenticated policies, exactly like every other
-- table: only the service role (the API server) may read this. Never edit an earlier migration.
create table if not exists account_campaign_progress (
  player_id uuid primary key references players(id) on delete cascade,
  completed jsonb not null default '[]'::jsonb,
  best jsonb not null default '{}'::jsonb,
  updated_at bigint not null
);

alter table account_campaign_progress enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on account_campaign_progress from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on account_campaign_progress from authenticated';
  end if;
end $$;
