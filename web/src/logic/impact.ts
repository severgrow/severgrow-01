// THE HEAVY IMPACT (Beta 0.8, owner 2026-11-06: "put some heaviness on bomb and blast ... lowkey all of
// it ... make work together ... has to work smooooth"). One plan for Bomb and Blast: a short freeze, the
// board settling under the weight, a dip of the light, a firmer buzz and a few specks of dust. Blast is
// the heavier and alone shakes. Pure, so the ceilings are tested and every device plays the same.
import { PINNED } from './motion.js';

export type ImpactKind = 'bomb' | 'blast';
export type ImpactOptions = { effects: 'low' | 'normal' | 'high'; reduceMotion: boolean; extras: boolean };
export type ImpactPlan = {
  /** the whole board holds still this long at the moment of impact */
  hitStopMs: number;
  /** how far the board sinks (as a scale delta, 0.006 = 0.6%) before it settles back */
  settle: number;
  /** Blast only: the board's shake, px */
  shakePx: number;
  /** the light dips by this much (an overlay's peak opacity) */
  dim: number;
  /** specks of dust */
  dust: number;
  /** the buzz, ms (mine only; the caller gates vibration) */
  buzzMs: number;
  /** how long the settle and the dip take, ms at Normal speed */
  bodyMs: number;
};

export const IMPACT_LIMITS = Object.freeze({ shakePx: 4, settle: 0.012, dim: 0.26 });
export const DUST_MAX = 9;

export const impactPlan = (kind: ImpactKind, size: number, o: ImpactOptions): ImpactPlan => {
  const blast = kind === 'blast';
  // 0 for the smallest, 1 for a Blast that clears a big area (about 19 tiles: two rings)
  const k = Math.max(0, Math.min(1, (size - 1) / 18));
  const extras = o.extras && o.effects !== 'low';
  const still = o.reduceMotion;
  const settle = still ? 0 : Math.min(IMPACT_LIMITS.settle, blast ? 0.007 + 0.005 * k : 0.004);
  return {
    hitStopMs: PINNED.hitStop,
    settle,
    shakePx: still || !extras || !blast ? 0 : Math.min(IMPACT_LIMITS.shakePx, 2.5 + 1.5 * k),
    dim: !extras ? 0 : Math.min(IMPACT_LIMITS.dim, blast ? 0.16 + 0.1 * k : 0.1),
    dust: still || !extras ? 0 : Math.min(DUST_MAX, blast ? 6 + Math.round(3 * k) : 4),
    buzzMs: blast ? 34 : 26,
    bodyMs: blast ? 560 + Math.round(160 * k) : 460,
  };
};

export type Speck = { dx: number; dy: number; fall: number; r: number; peak: number; delay: number; dur: number };

/**
 * n specks of dust around an impact, in hex units: each leaves in its own direction (evenly spread,
 * gently jittered), drifts out and settles downward, with its own size, brightness and timing.
 * Deterministic from `seed`, so a replay shows the same dust.
 */
export const dustSpecks = (n: number, seed: number): Speck[] => {
  let x = (seed * 2654435761) >>> 0 || 1;
  const rand = () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  return Array.from({ length: n }, (_, i) => {
    const a = ((i + 0.5) / n) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / n);
    const reach = 0.55 + rand() * 0.75;
    return {
      dx: Math.cos(a) * reach,
      dy: Math.sin(a) * reach * 0.7,
      fall: 0.18 + rand() * 0.22,
      r: 0.04 + rand() * 0.08,
      peak: 0.35 + rand() * 0.35,
      delay: Math.round(rand() * 120),
      dur: Math.round(700 + rand() * 600),
    };
  });
};
