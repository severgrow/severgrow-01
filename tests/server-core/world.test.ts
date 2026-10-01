import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORLD_CONFIG,
  InMemoryWorld,
  canPlaceAt,
  leaderboards,
  newAccount,
  planPlacement,
  recentFeed,
  seedWorld,
} from '../../src/server-core/index.js';
import type { Account, Cell } from '../../src/server-core/index.js';

type L = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
const cell = (q: number, r: number, level: L, owner: string | null = null): Cell => ({ q, r, level, owner, placedAt: 0, replacedCount: 0 });
const acct = (id: string, tokens: L[] = []): Account => ({ ...newAccount(id, 0), nickname: id.toUpperCase(), tokens });
const DAY = 86_400_000;

describe('where a sprout may go', () => {
  const w = new InMemoryWorld([cell(0, 0, 4, 'ann'), cell(1, 0, 9, 'bo'), cell(0, 1, 6, 'me')]);
  const at = (q: number, r: number) => w.get(q, r);

  it('an empty hex next to a sprout: yes; an empty hex with no neighbour: no', () => {
    expect(canPlaceAt(at, 0, -1, 3)).toEqual({ ok: true });
    expect(canPlaceAt(at, 5, 5, 3)).toMatchObject({ ok: false, reason: expect.stringMatching(/next to/) });
  });

  it('onto a sprout only when strictly stronger (any owner, mine included as an upgrade)', () => {
    expect(canPlaceAt(at, 0, 0, 5)).toEqual({ ok: true });
    expect(canPlaceAt(at, 0, 0, 4)).toMatchObject({ ok: false, reason: expect.stringMatching(/stronger/) });
    expect(canPlaceAt(at, 0, 0, 3).ok).toBe(false);
    expect(canPlaceAt(at, 0, 1, 7)).toEqual({ ok: true }); // my own 6 -> 7
  });

  it('a level-9 sprout is permanent', () => {
    for (const l of [1, 5, 9] as L[]) expect(canPlaceAt(at, 1, 0, l).ok).toBe(false);
  });
});

describe('placing a token', () => {
  it('uses the token, writes the cell, logs an event, counts toward the daily cap', () => {
    const w = new InMemoryWorld([cell(0, 0, 4, 'ann')]);
    const me = acct('me', [6]);
    const plan = planPlacement(me, (q, r) => w.get(q, r), { token: 0, q: 0, r: 0 }, 5 * DAY, DEFAULT_WORLD_CONFIG);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.cell).toMatchObject({ q: 0, r: 0, level: 6, owner: 'me', replacedCount: 1 });
    expect(plan.account.tokens).toEqual([]);
    expect(plan.account.placementsToday).toBe(1);
    expect(plan.event).toMatchObject({ kind: 'overgrow', by: 'me', level: 6, prevOwner: 'ann', prevLevel: 4 });
    expect(w.commit(plan)).toEqual({ ok: true });
    expect(w.get(0, 0)).toMatchObject({ level: 6, owner: 'me' });
  });

  it('at most 10 placements per day; the count resets the next day', () => {
    const w = new InMemoryWorld([cell(0, 0, 1)]);
    let me = { ...acct('me', [9]), placementsDay: 3, placementsToday: 10 };
    expect(planPlacement(me, (q, r) => w.get(q, r), { token: 0, q: 1, r: 0 }, 3 * DAY + 5, DEFAULT_WORLD_CONFIG)).toMatchObject({ ok: false, reason: expect.stringMatching(/10 sprouts a day/) });
    const next = planPlacement(me, (q, r) => w.get(q, r), { token: 0, q: 1, r: 0 }, 4 * DAY + 5, DEFAULT_WORLD_CONFIG);
    expect(next.ok).toBe(true);
    if (next.ok) me = next.account;
    expect(me.placementsToday).toBe(1);
  });

  it('a missing token is refused', () => {
    const w = new InMemoryWorld([cell(0, 0, 1)]);
    expect(planPlacement(acct('me'), (q, r) => w.get(q, r), { token: 0, q: 1, r: 0 }, 0, DEFAULT_WORLD_CONFIG)).toMatchObject({ ok: false, reason: expect.stringMatching(/no sprout to place/) });
  });

  it('ADVERSARIAL 4: a race: two players plan the same hex; the second commit loses and keeps the token', () => {
    const w = new InMemoryWorld([cell(0, 0, 2)]);
    const a = planPlacement(acct('a', [5]), (q, r) => w.get(q, r), { token: 0, q: 0, r: 0 }, 0, DEFAULT_WORLD_CONFIG);
    const b = planPlacement(acct('b', [7]), (q, r) => w.get(q, r), { token: 0, q: 0, r: 0 }, 0, DEFAULT_WORLD_CONFIG);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(w.commit(a)).toEqual({ ok: true });
    expect(w.commit(b)).toEqual({ ok: false, reason: 'Someone just took that spot' });
    expect(w.get(0, 0)).toMatchObject({ owner: 'a', level: 5 });
    // b's account was never saved, so b still has its token.
  });
});

describe('the world map data', () => {
  it('starts with about 60 wild sprouts (levels 1-6, unowned) in one connected cluster', () => {
    const cells = seedWorld(1);
    expect(cells.length).toBeGreaterThanOrEqual(55);
    expect(cells.length).toBeLessThanOrEqual(65);
    for (const c of cells) {
      expect(c.owner).toBeNull();
      expect(c.level).toBeGreaterThanOrEqual(1);
      expect(c.level).toBeLessThanOrEqual(6);
    }
    const keys = new Set(cells.map((c) => `${c.q},${c.r}`));
    expect(keys.size).toBe(cells.length);
    expect(keys.has('0,0')).toBe(true);
    // connected: every cell reachable from the origin
    const seen = new Set(['0,0']);
    const stack = [[0, 0]];
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    while (stack.length) {
      const [q, r] = stack.pop()!;
      for (const [dq, dr] of D) {
        const k = `${q! + dq!},${r! + dr!}`;
        if (keys.has(k) && !seen.has(k)) {
          seen.add(k);
          stack.push([q! + dq!, r! + dr!]);
        }
      }
    }
    expect(seen.size).toBe(cells.length);
    expect(seedWorld(1)).toEqual(cells); // deterministic
  });

  it('the feed keeps the last 30 events, newest first, in plain words', () => {
    const events = Array.from({ length: 40 }, (_, i) => ({ at: i, kind: 'place' as const, q: i, r: 0, level: 3 as L, by: 'ana', prevOwner: null, prevLevel: null }));
    const names = (id: string | null) => (id === 'ana' ? 'Ana' : id === 'bo' ? 'Bo' : 'Cy');
    const feed = recentFeed(events, names);
    expect(feed).toHaveLength(30);
    expect(feed[0]).toMatchObject({ at: 39, text: 'Ana placed a 3' });
    const over = recentFeed([{ at: 1, kind: 'overgrow', q: 0, r: 0, level: 6, by: 'bo', prevOwner: 'cy', prevLevel: 4 }], names);
    expect(over[0]!.text).toBe("Bo overgrew Cy's 4 with a 6");
    const wild = recentFeed([{ at: 1, kind: 'overgrow', q: 0, r: 0, level: 6, by: 'bo', prevOwner: null, prevLevel: 2 }], names);
    expect(wild[0]!.text).toBe('Bo overgrew a wild 2 with a 6');
  });

  it('leaderboards: most sprouts and highest total of levels, with my rank', () => {
    const cells = [cell(0, 0, 9, 'a'), cell(1, 0, 2, 'b'), cell(2, 0, 2, 'b'), cell(3, 0, 2, 'b'), cell(4, 0, 5, 'c'), cell(5, 0, 1, null)];
    const lb = leaderboards(cells, 'c');
    expect(lb.mostSprouts.slice(0, 2)).toEqual([{ owner: 'b', value: 3, rank: 1 }, { owner: 'a', value: 1, rank: 2 }]);
    expect(lb.highestTotal[0]).toEqual({ owner: 'a', value: 9, rank: 1 });
    expect(lb.mine).toEqual({ mostSprouts: { value: 1, rank: 2 }, highestTotal: { value: 5, rank: 3 } });
  });
});
