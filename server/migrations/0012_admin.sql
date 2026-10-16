-- FUTASAKU admin dashboard v1 — the three tables the dashboard needs. Additive and idempotent.
--
-- NOT APPLIED YET. Written for review; apply with `npm run server:migrate` only after the owner
-- approves the rollout of /admin/ (see docs/ADMIN.md).
--
-- Everything else the dashboard reads already exists (players, matches, match_moves,
-- match_participants, feedback_reports, seed_wallets, seed_ledger, seed_reward_receipts,
-- world_claims, world_meta, player_identities). Nothing here touches gameplay, and no earlier
-- migration is edited.
--
-- P-21 (the same lock-down as 0002/0006/0009/0011): Row Level Security on, every right revoked
-- from anon/authenticated, nothing added to the supabase_realtime publication. The API server
-- reads these with the service role only.

-- ---------------------------------------------------------------- admin_seen
-- The per-admin "since you last looked" cursor. Deliberately SERVER-SIDE (a table, not a local
-- file) so the new-since counts are the same from any machine the owner opens the dashboard on.
-- One row per admin player; `seen_at` is only ever written by an authorized admin request.
create table if not exists admin_seen (
  admin_player_id uuid primary key references players (id) on delete cascade,
  seen_at         bigint not null
);

-- ---------------------------------------------------------------- feedback_triage
-- Report triage is the ONE mutation v1 has: a status and a private note per report. A report with
-- no row here is 'new' — the dashboard LEFT JOINs this table and coalesces, so no backfill is
-- needed and an old report can never be "lost" by the triage feature.
create table if not exists feedback_triage (
  report_id  uuid primary key references feedback_reports (id) on delete cascade,
  status     text not null check (status in ('new', 'reviewing', 'resolved')),
  note       text not null default '' check (char_length(note) <= 2000),
  updated_at bigint not null,
  updated_by uuid not null references players (id) on delete restrict
);
create index if not exists feedback_triage_status_idx on feedback_triage (status, updated_at desc);

-- ---------------------------------------------------------------- admin_audit
-- Who changed what, and when. Append-only by convention: the dashboard never updates or deletes a
-- row here. `detail` holds the change itself (old/new status, note length) — never a token, a
-- secret or hidden game state.
create table if not exists admin_audit (
  id          uuid primary key,
  actor_id    uuid not null references players (id) on delete restrict,
  action      text not null,
  target_type text not null,
  target_id   text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  bigint not null
);
create index if not exists admin_audit_created_idx on admin_audit (created_at desc);

-- ---------------------------------------------------------------- security (P-21)

alter table admin_seen      enable row level security;
alter table feedback_triage enable row level security;
alter table admin_audit     enable row level security;

do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format('revoke all on admin_seen, feedback_triage, admin_audit from %I', client_role);
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
      execute 'alter publication supabase_realtime drop table admin_seen';
      execute 'alter publication supabase_realtime drop table feedback_triage';
      execute 'alter publication supabase_realtime drop table admin_audit';
    exception when undefined_object then null; when undefined_table then null; when sqlstate '42704' then null;
    end;
  end if;
end $$;
