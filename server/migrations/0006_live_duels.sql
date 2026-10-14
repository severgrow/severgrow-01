-- FUTASAKU live duels (test channel) — challenges, the live clock and presence.
--
-- The brief called this "migration 0003"; 0003-0005 were already taken on this branch, so it is
-- the next free number. Additive and idempotent. NEVER edit earlier migrations.
--
-- P-21 (same lock-down as 0002): the new table gets Row Level Security with no policies, every
-- right is revoked from anon/authenticated, default privileges stay revoked, and nothing is in the
-- supabase_realtime publication. Live pings go out on broadcast channels, never table replication.

-- ---------------------------------------------------------------- matches: live mode columns

alter table matches add column if not exists live_since bigint;
alter table matches add column if not exists live_limit_ms integer;
alter table matches add column if not exists live_strikes_seat0 integer not null default 0;
alter table matches add column if not exists live_strikes_seat1 integer not null default 0;
alter table matches add column if not exists live_strike_turn_seat0 integer;
alter table matches add column if not exists live_strike_turn_seat1 integer;
alter table matches add column if not exists live_left_by smallint;
alter table matches add column if not exists live_cooldown_until_seat0 bigint;
alter table matches add column if not exists live_cooldown_until_seat1 bigint;
alter table matches add column if not exists live_cooldown_turn_seat0 integer;
alter table matches add column if not exists live_cooldown_turn_seat1 integer;
alter table matches add column if not exists live_tail_rev integer;
alter table matches add column if not exists live_autoplay_rev integer;
alter table matches add column if not exists live_normal_timeout_ms bigint;
alter table matches add column if not exists live_ended_reason text;
alter table matches add column if not exists live_ended_at bigint;
alter table matches add column if not exists live_ended_by_seat smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_live_left_by_check') then
    alter table matches add constraint matches_live_left_by_check check (live_left_by is null or live_left_by in (0, 1));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_live_ended_reason_check') then
    alter table matches add constraint matches_live_ended_reason_check
      check (live_ended_reason is null or live_ended_reason in ('finished', 'left', 'strikes'));
  end if;
end $$;

-- The sweeper's "due live matches" scan.
create index if not exists matches_live_due_idx
  on matches (turn_deadline_at)
  where live_since is not null or live_tail_rev is not null or live_autoplay_rev is not null;

-- ---------------------------------------------------------------- players: the one live match, the switch, presence

alter table players add column if not exists live_match_id uuid;
alter table players add column if not exists live_challenges_enabled boolean not null default true;
alter table players add column if not exists presence_status text;
alter table players add column if not exists presence_at bigint;
alter table players add column if not exists presence_match_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_presence_status_check') then
    alter table players add constraint players_presence_status_check
      check (presence_status is null or presence_status in ('idle', 'offline_game', 'in_match', 'in_live', 'tutorial'));
  end if;
end $$;

-- ---------------------------------------------------------------- challenges

create table if not exists live_challenges (
  id            uuid    primary key default gen_random_uuid(),
  match_id      uuid    not null references matches (id) on delete cascade,
  from_player   uuid    not null references players (id) on delete cascade,
  to_player     uuid    not null references players (id) on delete cascade,
  kind          text    not null check (kind in ('live', 'rematch')),
  limit_ms      integer not null check (limit_ms > 0),
  status        text    not null default 'pending'
                        check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at    bigint  not null,
  expires_at    bigint  not null,
  responded_at  bigint,
  new_match_id  uuid
);

-- ONE pending challenge per match, enforced by the database itself.
create unique index if not exists live_challenges_one_pending_idx on live_challenges (match_id) where status = 'pending';
create index if not exists live_challenges_to_idx on live_challenges (to_player, status);
create index if not exists live_challenges_from_idx on live_challenges (from_player, created_at);
create index if not exists live_challenges_match_idx on live_challenges (match_id, from_player, created_at);

-- ---------------------------------------------------------------- security (P-21)

alter table live_challenges enable row level security;
alter table matches enable row level security;
alter table players enable row level security;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on live_challenges, matches, players from %I', client_role);
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
      execute 'alter publication supabase_realtime drop table live_challenges';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
  end if;
end $$;
