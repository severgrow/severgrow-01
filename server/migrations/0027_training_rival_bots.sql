-- Practice tickets for the rival bots (found 2026-11-16 against the live server: a Training ticket for
-- bot 9 was issued, for bots 10 and 12 the server answered 500). Migration 0011 created
-- `training_seed_tickets.bot_level` with `check (bot_level between 1 and 9)`; the rivals 10-12 joined
-- the game on 2026-11-12 (server/src/seeds/config.ts MAX_TRAINING_BOT = 12) but nothing widened the
-- column. A Hard or Blitz Practice whose rotation picked a rival could not get a ticket, so the tap waited
-- out its budget and the game paid no Seeds.
--
-- Widens the check to the code's top. The old check was created inline, so its name is whatever
-- Postgres chose: every check constraint on this table that mentions bot_level is dropped first, by
-- name, then one named check is added. Idempotent: a second run drops and re-adds the same check.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'training_seed_tickets'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%bot_level%'
  loop
    execute format('alter table training_seed_tickets drop constraint %I', c.conname);
  end loop;
end $$;

alter table training_seed_tickets
  add constraint training_seed_tickets_bot_level_check check (bot_level between 1 and 12);
