import { IllegalActionError } from './errors.js';
import type { Action, Phase } from './types.js';

/** The phase in which each action is legal (spec 6). */
export const ACTION_PHASE: Record<Action['t'], Phase> = {
  Draw: 'DRAW',
  Bloom: 'ACT',
  Sprout: 'ACT',
  PlayFruit: 'ACT',
  EndAct: 'ACT',
  Discard: 'DISCARD',
  Knock: 'KNOCK',
  Continue: 'KNOCK',
  RotPick: 'ROT_PICK',
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Top-level shape check so `apply` never crashes on malformed input. Field contents
 * (coords, card ids) are checked by the rule that consumes them.
 */
export const assertActionShape = (a: unknown): Action => {
  const bad = (msg: string): never => {
    throw new IllegalActionError('MALFORMED_ACTION', msg);
  };
  if (!isObj(a) || typeof a.t !== 'string' || !(a.t in ACTION_PHASE)) return bad('unknown action');
  switch (a.t) {
    case 'Draw':
      if (a.from !== 'deck' && a.from !== 'discard') bad('Draw.from must be deck or discard');
      break;
    case 'Bloom':
      if (!Array.isArray(a.cards) || !Array.isArray(a.hexes)) bad('Bloom needs cards[] and hexes[]');
      break;
    case 'PlayFruit':
      if (typeof a.card !== 'number') bad('PlayFruit needs a card id and a target');
      break;
    case 'Sprout':
      if (typeof a.card !== 'number') bad('Sprout needs a card id and a coord');
      break;
    case 'Discard':
      if (typeof a.card !== 'number') bad('Discard needs a card id');
      break;
  }
  return a as Action;
};
