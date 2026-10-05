// Props: separate sprites on owned tiles, placed deterministically (the same board always looks
// the same), never in the number or gold-badge clear zones, and only as many as the tile's
// rendered size allows (LOD). Pure.
import type { PropDef } from './types.js';

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/** The most props a tile may carry at this rendered size (CSS px per hex) and strength (1-9). */
export const propBudget = (tilePx: number, strength9: number) => {
  if (tilePx < 40) return 0;
  if (tilePx < 64) return strength9 >= 7 ? 1 : 0;
  if (tilePx < 96) return strength9 >= 3 ? 1 : 0;
  if (tilePx < 130) return strength9 >= 6 ? 2 : strength9 >= 2 ? 1 : 0;
  return strength9 >= 7 ? 3 : strength9 >= 4 ? 2 : 1;
};

/** Clear zones, board units from the tile centre (geometry.json of the V3 pack). */
export const CLEAR = { number: { x: 0, y: -1.8, r: 9 }, gold: { x: 17.4, y: 12.6, r: 6 } };

export type Placed = { def: PropDef; x: number; y: number; size: number };

/**
 * Up to `count` props for one tile: picked from the defs allowed at this strength, set on six
 * spots between the centre and the corners (turned a little per tile), skipping any spot whose
 * sprite would touch a clear zone or leave the hex.
 */
export const placeProps = (key: string, defs: PropDef[], count: number, strength9: number): Placed[] => {
  const pool = defs.filter((d) => (d.minStrength ?? 1) <= strength9);
  if (!pool.length || count <= 0) return [];
  const turn = hash(`${key}:turn`) * Math.PI * 2;
  const spots = Array.from({ length: 6 }, (_, i) => {
    const a = turn + (i * Math.PI) / 3;
    const r = 15 + hash(`${key}:r${i}`) * 4;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, k: hash(`${key}:o${i}`) };
  }).sort((p, q) => p.k - q.k);
  const out: Placed[] = [];
  for (const s of spots) {
    if (out.length >= count) break;
    const def = pool[Math.floor(hash(`${key}:p${out.length}`) * pool.length)]!;
    const half = def.size * (0.85 + hash(`${key}:s${out.length}`) * 0.2) * 0.5;
    const clearOf = (z: { x: number; y: number; r: number }) => Math.hypot(s.x - z.x, s.y - z.y) >= z.r + half;
    // inside the hex: the inscribed circle (apothem 26) less the sprite
    if (!clearOf(CLEAR.number) || !clearOf(CLEAR.gold) || Math.hypot(s.x, s.y) + half > 25) continue;
    if (out.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < (p.size + half * 2) * 0.5)) continue;
    out.push({ def, x: s.x, y: s.y, size: half * 2 });
  }
  return out;
};
