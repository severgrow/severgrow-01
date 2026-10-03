// How the deck and the throw pile look in each step. In the Draw step the piles you
// can draw from glow and say "tap"; in the other steps (and on the bot's turn) they
// are dimmed and cannot be tapped. Pure.
import type { Action, Phase } from '../../../src/engine/index.js';

export type PileLook = { enabled: boolean; glow: boolean; dim: boolean; hint: string | null };
const OFF: PileLook = { enabled: false, glow: false, dim: true, hint: null };

export const pileStates = (phase: Phase, myTurn: boolean, busy: boolean, legal: readonly Action[]): { deck: PileLook; discard: PileLook } => {
  if (phase !== 'DRAW' || !myTurn || busy) return { deck: OFF, discard: OFF };
  const can = (from: 'deck' | 'discard') => legal.some((a) => a.t === 'Draw' && a.from === from);
  const on = (hint: string): PileLook => ({ enabled: true, glow: true, dim: false, hint });
  return { deck: can('deck') ? on('Tap to draw') : OFF, discard: can('discard') ? on('Tap to take') : OFF };
};

/** Overhaul item 6: how thick a pile's stack looks (0 = empty, 1 = one card, up to 4 layers). */
export const stackLayers = (count: number, full: number): number => {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  return Math.min(4, 1 + Math.ceil((3 * Math.min(count, full)) / Math.max(full, 1)));
};

/** The deck's count states: the last card and the last few look different (the game ends when it runs out). */
export const pileCountState = (count: number): 'empty' | 'last' | 'low' | 'normal' => (count <= 0 ? 'empty' : count === 1 ? 'last' : count <= 5 ? 'low' : 'normal');
