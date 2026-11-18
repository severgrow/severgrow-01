// PRACTICE STREAKS ON THIS DEVICE (owner, 2026-11-18). The numbers on the four Practice keys change
// the moment a game ends, work offline, and follow the account (server-stored; this is the cache and
// the queue). The owner-approved table, every row:
//   Win +1 · Loss 0 · Draw unchanged · Resign 0 · Restart / a new game over an unfinished one 0 ·
//   Close the app during a game: nothing changes, the game can be resumed · Resume: continues ·
//   Every finished game counts exactly once.
import { describe, expect, it } from 'vitest';
import { createPracticeStreaks, PRACTICE_STREAKS_KEY } from '../src/logic/practice-streaks.js';
import type { PracticeStreaks } from '../../server/src/streaks/rules.js';

const memory = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, remove: (k: string) => { m.delete(k); } };
};
let ids = 0;
const make = (store = memory(), player: () => string | null = () => 'me') =>
  createPracticeStreaks({ store, playerId: player, newId: () => `g${++ids}` });

describe('the table, game by game', () => {
  it('win +1, a draw changes nothing, a loss resets; best stays', () => {
    const s = make();
    for (const result of ['win', 'win', 'draw', 'win'] as const) { s.started('easy', 1); s.finished('easy', result); }
    expect(s.view().easy).toEqual({ current: 3, best: 3 });
    s.started('easy', 1); s.finished('easy', 'loss');
    expect(s.view().easy).toEqual({ current: 0, best: 3 });
  });
  it('resign resets', () => {
    const s = make();
    s.started('hard', 1); s.finished('hard', 'win');
    s.started('hard', 2); s.finished('hard', 'resign');
    expect(s.view().hard).toEqual({ current: 0, best: 1 });
  });
  it('starting a new game over an unfinished one (restart or a new key) abandons it: reset', () => {
    const s = make();
    s.started('medium', 1); s.finished('medium', 'win');
    s.started('medium', 2);            // a game in progress...
    s.started('easy', 3);              // ...replaced by a new one: the medium game is abandoned
    expect(s.view().medium).toEqual({ current: 0, best: 1 });
    expect(s.view().easy).toEqual({ current: 0, best: 0 });
  });
  it('closing the app during a game changes nothing; resuming and finishing counts that game once', () => {
    const store = memory();
    const first = make(store);
    first.started('blitz', 7); first.finished('blitz', 'win');
    first.started('blitz', 8);          // ...the app is closed here
    const reopened = make(store);       // a new page load on the same device
    expect(reopened.view().blitz).toEqual({ current: 1, best: 1 });
    reopened.finished('blitz', 'win');  // the resumed game ends
    expect(reopened.view().blitz).toEqual({ current: 2, best: 2 });
  });
  it('the four keys are four separate streaks', () => {
    const s = make();
    s.started('easy', 1); s.finished('easy', 'win');
    s.started('hard', 2); s.finished('hard', 'loss');
    expect(s.view()).toMatchObject({ easy: { current: 1 }, medium: { current: 0 }, hard: { current: 0 }, blitz: { current: 0 } });
  });
});

describe('every finished game counts exactly once', () => {
  it('a finish reported twice (a double tap, a re-render) counts once', () => {
    const s = make();
    s.started('easy', 1); s.finished('easy', 'win'); s.finished('easy', 'win');
    expect(s.view().easy).toEqual({ current: 1, best: 1 });
  });
  it("two tabs on one device: the second sees the first one's game and cannot count it again", () => {
    const store = memory();
    const a = make(store); const b = make(store);
    a.started('easy', 1); a.finished('easy', 'win');
    expect(b.view().easy).toEqual({ current: 1, best: 1 });
    b.finished('easy', 'win');          // the other tab has no game open: nothing to count
    expect(a.view().easy).toEqual({ current: 1, best: 1 });
  });
  it('offline: games queue on the device and go to the account in order, once', async () => {
    const s = make();
    s.started('easy', 1); s.finished('easy', 'win');
    s.started('easy', 2); s.finished('easy', 'win');
    let sent: unknown[] = [];
    let server: PracticeStreaks | null = null;
    const offline = async () => { throw new Error('offline'); };
    await s.sync({ send: offline, read: offline }).catch(() => undefined);
    expect(s.pendingCount()).toBe(2);
    await s.sync({
      send: async (games) => { sent = games; server = { easy: { current: 2, best: 2 }, medium: { current: 0, best: 0 }, hard: { current: 0, best: 0 }, blitz: { current: 0, best: 0 } }; return server; },
      read: async () => server!,
    });
    expect(sent.map((g) => (g as { result: string }).result)).toEqual(['win', 'win']);
    expect(s.pendingCount()).toBe(0);
    expect(s.view().easy).toEqual({ current: 2, best: 2 });
  });
});

describe('the account is the record; this device is its cache', () => {
  const zero = { current: 0, best: 0 };
  it("another device's games arrive with the account's numbers", async () => {
    const s = make();
    await s.sync({ send: async () => { throw new Error('nothing to send'); }, read: async () => ({ easy: { current: 5, best: 9 }, medium: zero, hard: zero, blitz: zero }) });
    expect(s.view().easy).toEqual({ current: 5, best: 9 });
  });
  it('a game finished while the account answer was on its way is not lost', async () => {
    const s = make();
    s.started('hard', 1); s.finished('hard', 'win');
    await s.sync({
      send: async () => { s.started('hard', 2); s.finished('hard', 'win'); return { easy: zero, medium: zero, hard: { current: 1, best: 1 }, blitz: zero }; },
      read: async () => { throw new Error('unused'); },
    });
    expect(s.view().hard).toEqual({ current: 2, best: 2 });
    expect(s.pendingCount()).toBe(1);
  });
  it("another account on this device never sees or sends this one's streaks", async () => {
    const store = memory();
    let who = 'alice';
    const s = make(store, () => who);
    s.started('easy', 1); s.finished('easy', 'win');
    who = 'bob';
    expect(s.view().easy).toEqual(zero);
    let sent: unknown[] = [];
    await s.sync({ send: async (g) => { sent = g; return { easy: zero, medium: zero, hard: zero, blitz: zero }; }, read: async () => ({ easy: zero, medium: zero, hard: zero, blitz: zero }) });
    expect(sent).toEqual([]);
    who = 'alice';
    expect(s.view().easy).toEqual({ current: 1, best: 1 });
  });
  it('a damaged save on the device is ignored, never a crash', () => {
    const store = memory();
    store.set(PRACTICE_STREAKS_KEY, '{oops');
    expect(make(store).view().easy).toEqual(zero);
  });
});
