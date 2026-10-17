// WHY A TAP DID NOTHING — in the player's words, read from the engine's own state.
//
// A beginner experiments: they tap a stone, a far hex, the board before drawing. Silence is what
// makes Futasaku feel broken, so every dead tap answers at the hex. The answer is DERIVED, never
// guessed: the terrain says "rock", the phase says "draw first", and the legal move list says
// whether any move could use the hex at all. This module holds no rule of its own — it only reads
// (View, legal actions, selection) and picks the sentence that is true.
import { allNeighbors, coordKey, parseKey } from '../../../src/engine/index.js';
import type { Action, View } from '../../../src/engine/index.js';
import { TAP_WHY } from '../../../src/strings.js';
import type { Sel } from './interaction.js';

/** Every hex a legal action would touch (the engine's own action shape; no rule restated). */
export const actionHexKeys = (a: Action): string[] => {
  switch (a.t) {
    case 'Sprout': return [coordKey(a.coord)];
    case 'PlayFruit':
    case 'MegaBomb': return [coordKey(a.target)];
    case 'RotPick': return [coordKey(a.coord)];
    case 'Bloom': return a.hexes.map(coordKey);
    default: return [];
  }
};

/**
 * The hexes an action would put MY tile on. Not the same as `actionHexKeys`: a Bomb touches a hex to
 * REMOVE a tile from it, and a rotation pick touches one without placing anything — neither can ever
 * surround a home, so anything reasoning about the strangle must use this.
 */
export const placedHexKeys = (a: Action): string[] => {
  switch (a.t) {
    case 'Sprout': return [coordKey(a.coord)];
    case 'PlayFruit': return [coordKey(a.target)];
    case 'Bloom': return a.hexes.map(coordKey);
    default: return [];
  }
};

/** Does one of my tiles sit next to `key`? Growth must connect to your own network. */
export const touchesMine = (v: View, key: string): boolean =>
  allNeighbors(parseKey(key)).some((n) => v.board[coordKey(n)]?.owner === v.player);

/**
 * Why a tap on `key` cannot do anything now, or null when it can — or when the tap has its own job
 * (inspecting a tile, painting a Bloom). Short, calm, and always true of the current position.
 */
export const whyNotTap = (v: View, legal: readonly Action[], sel: Sel, key: string): string | null => {
  // Their turn is quiet: the board already dims, and nobody needs a lesson while waiting.
  if (v.actor !== v.player) return null;
  if (v.terrain[key] === 'rock') return TAP_WHY.rock;
  if (v.phase === 'DRAW') return TAP_WHY.draw;
  if (v.phase !== 'ACT') return null;
  // Painting a Bloom has its own undo gesture; a stray tap during it is a step back, not a lesson.
  if (sel.kind?.startsWith('bloom-')) return null;
  // Some legal move can use this hex: the board is not the thing that is wrong.
  if (legal.some((a) => actionHexKeys(a).includes(key))) return null;
  // A tile is tapped to inspect or open it, never to grow on.
  if (v.board[key]) return null;
  if (sel.card === null && sel.kind === null) {
    return touchesMine(v, key) ? TAP_WHY.pick : TAP_WHY.connect;
  }
  return touchesMine(v, key) ? TAP_WHY.target : TAP_WHY.connect;
};
