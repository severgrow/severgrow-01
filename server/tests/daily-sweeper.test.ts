// Migration 0007 turns the 0005 keep-alive/sweeper job from every-2-days to DAILY. It must ALTER the
// existing job rather than recreate it (so the name and run history stay stable) and must be
// idempotent. Static checks only; the live cadence and the anon denial are asserted in
// server/tests/postgres.integration.test.ts (`npm run server:db-test`) and
// server/scripts/verify-security.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../migrations/0007_daily_sweeper.sql', import.meta.url), 'utf8');
const code = sql.replace(/--.*$/gm, '');
const squashed = sql.replace(/\s+/g, ' ').toLowerCase();

describe('migration 0007_daily_sweeper.sql', () => {
  it('moves the existing futasaku-keepalive job to the daily 06:17 UTC schedule', () => {
    expect(squashed).toContain("'futasaku-keepalive'");
    expect(squashed).toContain("'17 6 * * *'");
    // The old every-2-days expression must not survive anywhere in the code.
    expect(code).not.toContain('*/2');
  });

  it('alters the job in place instead of unscheduling and recreating it (name + history stable)', () => {
    expect(squashed).toContain('cron.alter_job(');
    // Never duplicate or drop the job: no unschedule, no second schedule/creation.
    expect(squashed).not.toContain('cron.unschedule');
    expect(squashed).not.toContain('cron.schedule(');
  });

  it('is idempotent and safe to re-run: it only alters a job that exists', () => {
    // The ALTER is guarded by an existence check, so a re-run (or a project where the job is
    // missing) is a no-op rather than an error.
    expect(squashed).toContain('if v_job_id is null then');
    expect(squashed).toContain('select jobid into v_job_id from cron.job where jobname = v_job');
  });

  it('touches nothing but the schedule (the health ping and the empty-body sweep stay put)', () => {
    // No command rewrite: the migration never re-states the URLs or methods, so 0005's ping can
    // never be weakened or accidentally changed by this cadence change.
    expect(code).not.toContain('/v1/health');
    expect(code).not.toContain('/v1/sweep');
    expect(code).not.toContain('net.http_get');
    expect(code).not.toContain('net.http_post');
    // Still no secret.
    expect(squashed).not.toContain('x-futasaku-cron');
    expect(squashed).not.toContain('decrypted_secrets');
  });

  it('creates no objects and never weakens security (P-21)', () => {
    expect(code).not.toMatch(/create\s+table|create\s+schema|create\s+extension/i);
    expect(code).not.toMatch(/drop\s+table|drop\s+column|drop\s+schema|truncate|delete\s+from/i);
    expect(code).not.toMatch(/create\s+policy/i);
    expect(code).not.toMatch(/grant\s/i);
    // Re-issues the standing default-privileges guard.
    for (const kind of ['tables', 'sequences', 'functions']) {
      expect(squashed).toContain(`alter default privileges in schema public revoke all on ${kind}`);
    }
    // And does not touch the platform-owned net objects.
    expect(squashed).not.toContain('revoke all on schema net');
  });
});
