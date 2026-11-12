-- GIVE KAT (#QEWV) BACK THE TWO TILES RYK TOOK BY CHALLENGE: Q −4 R 0 and Q −4 R 1 (owner, 2026-10-28).
-- Paste ALL of this into Supabase → SQL Editor and press Run. It is safe to run twice.
--
-- It finds Kat by his tag (#QEWV — the tag is worked out from the player id exactly as the game
-- does, src/player-tag.ts), and gives a tile back ONLY if RYK holds it now AND RYK won it from Kat
-- in a settled challenge. Anything else is left alone. Seeds are not touched. The last result shows
-- what happened to each of the two tiles.

-- the game's tag: FNV-1a over the id, then 4 letters of Crockford base32 (lives only for this run)
create or replace function pg_temp.player_tag(id text) returns text language plpgsql immutable as $$
declare
  h bigint := 2166136261;
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  out text := '';
begin
  for i in 1..length(id) loop
    h := ((h # ascii(substr(id, i, 1))) * 16777619) & 4294967295;
  end loop;
  for i in 1..4 loop
    out := out || substr(alphabet, (h % 32)::int + 1, 1);
    h := h / 32;
  end loop;
  return out;
end $$;

begin;

with kat as (
  select id from players where pg_temp.player_tag(id::text) = 'QEWV'
),
won as (
  select distinct on (c.cell_id) c.cell_id, c.defender_id
    from world_challenges c
   where c.cell_id in ('-4,0', '-4,1')
     and c.challenger_id = '37e3d4d0-a34c-45b3-bc61-992fcf392912'   -- RYK
     and c.defender_id in (select id from kat)
     and c.status = 'resolved'
     and c.winner_id = c.challenger_id
   order by c.cell_id, c.resolved_at desc
)
update world_claims w
   set owner_id = won.defender_id,
       claimed_at = (extract(epoch from now()) * 1000)::bigint,
       source = 'admin',
       purchase_request_key = null
  from won
 where w.cell_id = won.cell_id
   and w.owner_id = '37e3d4d0-a34c-45b3-bc61-992fcf392912';

-- every open map picks up the change on its next refresh
update world_meta set revision = revision + 1 where version = 1;

commit;

-- WHAT HAPPENED: who holds each of the two tiles now
select w.cell_id as tile, p.display_name as held_by, '#' || pg_temp.player_tag(p.id::text) as tag, w.source
  from world_claims w join players p on p.id = w.owner_id
 where w.cell_id in ('-4,0', '-4,1')
 order by w.cell_id;
