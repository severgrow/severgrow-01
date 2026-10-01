import { describe, expect, it } from 'vitest';
import { deckExhaustionResult, knockResult, score, strangleResult } from '../../src/engine/index.js';
import { fixture } from '../helpers.js';

describe('score (spec 11)', () => {
  it('counts 1 per normal tile and 2 per rich tile; roots score nothing by default', () => {
    const f = fixture({ rich: ['0,0'], tiles: { '-1,1': [0, 3], '0,0': [0, 4], '1,-1': [1, 9] } });
    expect(score(f, 0)).toBe(3);
    expect(score(f, 1)).toBe(1);
  });

  it('strength does not matter', () => {
    const f = fixture({ tiles: { '-1,1': [0, 9], '-1,2': [0, 1] } });
    expect(score(f, 0)).toBe(2);
  });

  it('rootsScore adds 1 for the root', () => {
    const f = fixture({ config: { rootsScore: true }, tiles: { '-1,1': [0, 3] } });
    expect(score(f, 0)).toBe(2);
    expect(score(f, 1)).toBe(1);
  });

  it('an empty board scores 0', () => {
    expect(score(fixture(), 0)).toBe(0);
  });
});

describe('knockResult (spec 7.3)', () => {
  it('knocker wins only with a strictly higher score', () => {
    expect(knockResult(0, [12, 10], [5, 30])).toEqual({
      winner: 0,
      reason: 'knock',
      undercut: false,
      scores: [12, 10],
      deadwood: [5, 30],
    });
  });

  it('equal score is an Undercut', () => {
    expect(knockResult(1, [8, 8], [20, 3])).toEqual({
      winner: 0,
      reason: 'knock',
      undercut: true,
      scores: [8, 8],
      deadwood: [20, 3],
    });
  });

  it('lower score loses with undercut', () => {
    const r = knockResult(0, [10, 11], [4, 9]);
    expect(r.winner).toBe(1);
    expect(r.undercut).toBe(true);
  });
});

describe('deckExhaustionResult (spec 11)', () => {
  it('higher score wins', () => {
    expect(deckExhaustionResult([7, 5], [30, 0])).toEqual({
      winner: 0,
      reason: 'deck_exhaustion',
      scores: [7, 5],
      deadwood: [30, 0],
    });
    expect(deckExhaustionResult([5, 7], [0, 30]).winner).toBe(1);
  });

  it('tie on score: lower deadwood wins', () => {
    expect(deckExhaustionResult([6, 6], [4, 9]).winner).toBe(0);
    expect(deckExhaustionResult([6, 6], [9, 4]).winner).toBe(1);
  });

  it('tie on score and deadwood: P2 wins', () => {
    expect(deckExhaustionResult([6, 6], [5, 5]).winner).toBe(1);
  });
});

describe('strangleResult (spec 8.6)', () => {
  it('the strangled player loses', () => {
    expect(strangleResult({ reason: 'strangle', loser: 0 }, [3, 4])).toEqual({
      winner: 1,
      reason: 'strangle',
      scores: [3, 4],
    });
  });

  it('double strangle has no winner', () => {
    expect(strangleResult({ reason: 'double_strangle' }, [3, 4])).toEqual({
      winner: null,
      reason: 'double_strangle',
      scores: [3, 4],
    });
  });
});
