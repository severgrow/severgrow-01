-- GIVE BACK THE TILES RYK TOOK FROM ONE PLAYER BY CHALLENGE (owner, 2026-10-28).
-- Paste into Supabase → SQL Editor. Run PART 1 first: it only looks, it changes nothing.
-- If the list is right, run PART 2. It moves only tiles that RYK still holds, that RYK won from
-- that player in a settled challenge, and it marks them 'admin' so the history stays honest.
-- Seeds are not touched. Change 'kat%' if the name turns out to be different.

-- PART 1 — LOOK (changes nothing)
select p.display_name as give_back_to, c.cell_id as tile,
       to_timestamp(c.resolved_at / 1000) as taken_on
  from world_challenges c
  join players p      on p.id = c.defender_id
  join world_claims w on w.cell_id = c.cell_id
 where c.challenger_id = '37e3d4d0-a34c-45b3-bc61-992fcf392912'   -- RYK
   and c.status = 'resolved'
   and c.winner_id = c.challenger_id
   and w.owner_id = c.challenger_id
   and p.display_name ilike 'kat%'
 order by c.resolved_at;

-- PART 2 — GIVE THEM BACK (run only after PART 1 looks right)
begin;
update world_claims w
   set owner_id = c.defender_id,
       claimed_at = (extract(epoch from now()) * 1000)::bigint,
       source = 'admin',
       purchase_request_key = null
  from world_challenges c
  join players p on p.id = c.defender_id
 where w.cell_id = c.cell_id
   and c.challenger_id = '37e3d4d0-a34c-45b3-bc61-992fcf392912'
   and c.status = 'resolved'
   and c.winner_id = c.challenger_id
   and w.owner_id = c.challenger_id
   and p.display_name ilike 'kat%'
returning w.cell_id as tile, p.display_name as now_owned_by;
-- every open map picks up the change on its next refresh
update world_meta set revision = revision + 1 where version = 1;
commit;
