// UI polish pass 3: the top-rank glow as a pre-rendered picture. One soft halo per material,
// colour and tile shape, drawn once on a small canvas (a blurred outline with the inside
// cleared, so the tile itself is never tinted) and reused: no live filters on the board.
import type { ThemeStyle } from '../logic/themes.js';
import { S, hexPath } from './geom.js';

export type GlowSprite = { url: string; extent: number };
const cache = new Map<string, GlowSprite | null>();
/** canvas pixels per board unit (crisp enough on a phone at 3x) */
const RES = 4;

/** The halo picture for a tile shape, colour and blur (share of the hex width), or null without a canvas. */
export const glowSprite = (color: string, blur: number, shape: ThemeStyle['tileShape']): GlowSprite | null => {
  const id = `${color}|${blur}|${shape}`;
  if (cache.has(id)) return cache.get(id)!;
  let out: GlowSprite | null = null;
  try {
    const blurUnits = blur * S * Math.sqrt(3);
    const extent = S + blurUnits * 3;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(extent * 2 * RES);
    const g = c.getContext('2d');
    if (g) {
      const path = new Path2D(hexPath('0,0', S * 0.995, shape));
      g.setTransform(RES, 0, 0, RES, c.width / 2, c.height / 2);
      g.shadowColor = color;
      g.shadowBlur = blurUnits * RES;
      g.fillStyle = color;
      // several passes: a halo full enough near the edge to notice on a second look (its
      // overall strength is still capped by the glow's opacity), soft further out
      for (let i = 0; i < 4; i++) g.fill(path);
      g.shadowBlur = 0;
      g.globalCompositeOperation = 'destination-out';
      g.fill(path);
      out = { url: c.toDataURL('image/png'), extent };
    }
  } catch {
    out = null; // no canvas (tests): no glow
  }
  cache.set(id, out);
  return out;
};
