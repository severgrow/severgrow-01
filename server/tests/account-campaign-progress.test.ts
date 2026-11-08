// ACCOUNT CAMPAIGN PROGRESS (owner, 2026-11-08): one snapshot per account; further-ahead wins.
// A local save cannot raise Seeds, Territory or achievement rewards — this route only stores
// campaign completed ids + best attempts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CAMPAIGN_PROGRESS_FEATURE,
  furtherAheadWire,
  parseAccountCampaignProgress,
  unlockedFromCompletedIds,
} from '../src/account-campaign-progress.js';
import type { AccountCampaignProgressWire } from '../src/account-campaign-progress.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp, SERVER_FEATURES } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { postgresStorage } from '../src/storage/postgres.js';
import type { PgClient, PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';

const wire = (over: Partial<AccountCampaignProgressWire> = {}): AccountCampaignProgressWire => ({
  completed: [],
  best: {},
  ...over,
});

const ids = (...nums: number[]): string[] =>
  nums.map((n) => `c1-${String(n).padStart(2, '0')}`);

describe('further-ahead wire merge', () => {
  it('derives unlocked from consecutive completed ids', () => {
    expect(unlockedFromCompletedIds([])).toBe(1);
    expect(unlockedFromCompletedIds(ids(1, 2, 3))).toBe(4);
    // A gap stops the place: 1,2,4 does not open past 3.
    expect(unlockedFromCompletedIds(ids(1, 2, 4))).toBe(3);
  });

  it('keeps the further-ahead snapshot wholesale', () => {
    const behind = wire({ completed: ids(1, 2) });
    const ahead = wire({ completed: ids(1, 2, 3, 4, 5) });
    expect(furtherAheadWire(behind, ahead)).toEqual(ahead);
    expect(furtherAheadWire(ahead, behind)).toEqual(ahead);
  });

  it('equal unlocked prefers the preferred argument (no rewrite)', () => {
    const a = wire({ completed: ids(1, 2, 3) });
    const b = wire({ completed: ids(1, 2, 3) });
    expect(furtherAheadWire(a, b)).toBe(a);
  });

  it('an attempt on the open level beats a bare place at the same unlock', () => {
    const bare = wire({ completed: ids(1, 2, 3) }); // unlocked 4
    const tried = wire({
      completed: ids(1, 2, 3),
      best: { 'c1-04': { won: false, score: 2, turns: 6 } },
    });
    expect(furtherAheadWire(bare, tried)).toEqual(tried);
  });

  it('parse rejects a body that is not a progress snapshot', () => {
    expect(() => parseAccountCampaignProgress({})).not.toThrow();
    expect(() => parseAccountCampaignProgress({ completed: 'nope' })).toThrow(/completed/i);
    expect(() => parseAccountCampaignProgress({ completed: [1] })).toThrow(/completed/i);
    expect(() => parseAccountCampaignProgress({
      completed: ids(1),
      best: { 'c1-01': { won: 'yes', score: 1, turns: 1 } },
    })).toThrow(/best/i);
  });
});

describe('storage keeps the further-ahead row only', () => {
  it('MEMORY: a lagging POST leaves the stored place alone', async () => {
    const storage = new MemoryStorage();
    const first = await storage.mergeAccountCampaignProgress('player-a', wire({ completed: ids(1, 2, 3, 4, 5) }), 1_000);
    expect(first.completed).toEqual(ids(1, 2, 3, 4, 5));
    const stale = await storage.mergeAccountCampaignProgress('player-a', wire({ completed: ids(1) }), 2_000);
    expect(stale).toEqual(first);
    expect(await storage.accountCampaignProgressOf('player-a')).toEqual(first);
  });

  it('MEMORY: a further-ahead POST replaces the row', async () => {
    const storage = new MemoryStorage();
    await storage.mergeAccountCampaignProgress('player-a', wire({ completed: ids(1, 2) }), 1_000);
    const next = await storage.mergeAccountCampaignProgress('player-a', wire({ completed: ids(1, 2, 3, 4) }), 2_000);
    expect(next.completed).toEqual(ids(1, 2, 3, 4));
  });

  it('MEMORY: a missing row reads as null (never an invented place)', async () => {
    expect(await new MemoryStorage().accountCampaignProgressOf('nobody')).toBeNull();
  });
});

describe('HTTP: authenticated progress read/write; feature advertised', () => {
  const setup = () => {
    const storage = new MemoryStorage();
    const service = new MatchService({ storage, config: DEFAULT_SERVER_CONFIG, now: () => 5_000 });
    const app = createFetchApp({ service, config: DEFAULT_SERVER_CONFIG });
    const call = async (method: string, path: string, body?: unknown, token?: string) => {
      const res = await app(new Request(`http://x${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }));
      return { status: res.status, json: await res.json() as Record<string, unknown> };
    };
    return { call, token: async () => (await service.createGuest()).token };
  };

  it('names the feature so an older page can skip the route', () => {
    expect(SERVER_FEATURES).toContain(ACCOUNT_CAMPAIGN_PROGRESS_FEATURE);
  });

  it('GET returns null progress for a player who never posted', async () => {
    const h = setup();
    const token = await h.token();
    const res = await h.call('GET', '/v1/players/me/campaign/progress', undefined, token);
    expect(res.status).toBe(200);
    expect(res.json.progress).toBeNull();
  });

  it('POST keeps further-ahead and answers with the stored snapshot', async () => {
    const h = setup();
    const token = await h.token();
    const post = await h.call('POST', '/v1/players/me/campaign/progress', { completed: ids(1, 2, 3), best: {} }, token);
    expect(post.status).toBe(200);
    expect((post.json.progress as AccountCampaignProgressWire).completed).toEqual(ids(1, 2, 3));

    const lag = await h.call('POST', '/v1/players/me/campaign/progress', { completed: ids(1), best: {} }, token);
    expect((lag.json.progress as AccountCampaignProgressWire).completed).toEqual(ids(1, 2, 3));

    const get = await h.call('GET', '/v1/players/me/campaign/progress', undefined, token);
    expect((get.json.progress as AccountCampaignProgressWire).completed).toEqual(ids(1, 2, 3));
  });

  it('the route never touches Seeds / Territory / achievement tables', () => {
    const sql = readFileSync(new URL('../migrations/0023_account_campaign_progress.sql', import.meta.url), 'utf8');
    expect(sql).toContain('create table if not exists account_campaign_progress');
    expect(sql).toContain('alter table account_campaign_progress enable row level security');
    expect(sql).toContain("revoke all on account_campaign_progress from anon");
    expect(sql).not.toMatch(/seed_wallets|world_claims|achievements|offline_stats/);

    const moduleSource = readFileSync(new URL('../src/account-campaign-progress.ts', import.meta.url), 'utf8');
    expect(moduleSource).not.toMatch(/seed_wallets|world\/claims|achievements|ledger/);
  });

  it('POSTGRES SQL merge selects for update then upserts the kept snapshot', async () => {
    const calls: { text: string; values?: readonly unknown[] }[] = [];
    const stored = { completed: ids(1, 2, 3, 4), best: {} };
    const pool: PgPool = {
      async query(text, values) {
        calls.push({ text, values });
        if (/from account_campaign_progress/i.test(text) && /select/i.test(text)) {
          return { rows: [{ completed: stored.completed, best: stored.best }] };
        }
        return { rows: [] };
      },
      async connect(): Promise<PgClient> {
        return {
          async query(text, values): Promise<PgQueryResult> {
            calls.push({ text, values });
            if (/begin|commit|rollback/i.test(text)) return { rows: [] };
            if (/from account_campaign_progress/i.test(text) && /select/i.test(text)) {
              return { rows: [{ completed: stored.completed, best: stored.best }] as PgRow[] };
            }
            return { rows: [] };
          },
          release() {},
        };
      },
    };
    const storage = postgresStorage(pool);
    const result = await storage.mergeAccountCampaignProgress(
      'player-a',
      wire({ completed: ids(1) }),
      9_000,
    );
    // Lagging body must not become the stored answer.
    expect(result.completed).toEqual(stored.completed);
    expect(calls.some((c) => /for update/i.test(c.text))).toBe(true);
    const upsert = calls.find((c) => /insert into account_campaign_progress/i.test(c.text));
    expect(upsert?.values?.[1]).toEqual(stored.completed);
  });
});
