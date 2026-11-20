-- WEB PUSH SUBSCRIPTIONS + THE ONCE-ONLY SEND LEDGER (docs/PUSH-NOTIFICATIONS.md).
--
-- Additive only: two new tables, nothing existing is altered. A server without this migration answers
-- 404 on every /v1/push route, and a page sees no `push` block in /v1/health, so any deploy order is
-- safe and the feature stays dark until the owner turns it on.
--
-- Identity scoping is a CONSTRAINT, not a convention: an endpoint is one browser subscription, and
-- `primary key (endpoint)` means a phone used by two accounts can only belong to the account that
-- enabled notifications on it last. The sender reads rows by the authenticated player id.
create table if not exists push_subscriptions (
  player_id   uuid not null references players(id) on delete cascade,
  endpoint    text not null,
  -- The browser's public key (uncompressed P-256) and its 16-byte auth secret, both base64url.
  -- They are the browser's own key material, not the server's: no VAPID private key is ever stored.
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  bigint not null,
  last_seen_at bigint not null,
  primary key (endpoint)
);

create index if not exists push_subscriptions_player_idx on push_subscriptions (player_id);

-- One row per event that was actually claimed for a send. The primary key is the "once, and never
-- twice" guarantee across Edge isolates: a racing nudge, a second tab or a repeated poll inserts
-- nothing. Rows are tiny (an id, a short key, a timestamp); the daily sweep may prune old ones.
create table if not exists push_sends (
  player_id  uuid not null references players(id) on delete cascade,
  dedupe_key text not null,
  kind       text not null,
  claimed_at bigint not null,
  primary key (player_id, dedupe_key)
);

create index if not exists push_sends_claimed_idx on push_sends (claimed_at);

-- P-21, the same lock-down every new table carries. Supabase's default privileges would otherwise
-- expose a subscription endpoint (a capability URL) to the anon role through the Data API.
alter table push_subscriptions enable row level security;
alter table push_sends enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on push_subscriptions from anon';
    execute 'revoke all on push_sends from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on push_subscriptions from authenticated';
    execute 'revoke all on push_sends from authenticated';
  end if;
end $$;
