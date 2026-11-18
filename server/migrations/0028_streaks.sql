-- PRACTICE STREAKS + BEST ONLINE BLITZ STREAK (owner, 2026-11-18). Additive only: three new tables,
-- nothing existing is altered or rewritten, so a page or server from before this keeps working.
--
-- practice_streaks:       the four Practice keys' current and best streak per account.
-- practice_streak_games:  every practice game counted, by the page's own game id, so a retry, a
--                         second tab or the offline queue counts a game exactly once.
-- online_blitz_streaks:   the online Blitz streak, folded from the server's own finished live-match
--                         results up to a checkpoint, so a match the retention rule deletes later is
--                         never forgotten once folded.
create table if not exists practice_streaks (
  player_id uuid not null references players(id) on delete cascade,
  tier text not null check (tier in ('easy', 'medium', 'hard', 'blitz')),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  updated_at bigint not null,
  primary key (player_id, tier)
);

create table if not exists practice_streak_games (
  player_id uuid not null references players(id) on delete cascade,
  game_id text not null check (char_length(game_id) between 1 and 80),
  tier text not null check (tier in ('easy', 'medium', 'hard', 'blitz')),
  result text not null,
  recorded_at bigint not null,
  primary key (player_id, game_id)
);

create table if not exists online_blitz_streaks (
  player_id uuid primary key references players(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  folded_until bigint not null default -1,
  folded_match_id text not null default '',
  updated_at bigint not null
);

alter table practice_streaks enable row level security;
alter table practice_streak_games enable row level security;
alter table online_blitz_streaks enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on practice_streaks, practice_streak_games, online_blitz_streaks from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on practice_streaks, practice_streak_games, online_blitz_streaks from authenticated';
  end if;
end $$;
