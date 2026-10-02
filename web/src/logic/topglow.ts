// UI polish pass 3, Part 1: the top-rank tile's only finish is a slight glow: a faint halo
// hugging the hex in the owner's colour family. No contour, no rim, no shimmer. The number
// and the material ramp still carry the strength; the glow is a second-look detail.
import type { Effects } from './settings.js';

export type GlowSetting = 'off' | 'subtle';
export const GLOW_SETTINGS = ['off', 'subtle'] as const;
export type GlowOpts = { setting: GlowSetting; effects: Effects; reduceMotion: boolean };

export type Glow = {
  /** peak opacity of the halo */
  opacity: number;
  /** blur radius as a share of the hex width */
  blur: number;
  color: string;
  /** always 0: no outline of any kind */
  contour: 0;
  stroke: 0;
  /** a very slow, very slight breathing (High effects only), or null */
  breathe: { amount: number; periodMs: number } | null;
};

/** The strength of the glow before this pass (for the lab's comparison row). */
export const OLD_GLOW_OPACITY = 0.9;
/** About a quarter of the old strength, tuned down a little more by eye. */
export const GLOW_CAP = 0.2;
/** Tiles at or above this t (but not the top) get a whisper of the glow. */
export const WHISPER_FROM = 0.9;
const WHISPER = 0.3;

const COLORS = { moss: '#c8f0d8', lava: '#ff9a7e' } as const;

/** The glow for a tile at vigour t, or null for none. */
export const topGlow = (t: number, mat: 'moss' | 'lava', o: GlowOpts): Glow | null => {
  if (o.setting === 'off' || o.effects === 'low' || t < WHISPER_FROM) return null;
  const opacity = t >= 1 ? GLOW_CAP : GLOW_CAP * WHISPER;
  return {
    opacity,
    blur: 0.07,
    color: COLORS[mat],
    contour: 0,
    stroke: 0,
    breathe: o.effects === 'high' && !o.reduceMotion ? { amount: 0.04, periodMs: 6000 } : null,
  };
};
