// THE FOREST & ASH SKIN (owner, 2026-11-13): the supplied Forest and Ash ground, the fruit-tree and
// volcano homes, five rock clusters and two gold frames, cut from the original sheets by
// scripts/build-forest-ash.py. Shared by the live board (`DefaultArtBoardView`) and the replay's
// canvas painter, so both place every picture identically.
//
// Placement: each sprite is upright (flat-top hex, points left and right, exactly the board's own
// tiles) and keeps its overhang: grass tips, the tree, the smoke and rock bumps reach past the hex.
// The hex stays the only hit area; the art never takes a tap.
//
// Variation (owner, 2026-11-14: "never have 2 same exact tiles next to each other"): every cell of
// the board gets one variant index, picked from a hash of its key, then nudged so no neighbour shares
// it. It depends only on the board's cells, never on what is on them, so a tile's picture never
// changes between renders, strengths, undo or replay.
import { allNeighbors, coordKey, parseKey } from '../../../src/engine/index.js';
import { BACKGROUND_NAMES, FOREST_ASH_GEOMETRY, GOLD_ATLAS_SIZE, GOLD_FRAME_HEX_BOXES } from './forestAshData.js';
import type { ForestAshName, ForestAshSprite, SpillDir } from './forestAshData.js';
import { S, SQ3, hash } from './geom.js';
import forest1 from '../assets/forest-ash/forest-01.webp?url';
import forest2 from '../assets/forest-ash/forest-02.webp?url';
import forest3 from '../assets/forest-ash/forest-03.webp?url';
import forest4 from '../assets/forest-ash/forest-04.webp?url';
import forest5 from '../assets/forest-ash/forest-05.webp?url';
import forest6 from '../assets/forest-ash/forest-06.webp?url';
import forest7 from '../assets/forest-ash/forest-07.webp?url';
import forest8 from '../assets/forest-ash/forest-08.webp?url';
import forest9 from '../assets/forest-ash/forest-09.webp?url';
import ash1 from '../assets/forest-ash/ash-01.webp?url';
import ash2 from '../assets/forest-ash/ash-02.webp?url';
import ash3 from '../assets/forest-ash/ash-03.webp?url';
import ash4 from '../assets/forest-ash/ash-04.webp?url';
import ash5 from '../assets/forest-ash/ash-05.webp?url';
import ash6 from '../assets/forest-ash/ash-06.webp?url';
import ash7 from '../assets/forest-ash/ash-07.webp?url';
import ash8 from '../assets/forest-ash/ash-08.webp?url';
import ash9 from '../assets/forest-ash/ash-09.webp?url';
import tree from '../assets/forest-ash/home-tree.webp?url';
import volcano from '../assets/forest-ash/home-volcano.webp?url';
import rock1 from '../assets/forest-ash/rock-01.webp?url';
import rock2 from '../assets/forest-ash/rock-02.webp?url';
import rock3 from '../assets/forest-ash/rock-03.webp?url';
import rock4 from '../assets/forest-ash/rock-04.webp?url';
import rock5 from '../assets/forest-ash/rock-05.webp?url';
import goldAtlas from '../assets/forest-ash/gold-frames.webp?url';
import planetAll from '../assets/forest-ash/planet-all.webp?url';
import water1 from '../assets/forest-ash/water-01.webp?url';
import water2 from '../assets/forest-ash/water-02.webp?url';
import water3 from '../assets/forest-ash/water-03.webp?url';
import water4 from '../assets/forest-ash/water-04.webp?url';
import water5 from '../assets/forest-ash/water-05.webp?url';
import water6 from '../assets/forest-ash/water-06.webp?url';
import water7 from '../assets/forest-ash/water-07.webp?url';
import water8 from '../assets/forest-ash/water-08.webp?url';
import water9 from '../assets/forest-ash/water-09.webp?url';
import toxic1 from '../assets/forest-ash/toxic-01.webp?url';
import toxic2 from '../assets/forest-ash/toxic-02.webp?url';
import toxic3 from '../assets/forest-ash/toxic-03.webp?url';
import toxic4 from '../assets/forest-ash/toxic-04.webp?url';
import toxic5 from '../assets/forest-ash/toxic-05.webp?url';
import toxic6 from '../assets/forest-ash/toxic-06.webp?url';
import toxic7 from '../assets/forest-ash/toxic-07.webp?url';
import toxic8 from '../assets/forest-ash/toxic-08.webp?url';
import toxic9 from '../assets/forest-ash/toxic-09.webp?url';
import whirlpool from '../assets/forest-ash/home-whirlpool.webp?url';
import reactor from '../assets/forest-ash/home-reactor.webp?url';
import bg_cocoa from '../assets/forest-ash/bg-cocoa.webp?url';
import bg_lichen from '../assets/forest-ash/bg-lichen.webp?url';
import bg_cinder from '../assets/forest-ash/bg-cinder.webp?url';
import bg_clay from '../assets/forest-ash/bg-clay.webp?url';
import bg_slate from '../assets/forest-ash/bg-slate.webp?url';

export type { SpillDir };
export type FaSprite = ForestAshSprite & { url: string; name: ForestAshName };

const sprite = (name: ForestAshName, url: string): FaSprite => ({ ...FOREST_ASH_GEOMETRY[name], url, name });

/** Nine Forest grounds (player 0's territory), nine Ash grounds (player 1's). */
export const FA_FOREST: readonly FaSprite[] = [forest1, forest2, forest3, forest4, forest5, forest6, forest7, forest8, forest9]
  .map((url, i) => sprite(`forest-0${i + 1}` as ForestAshName, url));
export const FA_ASH: readonly FaSprite[] = [ash1, ash2, ash3, ash4, ash5, ash6, ash7, ash8, ash9]
  .map((url, i) => sprite(`ash-0${i + 1}` as ForestAshName, url));
export const FA_HOMES: readonly [FaSprite, FaSprite] = [sprite('home-tree', tree), sprite('home-volcano', volcano)];
export const FA_ROCKS: readonly FaSprite[] = [rock1, rock2, rock3, rock4, rock5]
  .map((url, i) => sprite(`rock-0${i + 1}` as ForestAshName, url));
/** Both gold frames in one atlas, and the hex's exact box inside it for each. */
export const FA_GOLD_ATLAS = goldAtlas;
export const FA_GOLD_ATLAS_SIZE = GOLD_ATLAS_SIZE;
export const FA_GOLD_BOXES = GOLD_FRAME_HEX_BOXES;

/**
 * THE TERRITORY SETS (owner, 2026-11-14: Water and Toxic join Forest and Ash). Each is nine plain
 * grounds and a home. The board shows one set per side: Forest (you) against Ash by default; on
 * /test/ the planet's colour menu can swap either side (ui/skinChoice.ts).
 */
export const TERRITORY_IDS = ['forest', 'ash', 'water', 'toxic'] as const;
export type TerritoryId = (typeof TERRITORY_IDS)[number];
const set = (id: string, urls: string[], home: string, homeUrl: string) => ({
  tiles: urls.map((url, i) => sprite(`${id}-0${i + 1}` as ForestAshName, url)),
  home: sprite(home as ForestAshName, homeUrl),
});
export const TERRITORIES: Record<TerritoryId, { tiles: readonly FaSprite[]; home: FaSprite }> = {
  forest: { tiles: FA_FOREST, home: FA_HOMES[0] },
  ash: { tiles: FA_ASH, home: FA_HOMES[1] },
  water: set('water', [water1, water2, water3, water4, water5, water6, water7, water8, water9], 'home-whirlpool', whirlpool),
  toxic: set('toxic', [toxic1, toxic2, toxic3, toxic4, toxic5, toxic6, toxic7, toxic8, toxic9], 'home-reactor', reactor),
};

/** The colour under each set's art (it shows only at a sprite's softened corners). */
export const TERRITORY_BASE_COLOUR: Record<TerritoryId, string> = { forest: '#315321', ash: '#302c2c', water: '#173a52', toxic: '#2b2a1c' };
export const faBaseColour = (owner: 0 | 1) => TERRITORY_BASE_COLOUR[sides[owner]];

/** Four sets in one 1024px texture, uploaded once when the shared Planet opens. */
export const faPlanetAllUrl = (): string => planetAll;

/** The two sides on the board: [player 0's set, player 1's set]. */
let sides: [TerritoryId, TerritoryId] = ['forest', 'ash'];
export const faSides = (): readonly [TerritoryId, TerritoryId] => sides;
export const setFaSides = (mine: TerritoryId, theirs: TerritoryId) => { sides = [mine, theirs]; };

/**
 * BOARD BACKGROUNDS (owner, 2026-11-14): painted boards whose hexes sit on the cells. 'classic' is
 * the ground the board had before (a tiled texture). Cinder is the quiet neutral default;
 * the painted image is only a faint 10% layer beneath the tile artwork.
 */
export type BackgroundId = 'classic' | (typeof BACKGROUND_NAMES)[number];
const BG_URLS: Record<(typeof BACKGROUND_NAMES)[number], string> = { cocoa: bg_cocoa, lichen: bg_lichen, cinder: bg_cinder, clay: bg_clay, slate: bg_slate };
export const BACKGROUNDS: readonly { id: BackgroundId; url: string | null }[] = [
  { id: 'classic', url: null }, ...BACKGROUND_NAMES.map((id) => ({ id, url: BG_URLS[id] })),
];
let background: BackgroundId = 'cinder';
export const faBackground = () => background;
export const setFaBackground = (id: BackgroundId) => { background = id; };
export const faBackgroundUrl = (): string | null => BACKGROUNDS.find((b) => b.id === background)?.url ?? null;

/** The pictures the default board draws (the preload list). Other sets load when chosen. */
export const FA_ALL_URLS: readonly string[] = [
  ...FA_FOREST.map((s) => s.url), ...FA_ASH.map((s) => s.url), ...FA_HOMES.map((s) => s.url),
  ...FA_ROCKS.map((s) => s.url), FA_GOLD_ATLAS,
];

const order = (keys: Iterable<string>) => [...keys].map((key) => ({ key, c: parseKey(key) }))
  .sort((a, b) => a.c.r - b.c.r || a.c.q - b.c.q);

/**
 * One variant per cell, `count` choices, no two neighbours alike (whenever `count` > 3, which the
 * scan order guarantees: at most three neighbours are placed before a cell). Each cell takes the
 * first variant in its own hash-shuffled preference list that no placed neighbour uses.
 */
export const assignVariants = (keys: Iterable<string>, salt: string, count: number): Map<string, number> => {
  const out = new Map<string, number>();
  for (const { key, c } of order(keys)) {
    const taken = new Set<number>();
    for (const n of allNeighbors(c)) {
      const v = out.get(coordKey(n));
      if (v !== undefined) taken.add(v);
    }
    const prefs = Array.from({ length: count }, (_, i) => i)
      .sort((a, b) => hash(`${key}:${salt}:${a}`) - hash(`${key}:${salt}:${b}`));
    out.set(key, prefs.find((v) => !taken.has(v)) ?? prefs[0]!);
  }
  return out;
};

/** The variants for a board's cells: ground tiles (nine) and rocks (five). */
export type FaVariants = { tile: Map<string, number>; rock: Map<string, number> };
export const faVariants = (keys: Iterable<string>): FaVariants => {
  const all = [...keys];
  return { tile: assignVariants(all, 'fa-tile', 9), rock: assignVariants(all, 'fa-rock', FA_ROCKS.length) };
};

/** The picture for a tile: its home, or its owner's ground in the cell's variant. */
export const faTileSprite = (v: FaVariants, key: string, owner: 0 | 1, root: boolean): FaSprite => {
  const t = TERRITORIES[sides[owner]];
  return root ? t.home : t.tiles[v.tile.get(key) ?? 0]!;
};
export const faRockSprite = (v: FaVariants, key: string): FaSprite => FA_ROCKS[v.rock.get(key) ?? 0]!;
/** Which gold frame a bonus hex wears (each hex keeps one for the whole game). */
export const faGoldVariant = (key: string): number => Math.floor(hash(`${key}:gold-frame`) * FA_GOLD_BOXES.length);

/**
 * The screen offset (in hex radii) from a cell's centre to the neighbour in each direction. The
 * board turns only in 60-degree steps of the flat family, so screen up stays a hex's top side.
 */
const DIR_OFFSET: Record<SpillDir, readonly [number, number]> = {
  n: [0, -SQ3], s: [0, SQ3], ne: [1.5, -SQ3 / 2], nw: [-1.5, -SQ3 / 2], se: [1.5, SQ3 / 2], sw: [-1.5, SQ3 / 2],
};

/** The neighbour of `key` lying in screen direction `dir`, or null (off the lattice's six). */
export const neighbourToward = (key: string, dir: SpillDir, centre: (key: string) => { x: number; y: number }): string | null => {
  const p = centre(key);
  const [dx, dy] = DIR_OFFSET[dir];
  let best: string | null = null;
  let bestD = Infinity;
  for (const n of allNeighbors(parseKey(key))) {
    const k = coordKey(n);
    const q = centre(k);
    const d = Math.hypot(q.x - p.x - dx * S, q.y - p.y - dy * S);
    if (d < bestD) { bestD = d; best = k; }
  }
  return bestD < S * 0.6 ? best : null;
};
