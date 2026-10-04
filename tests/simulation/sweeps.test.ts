import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/engine/index.js';
import { SWEEPS, formatSweepTable, runSweeps } from '../../src/sim/sweeps.js';

describe('sweeps (spec 17, step 23)', () => {
  it('cover every dimension the spec lists', () => {
    const names = SWEEPS.map((s) => s.name);
    for (const n of ['rootStyle', 'rot', 'knockDeadwood', 'knockGivesFinalTurn', 'copiesPerCard', 'allowHyphaOneBend', 'fruitCardCount']) {
      expect(names).toContain(n);
    }
    const knock = SWEEPS.find((s) => s.name === 'knockDeadwood')!;
    expect(knock.variants.map((v) => v.config.knockDeadwood)).toEqual([10, 9, 8, 7]);
    const fruit = SWEEPS.find((s) => s.name === 'fruitCardCount')!;
    expect(fruit.variants.map((v) => v.config.fruitCardCount)).toEqual([0, 2, 4, 6]);
  });

  it('every runnable variant is a valid config; the bend sweep is marked as skipped', () => {
    for (const s of SWEEPS) {
      if (s.skipped) {
        expect(s.name).toBe('allowHyphaOneBend');
        continue;
      }
      for (const v of s.variants) expect(() => resolveConfig(v.config)).not.toThrow();
    }
  });

  it('runs a tiny sweep and reports a row per variant', () => {
    const results = runSweeps({ games: 3, only: ['knockGivesFinalTurn'] });
    expect(results).toHaveLength(1);
    expect(results[0]!.rows).toHaveLength(2);
    for (const row of results[0]!.rows) expect(row.metrics.games).toBe(3);
    const table = formatSweepTable(results);
    expect(table).toMatch(/knockGivesFinalTurn/);
    expect(table).toMatch(/turns\/player/);
  }, 60_000);
});
