-- Futasaku 0.5 — backend foundation schema (Postgres / Supabase).
--
-- Authority model
--   * `matches.state` is the AUTHORITATIVE engine state (deck order, both hands, seed). It is
--     never returned to a client: the API sends `viewFor(state, seat)` projections only.
--   * Row Level Security is enabled on every table with NO anon/authenticated policies. The API
--     server connects with the service role (which bypasses RLS). No client-side key can read
--     authoritative state, hands or invite codes.
--
-- Time is epoch milliseconds (bigint), always supplied by the server, never `now()` — so tests and
-- replays are deterministic.
--
-- Run with:  psql "$DATABASE_URL" -f server/migrations/0001_init.sql

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- players and tokens

create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  kind          text        not null default 'guest' check (kind in ('guest', 'account')),
  display_name  text,
  created_at    bigint      not null,
  -- Set when a guest is upgraded to a permanent account (the id and matches are preserved).
  upgraded_at   bigint
);

-- Bearer tokens are stored only as hashes. A leaked database row cannot be replayed as a token.
create table if not exists player_tokens (
  id          uuid   primary key default gen_random_uuid(),
  player_id   uuid   not null references players (id) on delete cascade,
  token_hash  text   not null unique,
  created_at  bigint not null,
  revoked_at  bigint
);
create index if not exists player_tokens_player_idx on player_tokens (player_id);

-- ---------------------------------------------------------------- matches

create table if not exists matches (
  id                uuid    primary key default gen_random_uuid(),
  -- The private invite code (Crockford base32, no look-alikes). Unique, never enumerated.
  invite_code       text    not null unique,
  -- Immutable: the ruleset this match was created under. Never reinterpreted under newer rules.
  rules_version     text    not null,
  -- Immutable: server-chosen seed the deal follows from (a client must never choose it).
  seed              bigint  not null,
  -- Immutable: the opening configuration snapshot.
  config            jsonb   not null,
  -- Immutable: the seat that moves first, from the engine's seeded lottery.
  starting_player   smallint not null check (starting_player in (0, 1)),
  status            text    not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  -- Monotonic revision. Exactly +1 per committed move. Clients must send the revision they expect.
  revision          integer not null default 0 check (revision >= 0),
  -- AUTHORITATIVE engine state. Server-only (see RLS note above).
  state             jsonb   not null,
  result            jsonb,
  created_at        bigint  not null,
  updated_at        bigint  not null,
  finished_at       bigint
);
create index if not exists matches_status_idx on matches (status);

-- ---------------------------------------------------------------- participants

create table if not exists match_participants (
  match_id   uuid     not null references matches (id) on delete cascade,
  player_id  uuid     not null references players (id) on delete cascade,
  seat       smallint not null check (seat in (0, 1)),
  joined_at  bigint   not null,
  primary key (match_id, player_id),
  -- One player per seat. The server never trusts a client-supplied seat.
  unique (match_id, seat)
);

-- ---------------------------------------------------------------- moves / revisions

-- One row per committed move. `revision` is the match revision that move produced, so this table
-- is both the move log and the revision history. The unique (match_id, request_id) constraint is
-- the idempotency key: a repeated request returns the stored row instead of applying again.
create table if not exists match_moves (
  match_id    uuid     not null references matches (id) on delete cascade,
  revision    integer  not null check (revision >= 1),
  seat        smallint not null check (seat in (0, 1)),
  player_id   uuid     not null references players (id),
  action      jsonb    not null,
  -- The raw events of this move. Filtered per player (opponent deck draws hidden) before sending.
  events      jsonb    not null default '[]'::jsonb,
  request_id  text     not null,
  created_at  bigint   not null,
  primary key (match_id, revision),
  unique (match_id, request_id)
);

-- ---------------------------------------------------------------- security

alter table players            enable row level security;
alter table player_tokens      enable row level security;
alter table matches            enable row level security;
alter table match_participants enable row level security;
alter table match_moves        enable row level security;

-- Deliberately no policies: anon and authenticated roles are denied everything. The API server
-- uses the service role, which bypasses RLS. Add narrow policies only for a future read-only
-- public view (e.g. a finished-match summary), never for `matches.state` or `player_tokens`.
revoke all on players, player_tokens, matches, match_participants, match_moves from anon, authenticated;
