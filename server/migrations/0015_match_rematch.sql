-- FUTASAKU 0.5 — a mutual rematch for a finished standard duel (owner, 2026-10-22: "they both press
-- rematch = they're straight in a new game").
--
-- The first player to press Rematch creates the new match and tags it with the finished match's id;
-- the second press finds it by that tag and takes the other seat. The unique partial index makes
-- "at most one rematch per finished match" a database fact, so two presses at the same instant can
-- never create two matches (the loser of the race reads the winner's row instead).
--
-- Additive and idempotent. NEVER edit earlier migrations. `matches` keeps its existing lock-down
-- (RLS on, no client grants); a new column inherits it, so nothing extra is required for P-21.

alter table matches add column if not exists rematch_of uuid references matches (id) on delete set null;

create unique index if not exists matches_rematch_of_idx on matches (rematch_of) where rematch_of is not null;
