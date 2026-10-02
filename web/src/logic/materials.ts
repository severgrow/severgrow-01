// Board materials for the "lowkey 3D" look: grass for my tiles, lava for the bot's,
// real rock, soil-pocket empty hexes and gold. One light from the top-left, matte by
// default; the only glow allowed is the fire. Pure data and decisions (tested);
// web/src/ui/materials/ draws them.
//
// Every tile varies a little (tuft spots, seam paths, a small turn), always derived from
// a hash of its coordinate: the same tile always looks the same, with no randomness.
import type { Terrain, Tile } from '../../../src/engine/index.js';
import type { ThemeId } from './themes.js';

/** The materials the board can draw. A new one (e.g. "wild" for a world map) adds a name here and a drawer in ui/materials. */
export const MATERIAL_NAMES = ['moss', 'fire', 'rock', 'empty', 'gold'] as const;
export type MaterialName = (typeof MATERIAL_NAMES)[number];

/** Which material a hex shows. */
export const materialFor = (tile: Pick<Tile, 'owner'> & Partial<Tile> | null | undefined, terrain: Terrain): MaterialName => {
  if (tile) return tile.owner === 0 ? 'moss' : 'fire';
  return terrain === 'rock' ? 'rock' : terrain === 'rich' ? 'gold' : 'empty';
};

export const MATERIAL_TOKENS = [
  'rimLight', // the thin bright rim on top-left edges
  'rimDark', // the soft darker bottom-right edge
  'shadow', // contact shadows
  'mossDeep', // grass: the shade between blades
  'moss', // the lawn (fresh green, so it is still "me")
  'mossTop', // sunlit blade tops
  'mossTuft', // the brightest blade tips
  'mossDry', // cut off: dried, grey-brown and flat
  'fireCrust', // lava: the dark, rough cooled crust
  'fireDeep', // the deep red glow just under the crust
  'fire', // the molten cracks, the bot's coral-red
  'fireHot', // the hot middle of the cracks, orange-red (never amber)
  'fireTip', // the brightest thread in the cracks (a pale peach, never yellow)
  'fireAsh', // cut off: cooled to dark grey ash
  'fireInk', // numbers and the marker on lava (light on the dark crust)
  'rock', // stone body: dark, slightly warm grey-brown
  'rockDark', // crevices and the thick raised edge
  'rockLight', // the top-left facet
  'rockCrack', // hairline cracks and chips
  'goldSheen', // the faint metallic sheen on gold hexes
] as const;
export type MaterialToken = (typeof MATERIAL_TOKENS)[number];

export type Materials = { intensity: number; colors: Record<MaterialToken, string> };

const SHARED = {
  rimLight: '#fff6e0',
  rimDark: '#000000',
  shadow: '#000000',
  mossDeep: '#1d5a2e',
  moss: '#4fb35c',
  mossTop: '#8ed36d',
  mossTuft: '#c8ef9e',
  mossDry: '#756b5b',
  fireCrust: '#262322',
  fireDeep: '#8e1f13',
  fire: '#ff5a3a',
  fireHot: '#ff7f45',
  fireTip: '#ffb08a',
  fireAsh: '#4b4846',
  fireInk: '#fff1e8',
  goldSheen: '#fff1c4',
} as const;

const MATERIALS: Record<ThemeId, Materials> = {
  soil: { intensity: 1, colors: { ...SHARED, rock: '#58524a', rockDark: '#35312c', rockLight: '#776f64', rockCrack: '#1f1c18' } },
  moss: { intensity: 0.8, colors: { ...SHARED, rock: '#55524b', rockDark: '#33312d', rockLight: '#736d64', rockCrack: '#1d1b18' } },
  ink: { intensity: 0.3, colors: { ...SHARED, rock: '#55514c', rockDark: '#34322f', rockLight: '#6f6a63', rockCrack: '#1e1d1b' } },
};

export const materialsOf = (id: ThemeId): Materials => MATERIALS[id];

export const DETAILS = ['low', 'normal'] as const;
export type Detail = (typeof DETAILS)[number];

export type MaterialLook = {
  intensity: number;
  textures: boolean; // grain, tufts, crust plates
  facets: boolean; // rock's flat top planes
  cracks: boolean; // rock cracks, chips and pebbles
  motion: boolean; // the flames' flicker and the moss root's breathing
  depth: number; // px of raise for rock and roots, 1 to 3
  rim: number; // opacity of the top-left rim light
  shadow: number; // opacity of contact shadows
};

/** How much material to draw, from the palette's intensity, the Material detail setting and Reduce motion. */
export const materialLook = (id: ThemeId, detail: Detail, reduceMotion: boolean): MaterialLook => {
  const k = MATERIALS[id].intensity;
  const rich = detail === 'normal' && k >= 0.5;
  return {
    intensity: k,
    textures: rich,
    facets: rich,
    cracks: rich,
    motion: !reduceMotion && detail === 'normal',
    depth: Math.round((1 + 2 * k) * 10) / 10,
    rim: Math.round((0.18 + 0.22 * k) * 100) / 100,
    shadow: Math.round((0.25 + 0.25 * k) * 100) / 100,
  };
};

/** Strength as height: a stronger tile sits higher (1-3 px), with more rim light and shadow, and brighter. */
export const strengthLift = (strength: number, maxRank: number) => {
  const t = maxRank > 1 ? Math.min(1, Math.max(0, (strength - 1) / (maxRank - 1))) : 1;
  return {
    lift: Math.round((1 + 2 * t) * 100) / 100,
    rim: Math.round((0.25 + 0.2 * t) * 100) / 100,
    shadow: Math.round((0.3 + 0.25 * t) * 100) / 100,
    bright: Math.round((0.82 + 0.18 * t) * 100) / 100,
  };
};

// ---------- stable per-tile variation ----------

/** 0..1 from a string (FNV-1a): the same input always gives the same number. */
const unit = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const r2 = (x: number) => Math.round(x * 1000) / 1000;

/** A small turn (degrees) and a tiny brightness shift, so a field of tiles doesn't look stamped. */
export const tileVariant = (key: string) => ({
  turn: r2((unit(`${key}:turn`) - 0.5) * 16),
  shade: r2((unit(`${key}:shade`) - 0.5) * 0.08),
});

/**
 * Where the number and the owner's marker sit, in tile units (tile radius = 1, y down).
 * Seams and other bright details never enter it.
 */
export const CLEAR_ZONE = { halfWidth: 0.36, top: -0.48, bottom: 0.7 } as const;
export const inClearZone = (x: number, y: number) => Math.abs(x) <= CLEAR_ZONE.halfWidth && y >= CLEAR_ZONE.top && y <= CLEAR_ZONE.bottom;

export type Pt = { x: number; y: number };
const polar = (a: number, r: number): Pt => ({ x: r2(Math.cos(a) * r), y: r2(Math.sin(a) * r) });

/** One grass blade: base (x, y), length, lean (radians from straight up) and shade (0 dark, 1 mid, 2 light). */
export type Blade = { x: number; y: number; len: number; angle: number; tone: 0 | 1 | 2 };

/**
 * Grass: a dense lawn of fine blades all over the tile, plus a fringe of blades poking out
 * past the edge (the fuzzy outline). Over the number and the marker the blades stay short.
 */
export const grassBlades = (key: string): Blade[] => {
  const out: Blade[] = [];
  const inner = 78;
  for (let i = 0; i < inner; i++) {
    // spread evenly over the disc (sunflower spiral), jittered by the tile's hash
    const r = Math.sqrt((i + 0.5) / inner) * 0.8;
    const a = i * 2.39996 + unit(`${key}:ga${i}`) * 0.6;
    const p = polar(a, r);
    const angle = r2((unit(`${key}:gl${i}`) - 0.5) * 0.9);
    let len = 0.1 + 0.12 * unit(`${key}:gn${i}`);
    const tip = { x: p.x + Math.sin(angle) * len, y: p.y - Math.cos(angle) * len };
    if (inClearZone(p.x, p.y) || inClearZone(tip.x, tip.y)) len = 0.05 + 0.06 * unit(`${key}:gc${i}`);
    out.push({ ...p, len: r2(len), angle, tone: (Math.floor(unit(`${key}:gt${i}`) * 3) as 0 | 1 | 2) });
  }
  const fringe = 30;
  for (let i = 0; i < fringe; i++) {
    const a = ((i + unit(`${key}:fa${i}`) * 0.8) / fringe) * Math.PI * 2;
    const p = polar(a, 0.8 + 0.06 * unit(`${key}:fr${i}`));
    // lean outward a little, so the edge looks soft and grassy
    const outward = Math.atan2(p.x, -p.y);
    const angle = r2(outward * 0.5 + (unit(`${key}:fl${i}`) - 0.5) * 0.5);
    out.push({ ...p, len: r2(0.12 + 0.1 * unit(`${key}:fn${i}`)), angle, tone: (i % 3) as 0 | 1 | 2 });
  }
  return out;
};

/** A few tiny dandelions (yellow) and seed puffs (white) on some tiles, never on the number. */
export const grassFlowers = (key: string): { x: number; y: number; kind: 'bloom' | 'puff' }[] => {
  const n = Math.floor(unit(`${key}:fln`) * 5) - 1; // -1..3: some tiles have none
  const out: { x: number; y: number; kind: 'bloom' | 'puff' }[] = [];
  for (let i = 0; i < n; i++) {
    let a = unit(`${key}:fla${i}`) * Math.PI * 2;
    const r = 0.45 + 0.3 * unit(`${key}:flr${i}`);
    let p = polar(a, r);
    for (let t = 0; t < 6 && inClearZone(p.x, p.y); t++) {
      a += 0.7;
      p = polar(a, r);
    }
    if (!inClearZone(p.x, p.y)) out.push({ ...p, kind: unit(`${key}:flk${i}`) < 0.55 ? 'bloom' : 'puff' });
  }
  return out;
};

/** One glowing crack in the lava crust: a wandering line, wider where it is hotter. */
export type Crack = { points: Pt[]; width: number };

const LAVA_MAX_R = 0.82;
// cracks keep a margin from the number, so even a wide molten line stays off it
const LAVA_MARGIN = 0.12;
const nearZone = (x: number, y: number) =>
  Math.abs(x) <= CLEAR_ZONE.halfWidth + LAVA_MARGIN && y >= CLEAR_ZONE.top - LAVA_MARGIN && y <= CLEAR_ZONE.bottom + LAVA_MARGIN;
const segmentClear = (a: Pt, b: Pt) => {
  for (let t = 0; t <= 20; t++) {
    const x = a.x + ((b.x - a.x) * t) / 20;
    const y = a.y + ((b.y - a.y) * t) / 20;
    if (nearZone(x, y) || Math.hypot(x, y) > LAVA_MAX_R + 0.01) return false;
  }
  return true;
};

/**
 * Lava: dark crust split by glowing cracks that wander in from the edge. A stronger tile
 * has more cracks (it glows more). They never cross the number or the marker.
 */
export const lavaCracks = (key: string, strength: number): Crack[] => {
  const n = 3 + Math.floor((Math.min(9, Math.max(1, strength)) - 1) / 2); // 3..7
  const base = unit(`${key}:lb`) * Math.PI * 2;
  const out: Crack[] = [];
  for (let i = 0; i < n; i++) {
    // golden-angle spread: crack i is the same at every strength, so more strength only adds cracks
    let a = base + i * 2.39996 + (unit(`${key}:la${i}`) - 0.5) * 0.5;
    let r = LAVA_MAX_R - 0.02;
    for (let t = 0; t < 30 && nearZone(polar(a, r).x, polar(a, r).y); t++) a += 0.25;
    const points: Pt[] = [polar(a, r)];
    const steps = 4 + Math.floor(unit(`${key}:ls${i}`) * 4);
    for (let s = 0; s < steps; s++) {
      const da = (unit(`${key}:ld${i}:${s}`) - 0.5) * 0.6;
      const dr = -0.03 - 0.08 * unit(`${key}:lr${i}:${s}`);
      let next = polar(a + da, Math.max(0.3, r + dr));
      const prev = points[points.length - 1]!;
      // blocked by the number: run along it instead, at the edge
      if (!segmentClear(prev, next)) next = polar(a + da, LAVA_MAX_R - 0.02);
      if (!segmentClear(prev, next)) break;
      points.push(next);
      a += da;
      r = Math.hypot(next.x, next.y);
    }
    for (let t = 1; points.length < 2 && t < 12; t++) {
      const cand = polar(a + (t % 2 ? 1 : -1) * 0.15 * t, LAVA_MAX_R - 0.02);
      if (segmentClear(points[0]!, cand)) points.push(cand);
    }
    if (points.length >= 2) out.push({ points, width: r2(0.12 + 0.1 * unit(`${key}:lw${i}`)) });
  }
  return out;
};

/** Rock: a few smaller stones lying on the rock ("rocky rocks"), each with its own size, shape and turn. */
export const rockPebbles = (key: string): { x: number; y: number; size: number; sides: number; turn: number }[] => {
  const n = 4 + Math.floor(unit(`${key}:pn`) * 4);
  return Array.from({ length: n }, (_, i) => {
    const size = r2(0.09 + 0.14 * unit(`${key}:ps${i}`));
    const a = ((i + unit(`${key}:pa${i}`) * 0.8) / n) * Math.PI * 2;
    const r = Math.min(0.15 + 0.5 * unit(`${key}:pr${i}`), 0.86 - size - 0.001);
    return { ...polar(a, r), size, sides: 5 + Math.floor(unit(`${key}:pk${i}`) * 3), turn: r2(unit(`${key}:pt${i}`) * 360) };
  });
};
