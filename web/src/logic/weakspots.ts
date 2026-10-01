// Danger and opportunity views: which tiles would cut off the most if lost.
// Built on the shared, read-only helpers in src/bots/evaluate.ts.
import { cutLoss, threats } from '../../../src/bots/evaluate.js';
import type { Threat } from '../../../src/bots/evaluate.js';
import type { Player, View } from '../../../src/engine/index.js';

export type Spot = Threat;
type Opts = { anyReach?: boolean; minLoss?: number };

const spotsOf = (v: View, owner: Player, opts: Opts): Spot[] => {
  if (!opts.anyReach) return threats(v, owner);
  const out: Spot[] = [];
  for (const [key, t] of Object.entries(v.board)) {
    if (!t || t.owner !== owner || t.root || t.strength >= v.config.maxRank) continue;
    const loss = cutLoss(v, key).length;
    if (loss >= (opts.minLoss ?? 3)) out.push({ key, loss });
  }
  return out.sort((a, b) => b.loss - a.loss);
};

/** My tiles the bot could cut next turn, biggest loss first (the "Show weak spots" view). */
export const weakSpots = (v: View, opts: Opts = {}): Spot[] => spotsOf(v, v.player, opts);

/** The bot's weak links near me: how many of its tiles I would cut off. */
export const opportunities = (v: View, opts: Opts = {}): Spot[] => spotsOf(v, v.player === 0 ? 1 : 0, opts);
