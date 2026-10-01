// What a move would do, before it is played: ghost tiles in the exact places they
// grow, a short result chip, and a warning when it opens a big cut for the bot.
// Read-only: uses the engine's public planning functions and never changes the view.
import { coordKey, planRun, planSet, planSprout } from '../../../src/engine/index.js';
import type { Action, Player, View } from '../../../src/engine/index.js';
import { simulate, threats } from '../../../src/bots/evaluate.js';

export type Ghost = { key: string; strength: number; replaces: boolean };
export type Preview = {
  ghosts: Ghost[];
  placed: number;
  replaced: number;
  cuts: number;
  /** Bot tiles this move would cut off (not counting the ones it replaces). */
  cutKeys: string[];
  wins: boolean;
  points: number;
  chip: string;
  warning: string | null;
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const chipText = (p: { placed: number; replaced: number; cuts: number; wins: boolean; points?: number }): string => {
  const parts = [`+${plural(p.placed, 'tile')}`];
  if (p.replaced > 0) parts.push(`replaces ${p.replaced}`);
  if (p.cuts > 0) parts.push(`cuts ${p.cuts}`);
  if (p.wins) parts.push('wins the game');
  const text = parts.join(', ');
  return p.points === undefined || p.wins ? text : `${text} · ${p.points >= 0 ? '+' : '−'}${plural(Math.abs(p.points), 'point')}`;
};

export const previewMove = (v: View, a: Action): Preview | null => {
  if (a.t !== 'MeldRun' && a.t !== 'MeldSet' && a.t !== 'Sprout') return null;
  const p = v.player;
  const opp: Player = p === 0 ? 1 : 0;
  const plan =
    a.t === 'MeldRun'
      ? planRun(v, p, v.hand, a.cards, a.start, a.dir)
      : a.t === 'MeldSet'
        ? planSet(v, p, v.hand, a.cards, a.hexes)
        : planSprout(v, p, v.hand, a.card, a.coord);
  const sim = simulate(v, a)!;
  const ghosts = plan.tiles.map((t) => {
    const key = coordKey(t.coord);
    return { key, strength: t.strength, replaces: v.board[key]?.owner === opp };
  });
  const before = threats(v, p)[0]?.loss ?? 0;
  const after = threats({ config: v.config, terrain: v.terrain, board: sim.board }, p)[0]?.loss ?? 0;
  const core = { placed: sim.placed, replaced: sim.taken, cuts: sim.botCut, wins: sim.wins };
  const grown = new Set(ghosts.map((g) => g.key));
  const cutKeys = Object.keys(v.board).filter((k) => v.board[k]?.owner === opp && !grown.has(k) && !sim.board[k]);
  return {
    ghosts,
    ...core,
    cutKeys,
    points: sim.points,
    chip: chipText({ ...core, points: sim.points }),
    warning: after > before && !sim.wins ? `The bot could cut ${after} of your tiles.` : null,
  };
};
