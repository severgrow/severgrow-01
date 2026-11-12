-- TERRITORY CHAT (owner, 2026-10-28): one shared channel for everyone in Territory, newest 30 only.
-- server/src/chat/territory.ts keeps the table at 30 rows on every send (older rows are DELETED,
-- not hidden). Blocks reuse match_chat_blocks; a report copies the reported line so it survives the
-- window. Safe to run twice.

create table if not exists territory_messages (
  id          uuid    primary key,
  sequence    bigint  generated always as identity unique,
  sender_id   uuid    not null references players(id) on delete cascade,
  text        text    not null check (char_length(text) between 1 and 280),
  request_id  uuid    not null,
  created_at  bigint  not null,
  unique (sender_id, request_id)
);
create index if not exists territory_messages_newest on territory_messages(sequence desc);

create table if not exists territory_chat_reports (
  message_id  uuid    not null,
  reporter_id uuid    not null references players(id) on delete cascade,
  sender_id   uuid    not null references players(id) on delete cascade,
  text        text    not null,
  reason      text    not null check (reason in ('abuse', 'spam', 'other')),
  created_at  bigint  not null,
  primary key (message_id, reporter_id)
);

-- Server-only tables, like the duel chat's: no browser role reads or writes them directly.
alter table territory_messages enable row level security;
alter table territory_chat_reports enable row level security;
do $$ declare r text; begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on territory_messages, territory_chat_reports from %I', r);
      execute format('revoke all on sequence territory_messages_sequence_seq from %I', r);
    end if;
  end loop;
end $$;
