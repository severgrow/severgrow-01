import { allCoords, coordKey, mirror, neighbors, rootCoord } from './board.js';
import { CENTRE, TERRAIN_STREAM } from './constants.js';
import { ConfigError } from './errors.js';
import { deriveSeed, mulberry32, shuffle } from './prng.js';
import type { Coord, RootStyle, RulesConfig, Terrain } from './types.js';

/** The non-centre hexes grouped into mirrored pairs, in a fixed order. */
export const terrainPairs = (radius: number): [Coord, Coord][] => {
  const seen = new Set<string>([coordKey(CENTRE)]);
  const pairs: [Coord, Coord][] = [];
  for (const c of allCoords(radius)) {
    if (seen.has(coordKey(c))) continue;
    const m = mirror(c);
    seen.add(coordKey(c));
    seen.add(coordKey(m));
    pairs.push([c, m]);
  }
  return pairs;
};

/** Keys of both roots and their on-board neighbours: no rock or rich allowed here. */
export const rootZone = (style: RootStyle, radius: number): Set<string> => {
  const zone = new Set<string>();
  for (const p of [0, 1] as const) {
    const root = rootCoord(p, style, radius);
    zone.add(coordKey(root));
    for (const n of neighbors(root, radius)) zone.add(coordKey(n));
  }
  return zone;
};

/** Mirrored pairs that may receive rock or rich terrain. */
export const eligibleTerrainPairs = (style: RootStyle, radius: number): [Coord, Coord][] => {
  const zone = rootZone(style, radius);
  return terrainPairs(radius).filter(([a, b]) => !zone.has(coordKey(a)) && !zone.has(coordKey(b)));
};

/**
 * Point-symmetric terrain (spec 4.4): centre is rich; eligible mirrored pairs are
 * shuffled, the first rockCount/2 become rock, the next (richCount-1)/2 become rich.
 */
export const generateTerrain = (seed: number, config: RulesConfig): Record<string, Terrain> => {
  const { boardRadius, rootStyle, rockCount, richCount } = config;
  const rockPairs = rockCount / 2;
  const richPairs = (richCount - 1) / 2;
  const eligible = eligibleTerrainPairs(rootStyle, boardRadius);
  if (rockPairs + richPairs > eligible.length || rootZone(rootStyle, boardRadius).has(coordKey(CENTRE))) {
    throw new ConfigError('TERRAIN_INFEASIBLE', 'not enough eligible hexes for terrain');
  }

  const terrain: Record<string, Terrain> = {};
  for (const c of allCoords(boardRadius)) terrain[coordKey(c)] = 'normal';
  terrain[coordKey(CENTRE)] = 'rich';

  const order = shuffle(eligible, mulberry32(deriveSeed(seed, TERRAIN_STREAM)));
  order.forEach(([a, b], i) => {
    const kind: Terrain | null = i < rockPairs ? 'rock' : i < rockPairs + richPairs ? 'rich' : null;
    if (kind) {
      terrain[coordKey(a)] = kind;
      terrain[coordKey(b)] = kind;
    }
  });
  return terrain;
};
