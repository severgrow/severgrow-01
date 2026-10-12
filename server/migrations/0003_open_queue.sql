-- Futasaku 0.5 Phase 7 — Find Opponent open queue (flagged client).
-- Additive. Invite matches stay open_queue = false.

alter table matches add column if not exists open_queue boolean not null default false;

create index if not exists matches_open_queue_waiting_idx
  on matches (created_at)
  where status = 'waiting' and open_queue = true;
