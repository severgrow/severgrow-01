// LIVE STATUS IN /admin (launch readiness, 2026-11-12). The owner asked for monitoring IN the admin
// dashboard: one panel that says, line by line, green / amber / red, whether the server, the database,
// the scheduled jobs (the daily keep-alive + sweeper, the cleanups) and the crash rate look healthy,
// and what needs a person. `statusChecks` is the pure judgement; the route gathers the facts.
import { describe, expect, it } from 'vitest';
import { STATUS_DB_BUDGET_BYTES, statusChecks, type StatusFacts, type StatusJob } from '../src/admin/status.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { hashToken, newId, newToken } from '../src/ids.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { createFetchApp } from '../src/fetch-app.js';
import { chainRouters } from '../src/feedback/feedback.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { memoryAdminStore } from '../src/admin/memory.js';
import { createAdminRouter } from '../src/admin/router.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';

const NOW = 1_760_000_000_000;
const H = 3_600_000;
const healthy: StatusFacts = {
  db: { ok: true, ms: 40 },
  connections: { used: 12, max: 60 },
  sizeBytes: 300 * 1024 * 1024,
  jobs: [
    { name: 'futasaku-keepalive', lastRunAt: NOW - 3 * H, lastStatus: 'succeeded' },
    { name: 'futasaku-chat-retention', lastRunAt: NOW - 20 * 60_000, lastStatus: 'succeeded' },
    { name: 'futasaku-rate-limit-cleanup', lastRunAt: NOW - 10 * H, lastStatus: 'succeeded' },
  ],
  crashes: { last24h: 2, dailyAverage7d: 2 },
  reports: { waiting: 0, oldestWaitingAt: null },
};
const level = (facts: StatusFacts, id: string) => statusChecks(facts, NOW).find((c) => c.id === id)?.level;

describe('statusChecks', () => {
  it('a healthy server is green on every line', () => {
    const checks = statusChecks(healthy, NOW);
    expect(checks.map((c) => c.level).every((l) => l === 'ok')).toBe(true);
    expect(checks.map((c) => c.id)).toEqual(expect.arrayContaining(['database', 'connections', 'size', 'job:futasaku-keepalive', 'crashes', 'reports']));
  });

  it('the database: down is red, slow is amber', () => {
    expect(level({ ...healthy, db: { ok: false, ms: null } }, 'database')).toBe('bad');
    expect(level({ ...healthy, db: { ok: true, ms: 1500 } }, 'database')).toBe('warn');
  });

  it('connections: amber from 70% of the limit, red from 90%', () => {
    expect(level({ ...healthy, connections: { used: 42, max: 60 } }, 'connections')).toBe('warn');
    expect(level({ ...healthy, connections: { used: 55, max: 60 } }, 'connections')).toBe('bad');
    expect(level({ ...healthy, connections: null }, 'connections')).toBe('unknown');
  });

  it('database size against the plan budget', () => {
    expect(level({ ...healthy, sizeBytes: STATUS_DB_BUDGET_BYTES * 0.8 }, 'size')).toBe('warn');
    expect(level({ ...healthy, sizeBytes: STATUS_DB_BUDGET_BYTES * 0.95 }, 'size')).toBe('bad');
  });

  it('a daily job that has not run for over a day, or failed, is red; the hourly one after two hours', () => {
    const jobs = (patch: Partial<StatusJob>, name = 'futasaku-keepalive') =>
      ({ ...healthy, jobs: healthy.jobs!.map((j) => (j.name === name ? { ...j, ...patch } : j)) });
    expect(level(jobs({ lastRunAt: NOW - 27 * H }), 'job:futasaku-keepalive')).toBe('bad');
    expect(level(jobs({ lastStatus: 'failed' }), 'job:futasaku-keepalive')).toBe('bad');
    expect(level(jobs({ lastRunAt: null, lastStatus: null }), 'job:futasaku-keepalive')).toBe('bad');
    expect(level(jobs({ lastRunAt: NOW - 3 * H }, 'futasaku-chat-retention'), 'job:futasaku-chat-retention')).toBe('bad');
    // The scheduler cannot be read at all: say so, never green.
    expect(statusChecks({ ...healthy, jobs: null }, NOW).find((c) => c.id === 'jobs')?.level).toBe('unknown');
  });

  it('the keep-alive is expected even when the scheduler lists nothing for it', () => {
    const checks = statusChecks({ ...healthy, jobs: [] }, NOW);
    expect(checks.find((c) => c.id === 'job:futasaku-keepalive')?.level).toBe('bad');
  });

  it('crashes: a spike against the 7-day average is amber, a large one red', () => {
    expect(level({ ...healthy, crashes: { last24h: 4, dailyAverage7d: 0 } }, 'crashes')).toBe('ok');
    expect(level({ ...healthy, crashes: { last24h: 8, dailyAverage7d: 1 } }, 'crashes')).toBe('warn');
    expect(level({ ...healthy, crashes: { last24h: 40, dailyAverage7d: 1 } }, 'crashes')).toBe('bad');
  });

  it('reports waiting for a person: amber, red when one has waited over 3 days', () => {
    expect(level({ ...healthy, reports: { waiting: 2, oldestWaitingAt: NOW - H } }, 'reports')).toBe('warn');
    expect(level({ ...healthy, reports: { waiting: 2, oldestWaitingAt: NOW - 4 * 24 * H } }, 'reports')).toBe('bad');
  });
});

describe('GET /v1/admin/status', () => {
  const ADMIN_ID = '37e3d4d0-a34c-45b3-bc61-992fcf392912';
  const setup = async () => {
    const storage = new MemoryStorage();
    const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], adminPlayerIds: [ADMIN_ID] };
    const economy = new MemoryWorldEconomyStore();
    const service = new MatchService({ storage, config, now: () => NOW });
    const store = memoryAdminStore({ storage, feedback: null as never, economy, links: null as never });
    const admin = createAdminRouter({
      store, economy, authenticate: (t) => service.authenticate(t), config, now: () => NOW,
      rulesVersion: service.rulesVersion, storage, log: () => undefined, pingDb: async () => 1,
    });
    const app = createFetchApp({ service, config, live: chainRouters(async () => null, admin) });
    const token = async (id: string) => {
      await storage.createPlayer({ id, kind: 'account', displayName: 'P', createdAt: NOW, upgradedAt: NOW });
      const t = newToken();
      await storage.issueToken({ id: newId(), playerId: id, tokenHash: hashToken(t), createdAt: NOW, revokedAt: null });
      return t;
    };
    return { app, token };
  };

  it('is admin-only', async () => {
    const t = await setup();
    const player = await t.token(newId());
    expect((await t.app(new Request('http://x/v1/admin/status'))).status).toBe(401);
    expect((await t.app(new Request('http://x/v1/admin/status', { headers: { authorization: `Bearer ${player}` } }))).status).toBe(403);
  });

  it('answers the checks, the versions the server runs, and the time', async () => {
    const t = await setup();
    const admin = await t.token(ADMIN_ID);
    const res = await t.app(new Request('http://x/v1/admin/status', { headers: { authorization: `Bearer ${admin}` } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checks: Array<{ id: string; level: string }>; server: { botVersion: string; rulesVersion: string }; serverNow: number };
    expect(body.server.botVersion).toBe(CURRENT_BOT_VERSION);
    expect(body.checks.find((c) => c.id === 'database')?.level).toBe('ok');
    expect(body.serverNow).toBe(NOW);
  });
});
