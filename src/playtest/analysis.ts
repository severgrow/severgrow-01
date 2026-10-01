// Page-facing danger warning built on the shared evaluation helpers.
import { parseKey } from '../engine/index.js';
import type { Action, View } from '../engine/index.js';
import { simulate, threats } from '../bots/evaluate.js';
import { hexName } from './names-core.js';

export { cutLoss, simulate, threats } from '../bots/evaluate.js';
export type { Ctx, Simulation, Threat } from '../bots/evaluate.js';

/** A warning when a move would leave a bigger piece of my network open to a cut. */
export const dangerWarning = (v: View, a: Action): string | null => {
  const sim = simulate(v, a);
  if (!sim || sim.wins) return null;
  const before = threats(v, v.player)[0]?.loss ?? 0;
  const worst = threats({ config: v.config, terrain: v.terrain, board: sim.board }, v.player)[0];
  if (!worst || worst.loss <= before) return null;
  return `Careful: the bot could cut off ${worst.loss} of your tiles by taking ${hexName(parseKey(worst.key), v.config.boardRadius)}.`;
};
