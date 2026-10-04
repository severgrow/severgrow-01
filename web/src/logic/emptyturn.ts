// Step 2 (Fruit cards task): a Grow step with nothing to play. With "Auto-skip when nothing to
// play" on (the default) it skips itself and says so; off, the player sees why and taps
// Continue. The opponent's empty turn is quick: about EMPTY_TURN_MS at Normal speed.
// Pure functions of the legal moves and the hand.
import { isValidRun, isValidSet } from '../../../src/engine/index.js';
import type { Action, Card } from '../../../src/engine/index.js';
import { isBoardAction } from './interaction.js';

export const NOTHING_TO_PLAY = 'Nothing to play this turn';
/** The opponent's whole empty turn (draw, end, throw), at Normal speed. */
export const EMPTY_TURN_MS = 400;

/** My Grow step has only "end the Grow step" left. */
export const growIsEmpty = (legal: readonly Action[]): boolean =>
  legal.length > 0 && legal.every((a) => a.t === 'EndAct');

export type SkipPlan = { kind: 'auto' | 'ask' | 'none'; text: string | null };

/** What to do with an empty Grow step: skip it at once (auto), or ask (Continue). */
export const skipPlan = (legal: readonly Action[], handSize: number, autoSkip: boolean): SkipPlan => {
  if (handSize === 0 || !growIsEmpty(legal)) return { kind: 'none', text: null };
  return { kind: autoSkip ? 'auto' : 'ask', text: NOTHING_TO_PLAY };
};

/** Any 3 cards of the hand that make a combo (a run or a set)? */
const hasCombo = (hand: readonly Card[]): boolean => {
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++)
      for (let k = j + 1; k < hand.length; k++) {
        const three = [hand[i]!, hand[j]!, hand[k]!];
        if (isValidRun(three) || isValidSet(three)) return true;
      }
  return false;
};

/** Why nothing can be played, in one short line (shown with auto-skip off). */
export const emptyReason = (hand: readonly Card[]): string =>
  `${hasCombo(hand) ? 'Your combos have no room' : 'No combo in your hand'}, and no card can sprout.`;

/** A whole turn of the opponent with no board move in it. */
export const isEmptyTurn = (actions: readonly Action[]): boolean => !actions.some(isBoardAction);

export type Beats = {
  /** the pause before each action */
  think: number[];
  /** how long the draw, the throw and the next turn's start are shown */
  show: { draw: number; discard: number; turn: number };
  quick: boolean;
};

/** The usual beats: a longer think at the start, a pause before each tile move, housekeeping quick. */
const USUAL = { first: 550, grow: 300, other: 90, draw: 120, discard: 320, turn: 320 };
/**
 * The empty turn's beats (250ms). Drawing the board between the steps takes the rest, so on a
 * phone the whole turn shows for about EMPTY_TURN_MS (measured by web/e2e/emptyturn.ts). v0.7:
 * redraws got cheaper (no board frame, textures painted in idle time; CI measured 280-430ms
 * with 200ms of beats), so the beats grew to 250ms to keep the same pace.
 */
export const QUICK_BEATS_MS = 250;
const QUICK = { first: 80, other: 0, draw: 30, discard: 110, turn: 30 };

/** The opponent's beats for a planned turn, at speed factor f (1 = Normal, 0 = Off). */
export const opponentBeats = (actions: readonly Action[], f: number): Beats => {
  const quick = isEmptyTurn(actions);
  if (quick) {
    return {
      think: actions.map((_, i) => (i === 0 ? QUICK.first : QUICK.other) * f),
      show: { draw: QUICK.draw * f, discard: QUICK.discard * f, turn: QUICK.turn * f },
      quick,
    };
  }
  return {
    think: actions.map((a, i) => (i === 0 ? USUAL.first : isBoardAction(a) ? USUAL.grow : USUAL.other) * f),
    show: { draw: USUAL.draw * f, discard: USUAL.discard * f, turn: USUAL.turn * f },
    quick,
  };
};
