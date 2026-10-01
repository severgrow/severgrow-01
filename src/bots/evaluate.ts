// "What if" helpers shared by GreedyBot and the playtest coach. Pure; read only the
// engine's public API and a player's View (never hidden cards).
import {
  applyFruit,
  applyPlacement,
  coordKey,
  hexDistance,
  parseKey,
  planFruit,
  planRun,
  planSet,
  planSprout,
  removeTiles,
  score,
  sever,
  strangleOutcome,
} from '../engine/index.js';
import type { Action, Player, RulesConfig, Terrain, Tile, View } from '../engine/index.js';

export type Ctx = { config: RulesConfig; board: Record<string, Tile | null>; terrain: Record<string, Terrain> };

const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** Every tile its owner would lose if this tile were cut: itself plus all it connects. */
export const cutLoss = (ctx: Ctx, key: string): string[] => {
  const tile = ctx.board[key];
  if (!tile || tile.root) return [];
  const after = sever(removeTiles(ctx.board, [parseKey(key)]), ctx.config, other(tile.owner));
  return [key, ...after.severed.filter((s) => s.player === tile.owner).flatMap((s) => s.coords.map(coordKey))];
};

/** How far the opponent can plausibly reach in one move, and the smallest loss worth flagging. */
const REACH = 3;
const MIN_LOSS = 3;

export type Threat = { key: string; loss: number };

/**
 * My tiles the opponent could plausibly cut next turn: not strength 9 (those cannot be
 * overgrown), within reach of an opponent tile, and costing at least 3 tiles. Biggest first.
 */
export const threats = (ctx: Ctx, me: Player): Threat[] => {
  const enemy = Object.entries(ctx.board)
    .filter(([, t]) => t?.owner === other(me))
    .map(([k]) => parseKey(k));
  const out: Threat[] = [];
  for (const [key, t] of Object.entries(ctx.board)) {
    if (!t || t.owner !== me || t.root || t.strength >= 9) continue;
    const c = parseKey(key);
    if (!enemy.some((e) => hexDistance(e, c) <= REACH)) continue;
    const loss = cutLoss(ctx, key).length;
    if (loss >= MIN_LOSS) out.push({ key, loss });
  }
  return out.sort((a, b) => b.loss - a.loss);
};

export type Simulation = {
  board: Record<string, Tile | null>;
  placed: number;
  taken: number;
  botCut: number;
  myLoss: number;
  points: number;
  botPointsLost: number;
  wins: boolean;
};

/** The board after a meld or Fruit (with Sever), and what changed. Null for other moves. */
export const simulate = (v: View, a: Action): Simulation | null => {
  const p = v.player;
  const o = other(p);
  let board: Record<string, Tile | null>;
  let placed = 0;
  let taken = 0;
  let sacrificed = 0;
  if (a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout') {
    const plan =
      a.t === 'MeldRun'
        ? planRun(v, p, v.hand, a.cards, a.start, a.dir)
        : a.t === 'MeldSet'
          ? planSet(v, p, v.hand, a.cards, a.hexes)
          : planSprout(v, p, v.hand, a.card, a.coord);
    const out = applyPlacement(v.board, plan);
    board = out.board;
    placed = plan.tiles.length;
    taken = out.overgrown.length;
  } else if (a.t === 'Fruit') {
    board = applyFruit(v.board, planFruit(v, p, v.fruitUsed[p], a.sacrifice, a.target));
    taken = 1;
    sacrificed = 3;
  } else return null;

  const cut = sever(board, v.config, p);
  const count = (pl: Player) => cut.severed.filter((s) => s.player === pl).reduce((n, s) => n + s.coords.length, 0);
  const after: Ctx = { config: v.config, terrain: v.terrain, board: cut.board };
  const outcome = strangleOutcome(after);
  return {
    board: cut.board,
    placed,
    taken,
    botCut: count(o),
    myLoss: sacrificed + count(p),
    points: score(after, p) - score(v, p),
    botPointsLost: score(v, o) - score(after, o),
    wins: outcome?.reason === 'strangle' && outcome.loser === o,
  };
};

