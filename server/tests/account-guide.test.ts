// The in-game guide's account sync (owner, 2026-11-09: seen windows "follow the account").
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_GUIDE_FEATURE, mergeAccountGuide, parseAccountGuide } from '../src/account-guide.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp, SERVER_FEATURES } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

const setup = () => {
  const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG, now: () => 5_000 });
  const app = createFetchApp({ service, config: DEFAULT_SERVER_CONFIG });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app(new Request(`http://x${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  };
  return { call, token: async () => (await service.createGuest()).token };
};

describe('account guide progress', () => {
  it('is advertised, so a page can skip it on an older server', () => {
    expect(SERVER_FEATURES).toContain(ACCOUNT_GUIDE_FEATURE);
  });

  it('GET is null until the first POST; POSTs join (beats only grow, the higher count wins)', async () => {
    const { call, token } = setup();
    const t = await token();
    expect((await call('GET', '/v1/players/me/guide', undefined, t)).json.guide).toBeNull();
    const a = await call('POST', '/v1/players/me/guide', { seen: ['grow', 'draw'], games: 2 }, t);
    expect(a.status).toBe(200);
    expect(a.json.guide).toEqual({ seen: ['draw', 'grow'], games: 2 });
    // a lagging device can never take a beat back or lower the count
    const b = await call('POST', '/v1/players/me/guide', { seen: ['throw'], games: 1 }, t);
    expect(b.json.guide).toEqual({ seen: ['draw', 'grow', 'throw'], games: 2 });
    expect((await call('GET', '/v1/players/me/guide', undefined, t)).json.guide).toEqual({ seen: ['draw', 'grow', 'throw'], games: 2 });
  });

  it('is per player: one account never sees another one', async () => {
    const { call, token } = setup();
    const [t1, t2] = [await token(), await token()];
    await call('POST', '/v1/players/me/guide', { seen: ['bloom'], games: 1 }, t1);
    expect((await call('GET', '/v1/players/me/guide', undefined, t2)).json.guide).toBeNull();
  });

  it('needs a token, and refuses a malformed body', async () => {
    const { call, token } = setup();
    expect((await call('GET', '/v1/players/me/guide')).status).toBe(401);
    const t = await token();
    expect((await call('POST', '/v1/players/me/guide', { seen: 'grow' }, t)).status).toBe(400);
    expect((await call('POST', '/v1/players/me/guide', { seen: [], games: -1 }, t)).status).toBe(400);
  });

  it('drops odd entries and caps the list', () => {
    const many = Array.from({ length: 60 }, (_, i) => `beat-${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);
    expect(parseAccountGuide({ seen: ['grow', 7, 'BAD', 'grow', 'x'.repeat(40)], games: 2.9 })).toEqual({ seen: ['grow'], games: 2 });
    expect(parseAccountGuide({ seen: many }).seen.length).toBe(32);
    expect(mergeAccountGuide({ seen: ['a'], games: 3 }, { seen: ['b'], games: 1 })).toEqual({ seen: ['a', 'b'], games: 3 });
  });

  it('ships its own migration with row level security and no client grants', () => {
    const sql = readFileSync(new URL('../migrations/0024_account_guide.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/create table if not exists account_guide/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on account_guide from anon/);
  });
});
