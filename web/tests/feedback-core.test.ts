// Beta feedback: what a report carries, which crashes are sent, and the offline queue.
import { describe, expect, it } from 'vitest';
import { QUEUE_KEY, buildContext, cleanStack, createCrashGate, createQueue, safePath } from '../src/feedback/core.js';
import type { FeedbackPayload } from '../src/feedback/core.js';

const kv = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
};

describe('report context', () => {
  const base = {
    channel: 'futa05',
    path: '/',
    screen: 'game',
    viewport: { w: 390, h: 844, dpr: 3 },
    standalone: true,
    touch: true,
    lang: 'en-GB',
    online: true,
    settings: { reduceMotion: false, largeText: true, speed: 'normal', palette: 'x', sfxVolume: 80, level: 7 },
    game: { phase: 'ACT', turnNumber: 9 },
    duel: { revealing: false, myTurn: true },
    matchId: 'm-1',
    recent: Array.from({ length: 40 }, (_, i) => ({ ev: `e${i}` })),
    errors: ['a', 'b', 'c', 'd'],
    uptimeMs: 1234.6,
  };

  it('keeps only the useful, non-identifying facts and trims the history', () => {
    const c = buildContext(base);
    expect(c.settings).toEqual({ reduceMotion: false, largeText: true, speed: 'normal' });
    expect((c.recent as unknown[]).length).toBe(15);
    expect(c.errors).toEqual(['b', 'c', 'd']);
    expect(c.uptimeMs).toBe(1235);
    const text = JSON.stringify(c);
    for (const k of ['hand', 'deck"', 'seed', 'token', 'displayName']) expect(text.includes(k)).toBe(false);
  });

  it('never carries a query or a hash (a join link hash holds the invite code)', () => {
    expect(safePath('/futa0.5/?seed=1#/join/ABCD')).toBe('/futa0.5/');
  });

  it('strips the site origin and query strings out of stacks', () => {
    const s = cleanStack('TypeError: x\n    at f (https://futasaku.com/assets/index-a.js?v=2:1:5)', 'https://futasaku.com');
    expect(s).toBe('TypeError: x\n    at f (/assets/index-a.js:1:5)');
  });
});

describe('crash gate', () => {
  it('drops noise and duplicates, and sends at most 5 per page load', () => {
    const gate = createCrashGate(5);
    expect(gate('Script error.', '')).toBe(false);
    expect(gate('ResizeObserver loop completed with undelivered notifications.', '')).toBe(false);
    expect(gate('TypeError: a', 'TypeError\n at f:1')).toBe(true);
    expect(gate('TypeError: a', 'TypeError\n at f:1')).toBe(false);
    // The same error from another line or column is the same bug: one report, not one per call site.
    expect(gate('TypeError: a', 'TypeError\n at g:9:3')).toBe(false);
    for (let i = 0; i < 10; i++) gate(`E${i}`, `\n at g${i}`);
    expect(gate('later', '\n at z')).toBe(false);
  });
});

describe('offline queue', () => {
  const p = (m: string): FeedbackPayload => ({ kind: 'report', message: m, build: null, context: {} });

  it('keeps what could not be sent, drops what was refused for good, and caps at 10', async () => {
    const store = kv();
    const q = createQueue(store);
    for (let i = 0; i < 12; i++) q.push(p(`m${i}`));
    expect(q.items().length).toBe(10);
    const sent = await q.flush(async (x) => (x.message === 'm5' ? 'retry' : x.message === 'm6' ? 'drop' : 'ok'));
    expect(sent).toBe(8);
    expect(q.items().map((x) => x.message)).toEqual(['m5']);
    await q.flush(async () => 'ok');
    expect(store.m.has(QUEUE_KEY)).toBe(false);
  });

  it('a corrupt stored queue is treated as empty', () => {
    const store = kv();
    store.set(QUEUE_KEY, '{oops');
    expect(createQueue(store).items()).toEqual([]);
  });
});
