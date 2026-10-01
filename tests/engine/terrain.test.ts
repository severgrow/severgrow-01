import { describe, expect, it } from 'vitest';
import {
  allCoords,
  coordKey,
  generateTerrain,
  mirror,
  neighbors,
  resolveConfig,
  rootCoord,
  terrainPairs,
} from '../../src/engine/index.js';
import type { RulesConfig, Terrain } from '../../src/engine/index.js';

const SEEDS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 13);

const count = (t: Record<string, Terrain>, kind: Terrain) =>
  Object.values(t).filter((x) => x === kind).length;

const rootZone = (config: RulesConfig): Set<string> => {
  const zone = new Set<string>();
  for (const p of [0, 1] as const) {
    const root = rootCoord(p, config.rootStyle, config.boardRadius);
    zone.add(coordKey(root));
    for (const n of neighbors(root, config.boardRadius)) zone.add(coordKey(n));
  }
  return zone;
};

describe('terrainPairs', () => {
  it('splits the 36 non-centre hexes into 18 mirrored pairs', () => {
    const pairs = terrainPairs(3);
    expect(pairs).toHaveLength(18);
    const keys = pairs.flatMap(([a, b]) => {
      expect(b).toEqual(mirror(a));
      return [coordKey(a), coordKey(b)];
    });
    expect(new Set(keys).size).toBe(36);
    expect(keys).not.toContain('0,0');
  });
});

for (const rootStyle of ['ring2', 'corner'] as const) {
  describe(`generateTerrain (${rootStyle}, 1000 seeds)`, () => {
    const config = resolveConfig({ rootStyle });
    const zone = rootZone(config);
    const boardKeys = allCoords(config.boardRadius).map(coordKey).sort();

    it('covers exactly the board hexes', () => {
      for (const seed of SEEDS) {
        expect(Object.keys(generateTerrain(seed, config)).sort()).toEqual(boardKeys);
      }
    });

    it('is point-symmetric', () => {
      for (const seed of SEEDS) {
        const t = generateTerrain(seed, config);
        for (const c of allCoords(config.boardRadius)) {
          expect(t[coordKey(c)]).toBe(t[coordKey(mirror(c))]);
        }
      }
    });

    it('has exactly 4 rock and 5 rich, centre rich', () => {
      for (const seed of SEEDS) {
        const t = generateTerrain(seed, config);
        expect(count(t, 'rock')).toBe(4);
        expect(count(t, 'rich')).toBe(5);
        expect(count(t, 'normal')).toBe(37 - 9);
        expect(t['0,0']).toBe('rich');
      }
    });

    it('has no rock or rich on or adjacent to either root', () => {
      for (const seed of SEEDS) {
        const t = generateTerrain(seed, config);
        for (const k of zone) expect(t[k]).toBe('normal');
      }
    });

    it('is deterministic per seed', () => {
      for (const seed of SEEDS.slice(0, 50)) {
        expect(generateTerrain(seed, config)).toEqual(generateTerrain(seed, config));
      }
    });

    it('varies across seeds', () => {
      const layouts = new Set(SEEDS.map((s) => JSON.stringify(generateTerrain(s, config))));
      expect(layouts.size).toBeGreaterThan(50);
    });
  });
}

describe('generateTerrain with non-default counts', () => {
  it('honours rockCount and richCount', () => {
    for (const [rockCount, richCount] of [
      [0, 1],
      [2, 3],
      [6, 7],
      [10, 13],
    ] as const) {
      const config = resolveConfig({ rockCount, richCount });
      for (const seed of SEEDS.slice(0, 100)) {
        const t = generateTerrain(seed, config);
        expect(count(t, 'rock')).toBe(rockCount);
        expect(count(t, 'rich')).toBe(richCount);
        expect(t['0,0']).toBe('rich');
      }
    }
  });

  it('works for other board radii without hardcoding 3', () => {
    const config = resolveConfig({ boardRadius: 4 });
    const zone = rootZone(config);
    for (const seed of SEEDS.slice(0, 100)) {
      const t = generateTerrain(seed, config);
      expect(Object.keys(t)).toHaveLength(61);
      expect(count(t, 'rock')).toBe(4);
      expect(count(t, 'rich')).toBe(5);
      for (const k of zone) expect(t[k]).toBe('normal');
      for (const c of allCoords(4)) expect(t[coordKey(c)]).toBe(t[coordKey(mirror(c))]);
    }
  });

  it('does not depend on non-terrain config (independent PRNG stream)', () => {
    const a = generateTerrain(99, resolveConfig());
    const b = generateTerrain(99, resolveConfig({ handSize: 5, copiesPerCard: 1 }));
    expect(a).toEqual(b);
  });
});
