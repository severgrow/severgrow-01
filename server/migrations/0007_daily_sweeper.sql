-- FUTASAKU 0.5 — run the keep-alive / sweeper job DAILY instead of every 2 days (P-2 cadence).
--
-- 0005_keepalive_cron.sql installed ONE named job, `futasaku-keepalive`, at `17 6 */2 * *`
-- (06:17 UTC every 2 days). A fully abandoned match can therefore sit expired-but-unfinished for up
-- to ~2 days past its 48-hour expiry window. Expiry is ALSO evaluated lazily on any join / list /
-- view, so in practice any visit by either player finishes it instantly — this cron is the backstop
-- for matches nobody ever revisits.
--
-- This migration changes the CADENCE ONLY. The same single job now runs every day at 06:17 UTC
-- (`17 6 * * *`), so an unvisited expired match is cleaned up within a day instead of up to two.
-- Nothing else changes:
--
--   * The job NAME (`futasaku-keepalive`), its role and its command are untouched, so
--     `cron.job_run_details` history stays attached to the SAME jobid and operators keep watching
--     the same name. We ALTER the existing job rather than unschedule + recreate it for exactly
--     that reason.
--   * The health ping (`GET /v1/health?db=1` — a REAL database round trip via
--     `service.pingStorage()`) is EXACTLY as before; it is what stops the free-tier project from
--     pausing. Only the schedule moves.
--   * No secret is embedded (unchanged, same as 0005).
--
-- 0005 is LEFT UNTOUCHED: it is already applied and the migrator is checksum-guarded, so editing it
-- would break every environment. This is an additive migration. It creates NO schema objects (no
-- tables / sequences / functions), so there is nothing new to grant or lock down for P-21; the
-- standing default-privileges guard is re-issued anyway for consistency with 0002/0004/0005.

do $daily_sweeper$
declare
  v_job text := 'futasaku-keepalive';
  -- '17 6 * * *' = 06:17 UTC every day (was '17 6 */2 * *' = every 2 days). pg_cron evaluates
  -- schedules in UTC on Supabase.
  v_schedule text := '17 6 * * *';
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = v_job;

  if v_job_id is null then
    -- 0005 creates the job and runs before this migration in the same migrator pass, so this is
    -- only reachable if the job was manually unscheduled. Do NOT invent a second job here; the
    -- operator path is `npm run server:migrate` (whose 0005 body recreates it, then this alters).
    raise notice 'futasaku-keepalive not found; skipping cadence change (run `npm run server:migrate`)';
    return;
  end if;

  -- cron.alter_job (pg_cron 1.6.4, installed) updates only the columns given, so the command and
  -- the job id/history are preserved. Idempotent: re-running just re-sets the same schedule.
  perform cron.alter_job(job_id := v_job_id, schedule := v_schedule);
end
$daily_sweeper$;

-- Standing guard: this migration creates nothing in `public`, so it grants nothing and leaves every
-- existing RLS / revoke decision exactly as it was. Keep future objects closed to the Supabase
-- client roles (same guard as 0002/0004/0005).
do $$
declare
  client_role text;
begin
  foreach client_role in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = client_role) then
      execute format(
        'alter default privileges in schema public revoke all on tables from %I',
        client_role
      );
      execute format(
        'alter default privileges in schema public revoke all on sequences from %I',
        client_role
      );
      execute format(
        'alter default privileges in schema public revoke all on functions from %I',
        client_role
      );
    end if;
  end loop;
end $$;
