// Positioning pass, Step 2: equal gaps. Every tile centre is a whole-number combination of two
// lattice vectors (a: one neighbour step, b: the next one round). Rounding those two vectors to
// whole device pixels, once, puts every centre on a device pixel and makes every gap the same
// size on screen: no 1px jitter from rounding each tile on its own.
import { toScreen } from './orient.js';

const S = 30;
const SQ3 = Math.sqrt(3);
type V = { x: number; y: number };

/**
 * The two lattice vectors in screen units, each component a whole number of `quantum` (one
 * device pixel in screen units; 0 = no rounding). Of the roundings next to the true vectors,
 * the one whose three neighbour steps (a, b, b - a) are closest to the same length wins.
 */
export const snapBasis = (quantum: number): { a: V; b: V } => {
  const a = toScreen(S * SQ3, 0);
  const b = toScreen((S * SQ3) / 2, 1.5 * S);
  if (!(quantum > 0)) return { a, b };
  const opts = (v: number) => {
    const n = v / quantum;
    return [...new Set([Math.floor(n), Math.ceil(n)])].map((i) => i * quantum);
  };
  let best = { a, b };
  let bestSpread = Infinity;
  for (const ax of opts(a.x))
    for (const ay of opts(a.y))
      for (const bx of opts(b.x))
        for (const by of opts(b.y)) {
          const l = [Math.hypot(ax, ay), Math.hypot(bx, by), Math.hypot(bx - ax, by - ay)];
          const spread = Math.max(...l) - Math.min(...l);
          // ties: stay closest to the true vectors
          const drift = Math.hypot(ax - a.x, ay - a.y) + Math.hypot(bx - b.x, by - b.y);
          const score = spread + drift * 1e-3;
          if (score < bestSpread) {
            bestSpread = score;
            best = { a: { x: ax + 0, y: ay + 0 }, b: { x: bx + 0, y: by + 0 } };
          }
        }
  return best;
};
