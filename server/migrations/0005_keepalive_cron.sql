-- FUTASAKU 0.5 — Supabase-native keep-alive and housekeeping sweeper (P-2).
--
-- Replaces the inert GitHub Actions workflow `.github/workflows/futa05-keepalive.yml` (deleted by
-- this change). GitHub only fires `schedule` / `workflow_dispatch` for a workflow file present on
-- the DEFAULT branch, and that file existed only on `futa0.5-online`, so no keep-alive run ever
-- executed. GitHub also DISABLES scheduled workflows after ~60 days without repository activity.
-- Running the ping inside the database removes BOTH dependencies: no GitHub, and no requirement to
-- put anything on `main`.
--
-- Every 2 days at 06:17 UTC (the previous cadence, at a quiet UTC hour) one named job makes a REAL
-- database round trip and also finishes overdue matches server-side:
--
--   1. GET  https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/health?db=1
--      The Edge health route with `?db=1` runs `service.pingStorage()` — a live query against this
--      database. That round trip is what resets the free-tier inactivity clock. A bare liveness
--      ping (no `?db=1`) would answer from the isolate and keep NOTHING active.
--
--   2. POST https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/sweep
--      The existing sweeper: turn timeouts, waiting/parked-match expiry and stale guests. So
--      overdue matches keep being finished even when no client visits.
--
-- NO SECRET IS EMBEDDED. `/v1/sweep` only needs the `x-futasaku-cron` header (SWEEP_CRON_TOKEN) to
-- get a dedicated rate-limit bucket; at two sweeps every two days the ordinary per-IP budget (120/h)
-- can never be exhausted, so the job sends no header and this file holds no credential. If a token
-- is ever wanted, store it in Supabase Vault (`supabase_vault` is installed) — never here.
--
-- Additive and idempotent: re-running replaces the single named job, never duplicates it. NEVER
-- edit 0001-0004. See the security section at the bottom and `server/scripts/verify-security.ts`
-- for the runnable evidence.

-- ---------------------------------------------------------------- extensions

-- Both are the standard Supabase way to run a scheduled outbound HTTP ping from the database.
-- `create extension if not exists` is a no-op when the extension is already enabled (e.g. via the
-- dashboard), so this is safe on a fresh project and on an existing one.
--
-- pg_cron and pg_net are already in the server's `shared_preload_libraries`, so enabling them from
-- SQL is sufficient; no dashboard toggle is required (verified against this project). On Supabase
-- both extensions are owned by `supabase_admin`; the job therefore runs as the role that created
-- it — `postgres`, the role this migration runs as — which has the cron/net privileges it needs.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- the scheduled job

do $keepalive$
declare
  v_job text := 'futasaku-keepalive';
  v_cmd text := $cmd$
    select
      net.http_get(
        url := 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/health?db=1',
        timeout_milliseconds := 10000
      ) as health_request_id,
      net.http_post(
        url := 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/sweep',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 15000
      ) as sweep_request_id
  $cmd$;
begin
  -- Idempotent: drop any previous copy of this named job, then (re)create exactly one. pg_cron has
  -- a text overload of unschedule(), so a name never collides with an unrelated numeric job id.
  if exists (select 1 from cron.job where jobname = v_job) then
    perform cron.unschedule(v_job);
  end if;
  -- '17 6 */2 * *' = 06:17 UTC on every odd day of the month (the previous GH-Actions cadence).
  -- pg_cron evaluates schedules in UTC on Supabase.
  perform cron.schedule(v_job, '17 6 */2 * *', v_cmd);
end
$keepalive$;

-- ---------------------------------------------------------------- security (P-21 adjacent)

-- pg_net makes OUTBOUND HTTP requests from inside the database, so anon/authenticated must not be
-- able to reach it — otherwise an anonymous visitor could use this database to send arbitrary
-- requests (an SSRF-style hole). Audited against THIS project; two different answers:
--
--   * `cron` schema — anon and authenticated have NO schema USAGE (only `supabase_admin` and
--     `postgres` do), so `cron.job`, `cron.job_run_details` and `cron.schedule()`/`unschedule()`
--     are all refused with SQLSTATE 42501 even though some row/function ACLs look permissive.
--     Nothing to revoke; proved by `set role anon` / `set role authenticated` in
--     `server/tests/postgres.integration.test.ts` and `server/scripts/verify-security.ts`.
--
--   * `net` schema — anon and authenticated DO hold grants here (PUBLIC `usage` on the schema and
--     PUBLIC `execute` on net.http_get/http_post), but they are non-login roles that cannot open a
--     database connection, and the Data API (PostgREST) exposes only `public`, never `net`. So an
--     anonymous API caller still cannot call net.http_get/http_post or read
--     net.http_request_queue / net._http_response. This matches Supabase's documented platform
--     constraint: the extension is owned by `supabase_admin`, `postgres` granted none of these
--     privileges, so `revoke` here prints "no privileges could be revoked" and changes nothing —
--     and removing the PUBLIC grants outright would BREAK pg_net (the `postgres` role reaches its
--     tables only through them), which would break this very job. We therefore do NOT revoke on
--     `net`; the reachable-path denial is proved live with the anon key in verify-security.ts.
--
-- The job deliberately sends NO auth header, so the request queue it creates holds only the public
-- API URL and an empty body: no credential to leak even if that queue were ever exposed.
--
-- Keep `net` (and `cron`) out of the Data API's exposed schemas — they are not exposed by default.
-- See docs/DEPLOY-ONLINE.md ("Keep-alive") and `npm run server:verify-security`.

-- Standing guard: any future object this migration's role creates in public stays closed to the
-- Supabase client roles (same guard as 0002/0004).
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
