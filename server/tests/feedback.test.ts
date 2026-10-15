// Beta feedback endpoint: stores reports and crashes, never stores secrets, never breaks the game.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MemoryFeedbackStore, chainRouters, createFeedbackRouter } from '../src/feedback/feedback.js';
import { createFetchApp } from '../src/fetch-app.js';

const setup = (limits = { reportPerHour: 20, crashPerHour: 30 }) => {
  const storage = new MemoryStorage();
  const config = { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' };
  const service = new MatchService({ storage, config });
  const store = new MemoryFeedbackStore();
  const feedback = createFeedbackRouter({ store, storage, authenticate: (t) => service.authenticate(t), now: () => 1_700_000_000_000, limits });
  const app = createFetchApp({ service, config, live: chainRouters(async () => null, feedback) });
  const post = (body: unknown, token?: string, raw?: string) =>
    app(
      new Request('http://x/v1/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '8.8.8.8', 'user-agent': 'TestPhone/1', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: raw ?? JSON.stringify(body),
      }),
    );
  return { service, store, post };
};

describe('POST /v1/feedback', () => {
  it('stores a report with its context, linked to the player when the token is valid', async () => {
    const t = setup();
    const g = await t.service.createGuest();
    const res = await t.post({ kind: 'report', message: '  The board froze after my Bloom.  ', build: 'index-abc.js', context: { phase: 'ACT', turnNumber: 7 } }, g.token);
    expect(res.status).toBe(201);
    const [row] = await t.store.recent(1);
    expect(row).toMatchObject({ kind: 'report', message: 'The board froze after my Bloom.', playerId: g.player.id, build: 'index-abc.js', userAgent: 'TestPhone/1' });
    expect(row!.context).toEqual({ phase: 'ACT', turnNumber: 7 });
  });

  it('a bad or missing token never blocks a report (it is filed without a player)', async () => {
    const t = setup();
    expect((await t.post({ kind: 'crash', message: 'TypeError: x' }, 'not-a-real-token-at-all-xxxx')).status).toBe(201);
    expect((await t.post({ kind: 'crash', message: 'TypeError: y' })).status).toBe(201);
    expect((await t.store.recent(5)).every((r) => r.playerId === null)).toBe(true);
  });

  it('never stores secrets, even if a client sends them', async () => {
    const t = setup();
    await t.post({
      kind: 'crash',
      message: 'boom',
      context: { token: 'SECRET', hand: [1, 2], game: { deck: [3], seed: 9, inviteCode: 'ABCD', phase: 'DRAW' }, authorization: 'Bearer x' },
    });
    const text = JSON.stringify(await t.store.recent(1));
    for (const secret of ['SECRET', 'ABCD', '"hand"', '"deck"', '"seed"', 'Bearer']) expect(text.includes(secret)).toBe(false);
    expect(text).toContain('"phase":"DRAW"');
  });

  it('refuses junk with stable codes; a report needs words, a crash does not', async () => {
    const t = setup();
    expect(((await (await t.post({ kind: 'nope' })).json()) as { code: string }).code).toBe('INVALID_REQUEST');
    expect(((await (await t.post({ kind: 'report', message: '   ' })).json()) as { code: string }).code).toBe('INVALID_REQUEST');
    expect(((await (await t.post(null, undefined, '{not json')).json()) as { code: string }).code).toBe('INVALID_REQUEST');
    expect((await t.post({ kind: 'crash' })).status).toBe(201);
  });

  it('trims long messages and drops an oversized context instead of failing', async () => {
    const t = setup();
    await t.post({ kind: 'report', message: 'x'.repeat(5000), context: { blob: Array.from({ length: 40 }, () => 'y'.repeat(400)) } });
    const [row] = await t.store.recent(1);
    expect(row!.message.length).toBe(2000);
    expect(JSON.stringify(row!.context).length).toBeLessThanOrEqual(8 * 1024);
  });

  it('is rate limited per player (or per IP when anonymous)', async () => {
    const t = setup({ reportPerHour: 2, crashPerHour: 2 });
    expect((await t.post({ kind: 'report', message: 'a' })).status).toBe(201);
    expect((await t.post({ kind: 'report', message: 'b' })).status).toBe(201);
    const third = await t.post({ kind: 'report', message: 'c' });
    expect(third.status).toBe(429);
    expect(((await third.json()) as { code: string }).code).toBe('RATE_LIMITED');
    // A different kind has its own bucket.
    expect((await t.post({ kind: 'crash', message: 'd' })).status).toBe(201);
  });

  it('only owns POST /v1/feedback', async () => {
    const t = setup();
    const store = new MemoryFeedbackStore();
    const r = createFeedbackRouter({ store, storage: new MemoryStorage(), authenticate: (x) => t.service.authenticate(x), now: () => 1 });
    expect(await r(new Request('http://x/v1/feedback', { method: 'GET' }), '/v1/feedback')).toBeNull();
    expect(await r(new Request('http://x/v1/other', { method: 'POST', body: '{}' }), '/v1/other')).toBeNull();
  });
});

describe('migration 0009_feedback', () => {
  const code = readFileSync(new URL('../migrations/0009_feedback.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  it('is locked down like the others (RLS on, anon/authenticated revoked, not in realtime)', () => {
    expect(code).toMatch(/create table if not exists feedback_reports/i);
    expect(code).toMatch(/alter table feedback_reports enable row level security/i);
    expect(code).toMatch(/revoke all on feedback_reports from %I/i);
    expect(code).not.toMatch(/create policy|grant\s|publication\s+supabase_realtime\s+add/i);
  });
});
