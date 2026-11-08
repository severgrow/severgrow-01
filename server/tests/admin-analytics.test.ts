// Retention window logic and the analytics store: complete windows only, test accounts excluded,
// and empty/failure shapes never invent cheerful zeroes that look like "nobody played".
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_FUNNEL_LOOKBACK_DAYS,
  retentionRate,
  retentionWindowComplete,
  shapeAnalytics,
  unavailableAnalytics,
  type AnalyticsPlayerFact,
} from '../src/admin/analytics.js';
import { DAY_MS, utcDay } from '../src/admin/util.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { hashToken, newId, newToken } from '../src/ids.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryFeedbackStore, chainRouters, createFeedbackRouter } from '../src/feedback/feedback.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { MemoryIdentityLinkStore } from '../src/accounts/accounts.js';
import { memoryAdminStore } from '../src/admin/memory.js';
import { createAdminRouter } from '../src/admin/router.js';
import { createFetchApp } from '../src/fetch-app.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { postgresAdminStore } from '../src/admin/postgres.js';
import type { PgPool } from '../src/storage/postgres.js';

const NOW = Date.parse('2026-11-08T15:00:00.000Z');
const DAY = DAY_MS;

const fact = (over: Partial<AnalyticsPlayerFact> & Pick<AnalyticsPlayerFact, 'playerId' | 'createdAt'>): AnalyticsPlayerFact => ({
  finishedMatchCount: 0,
  invitesSent: 0,
  invitesJoined: 0,
  hasClaim: false,
  rematchCount: 0,
  activityDays: over.activityDays ?? new Set([utcDay(over.createdAt)]),
  ...over,
});

describe('retention windows are complete or null — never partial', () => {
  it('a cohort younger than 1 day must not show D1', () => {
    const today = utcDay(NOW);
    expect(retentionWindowComplete(today, 1, NOW)).toBe(false);
    expect(retentionRate(1, 1, false)).toBeNull();
  });

  it('a cohort younger than 7 days must not show D7', () => {
    const threeDaysAgo = utcDay(NOW - 3 * DAY);
    expect(retentionWindowComplete(threeDaysAgo, 1, NOW)).toBe(true);
    expect(retentionWindowComplete(threeDaysAgo, 7, NOW)).toBe(false);
    const shaped = shapeAnalytics(
      [
        fact({
          playerId: 'a',
          createdAt: NOW - 3 * DAY,
          activityDays: new Set([threeDaysAgo, utcDay(NOW - 2 * DAY)]),
        }),
      ],
      NOW,
    );
    const cohort = shaped.retention.find((row) => row.day === threeDaysAgo);
    expect(cohort?.d1).not.toBeNull();
    expect(cohort?.d7).toBeNull();
  });

  it('a cohort old enough reports D1 and D7 as real rates', () => {
    const cohortDay = utcDay(NOW - 10 * DAY);
    const shaped = shapeAnalytics(
      [
        fact({
          playerId: 'a',
          createdAt: NOW - 10 * DAY,
          activityDays: new Set([cohortDay, utcDay(NOW - 9 * DAY), utcDay(NOW - 3 * DAY)]),
        }),
        fact({
          playerId: 'b',
          createdAt: NOW - 10 * DAY,
          activityDays: new Set([cohortDay]),
        }),
      ],
      NOW,
    );
    const cohort = shaped.retention.find((row) => row.day === cohortDay);
    expect(cohort?.cohortSize).toBe(2);
    expect(cohort?.d1).toBe(0.5);
    expect(cohort?.d7).toBe(0.5);
  });

  it('an empty input still returns a shaped payload (never throws)', () => {
    const shaped = shapeAnalytics([], NOW);
    expect(shaped.dau).toBe(0);
    expect(shaped.funnel.firstMatchRate).toBeNull();
    expect(shaped.activityDefinition.length).toBeGreaterThan(20);
  });

  it('unavailableAnalytics labels the failure', () => {
    const payload = unavailableAnalytics(NOW, 'the analytics query failed');
    expect(payload.unavailable).toBe('the analytics query failed');
  });
});

describe('funnel rates among the lookback cohort', () => {
  it('counts first match, claim, invite-to-play and repeat matches', () => {
    const shaped = shapeAnalytics(
      [
        fact({
          playerId: 'a',
          createdAt: NOW - DAY,
          finishedMatchCount: 2,
          hasClaim: true,
          invitesSent: 1,
          invitesJoined: 1,
          rematchCount: 1,
        }),
        fact({
          playerId: 'b',
          createdAt: NOW - DAY,
          finishedMatchCount: 1,
          invitesSent: 1,
          invitesJoined: 0,
        }),
        fact({
          playerId: 'old',
          createdAt: NOW - (ANALYTICS_FUNNEL_LOOKBACK_DAYS + 5) * DAY,
          finishedMatchCount: 9,
          hasClaim: true,
        }),
      ],
      NOW,
    );
    expect(shaped.funnel.newPlayers).toBe(2);
    expect(shaped.funnel.firstMatchCompleted).toBe(2);
    expect(shaped.funnel.firstClaim).toBe(1);
    expect(shaped.funnel.inviteToPlayRate).toBe(0.5);
    expect(shaped.funnel.repeatMatchRate).toBe(0.5);
  });
});

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const player = (n: number, over: Partial<PlayerRecord> = {}): PlayerRecord => ({
  id: uuid(n),
  kind: 'guest',
  displayName: `Player${n}`,
  createdAt: NOW - DAY,
  upgradedAt: null,
  ...over,
});

describe('the analytics store excludes test accounts and answers through the admin API', () => {
  it('drops marked players from DAU / new counts', async () => {
    const storage = new MemoryStorage();
    const economy = new MemoryWorldEconomyStore();
    const store = memoryAdminStore({
      storage,
      feedback: new MemoryFeedbackStore(),
      economy,
      links: new MemoryIdentityLinkStore(),
    });

    const real = player(1, { displayName: 'Real', createdAt: NOW - 2 * DAY });
    const bot = player(2, { displayName: 'Bot', createdAt: NOW - 2 * DAY, isTest: true });
    await storage.createPlayer(real);
    await storage.createPlayer(bot);

    for (const id of [real.id, bot.id]) {
      for (let i = 0; i < 4; i += 1) {
        await economy.settle({
          playerId: id,
          sourceKey: `${id}-win-${i}`,
          mode: 'queue',
          outcome: 'win',
          opponentId: null,
          now: NOW - 4_000 + i,
        });
      }
    }
    expect((await economy.claim(real.id, '0,0', 'real-claim', NOW - 500)).ok).toBe(true);
    expect((await economy.claim(bot.id, '1,0', 'bot-claim', NOW - 500)).ok).toBe(true);

    const analytics = await store.analytics(NOW);
    expect(analytics.dau).toBe(1);
    const newOnCreateDay = analytics.newByDay.find((row) => row.day === utcDay(NOW - 2 * DAY));
    expect(newOnCreateDay?.n).toBe(1);
  });

  it('the /v1/admin/analytics route is authorized like every other admin read', async () => {
    const storage = new MemoryStorage();
    const adminId = uuid(1);
    const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], adminPlayerIds: [adminId] };
    const feedback = new MemoryFeedbackStore();
    const economy = new MemoryWorldEconomyStore();
    const links = new MemoryIdentityLinkStore();
    const service = new MatchService({ storage, config, now: () => NOW });
    const store = memoryAdminStore({ storage, feedback, economy, links });
    const admin = createAdminRouter({
      store,
      authenticate: (t) => service.authenticate(t),
      config,
      now: () => NOW,
      rulesVersion: service.rulesVersion,
      storage,
      log: () => undefined,
    });
    const feedbackRouter = createFeedbackRouter({
      store: feedback,
      storage,
      authenticate: (t) => service.authenticate(t),
      now: () => NOW,
    });
    const app = createFetchApp({ service, config, live: chainRouters(async () => null, feedbackRouter, admin) });

    const mint = async (id: string, name: string, n: number): Promise<string> => {
      await storage.createPlayer(player(n, { id, kind: 'account', displayName: name }));
      const token = newToken();
      await storage.issueToken({ id: newId(), playerId: id, tokenHash: hashToken(token), createdAt: NOW, revokedAt: null });
      return token;
    };
    const adminToken = await mint(adminId, 'Admin', 1);
    const normalToken = await mint(uuid(9), 'Normie', 9);

    const denied = await app(new Request('http://x/v1/admin/analytics', { headers: { authorization: `Bearer ${normalToken}` } }));
    expect(denied.status).toBe(403);

    const allowed = await app(new Request('http://x/v1/admin/analytics', { headers: { authorization: `Bearer ${adminToken}` } }));
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { ok: true; dau: number; activityDefinition: string };
    expect(body.ok).toBe(true);
    expect(typeof body.dau).toBe('number');
    expect(body.activityDefinition.length).toBeGreaterThan(20);
  });
});

describe('the Postgres analytics read carries the test-account filter', () => {
  it('every statement that touches players or matches checks is_test', async () => {
    const sql: string[] = [];
    const query = async (text: string): Promise<{ rows: Record<string, unknown>[] }> => {
      sql.push(text);
      return { rows: [] };
    };
    const pool = { query, connect: async () => ({ query, release: () => undefined }) } as unknown as PgPool;
    const store = postgresAdminStore(pool);
    await store.analytics(NOW);
    expect(sql.length).toBeGreaterThan(0);
    for (const statement of sql) {
      if (!/\b(players|matches|world_claims|match_participants)\b/.test(statement)) continue;
      expect(statement.replace(/\s+/g, ' ')).toMatch(/is_test/);
    }
  });
});
