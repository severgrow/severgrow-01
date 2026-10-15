-- FUTASAKU 0.5 — beta feedback: "Report a problem" and silent crash reports.
--
-- One table. The app sends a short message (reports) or an error + stack (crashes), plus a small
-- context object (app build, device, screen, the game position: turn/step/revision). Never cards,
-- tokens, invite codes or names. Read it in the Supabase dashboard: Table Editor -> feedback_reports.
--
-- Additive and idempotent. P-21: RLS on, every right revoked from anon/authenticated (the same
-- lock-down as 0002/0006), nothing in the realtime publication.

create table if not exists feedback_reports (
  id           uuid    primary key default gen_random_uuid(),
  created_at   bigint  not null,
  kind         text    not null check (kind in ('report', 'crash')),
  player_id    uuid    references players (id) on delete set null,
  message      text    not null default '' check (char_length(message) <= 2000),
  context      jsonb   not null default '{}'::jsonb,
  build        text,
  user_agent   text
);

create index if not exists feedback_reports_created_idx on feedback_reports (created_at desc);
create index if not exists feedback_reports_kind_idx on feedback_reports (kind, created_at desc);

alter table feedback_reports enable row level security;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on feedback_reports from %I', client_role);
      execute format('alter default privileges in schema public revoke all on tables from %I', client_role);
      execute format('alter default privileges in schema public revoke all on sequences from %I', client_role);
      execute format('alter default privileges in schema public revoke all on functions from %I', client_role);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime drop table feedback_reports';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
  end if;
end $$;
