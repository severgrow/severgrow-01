-- FUTASAKU 0.5 — the human/bot split the owner asked for (2026-10-24).
--
-- "i mainly care about not confusing bots with real players who are testing the game."
--
-- `players.is_test` (0013) already marks automated traffic, and every admin read hides it. Two things
-- were still missing for the dashboard to be trustworthy:
--
--   * WHY a row was marked, so the owner can judge the call instead of trusting it blind
--     (`test_reason`, written by whichever tool marked the row: a harness at creation, or the
--     conservative backfill that recognised a CI burst);
--   * a way to CORRECT it in one click, durably (`test_override`): false = "this is a real person,
--     always show them", true = "this is a bot", null = follow `is_test`.
--
-- Additive and idempotent; never edits an earlier migration. Both columns are nullable, so every
-- existing row keeps exactly the meaning it had (null override == follow `is_test`). No backfill is
-- performed here — the marker is data, and marking history is the backfill tool's job, not a schema
-- change's. The tables already have RLS on with no client policies (P-21), so the new columns inherit
-- that lock-down and need no grant change.
--
-- No new index: `players` is small (hundreds of rows) and the effective predicate is
-- `coalesce(test_override, is_test) = false`, which a partial index on `is_test` would not serve
-- anyway. The existing `players_is_test_idx` (0013) stays as the operator's "what is marked" index.

alter table players add column if not exists test_reason text;
alter table players add column if not exists test_override boolean;

comment on column players.test_reason is
  'Why the row carries is_test: written by the harness that created it, or by the backfill that recognised a CI burst. Never inferred from a name.';
comment on column players.test_override is
  'Owner correction to the test marker: false = always a real person, true = always a bot, null = follow is_test. Set only from /admin/.';
