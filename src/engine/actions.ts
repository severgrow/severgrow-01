import { IllegalActionError } from './errors.js';
import type { Action, Phase } from './types.js';

/** The phase in which each action is legal (spec 6). */
export const ACTION_PHASE: Record<Action['t'], Phase> = {
  Draw: 'DRAW',
  MeldRun: 'ACT',
  MeldSet: 'ACT',
  Fruit: 'ACT',
  EndAct: 'ACT',
  Discard: 'DISCARD',
  Knock: 'KNOCK',
  Continue: 'KNOCK',
  RotPick: 'ROT_PICK',
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Top-level shape check so `apply` never crashes on malformed input. Field contents
 * (coords, card ids, dir) are checked by the rule that consumes them.
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
    case 'MeldRun':
      if (!Array.isArray(a.cards) || typeof a.dir !== 'number') bad('MeldRun needs cards[], start, dir');
      break;
    case 'MeldSet':
      if (!Array.isArray(a.cards) || !Array.isArray(a.hexes)) bad('MeldSet needs cards[] and hexes[]');
      break;
    case 'Fruit':
      if (!Array.isArray(a.sacrifice)) bad('Fruit needs sacrifice[] and target');
      break;
    case 'Discard':
      if (typeof a.card !== 'number') bad('Discard needs a card id');
      break;
  }
  return a as Action;
};
