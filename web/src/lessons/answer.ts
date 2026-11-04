// THE ANSWER TO A WRONG TAP — never silent, never a second rule book.
//
// A beginner taps everything. Each tap that cannot do anything gets one short answer, read from the
// engine's own reasons: the phase, `claimBlocker` (rock, home, not stronger), `fruitTargetBlocker`
// (a Bomb must touch your tiles, homes are safe) and `legalActions`. The answer is words for the
// glass window or the LED; the board itself only gets a small pulse at the tapped spot.
import {
  allNeighbors, claimBlocker, coordKey, fruitTargetBlocker, homeCoord, isValidRun, isValidSet,
  legalActions, parseKey, viewFor,
} from '../../../src/engine/index.js';
import type { Action, Card, State } from '../../../src/engine/index.js';
import { LESSON as W } from '../../../src/strings.js';
import type { Lit } from './lessons.js';

export type Tap =
  | { t: 'hex'; key: string }
  | { t: 'card'; id: number }
  | { t: 'deck' }
  | { t: 'discard' }
  | { t: 'end' }
  | { t: 'other' };

const YOU = 0 as const;

/** Every hex a legal action of mine would touch. */
const hexesOf = (a: Action): string[] =>
  a.t === 'Sprout' ? [coordKey(a.coord)]
  : a.t === 'PlayFruit' || a.t === 'MegaBomb' ? [coordKey(a.target)]
  : a.t === 'Bloom' ? a.hexes.map(coordKey)
  : [];

/** Does a tap land on the lit thing (or one of its quiet alternatives)? */
export const tapIsLit = (lit: Lit, tap: Tap): boolean => {
  switch (lit.t) {
    case 'hex': return tap.t === 'hex' && (tap.key === lit.key || !!lit.quiet?.includes(tap.key));
    case 'hexes': return tap.t === 'hex' && lit.keys.includes(tap.key);
    case 'card': return tap.t === 'card' && (tap.id === lit.id || !!lit.quiet?.includes(tap.id));
    case 'cards': return tap.t === 'card' && lit.ids.includes(tap.id);
    case 'deck': return tap.t === 'deck';
    case 'discard': return tap.t === 'discard';
    case 'end': return tap.t === 'end';
    default: return false;
  }
};

/**
 * Why this tap cannot do anything now, or null when it can. `locked` (levels 1-3): a legal tap that is
 * not the lit one is answered too, so the player is led back to the light instead of off the lesson.
 */
export const tapAnswer = (s: State, selected: number | null, tap: Tap, lit: Lit | null = null, locked = false, placing = false): string | null => {
  if (s.phase === 'GAME_OVER' || tap.t === 'other') return null;
  if (s.actor !== YOU) return W.theirTurnNow;
  const v = viewFor(s, YOU);
  const legal = legalActions(v);
  const litOk = lit ? tapIsLit(lit, tap) : false;
  const refuse = (why: string | null): string | null => why;

  if (tap.t === 'deck' || tap.t === 'discard') {
    const ok = legal.some((a) => a.t === 'Draw' && a.from === (tap.t === 'deck' ? 'deck' : 'discard'));
    if (s.phase !== 'DRAW') return tap.t === 'discard' && s.phase === 'DISCARD' ? null : refuse(W.oneDraw);
    if (!ok) return refuse(W.notYet);
    return locked && lit && !litOk ? W.tapLit : null;
  }
  if (tap.t === 'end') {
    if (!legal.some((a) => a.t === 'EndAct')) return s.phase === 'DRAW' ? W.drawFirst : W.notYet;
    return locked && lit && !litOk ? W.tapLit : null;
  }
  if (s.phase === 'DRAW') return W.drawFirst;

  if (tap.t === 'card') {
    if (s.phase === 'DISCARD') return locked && lit && !litOk && !(lit.t === 'discard') ? W.tapLit : null;
    const usable = legal.some((a) => ('card' in a && a.card === tap.id) || ('cards' in a && a.cards.includes(tap.id)));
    if (!usable) return W.notYet;
    return locked && lit && !litOk ? W.tapLit : null;
  }

  // A hex.
  const key = tap.key;
  if (s.phase !== 'ACT') return W.notYet;
  if (s.terrain[key] === 'rock') return W.rockBlocks;
  const theirs = coordKey(homeCoord(1, s.config));
  const yours = coordKey(homeCoord(YOU, s.config));
  const usableHere = legal.filter((a) => hexesOf(a).includes(key));
  // Placing a Bloom or a Blast: its own tiles are the touch, and a lit one is right by definition.
  if (placing) {
    const ok = usableHere.some((a) => a.t === 'Bloom' || a.t === 'MegaBomb');
    if (ok) return locked && lit && !litOk ? W.tapLit : null;
  }
  const card: Card | undefined = selected === null ? undefined : s.hands[YOU].find((c) => c.id === selected);
  if (card) {
    const withCard = usableHere.some((a) => ('card' in a && a.card === card.id) || ('cards' in a && a.cards.includes(card.id)));
    if (withCard) return locked && lit && !litOk ? W.tapLit : null;
    if (key === theirs) return W.isTheirHome;
    if (key === yours) return W.isYourHome;
    const coord = parseKey(key);
    if (card.suit === null) {
      const why = fruitTargetBlocker(v, YOU, coord);
      if (why === 'FRUIT_TARGET_NOT_TOUCHED') return W.mustTouch;
      if (why === 'FRUIT_TARGET_ROOT') return W.homesSafe;
      return W.bombTile;
    }
    const tile = s.board[key];
    if (tile?.owner === YOU) return W.ownTile;
    const blocker = claimBlocker(v, YOU, coord, card.rank);
    if (blocker === 'OVERGROW_FORBIDDEN') return W.theirTileSafe;
    if (blocker === 'NOT_STRONGER' && tile) return W.tooWeak(card.rank, tile.strength);
    const touches = allNeighbors(coord).some((n) => s.board[coordKey(n)]?.owner === YOU);
    if (!touches) return W.connect;
    if ((s.sproutsThisTurn ?? 0) > 0) return W.notYet;
    return W.notYet;
  }
  // Nothing picked.
  if (key === theirs) return W.isTheirHome;
  if (key === yours) return W.isYourHome;
  if (usableHere.length) return locked && lit && !litOk ? W.tapLit : W.pickFirst;
  const touches = allNeighbors(parseKey(key)).some((n) => s.board[coordKey(n)]?.owner === YOU);
  return touches ? W.pickFirst : W.connect;
};

/** What a Bloom of these cards is missing, from the engine's own Bloom shapes. Null when it blooms. */
export const bloomProblem = (cards: readonly Card[]): string | null => {
  if (cards.length < 3) return W.bloomNeeds;
  if (cards.some((c) => c.suit === null)) return W.bloomMatch;
  return isValidSet(cards) || isValidRun(cards) ? null : W.bloomMatch;
};
