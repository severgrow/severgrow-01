import { describe, expect, it } from 'vitest';
import { isStrangled, strangleOutcome, strangledPlayers } from '../../src/engine/index.js';
import type { Player } from '../../src/engine/index.js';
import { fixture } from '../helpers.js';

const P1_RING = ['-1,2', '-1,1', '-2,1', '-3,2', '-3,3', '-2,3'];
const P2_RING = ['3,-2', '3,-3', '2,-3', '1,-2', '1,-1', '2,-1'];

const owned = (keys: string[], owner: Player, strength = 1): Record<string, [Player, number]> =>
  Object.fromEntries(keys.map((k) => [k, [owner, strength]]));

describe('Strangle', () => {
  it('six enemy tiles around a root strangle it', () => {
    const f = fixture({ tiles: owned(P1_RING, 1) });
    expect(isStrangled(f, 0)).toBe(true);
    expect(isStrangled(f, 1)).toBe(false);
    expect(strangledPlayers(f)).toEqual([0]);
    expect(strangleOutcome(f)).toEqual({ reason: 'strangle', loser: 0 });
  });

  it('one empty neighbour prevents strangle', () => {
    const f = fixture({ tiles: owned(P1_RING.slice(1), 1) });
    expect(isStrangled(f, 0)).toBe(false);
    expect(strangleOutcome(f)).toBeNull();
  });

  it('one own neighbour prevents strangle', () => {
    const f = fixture({ tiles: { ...owned(P1_RING.slice(1), 1), [P1_RING[0]!]: [0, 1] } });
    expect(isStrangled(f, 0)).toBe(false);
  });

  it('rock counts as a blocker alongside enemy tiles', () => {
    const f = fixture({ rock: P1_RING.slice(0, 2), tiles: owned(P1_RING.slice(2), 1) });
    expect(isStrangled(f, 0)).toBe(true);
  });

  it('a terrain-only blockade never strangles', () => {
    const f = fixture({ rock: P1_RING });
    expect(isStrangled(f, 0)).toBe(false);
    expect(strangleOutcome(f)).toBeNull();
  });

  it('off-board neighbours count as blocked (corner roots)', () => {
    // Corner P1 root (-3,3) has on-board neighbours (-2,3), (-2,2), (-3,2).
    const terrainOnly = fixture({ config: { rootStyle: 'corner' }, rock: ['-2,3', '-2,2', '-3,2'] });
    expect(isStrangled(terrainOnly, 0)).toBe(false);
    const withEnemy = fixture({
      config: { rootStyle: 'corner' },
      rock: ['-2,3', '-3,2'],
      tiles: { '-2,2': [1, 1] },
    });
    expect(isStrangled(withEnemy, 0)).toBe(true);
    expect(strangleOutcome(withEnemy)).toEqual({ reason: 'strangle', loser: 0 });
  });

  it('works for P2', () => {
    const f = fixture({ tiles: owned(P2_RING, 0) });
    expect(strangledPlayers(f)).toEqual([1]);
    expect(strangleOutcome(f)).toEqual({ reason: 'strangle', loser: 1 });
  });

  it('both roots strangled is a double strangle', () => {
    const f = fixture({ tiles: { ...owned(P1_RING, 1), ...owned(P2_RING, 0) } });
    expect(strangledPlayers(f)).toEqual([0, 1]);
    expect(strangleOutcome(f)).toEqual({ reason: 'double_strangle' });
  });

  it('enemy strength is irrelevant (rank 1 blockers count)', () => {
    const f = fixture({ tiles: owned(P1_RING, 1, 1) });
    expect(isStrangled(f, 0)).toBe(true);
  });
});
