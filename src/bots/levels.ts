// Three bot levels for the page. Normal is the original GreedyBot (unchanged, so the
// golden games and simulations still hold). Easy sometimes settles for a lesser move;
// Hard plans its whole turn: it also weighs the best move it could play right after.
// (Tuned weights alone did not beat Normal in self-play; see docs/SPEC.md 11.2.)
// All levels are deterministic.
import type { View } from '../engine/index.js';
import type { Bot } from './Bot.js';
import { score } from '../engine/index.js';
import type { Action } from '../engine/index.js';
import { simulate } from './evaluate.js';
import { GreedyBot, WEIGHTS, rankActions } from './GreedyBot.js';

export const LEVELS = ['easy', 'normal', 'hard'] as const;
export type Level = (typeof LEVELS)[number];


/** A stable number in [0, 1) from what the bot can see, so Easy is "random" but repeatable. */
const noise = (v: View): number => {
  const key = `${v.turnNumber}|${v.phase}|${v.hand.map((c) => c.id).join(',')}|${Object.keys(v.board).filter((k) => v.board[k]).length}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

const easyBot: Bot = {
  chooseAction(v) {
    const ranked = rankActions(v, { allowKnock: false });
    const best = ranked[0]!;
    if (best.score >= WEIGHTS.win / 2) return best.action; // never throws away a win
    // Half the time the best move; otherwise the 2nd or 3rd best.
    const r = noise(v);
    const pick = r < 0.5 ? 0 : r < 0.8 ? 1 : 2;
    return (ranked[Math.min(pick, ranked.length - 1)] ?? best).action;
  },
};

const growing = (a: Action) => a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout';

/** The bot's own view after one of its growing moves (nothing hidden is needed for that). */
const viewAfter = (v: View, a: Action): View | null => {
  const sim = simulate(v, a);
  if (!sim || sim.wins) return null;
  const used = new Set(a.t === 'Sprout' ? [a.card] : a.t === 'MeldRun' || a.t === 'MeldSet' ? a.cards : []);
  const ctx = { config: v.config, terrain: v.terrain, board: sim.board };
  return {
    ...v,
    board: sim.board,
    hand: v.hand.filter((c) => !used.has(c.id)),
    sproutsThisTurn: v.sproutsThisTurn + (a.t === 'Sprout' ? 1 : 0),
    score: score(ctx, v.player),
    opponentScore: score(ctx, v.player === 0 ? 1 : 0),
    lastResolution: null,
  };
};

/** Looks one move further inside its own turn: picks the best pair, not just the best first move. */
const LOOK = 6;
const hardBot: Bot = {
  chooseAction(v) {
    const ranked = rankActions(v, { allowKnock: false });
    const best = ranked[0]!;
    if (v.phase !== 'ACT' || best.score >= WEIGHTS.win / 2) return best.action;
    let pick = best;
    let pickValue = -Infinity;
    for (const r of ranked.filter((x) => growing(x.action)).slice(0, LOOK)) {
      const next = viewAfter(v, r.action);
      const follow = next ? (rankActions(next, { allowKnock: false }).find((x) => growing(x.action))?.score ?? 0) : 0;
      const value = r.score + 0.9 * Math.max(0, follow);
      if (value > pickValue) {
        pickValue = value;
        pick = r;
      }
    }
    // Only grow if it beats stopping here (the best non-growing option).
    return pickValue > best.score || growing(best.action) ? pick.action : best.action;
  },
};

export const botFor = (level: Level): Bot => (level === 'easy' ? easyBot : level === 'hard' ? hardBot : GreedyBot);
