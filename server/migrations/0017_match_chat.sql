-- Private match chat uses the SAME bearer-authenticated API and authoritative match row
-- as gameplay. Supabase Auth JWTs alone cannot read these tables. Realtime sends hints only.
create table if not exists match_messages (
 id uuid primary key,
 sequence bigint generated always as identity unique,
 match_id uuid not null references matches(id) on delete cascade,
 sender_id uuid not null,
 text text,
 phrase text check (phrase in ('good-luck','nice-move','gg')),
 request_id uuid not null,
 created_at bigint not null,
 foreign key(match_id,sender_id) references match_participants(match_id,player_id) on delete cascade,
 unique(match_id,sender_id,request_id),
 check ((text is not null and phrase is null and char_length(text) between 1 and 280) or (text is null and phrase is not null))
);
create index if not exists match_messages_history on match_messages(match_id,sequence desc);
create index if not exists match_messages_sender_rate on match_messages(sender_id,created_at desc);
create table if not exists match_chat_preferences (
 match_id uuid not null,
 player_id uuid not null,
 muted boolean not null default false,
 primary key(match_id,player_id),
 foreign key(match_id,player_id) references match_participants(match_id,player_id) on delete cascade
);
-- Blocks affect communication in EVERY match between this pair, never gameplay/matchmaking.
create table if not exists match_chat_blocks (
 blocker_id uuid not null references players(id) on delete cascade,
 blocked_id uuid not null references players(id) on delete cascade,
 primary key(blocker_id,blocked_id),
 check(blocker_id <> blocked_id)
);
create table if not exists match_chat_reports (
 message_id uuid not null references match_messages(id) on delete cascade,
 reporter_id uuid not null references players(id) on delete cascade,
 created_at bigint not null,
 primary key(message_id,reporter_id)
);
create index if not exists match_chat_reports_rate on match_chat_reports(reporter_id,created_at desc);
alter table match_messages enable row level security;
alter table match_chat_preferences enable row level security;
alter table match_chat_blocks enable row level security;
alter table match_chat_reports enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on match_messages,match_chat_preferences,match_chat_blocks,match_chat_reports from %I',r);
   execute format('revoke all on sequence match_messages_sequence_seq from %I',r);
  end if;
 end loop;
end $$;
create index if not exists matches_chat_retention on matches(finished_at,id) where status='finished';
-- Reports are copied transactionally into the existing private feedback/admin triage queue.
-- Clean bounded batches hourly if this Supabase installation has pg_cron. Plain Postgres can
-- run the same statement with its scheduler. Active match history is never aged out.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  if not exists(select 1 from cron.job where jobname='futasaku-chat-retention') then
   perform cron.schedule('futasaku-chat-retention','37 * * * *', $job$
    delete from public.match_messages where id in (
     select c.id from public.match_messages c join public.matches m on m.id=c.match_id
     where m.status='finished' and m.finished_at < (extract(epoch from now())*1000)::bigint-7776000000
     order by m.finished_at,c.sequence limit 5000
    )
   $job$);
  end if;
 end if;
end $$;

-- Message content never uses Postgres Changes; keep it out of the game publication.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
  foreach t in array array['match_messages','match_chat_preferences','match_chat_blocks','match_chat_reports'] loop
   if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime drop table public.%I',t);
   end if;
  end loop;
 end if;
end $$;
