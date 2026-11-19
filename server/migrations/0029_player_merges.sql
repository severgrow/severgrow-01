-- GUEST → EXISTING ACCOUNT MERGES (owner decision 2026-11-18, accounts pass: "keep the best of both").
-- Additive only: one new table, nothing existing is altered, so a page or server from before this
-- keeps working, and a server without this table simply does not merge (today's behaviour).
--
-- A row means "this guest was merged into this account". The guest_id primary key is what makes a
-- merge happen at most once, whichever device or retry asks; the summary is what the player was told.
create table if not exists player_merges (
  guest_id uuid primary key references players(id) on delete cascade,
  account_id uuid not null references players(id) on delete cascade,
  merged_at bigint not null,
  summary jsonb not null default '{}'::jsonb
);
create index if not exists player_merges_account_idx on player_merges (account_id);

alter table player_merges enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on player_merges from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on player_merges from authenticated';
  end if;
end $$;
