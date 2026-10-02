// Board materials for the "lowkey 3D" look: moss for my tiles, lava for the bot's,
// real rock, soil-pocket empty hexes and gold. One light from the top-left, matte by
// default; the only glow allowed is the lava seams. Pure data and decisions (tested);
// web/src/ui/materials/ draws them.
//
// Every tile varies a little (tuft spots, seam paths, a small turn), always derived from
// a hash of its coordinate: the same tile always looks the same, with no randomness.
import type { Terrain, Tile } from '../../../src/engine/index.js';
import type { ThemeId } from './themes.js';

/** The materials the board can draw. A new one (e.g. "wild" for a world map) adds a name here and a drawer in ui/materials. */
export const MATERIAL_NAMES = ['moss', 'lava', 'rock', 'empty', 'gold'] as const;
export type MaterialName = (typeof MATERIAL_NAMES)[number];

/** Which material a hex shows. */
export const materialFor = (tile: Pick<Tile, 'owner'> & Partial<Tile> | null | undefined, terrain: Terrain): MaterialName => {
  if (tile) return tile.owner === 0 ? 'moss' : 'lava';
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
  'lavaCrust', // lava: dark cracked basalt crust
  'lavaCrustLight', // the crust's lighter top plates
  'lavaSeam', // glowing seams, the bot's coral-red
  'lavaSeamHot', // the seams' hot core, orange-red (never amber)
  'lavaAsh', // cut off: cooled to dark grey ash
  'lavaInk', // numbers and the marker on lava (light on dark)
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
  lavaCrust: '#2a201e',
  lavaCrustLight: '#433530',
  lavaSeam: '#ff5640',
  lavaSeamHot: '#ff8a5c',
  lavaAsh: '#4b4846',
  lavaInk: '#fff0e8',
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
  cracks: boolean; // rock cracks and chips, lava crust cracks
  motion: boolean; // the lava pulse and the moss root's breathing
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

/** Moss tufts: six small tufts around the cushion, placed from the tile's hash. */
export const mossTufts = (key: string): { x: number; y: number; size: number }[] =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((i + unit(`${key}:ta${i}`) * 0.7) / 6) * Math.PI * 2;
    const p = polar(a, 0.55 + 0.3 * unit(`${key}:tr${i}`));
    return { ...p, size: r2(0.06 + 0.05 * unit(`${key}:ts${i}`)) };
  });

/**
 * Lava seams: a few short glowing cracks that run around the rim of the crust (more for
 * a stronger tile), placed from the tile's hash, and always outside the clear zone.
 */
export const lavaSeams = (key: string, strength: number): Pt[][] => {
  const n = 2 + (strength >= 4 ? 1 : 0) + (strength >= 7 ? 1 : 0);
  const base = unit(`${key}:sb`) * Math.PI * 2;
  const seams: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const a0 = base + (i / n) * Math.PI * 2 + (unit(`${key}:sa${i}`) - 0.5) * 0.5;
    const steps = 3;
    let line: { a: number; r: number }[] = [];
    for (let j = 0; j < steps; j++) {
      const a = a0 + j * (0.22 + 0.12 * unit(`${key}:sd${i}:${j}`));
      const r = 0.58 + 0.26 * unit(`${key}:sr${i}:${j}`);
      line.push({ a, r });
    }
    // Keep the number and the marker clear: push any part that comes near them out to the rim.
    const pts = () => line.map((p) => polar(p.a, p.r));
    const crosses = () => {
      const p = pts();
      if (p.some((q) => inClearZone(q.x, q.y))) return true;
      for (let k = 1; k < p.length; k++) {
        for (let j = 1; j < 20; j++) {
          const t = j / 20;
          if (inClearZone(p[k - 1]!.x + (p[k]!.x - p[k - 1]!.x) * t, p[k - 1]!.y + (p[k]!.y - p[k - 1]!.y) * t)) return true;
        }
      }
      return false;
    };
    if (crosses()) line = line.map((p) => ({ ...p, r: 0.84 }));
    seams.push(pts());
  }
  return seams;
};
