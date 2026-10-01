import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, resolveConfig } from '../../src/engine/index.js';

describe('DEFAULT_CONFIG', () => {
  it('matches the spec defaults (v0.4)', () => {
    expect(DEFAULT_CONFIG).toEqual({
      boardRadius: 3,
      rootStyle: 'ring2',
      handSize: 7,
      copiesPerCard: 2,
      rockCount: 4,
      richCount: 5,
      knockDeadwood: 10,
      knockGivesFinalTurn: true,
      rotThreshold: 20,
      rotStep: 8,
      forbidRedundantDiscard: true,
      allowHyphaOneBend: false,
      fruitPerPlayer: 0,
      rootsScore: false,
      maxRank: 7,
      sproutsPerTurn: 1,
      guaranteeOpeningMeld: true,
      rotEnabled: false,
      knockEnabled: false,
    });
  });

  it('is frozen so nothing can mutate the shared defaults', () => {
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
  });
});

describe('resolveConfig', () => {
  it('returns a fresh copy of the defaults when no overrides are given', () => {
    const c = resolveConfig();
    expect(c).toEqual(DEFAULT_CONFIG);
    expect(c).not.toBe(DEFAULT_CONFIG);
    expect(Object.isFrozen(c)).toBe(false);
  });

  it('applies overrides', () => {
    const c = resolveConfig({ rootStyle: 'corner', rotThreshold: 18, fruitPerPlayer: 0 });
    expect(c.rootStyle).toBe('corner');
    expect(c.rotThreshold).toBe(18);
    expect(c.fruitPerPlayer).toBe(0);
    expect(c.handSize).toBe(7);
  });

  it('does not mutate the override object', () => {
    const o = { richCount: 3 };
    resolveConfig(o);
    expect(o).toEqual({ richCount: 3 });
  });

  const reject = (partial: Record<string, unknown>, code: string) => {
    let err: unknown;
    try {
      resolveConfig(partial as never);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).code).toBe(code);
  };

  it('rejects an even richCount', () => {
    reject({ richCount: 4 }, 'RICH_COUNT_NOT_ODD');
    reject({ richCount: 0 }, 'RICH_COUNT_NOT_ODD');
  });

  it('rejects a negative richCount', () => {
    reject({ richCount: -1 }, 'INVALID_NUMBER');
  });

  it('rejects an odd rockCount', () => {
    reject({ rockCount: 3 }, 'ROCK_COUNT_NOT_EVEN');
  });

  it('rejects handSize below 3', () => {
    reject({ handSize: 2 }, 'HAND_SIZE_TOO_SMALL');
  });

  it('rejects non-integer and non-finite numbers', () => {
    reject({ handSize: 7.5 }, 'INVALID_NUMBER');
    reject({ rotThreshold: Number.POSITIVE_INFINITY }, 'INVALID_NUMBER');
    reject({ rotStep: Number.NaN }, 'INVALID_NUMBER');
    reject({ knockDeadwood: '10' }, 'INVALID_NUMBER');
  });

  it('rejects a rotStep below 1', () => {
    reject({ rotStep: 0 }, 'INVALID_NUMBER');
  });

  it('rejects copiesPerCard below 1', () => {
    reject({ copiesPerCard: 0 }, 'INVALID_NUMBER');
  });

  it('rejects an unknown rootStyle', () => {
    reject({ rootStyle: 'edge' }, 'INVALID_ROOT_STYLE');
  });

  it('rejects non-boolean flags', () => {
    reject({ knockGivesFinalTurn: 1 }, 'INVALID_BOOLEAN');
  });

  it('rejects unknown keys (catches typos in sweeps)', () => {
    reject({ rotThreshhold: 20 }, 'UNKNOWN_KEY');
  });

  it('rejects a deck too small to deal both hands and flip a discard', () => {
    // 36 cards with 1 copy; 2 * 18 + 1 = 37 > 36
    reject({ copiesPerCard: 1, handSize: 18 }, 'DECK_TOO_SMALL');
  });

  it('rejects a board too small to hold the roots', () => {
    reject({ boardRadius: 1 }, 'ROOT_OFF_BOARD');
  });

  it('rejects terrain counts that cannot be placed', () => {
    reject({ rockCount: 30 }, 'TERRAIN_INFEASIBLE');
    reject({ richCount: 21 }, 'TERRAIN_INFEASIBLE');
  });

  it('rejects allowHyphaOneBend until it is implemented (Milestone C)', () => {
    reject({ allowHyphaOneBend: true }, 'NOT_IMPLEMENTED');
  });
});
