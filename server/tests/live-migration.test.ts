// Migration 0006 (live duels) follows the P-21 lock-down of 0002. Static checks here; the real
// role-based denial runs in live-postgres.integration.test.ts against a database.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../migrations/0006_live_duels.sql', import.meta.url), 'utf8');
const code = sql.replace(/--.*$/gm, '');

describe('migration 0006_live_duels', () => {
  it('is additive and idempotent (no drops of data, every create/alter guarded)', () => {
    expect(code.replace(/alter publication supabase_realtime drop table \w+/gi, '')).not.toMatch(/drop\s+table|drop\s+column|truncate|delete\s+from/i);
    for (const line of code.split('\n').filter((l) => /add column/i.test(l))) expect(line).toMatch(/if not exists/i);
    for (const line of code.split('\n').filter((l) => /create (unique )?index/i.test(l))) expect(line).toMatch(/if not exists/i);
    expect(code).toMatch(/create table if not exists live_challenges/i);
  });

  it('enables RLS and revokes anon/authenticated on every table it touches, with default privileges', () => {
    expect(code).toMatch(/alter table live_challenges enable row level security/i);
    expect(code).toMatch(/revoke all on live_challenges, matches, players from %I/i);
    for (const kind of ['tables', 'sequences', 'functions']) {
      expect(code).toMatch(new RegExp(`alter default privileges in schema public revoke all on ${kind} from %I`, 'i'));
    }
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant\s/i);
  });

  it('never adds a table to the realtime publication', () => {
    expect(code).not.toMatch(/publication\s+supabase_realtime\s+add/i);
    expect(code).toMatch(/alter publication supabase_realtime drop table live_challenges/i);
  });

  it('enforces one pending challenge per match in the database', () => {
    expect(code).toMatch(/create unique index if not exists live_challenges_one_pending_idx on live_challenges \(match_id\) where status = 'pending'/i);
  });
});

// Migration 0008 (real-time reconnect) is the same additive, locked-down shape as 0006.
const reconnectSql = readFileSync(new URL('../migrations/0008_live_reconnect.sql', import.meta.url), 'utf8');
const reconnectCode = reconnectSql.replace(/--.*$/gm, '');

describe('migration 0008_live_reconnect', () => {
  it('is additive and idempotent (every column guarded, nothing dropped)', () => {
    expect(reconnectCode).not.toMatch(/drop\s+table|drop\s+column|truncate|delete\s+from/i);
    const adds = reconnectCode.split('\n').filter((l) => /add column/i.test(l));
    expect(adds).toHaveLength(4);
    for (const line of adds) expect(line).toMatch(/if not exists/i);
    // It adds ONLY the reconnect columns: no new table, nothing else touched.
    expect(reconnectCode).not.toMatch(/create table/i);
    for (const col of ['live_reconnect_stage_seat0', 'live_reconnect_stage_seat1', 'live_reconnect_since_seat0', 'live_reconnect_since_seat1']) {
      expect(reconnectCode).toContain(col);
    }
  });

  it('re-issues the P-21 revokes and never opens a grant or a policy', () => {
    for (const kind of ['tables', 'sequences', 'functions']) {
      expect(reconnectCode).toMatch(new RegExp(`revoke all on all ${kind} in schema public from %I`, 'i'));
      expect(reconnectCode).toMatch(new RegExp(`alter default privileges in schema public revoke all on ${kind} from %I`, 'i'));
    }
    expect(reconnectCode).not.toMatch(/create policy/i);
    expect(reconnectCode).not.toMatch(/grant\s/i);
    expect(reconnectCode).not.toMatch(/publication\s+supabase_realtime\s+add/i);
  });
});
