-- MODERATION (launch readiness, 2026-11-12).
--
-- The owner can pause a player's chat from /admin (24 hours, 7 days or for good). The time is kept on
-- the player row, so the authenticated player already carries it and a chat send costs no extra read
-- (server/src/chat/silence.ts). Null: chat is open. Play is never affected.
--
-- Additive and idempotent. `players` already has RLS on and anon/authenticated revoked (0001), and a
-- new column inherits that. Never edit an earlier migration.
alter table players add column if not exists chat_silenced_until bigint;
