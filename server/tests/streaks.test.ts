// THE ACCOUNT'S STREAKS (owner, 2026-11-18). Practice games count once each (retries, two tabs, the
// offline queue), in the order they arrive; the online Blitz streak comes from the server's own match
// results only, and a match the retention rule deletes is never forgotten once folded.
import { describe, expect, it } from 'vitest';
import { blitzResult, memoryStreakStore } from '../src/streaks/store.js';
import type { BlitzResultRow } from '../src/streaks/store.js';

describe('practice streaks on the account', () => {
  it('the same game sent twice (a retry, a second tab, the offline queue) counts once', async () => {
    const store = memoryStreakStore({ blitzResults: () => [] });
    await store.recordPractice('p', [{ id: 'g1', tier: 'easy', result: 'win' }], 1);
    await store.recordPractice('p', [{ id: 'g1', tier: 'easy', result: 'win' }, { id: 'g2', tier: 'easy', result: 'win' }], 2);
    const after = await store.recordPractice('p', [{ id: 'g2', tier: 'easy', result: 'win' }], 3);
    expect(after.easy).toEqual({ current: 2, best: 2 });
  });
  it('each key keeps its own streak, and other players never share it', async () => {
    const store = memoryStreakStore({ blitzResults: () => [] });
    await store.recordPractice('p', [{ id: 'a', tier: 'hard', result: 'win' }, { id: 'b', tier: 'blitz', result: 'loss' }], 1);
    const mine = await store.practice('p');
    expect(mine.hard).toEqual({ current: 1, best: 1 });
    expect(mine.easy).toEqual({ current: 0, best: 0 });
    expect((await store.practice('someone-else')).hard).toEqual({ current: 0, best: 0 });
  });
  it('completed counts win/loss/draw once each and never an abandon or a resignation', async () => {
    const store = memoryStreakStore({ blitzResults: () => [] });
    await store.recordPractice('p', [
      { id: 'w1', tier: 'easy', result: 'win' },
      { id: 'w1', tier: 'easy', result: 'win' }, // the retry cannot count twice
      { id: 'l1', tier: 'medium', result: 'loss' },
      { id: 'd1', tier: 'hard', result: 'draw' },
      { id: 'r1', tier: 'easy', result: 'resign' },
      { id: 'a1', tier: 'easy', result: 'abandon' },
    ], 1);
    expect(await store.completedPractice('p')).toBe(3);
    expect(await store.completedPractice('someone-else')).toBe(0);
  });
  it('two devices: the account holds every game from both, and best never goes back', async () => {
    const store = memoryStreakStore({ blitzResults: () => [] });
    await store.recordPractice('p', [{ id: 'A1', tier: 'medium', result: 'win' }, { id: 'A2', tier: 'medium', result: 'win' }], 1);
    const b = await store.recordPractice('p', [{ id: 'B1', tier: 'medium', result: 'loss' }], 2);
    expect(b.medium).toEqual({ current: 0, best: 2 });
    const a = await store.recordPractice('p', [{ id: 'A2', tier: 'medium', result: 'win' }], 3);
    expect(a.medium).toEqual({ current: 0, best: 2 });
  });
});

describe('the online Blitz streak, from server results only', () => {
  const row = (matchId: string, finishedAt: number, outcome: 'win' | 'loss' | 'draw' | 'timeout' | 'forfeit'): BlitzResultRow => ({
    matchId, finishedAt, seat: 0,
    winner: outcome === 'win' ? 0 : outcome === 'draw' ? null : 1,
    reason: outcome === 'timeout' ? 'timeout' : outcome === 'forfeit' ? 'resigned' : 'score' as never,
  });
  it('wins count, a loss, a forfeit and a timeout reset, a draw changes nothing', async () => {
    expect(blitzResult(row('x', 1, 'win'))).toBe('win');
    expect(blitzResult(row('x', 1, 'timeout'))).toBe('timeout');
    expect(blitzResult(row('x', 1, 'forfeit'))).toBe('forfeit');
    expect(blitzResult(row('x', 1, 'draw'))).toBe('draw');
    const rows = [row('m1', 1, 'win'), row('m2', 2, 'win'), row('m3', 3, 'draw'), row('m4', 4, 'win'), row('m5', 5, 'timeout'), row('m6', 6, 'win')];
    const store = memoryStreakStore({ blitzResults: () => rows });
    expect(await store.onlineBlitz('p', 10 + 60_000)).toEqual({ current: 1, best: 3 });
  });
  it('a match folded once is never counted again, and one deleted later is not forgotten', async () => {
    let rows = [row('m1', 1, 'win'), row('m2', 2, 'win')];
    const store = memoryStreakStore({ blitzResults: () => rows });
    expect(await store.onlineBlitz('p', 3 + 60_000)).toEqual({ current: 2, best: 2 });
    expect(await store.onlineBlitz('p', 4 + 60_000)).toEqual({ current: 2, best: 2 });
    rows = [row('m3', 5, 'win')]; // m1 and m2 were deleted by retention
    expect(await store.onlineBlitz('p', 6 + 60_000)).toEqual({ current: 3, best: 3 });
  });
});

describe('the streak route', async () => {
  const { createStreakRouter } = await import('../src/streaks/router.js');
  const route = () => createStreakRouter({
    store: memoryStreakStore({ blitzResults: () => [] }),
    authenticate: async (t) => { if (t !== 'tok') throw Object.assign(new Error('no'), { code: 'UNAUTHORIZED' }); return { id: 'p' } as never; },
    now: () => 1000,
  });
  const post = (r: ReturnType<typeof route>, games: unknown, token = 'tok') =>
    r(new Request('http://x/v1/players/me/streaks', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ games }) }), '/v1/players/me/streaks');
  it('records a game and reads it back, with the online Blitz streak beside it', async () => {
    const r = route();
    const out = await post(r, [{ id: 'g-1', tier: 'easy', result: 'win' }]);
    expect((out!.body as { practice: { easy: unknown } }).practice.easy).toEqual({ current: 1, best: 1 });
    expect((out!.body as { completed: number }).completed).toBe(1);
    const read = await r(new Request('http://x/v1/players/me/streaks', { headers: { authorization: 'Bearer tok' } }), '/v1/players/me/streaks');
    expect(read!.body).toMatchObject({ ok: true, practice: { easy: { current: 1, best: 1 } }, onlineBlitz: { current: 0, best: 0 }, completed: 1 });
    // A retry does not move the count either.
    const retry = await post(r, [{ id: 'g-1', tier: 'easy', result: 'win' }]);
    expect((retry!.body as { completed: number }).completed).toBe(1);
  });
  it('a page cannot claim an online result, a bad key or a bad id', async () => {
    const r = route();
    for (const game of [{ id: 'g', tier: 'easy', result: 'timeout' }, { id: 'g', tier: 'campaign', result: 'win' }, { id: 'bad id!', tier: 'easy', result: 'win' }]) {
      await expect(post(r, [game])).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    await expect(post(r, Array.from({ length: 51 }, (_, i) => ({ id: `g${i}`, tier: 'easy', result: 'win' })))).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
  it('only the signed-in player is written', async () => {
    await expect(post(route(), [{ id: 'g', tier: 'easy', result: 'win' }], 'other')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe("a profile's record: best online Blitz streak and achievements unlocked", async () => {
  const { createStreakRouter } = await import('../src/streaks/router.js');
  const ME = '11111111-1111-4111-8111-111111111111';
  const route = createStreakRouter({
    store: memoryStreakStore({ blitzResults: (id) => (id === ME ? [
      { matchId: 'a', finishedAt: 1, seat: 0, winner: 0, reason: 'score' as never },
      { matchId: 'b', finishedAt: 2, seat: 0, winner: 0, reason: 'score' as never },
      { matchId: 'c', finishedAt: 3, seat: 0, winner: 1, reason: 'timeout' },
    ] : []) }),
    authenticate: async (t) => { if (t !== 'tok') throw Object.assign(new Error('no'), { code: 'UNAUTHORIZED' }); return { id: 'viewer' } as never; },
    now: () => 100_000,
    achievementsOf: async (id) => (id === ME ? { done: 12, total: 35 } : null),
  });
  const read = (id: string, token = 'tok') => route(new Request(`http://x/v1/players/${id}/record`, { headers: { authorization: `Bearer ${token}` } }), `/v1/players/${id}/record`);
  it('shows the best run (not the current one) and x/x achievements', async () => {
    expect((await read(ME))!.body).toEqual({ ok: true, onlineBlitzBest: 2, achievements: { done: 12, total: 35 } });
  });
  it('an unknown or malformed id is the same 404, and signed-out viewers are refused', async () => {
    await expect(read('22222222-2222-4222-8222-222222222222')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(read('not-an-id')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(read(ME, 'nope')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
