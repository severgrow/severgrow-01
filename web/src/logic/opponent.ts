// How the opponent's turn is shown (UI overhaul item 19): which tiles each action involves (the
// rest of the board dims a little), a tiny camera nudge toward the action, and the Replay speed.
// Pure.
import type { Player } from '../../../src/engine/index.js';
import type { Step } from './anim.js';
import { centerOf } from '../ui/geom.js';

/** Replay plays the opponent's last turn at this speed (slower than live). */
export const REPLAY_SPEED = 0.75;
/** The camera nudge toward an action, as a share of the board's size (1-2%). */
export const NUDGE = 0.015;

/** Who made this step's move (null for bookkeeping steps). */
export const actorOf = (s: Step): Player | null => {
  switch (s.k) {
    case 'grow':
    case 'strengthen':
    case 'fruit':
    case 'megaBomb':
    case 'discard':
    case 'draw':
      return s.player;
    case 'sever':
      return s.by;
    default:
      return null;
  }
};

/** The hexes a step is about (they stay bright while the rest of the board dims). */
export const involvedKeys = (s: Step): string[] => {
  switch (s.k) {
    case 'grow':
      return s.tiles.map((t) => t.key);
    case 'strengthen':
      return [s.key];
    case 'fruit':
      return [s.target];
    case 'megaBomb':
      return [s.target,...s.destroyed];
    case 'sever':
      return [...new Set([s.origin, ...s.keys])];
    case 'remove':
      return s.keys;
    default:
      return [];
  }
};

/**
 * The nudge toward the middle of the involved hexes, as fractions of the board's width and
 * height (each within ±NUDGE). Nothing involved, or an action in the middle: no nudge.
 */
export const nudgeToward = (keys: readonly string[], boardHalfW: number, boardHalfH: number): { x: number; y: number } => {
  if (keys.length === 0) return { x: 0, y: 0 };
  const c = keys.reduce((a, k) => ({ x: a.x + centerOf(k).x / keys.length, y: a.y + centerOf(k).y / keys.length }), { x: 0, y: 0 });
  const nx = Math.max(-1, Math.min(1, c.x / boardHalfW));
  const ny = Math.max(-1, Math.min(1, c.y / boardHalfH));
  return { x: +(nx * NUDGE).toFixed(4), y: +(ny * NUDGE).toFixed(4) };
};
