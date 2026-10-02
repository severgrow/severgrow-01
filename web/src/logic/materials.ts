// Board materials for the "lowkey 3D" look: grass-like moss for my tiles, fire for the bot's,
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
  'mossDeep', // moss: the darker gaps between clumps
  'moss', // the cushion (mint family, so it is still "me")
  'mossTop', // the lighter tops of the clumps
  'mossTuft', // tiny tufts
  'mossDry', // cut off: dried, grey-brown and flat
  'fireDeep', // fire: the deep red at its edges
  'fire', // the burning body, the bot's coral-red
  'fireHot', // the hot core and flame tongues, orange-red (never amber)
  'fireTip', // the bright tips of the flames (a pale peach, never yellow)
  'fireAsh', // cut off: burnt out to dark grey ash
  'fireInk', // numbers and the marker on fire (dark on bright)
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
  mossDeep: '#1f6e51',
  moss: '#45c592',
  mossTop: '#86e8c0',
  mossTuft: '#c2f6dd',
  mossDry: '#756b5b',
  fireDeep: '#8e1f13',
  fire: '#ff5a3a',
  fireHot: '#ff7f45',
  fireTip: '#ffb08a',
  fireAsh: '#4b4846',
  fireInk: '#1c0805',
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

/** Moss tufts: nine small grass tufts around the cushion, placed from the tile's hash. */
export const mossTufts = (key: string): { x: number; y: number; size: number }[] =>
  Array.from({ length: 9 }, (_, i) => {
    const a = ((i + unit(`${key}:ta${i}`) * 0.7) / 9) * Math.PI * 2;
    const p = polar(a, 0.55 + 0.3 * unit(`${key}:tr${i}`));
    return { ...p, size: r2(0.06 + 0.05 * unit(`${key}:ts${i}`)) };
  });

/** A flame tongue at (x, y) (its base), `size` wide and 1.8 x size tall, leaning a little. */
export type Flame = { x: number; y: number; size: number; lean: number };
/** The box a flame covers (it rises upward from its base). */
export const flameBox = (f: Flame) => ({ x0: f.x - f.size / 2 - Math.abs(f.lean) * f.size, x1: f.x + f.size / 2 + Math.abs(f.lean) * f.size, y0: f.y - f.size * 1.8, y1: f.y });
const boxHitsZone = (b: ReturnType<typeof flameBox>) => b.x1 >= -CLEAR_ZONE.halfWidth && b.x0 <= CLEAR_ZONE.halfWidth && b.y1 >= CLEAR_ZONE.top && b.y0 <= CLEAR_ZONE.bottom;

/**
 * Fire: flame tongues licking up around the tile (more on a stronger tile), placed from the
 * tile's hash, never over the number or the marker.
 */
export const flameTongues = (key: string, strength: number): Flame[] => {
  const n = 4 + Math.floor((Math.max(1, strength) - 1) / 3);
  const base = unit(`${key}:fb`) * Math.PI * 2;
  const out: Flame[] = [];
  for (let i = 0; i < n; i++) {
    const size = r2(0.16 + 0.08 * unit(`${key}:fs${i}`));
    const lean = r2((unit(`${key}:fl${i}`) - 0.5) * 0.5);
    let a = base + (i / n) * Math.PI * 2 + (unit(`${key}:fa${i}`) - 0.5) * 0.5;
    let r = 0.62 + 0.22 * unit(`${key}:fr${i}`);
    let fl: Flame | null = null;
    for (let t = 0; t < 8 && !fl; t++) {
      const cand = { ...polar(a, r), size, lean };
      if (!boxHitsZone(flameBox(cand))) fl = cand;
      else {
        r = 0.84;
        a += (t % 2 ? -1 : 1) * 0.3 * (t + 1);
      }
    }
    if (fl) out.push(fl);
  }
  // always at least three: fall back to the sides and the top, which never touch the number
  const spare: Flame[] = [{ x: -0.7, y: 0.2, size: 0.16, lean: 0 }, { x: 0.7, y: 0.2, size: 0.16, lean: 0 }, { x: 0, y: -0.62, size: 0.16, lean: 0 }];
  for (const f of spare) if (out.length < 3) out.push(f);
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
