// THE ACHIEVEMENTS KEY MUST NOT DEPEND ON ONE NETWORK READ SUCCEEDING.
//
// Owner report (2026-10-31): "sometimes i see the achievements sometimes i dont" on /test/. The
// cause was a state machine that made the key's EXISTENCE a function of whether one GET happened to
// answer: `this.achievements` started null, any non-404 error returned without painting or retrying,
// and only some unrelated change ever asked again.
//
// Owner direction (2026-11-01): "should always be availalbe in territory menu". The key is now
// present for EVERY signed-in player, from the first paint, including while a read is in flight or
// has failed; the panel shows its honest waiting state instead.
//
// The rule this file pins:
//   * the key is present for any signed-in player; hidden ONLY for a guest or because the server has
//     definitively no such route (404 / NOT_FOUND);
//   * a TRANSIENT failure (500, offline, timeout) never hides a list that is already on screen;
//   * a transient failure with no list yet is remembered, and the ordinary world poll retries;
//   * a discarded answer (identity changed, map closed) cannot leave the key hidden for ever;
//   * an EMPTY successful answer is the server's deadline fallback, never a real "you have none":
//     it keeps the remembered list and retries;
//   * the last good list per player is remembered on the device, so a later open paints at once.
//
// These are the decisions, pure. `web/src/online/world-view.ts` is the thin DOM apply; the second
// half of this file asserts that wiring without needing a browser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AchievementView } from '../../server/src/seeds/achievements.js';
import {
  ACHIEVEMENTS_MEMORY_KEY,
  achievementsReady,
  achievementsVisible,
  afterAchievementsRead,
  lastAchievements,
  noAchievements,
  rememberAchievements,
  restoreAchievements,
} from '../src/online/achievement-state.js';

const view = (over: Partial<AchievementView> = {}): AchievementView => ({
  id: 'roots',
  group: 'territory',
  seeds: 100,
  goal: 1,
  progress: 1,
  done: true,
  claimed: false,
  ...over,
});

const list = (): AchievementView[] => [
  view(),
  view({ id: 'neighbours', goal: 3, progress: 2, done: false }),
  view({ id: 'first-crossing', group: 'duels', done: true, claimed: true }),
];

const store = () => {
  const m = new Map<string, string>();
  return {
    m,
    kv: {
      get: (k: string) => m.get(k) ?? null,
      set: (k: string, v: string) => void m.set(k, v),
      remove: (k: string) => void m.delete(k),
    },
  };
};

describe('the achievements key visibility rule', () => {
  it('is hidden for a guest, whatever the device remembers', () => {
    const state = { playerId: null, views: list(), routeMissing: false, retry: false };
    expect(achievementsVisible(state)).toBe(false);
    expect(achievementsReady(state)).toBe(0);
  });

  // CHANGED INTENT (owner, 2026-11-01: "should always be availalbe in territory menu"): this used
  // to assert that the key was HIDDEN before a list had ever arrived. That is exactly the behaviour
  // the owner rejected. It is not a weakened test — it pins the opposite, stronger rule: the key is
  // there from the first paint, and a read in flight or a failure is the panel's waiting state.
  it('is present as soon as there is a player, before any list and through a failed first read', () => {
    const before = noAchievements('p1');
    expect(achievementsVisible(before), 'signed in, nothing read yet: the key is there').toBe(true);
    expect(before.retry).toBe(false);

    const failed = afterAchievementsRead(before, { kind: 'transient', playerId: 'p1' });
    expect(achievementsVisible(failed), 'a failed first read keeps the key').toBe(true);
    expect(failed.views, 'and still invents no progress').toBeNull();
    expect(failed.retry, 'the next world poll must try again').toBe(true);
    expect(failed.routeMissing).toBe(false);

    const loaded = afterAchievementsRead(failed, { kind: 'loaded', playerId: 'p1', views: list() });
    expect(achievementsVisible(loaded)).toBe(true);
    expect(loaded.views).toEqual(list());
    expect(loaded.retry).toBe(false);
  });

  it('treats an empty successful answer as "not computed yet", never as a real empty set', () => {
    const good = afterAchievementsRead(noAchievements('p1'), { kind: 'loaded', playerId: 'p1', views: list() });
    expect(achievementsReady(good)).toBe(1);
    // The server's deadline fallback: HTTP 200 with no rows. A real answer always carries the set.
    const fallback = afterAchievementsRead(good, { kind: 'loaded', playerId: 'p1', views: [] });
    expect(achievementsVisible(fallback)).toBe(true);
    expect(fallback.views, 'the remembered list survives the fallback').toEqual(list());
    expect(achievementsReady(fallback), 'and so does its ready badge').toBe(1);
    expect(fallback.retry, 'the poll asks again').toBe(true);

    // With no list yet it stays honest: visible, nothing drawn, and a retry.
    const first = afterAchievementsRead(noAchievements('p1'), { kind: 'loaded', playerId: 'p1', views: [] });
    expect(achievementsVisible(first)).toBe(true);
    expect(first.views).toBeNull();
    expect(first.retry).toBe(true);
  });

  it('never disappears after a good read because a later read failed transiently', () => {
    const good = afterAchievementsRead(noAchievements('p1'), { kind: 'loaded', playerId: 'p1', views: list() });
    // A 5xx, a thrown network error and a timeout all reach the same branch.
    const after = afterAchievementsRead(good, { kind: 'transient', playerId: 'p1' });
    expect(achievementsVisible(after)).toBe(true);
    expect(after.views).toEqual(list());
    expect(after.retry).toBe(true);
  });

  it('hides the key and stops retrying after a definite 404 / NOT_FOUND', () => {
    const good = afterAchievementsRead(noAchievements('p1'), { kind: 'loaded', playerId: 'p1', views: list() });
    const missing = afterAchievementsRead(good, { kind: 'missing', playerId: 'p1' });
    expect(achievementsVisible(missing)).toBe(false);
    expect(missing.views).toBeNull();
    expect(missing.routeMissing).toBe(true);
    expect(missing.retry, 'a missing route is not retried on the poll').toBe(false);

    // Even a later transient error cannot re-enable a route the server said does not exist.
    expect(afterAchievementsRead(missing, { kind: 'transient', playerId: 'p1' }).retry).toBe(false);
  });

  it('does not stay hidden for ever when a result is discarded', () => {
    // The identity changed, or the map closed, while the read was in flight.
    const discarded = afterAchievementsRead(noAchievements('p1'), { kind: 'discarded' });
    expect(discarded.retry, 'the next refresh must be able to recover').toBe(true);

    // A discarded answer never wipes a list that is already on screen.
    const good = afterAchievementsRead(noAchievements('p1'), { kind: 'loaded', playerId: 'p1', views: list() });
    const kept = afterAchievementsRead(good, { kind: 'discarded' });
    expect(achievementsVisible(kept)).toBe(true);
    expect(kept.views).toEqual(list());

    // And a later success still makes the key visible.
    const recovered = afterAchievementsRead(discarded, { kind: 'loaded', playerId: 'p1', views: list() });
    expect(achievementsVisible(recovered)).toBe(true);
  });

  it('counts ready rewards from the remembered list when a fresh read fails', () => {
    const good = afterAchievementsRead(noAchievements('p1'), { kind: 'loaded', playerId: 'p1', views: list() });
    expect(achievementsReady(good), 'one earned and unclaimed').toBe(1);
    const failed = afterAchievementsRead(good, { kind: 'transient', playerId: 'p1' });
    expect(achievementsReady(failed)).toBe(1);
  });
});

describe('the remembered achievements list', () => {
  it('round-trips the last good list, per player, under a versioned key', () => {
    expect(ACHIEVEMENTS_MEMORY_KEY).toBe('severgrow.territory.achievements.v1.');
    const { m, kv } = store();
    expect(lastAchievements(kv, 'p1')).toBeNull();

    rememberAchievements(kv, 'p1', list());
    expect(lastAchievements(kv, 'p1')).toEqual(list());
    expect(lastAchievements(kv, 'p2'), 'another account cannot borrow this list').toBeNull();
    expect([...m.keys()]).toEqual([`${ACHIEVEMENTS_MEMORY_KEY}p1`]);

    rememberAchievements(kv, 'p2', [view({ id: 'company', group: 'company' })]);
    expect(lastAchievements(kv, 'p1')).toEqual(list());
    expect(lastAchievements(kv, 'p2')).toHaveLength(1);
  });

  it('paints from the cache on open, without pretending the route is missing', () => {
    const { kv } = store();
    rememberAchievements(kv, 'p1', list());
    const restored = restoreAchievements(kv, 'p1');
    expect(achievementsVisible(restored)).toBe(true);
    expect(restored.views).toEqual(list());
    expect(restored.routeMissing).toBe(false);
    expect(restored.retry).toBe(false);
  });

  it('ignores a malformed or stale cache instead of drawing a broken panel', () => {
    const { m, kv } = store();
    for (const bad of [
      '{not json',
      'null',
      '{}',
      JSON.stringify({ v: 2, views: list() }),
      JSON.stringify({ v: 1, views: 'nope' }),
      JSON.stringify({ v: 1, views: [{ id: 'roots' }] }),
      JSON.stringify({ v: 1, views: [{ ...view(), group: 'unknown' }] }),
    ]) {
      m.set(`${ACHIEVEMENTS_MEMORY_KEY}p1`, bad);
      expect(lastAchievements(kv, 'p1'), bad).toBeNull();
    }
    expect(lastAchievements(null, 'p1')).toBeNull();
    expect(restoreAchievements(null, 'p1').views).toBeNull();
    expect(restoreAchievements(kv, null)).toEqual(noAchievements(null));
  });
});

describe('the world view applies the rule instead of making the key depend on a read', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/online/world-view.ts', import.meta.url)), 'utf8');

  it('decides visibility with the pure rule, never `achievements === null`', () => {
    expect(source).toContain('achievementsVisible(this.achievements)');
    expect(source).not.toMatch(/achievementsKey\.hidden\s*=\s*this\.achievements\s*===?\s*null/);
  });

  it('paints the panel after every outcome, and remembers a successful list', () => {
    const load = source.slice(
      source.indexOf('private async loadAchievements'),
      source.indexOf('// ---- YOUR COLOUR'),
    );
    expect(load, 'the loader must exist').toContain('afterAchievementsRead(');
    expect(load).toContain('rememberAchievements(');
    // An empty body is the server's deadline fallback, so it must not overwrite the remembered list.
    expect(load, 'only a real (non-empty) list is remembered').toMatch(/if \(views\.length > 0\) rememberAchievements\(/);
    expect(source).toContain('restoreAchievements(');
    // Every outcome (loaded, 404, transient, discarded) is applied and then painted; the old failure
    // path returned before painting, which is how a missed read left the key in the wrong state.
    // A quiet toast note may sit between apply and paint; paint must still follow every outcome.
    expect(load).toMatch(/this\.achievements = afterAchievementsRead\(this\.achievements, outcome\);/);
    expect(load.indexOf('this.achievements = afterAchievementsRead(this.achievements, outcome);'))
      .toBeLessThan(load.lastIndexOf('this.paintPanel();'));
    expect(load).not.toMatch(/else return;/);
  });

  it('lets the existing 12 s world poll retry, with no new timer or endpoint', () => {
    expect(source).toContain('this.achievements.retry');
    expect(source).toMatch(/if \(force \|\| ownerChanged \|\| challengeChanged \|\| walletChanged \|\| this\.achievements\.retry\)/);
    expect(source).not.toContain('/v1/seeds/achievements');
  });
});
