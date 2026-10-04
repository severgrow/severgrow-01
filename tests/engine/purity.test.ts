import { describe, expect, it } from 'vitest';
import {
  applyPlacement,
  claimBlocker,
  connectedKeys,
  isStrangled,
  isValidRun,
  isValidSet,
  planBloom,
  sever,
  strangleOutcome,
  strangledPlayers,
  takeCards,
  validateRun,
  validateSet,
} from '../../src/engine/index.js';
import type { Card } from '../../src/engine/index.js';
import { chain, card, clone, codeOf, fixture } from '../helpers.js';

/**
 * Section 2.2 / 14.14: no step 7-10 function mutates its input, on success or
 * failure. Each case deep-clones every argument, calls, and compares.
 */
const assertPure = (args: unknown[], fn: () => unknown) => {
  const before = clone(args);
  try {
    fn();
  } catch {
    // failure paths must be pure too
  }
  expect(args).toEqual(before);
};

const run: Card[] = [card(5, 0, 5), card(3, 0, 3), card(4, 0, 4)];
const badRun: Card[] = [card(3, 0, 3), card(4, 0, 4), card(6, 0, 6)];
const set: Card[] = [card(1, 0, 6), card(2, 1, 6), card(3, 2, 6)];
const hand: Card[] = [...run, card(9, 3, 9)];
const busy = () =>
  fixture({
    tiles: { '-1,1': [0, 3], '0,0': [1, 2], '1,0': [0, 2], '0,1': [1, 7], '1,-1': [1, 4] },
    rock: ['3,-1', '-3,1'],
    rich: ['0,0'],
  });

describe('purity: meld validation', () => {
  it('validateRun / isValidRun do not mutate (valid and invalid)', () => {
    for (const cards of [run, badRun]) {
      assertPure([cards], () => validateRun(cards));
      assertPure([cards], () => isValidRun(cards));
    }
  });

  it('validateSet / isValidSet do not mutate (valid and invalid)', () => {
    const bad = [set[0]!, set[0]!, set[1]!];
    for (const cards of [set, bad]) {
      assertPure([cards], () => validateSet(cards));
      assertPure([cards], () => isValidSet(cards));
    }
  });

  it('takeCards does not mutate hand or ids', () => {
    const ids = [5, 3, 4];
    assertPure([hand, ids], () => takeCards(hand, ids));
    const badIds = [5, 99];
    assertPure([hand, badIds], () => takeCards(hand, badIds));
  });

  it('returned cards are not the sorted input array', () => {
    const out = validateRun(run);
    expect(out).not.toBe(run);
    expect(run.map((c) => c.rank)).toEqual([5, 3, 4]);
  });
});

describe('purity: placement', () => {
  it('planBloom (a run) does not mutate ctx, hand, ids or start (success)', () => {
    const f = busy();
    const ids = [3, 4, 5];
    const start = { q: -1, r: 2 };
    assertPure([f, hand, ids, start], () => planBloom(f, 0, hand, ids, chain(start, 0, ids.length)));
  });

  it('planBloom (a run) does not mutate anything on failure (atomic: hand and board intact)', () => {
    const f = busy();
    const ids = [3, 4, 5];
    const start = { q: -1, r: 1 }; // own tile
    assertPure([f, hand, ids, start], () => planBloom(f, 0, hand, ids, chain(start, 1, ids.length)));
    expect(codeOf(() => planBloom(f, 0, hand, ids, chain(start, 1, ids.length)))).toBe('OWN_TILE');
  });

  it('planBloom (a set) does not mutate ctx, hand, ids or hexes (success and failure)', () => {
    const f = fixture();
    const ids = [1, 2, 3];
    const good = [{ q: -1, r: 1 }, { q: -1, r: 2 }, { q: 0, r: 1 }];
    assertPure([f, set, ids, good], () => planBloom(f, 0, set, ids, good));
    const bad = [{ q: -1, r: 1 }, { q: -1, r: 2 }, { q: 3, r: 3 }];
    assertPure([f, set, ids, bad], () => planBloom(f, 0, set, ids, bad));
    expect(codeOf(() => planBloom(f, 0, set, ids, bad))).toBe('HEXES_NOT_CONNECTED');
  });

  it('applyPlacement does not mutate board or placement; output shares no tile it changed', () => {
    const f = busy();
    const placement = planBloom(f, 0, hand, [3, 4, 5], chain({ q: -1, r: 2 }, 0, 3));
    assertPure([f.board, placement], () => applyPlacement(f.board, placement));
    const out = applyPlacement(f.board, placement);
    expect(out.board).not.toBe(f.board);
    out.placed[0]!.q = 99; // mutating the result must not reach the placement
    expect(placement.tiles[0]!.coord.q).toBe(-1);
  });

  it('claimBlocker does not mutate', () => {
    const f = busy();
    const c = { q: 0, r: 0 };
    assertPure([f, c], () => claimBlocker(f, 0, c, 5));
  });
});

describe('purity: Sever and Strangle', () => {
  it('connectedKeys and sever do not mutate (with severing)', () => {
    const f = busy();
    assertPure([f], () => connectedKeys(f.board, f.config, 0));
    assertPure([f], () => sever(f.board, f.config, 0));
    expect(sever(f.board, f.config, 0).severed.length).toBeGreaterThan(0);
  });

  it('strangle checks do not mutate', () => {
    const f = fixture({
      tiles: Object.fromEntries(
        ['-1,2', '-1,1', '-2,1', '-3,2', '-3,3', '-2,3'].map((k) => [k, [1, 1] as [0 | 1, number]]),
      ),
    });
    assertPure([f], () => isStrangled(f, 0));
    assertPure([f], () => strangledPlayers(f));
    assertPure([f], () => strangleOutcome(f));
  });
});
