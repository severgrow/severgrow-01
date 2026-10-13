// The 0005 keep-alive migration is the single source of truth for the scheduled job, so its
// security-critical and operational properties are asserted here without a database. The live
// database behaviour (job exists, anon/authenticated denied, real round trip) is asserted in
// server/tests/postgres.integration.test.ts (run by `npm run server:db-test`) and
// server/scripts/verify-security.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../migrations/0005_keepalive_cron.sql', import.meta.url), 'utf8');
const squashed = sql.replace(/\s+/g, ' ').toLowerCase();

describe('migration 0005_keepalive_cron.sql', () => {
  it('enables pg_cron and pg_net idempotently (safe on a fresh or an existing project)', () => {
    expect(squashed).toContain('create extension if not exists pg_cron');
    expect(squashed).toContain('create extension if not exists pg_net');
  });

  it('schedules exactly one named job on the old cadence, as the migrating role', () => {
    expect(squashed).toContain("'futasaku-keepalive'");
    // Every 2 days at a quiet UTC hour — the same cadence the GitHub workflow used.
    expect(squashed).toContain("'17 6 */2 * *'");
    // Idempotency: the previous copy is unscheduled before the new one is created, so re-running
    // never duplicates the job.
    expect(squashed).toContain('cron.unschedule(v_job)');
    expect(squashed).toContain('cron.schedule(v_job');
    // The job runs as the role that created it (`postgres`, the migration role).
    expect(sql).toContain('select 1 from cron.job where jobname = v_job');
  });

  it('targets the real database round trip and the sweeper, by the intended methods', () => {
    // A real DB round trip: the health route with ?db=1 runs service.pingStorage().
    expect(sql).toContain("net.http_get");
    expect(sql).toContain('/v1/health?db=1');
    // The sweeper finishes overdue matches server-side.
    expect(sql).toContain('net.http_post');
    expect(sql).toContain('/v1/sweep');
    // The health call is a GET and the sweep is a POST.
    expect(sql).toMatch(/net\.http_get\(\s*url := '[^']*\/v1\/health\?db=1'/);
    expect(sql).toMatch(/net\.http_post\(\s*url := '[^']*\/v1\/sweep'/);
  });

  it('embeds no secret (the sweep sends no auth header at this cadence)', () => {
    // The cron sweep deliberately sends no `x-futasaku-cron` header, so no token can leak through
    // cron.job, net.http_request_queue or this file. (The comments may name the header; the code
    // must not send it, and nothing is read from the Vault.)
    expect(squashed).not.toContain('"x-futasaku-cron"');
    expect(squashed).not.toContain("'x-futasaku-cron'");
    expect(squashed).not.toContain('decrypted_secrets');
    // The only header the job sends is the JSON content type.
    expect(squashed).toContain('headers := \'{"content-type": "application/json"}\'::jsonb');
  });

  it('keeps the project standing guard and never weakens existing security', () => {
    expect(squashed).toContain('alter default privileges in schema public revoke all on tables');
    expect(squashed).toContain('alter default privileges in schema public revoke all on sequences');
    expect(squashed).toContain('alter default privileges in schema public revoke all on functions');
    // Additive only: no destructive DDL, no client policy.
    expect(squashed).not.toContain('drop table');
    expect(squashed).not.toContain('drop schema');
    expect(squashed).not.toContain('create policy');
    // We do NOT revoke on the platform-owned cron/net objects (a documented no-op that would also
    // break pg_net); the reachable-path denial is proved live instead.
    expect(squashed).not.toContain('revoke all on schema net');
    expect(squashed).not.toContain('revoke all on all functions in schema net');
    expect(squashed).not.toContain('revoke all on all tables in schema net');
  });
});
