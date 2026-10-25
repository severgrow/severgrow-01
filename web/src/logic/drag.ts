// Pointer drag layer, pure decisions. A drag is an extra way to make the move a tap
// already makes: nothing here changes the rules or the legal-action list, it only reads
// what the engine already offers and picks the exact legal action a release should play.
// The page owns the pointer, the ghost and the animations; this file decides what the
// gesture means from the current position. Every function is a pure function of its input,
// so the thresholds and phase rules can be tested without a DOM.
import { coordKey } from '../../../src/engine/index.js';
import type { Action, Card, View } from '../../../src/engine/index.js';
import { moveCards, moveHexes } from '../../../src/playtest/names.js';
import { kindCards } from './interaction.js';
import type { Sel } from './interaction.js';
import { comboFor, drawNext, paintEnter, paintMatch } from './draw.js';

/** A move under this many pixels stays a tap: the drag never starts. */
export const DRAG_THRESHOLD_PX = 10;
/**
 * A started Throw-step move shorter than this is still a tap (owner, 2026-10-25: a tap must
 * deselect, never throw). It covers the 10px drag threshold plus a thumb's slop, and it also
 * stops a tiny drift into the pile's 96px grab radius from counting as a drag onto the pile.
 */
export const SWIPE_TAP_PX = 24;
/** Upward travel (px) a swipe must cover before it can mean a throw. */
export const SWIPE_MIN_UP_PX = 48;
/** The upward share of the total travel: at least this much before it is "up", not "sideways". */
export const SWIPE_UP_DOMINANCE = 0.65;
/** Peak upward speed (px/ms) that turns a throw drag into a flick. */
export const FLICK_SPEED_PX_PER_MS = 0.28;
/** Upward travel (px) that, with enough peak speed, also counts as a flick. */
export const FLICK_TRAVEL_PX = 64;
/** How close (px) the pointer must come to the throw pile / cockpit throw zone. */
export const PILE_GRAB_PX = 96;

/** The words the cockpit sign may show while a drag is over a matching target. Never FAST. */
export type DragLedWord = 'DRAW' | 'PLACE' | 'THROW' | 'BLOOM' | 'MEGA';
export const DRAG_LED_WORDS: readonly DragLedWord[] = ['DRAW', 'PLACE', 'THROW', 'BLOOM', 'MEGA'];

/** What the drag would do if the pointer were released right now. */
export type DragMode =
  | 'none' // not started yet, or no meaning here (cancel)
  | 'draw-deck'
  | 'draw-discard'
  | 'place' // Sprout, Strengthen or Fruit on one hex
  | 'bloom-open' // drop a card and open the existing Bloom choices
  | 'bloom' // paint a selected Bloom group
  | 'mega' // two Bombs
  | 'discard' // onto the throw pile
  | 'flick';

/** The four visible states (plus none): legal hover, illegal hover, pile hover, flick-ready. */
export type DragHover = 'none' | 'legal' | 'illegal' | 'pile' | 'flick';

export type DragSource = { kind: 'hand'; cardId: number } | { kind: 'deck' } | { kind: 'discard' };

export type DragInput = {
  view: View;
  legal: readonly Action[];
  sel: Sel;
  source: DragSource;
  /** Distance (px) from where the pointer went down. */
  distance: number;
  /** The board hex under the pointer (null: a gap or off the board). */
  boardKey: string | null;
  /** True while the pointer is inside the throw pile's grab radius. */
  overDiscardPile: boolean;
  /** The Bloom shape painted so far (the caller keeps it between moves). */
  shape: readonly string[];
  /** Peak upward speed so far this gesture (px/ms, 0 when it never moved up). */
  upSpeed: number;
  /** How far upward the pointer has travelled from the press (px, 0 when below start). */
  upTravel: number;
  /** Bloom paint order (matches the board's Reverse toggle). */
  reverse?: boolean;
};

export type DragResolution = {
  /** False until the pointer passes the 10px threshold: the gesture is still a tap. */
  active: boolean;
  mode: DragMode;
  /** The exact legal action a release now would play, or null (nothing legal / cancel). */
  commit: Action | null;
  /** The hex under the pointer, when the drag is about a hex. */
  hoverKey: string | null;
  hover: DragHover;
  /** The painted Bloom shape so far (empty for other drags). */
  shape: string[];
  /** True when a release should open the existing Bloom options instead of committing. */
  openOptions: boolean;
  /** The LED word while over a matching target, or null to leave the sign alone. */
  led: DragLedWord | null;
  /**
   * True when a started Throw-step move was too short / ambiguous to be a throw, so releasing it
   * must run the same tap the click would have run (select, or deselect the picked card).
   */
  asTap?: boolean;
};

/** True when `a` uses a card identical (same suit and rank) to `card`: copies play the same. */
const sameCard = (v: View, id: number, card: Card): boolean => {
  const c = v.hand.find((h) => h.id === id);
  return !!c && c.suit === card.suit && c.rank === card.rank;
};
const usesCard = (v: View, a: Action, card: Card): boolean => moveCards(a).some((id) => sameCard(v, id, card));
const atHex = (a: Action, key: string): boolean => moveHexes(a).some((c) => coordKey(c) === key);

const none = (input: DragInput): DragResolution => ({
  active: false, mode: 'none', commit: null, hoverKey: null, hover: 'none',
  shape: [...input.shape], openOptions: false, led: null,
});
const cancel = (input: DragInput): DragResolution => ({
  active: true, mode: 'none', commit: null, hoverKey: input.boardKey, hover: input.boardKey ? 'illegal' : 'none',
  shape: [], openOptions: false, led: null,
});

/** The deck pile: a draw from the deck in DRAW; anywhere else the phase decides, so it cancels. */
function resolveDeck(input: DragInput): DragResolution {
  const draw = input.view.phase === 'DRAW' ? input.legal.find((a) => a.t === 'Draw' && a.from === 'deck') : undefined;
  if (!draw) return cancel(input);
  return { active: true, mode: 'draw-deck', commit: draw, hoverKey: null, hover: 'legal', shape: [], openOptions: false, led: 'DRAW' };
}

/** The throw pile as a source: it can be taken from in DRAW (never a THROW), nothing else. */
function resolveDiscardSource(input: DragInput): DragResolution {
  const draw = input.view.phase === 'DRAW' ? input.legal.find((a) => a.t === 'Draw' && a.from === 'discard') : undefined;
  if (!draw) return cancel(input);
  // THROW highlighting exists only in the DISCARD phase, so a draw drag never shows it.
  return { active: true, mode: 'draw-discard', commit: draw, hoverKey: null, hover: 'legal', shape: [], openOptions: false, led: 'DRAW' };
}

/**
 * A hand card in the Throw step: a swipe up, or a drag onto the Throw pile. Crossing the board
 * does nothing. The source card is fixed at pointerdown, so a gesture that ends over a different
 * card is still the original card's throw.
 *
 * The swipe is judged by its own shape (travel, direction, peak speed), never by where it is
 * released: on a phone a clear 50px swipe is still inside the hand. That is the owner's "swipe up
 * ... upward anywhere sensible in the hand" (2026-10-25), and it is what a thumb can actually do.
 */
function resolveThrow(input: DragInput, card: Card): DragResolution {
  const discard = input.legal.find((a) => a.t === 'Discard' && a.card === card.id)
    ?? input.legal.find((a) => a.t === 'Discard' && sameCard(input.view, a.card, card));
  if (!discard) return cancel(input);
  const up = Math.max(0, input.upTravel);
  const upright = up >= SWIPE_MIN_UP_PX && up >= SWIPE_UP_DOMINANCE * Math.max(input.distance, 1);
  // Peak speed, or a clear upward carry with a softer peak — release often decelerates, so the
  // last frame alone used to miss flicks.
  const flick = upright && (input.upSpeed >= FLICK_SPEED_PX_PER_MS
    || (input.upSpeed >= FLICK_SPEED_PX_PER_MS * 0.55 && up >= FLICK_TRAVEL_PX));
  if (flick) return { active: true, mode: 'flick', commit: discard, hoverKey: null, hover: 'flick', shape: [], openOptions: false, led: 'THROW', asTap: false };
  // The pile is a drop target only once the move is a real drag, not a jitter inside its grab
  // radius. Under SWIPE_TAP_PX it falls through to the tap below.
  if (input.distance >= SWIPE_TAP_PX && input.overDiscardPile)
    return { active: true, mode: 'discard', commit: discard, hoverKey: null, hover: 'pile', shape: [], openOptions: false, led: 'THROW', asTap: false };
  // Nothing was thrown. A short, sloppy move is still a tap (so it deselects, never throws); a
  // deliberate drag that missed its target simply flies back.
  return {
    active: true, mode: 'discard', commit: null, hoverKey: null, hover: 'none', shape: [], openOptions: false, led: null,
    asTap: input.distance < SWIPE_TAP_PX,
  };
}

/** A hand card in the Grow step: Mega Bomb, Bloom paint, one-tile place, or open options. */
function resolveAct(input: DragInput, card: Card): DragResolution {
  // Two Bombs: the drag is legal only on a Mega Bomb target.
  if (card.suit === null) {
    const mega = input.legal.find((a) => a.t === 'MegaBomb' && usesCard(input.view, a, card));
    if (mega) {
      const key = input.boardKey;
      const commit = key ? input.legal.find((a) => a.t === 'MegaBomb' && usesCard(input.view, a, card) && atHex(a, key)) ?? null : null;
      return {
        active: true, mode: 'mega', commit, hoverKey: key,
        hover: commit ? 'legal' : key ? 'illegal' : 'none', shape: [], openOptions: false,
        led: commit ? 'MEGA' : null,
      };
    }
  }
  // A Bloom group is already chosen: paint it with the finger.
  if (input.sel.kind?.startsWith('bloom-') && kindCards(input.sel.kind).some((id) => sameCard(input.view, id, card))) {
    const combo = comboFor(input.view, input.legal, input.sel);
    if (combo) {
      const reverse = !!input.reverse;
      const key = input.boardKey;
      const next = key ? drawNext(combo, input.shape, reverse) : null;
      const shape = key ? paintEnter(combo, input.shape, key, reverse) : [...input.shape];
      const action = paintMatch(combo, shape, reverse);
      const overLegal = !!key && (!!action || !!next?.has(key) || shape.length > input.shape.length || input.shape.at(-2) === key);
      return {
        active: true, mode: 'bloom', commit: key ? action : null, hoverKey: key,
        hover: overLegal ? 'legal' : key ? 'illegal' : 'none', shape, openOptions: false,
        led: overLegal ? 'BLOOM' : null,
      };
    }
  }
  // One tile: Sprout, Strengthen or Fruit (the same action a tap would confirm).
  const place = input.boardKey
    ? input.legal.find((a) => (a.t === 'Sprout' || a.t === 'PlayFruit') && usesCard(input.view, a, card) && atHex(a, input.boardKey!)) ?? null
    : null;
  if (place) {
    return { active: true, mode: 'place', commit: place, hoverKey: input.boardKey, hover: 'legal', shape: [], openOptions: false, led: 'PLACE' };
  }
  // No group chosen: a legal Bloom drop opens the existing choices rather than inventing a gesture.
  const bloom = input.boardKey ? input.legal.find((a) => a.t === 'Bloom' && usesCard(input.view, a, card) && atHex(a, input.boardKey!)) : undefined;
  if (bloom) {
    return { active: true, mode: 'bloom-open', commit: null, hoverKey: input.boardKey, hover: 'legal', shape: [], openOptions: true, led: 'BLOOM' };
  }
  return {
    active: true, mode: 'place', commit: null, hoverKey: input.boardKey,
    hover: input.boardKey ? 'illegal' : 'none', shape: [], openOptions: false, led: null,
  };
}

/**
 * What the gesture means right now. Under the threshold nothing happens (still a tap); past
 * it the phase, the source and the pointer decide, and `commit` is always an action the
 * engine already listed as legal for this exact position.
 */
export function resolveDrag(input: DragInput): DragResolution {
  if (input.distance < DRAG_THRESHOLD_PX) return none(input);
  const source = input.source;
  if (source.kind === 'deck') return resolveDeck(input);
  if (source.kind === 'discard') return resolveDiscardSource(input);
  const card = input.view.hand.find((c) => c.id === source.cardId);
  if (!card) return cancel(input);
  if (input.view.phase === 'DISCARD') return resolveThrow(input, card);
  if (input.view.phase === 'ACT') return resolveAct(input, card);
  // DRAW with a hand card has no meaning; the phase decides.
  return cancel(input);
}
