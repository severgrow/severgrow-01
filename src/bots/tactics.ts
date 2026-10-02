// Strengthen and Fruit judgement for the bots (v0.5), by skill tier. Pure and deterministic;
// reads only a View (public information: my hand, the board, the discard pile, counts).
//
// Tiers: 0 ignores both (levels 1-2 only stumble into them by a seeded whim, see levels.ts),
// 1 simple rules (levels 3-4), 2 weighs exposure and net swing (5-6), 3 full evaluation
// (7-8), 4 also weighs the opponent's remaining Fruit and weak supporting links (9).
import { allNeighbors, coordKey, createCards, hexDistance, parseKey, rootCoord } from '../engine/index.js';
import type { Action, Card, Player, View } from '../engine/index.js';
import { cutLoss, simulate } from './evaluate.js';
import type { Simulation } from './evaluate.js';

export type Tier = 0 | 1 | 2 | 3 | 4;
export type Judged = { score: number; reason: string };

const other = (p: Player): Player => (p === 0 ? 1 : 0);
/** Never chosen by ranking (only by a whim). */
export const NEVER = -1000;

/** Points a set of my tiles is worth (gold counts double). */
const pointsOf = (v: View, keys: string[]) => keys.reduce((n, k) => n + (v.terrain[k] === 'rich' ? 2 : 1), 0);

/**
 * Cards I cannot see, by rank: every rank has the same count; minus my hand, the discard
 * pile and the strengths showing on the board (each tile was played from one card).
 */
export const unseenByRank = (v: View): number[] => {
  const total = createCards(v.config);
  const per = new Array<number>(v.config.maxRank + 1).fill(0);
  for (const c of total) per[c.rank]!++;
  const seen = (c: Card) => (per[c.rank] = Math.max(0, per[c.rank]! - 1));
  v.hand.forEach(seen);
  v.discard.forEach(seen);
  for (const t of Object.values(v.board)) if (t && !t.root) per[t.strength] = Math.max(0, per[t.strength]! - 1);
  return per;
};

/** Chance the opponent will hold at least one card stronger than `s` on their next turn. */
export const chanceAbove = (v: View, unseen: number[], s: number): number => {
  const U = unseen.reduce((a, b) => a + b, 0);
  const k = unseen.slice(s + 1).reduce((a, b) => a + b, 0);
  const h = Math.min(U, v.opponentHandCount + 1);
  if (U === 0 || k === 0) return 0;
  let none = 1;
  for (let i = 0; i < h; i++) none *= Math.max(0, U - k - i) / (U - i);
  return 1 - none;
};

/** How near the enemy is to a hex: 1 = touching (can overgrow next turn) ... small = far. */
const reachOf = (v: View, key: string): number => {
  const c = parseKey(key);
  let d = 99;
  for (const [k, t] of Object.entries(v.board)) if (t && t.owner !== v.player) d = Math.min(d, hexDistance(parseKey(k), c));
  return d <= 1 ? 1 : d === 2 ? 0.45 : d === 3 ? 0.15 : 0.05;
};

/** Enemy tiles touching a hex. */
const enemyNeighbours = (v: View, key: string) => allNeighbors(parseKey(key)).filter((n) => {
  const t = v.board[coordKey(n)];
  return !!t && t.owner !== v.player;
}).length;

/** The opponent could still Fruit this tile: they have a use left and a big enough group next to it. */
const fruitableByOpponent = (v: View, key: string): boolean => {
  const o = other(v.player);
  if (v.fruitUsed[o] >= v.config.fruitPerPlayer) return false;
  // their non-root tiles in one connected group touching this hex
  const start = allNeighbors(parseKey(key)).map(coordKey).filter((k) => v.board[k]?.owner === o && !v.board[k]?.root);
  const seen = new Set<string>(start);
  const stack = [...start];
  while (stack.length > 0) {
    for (const n of allNeighbors(parseKey(stack.pop()!))) {
      const k = coordKey(n);
      if (!seen.has(k) && v.board[k]?.owner === o && !v.board[k]?.root) {
        seen.add(k);
        stack.push(k);
      }
    }
  }
  return seen.size >= v.config.fruitSacrifice;
};

export type TacticsCtx = { v: View; unseen: number[]; loss: Map<string, string[]> };
export const tacticsCtx = (v: View): TacticsCtx => ({ v, unseen: unseenByRank(v), loss: new Map() });
const lossOf = (t: TacticsCtx, key: string) => {
  let l = t.loss.get(key);
  if (!l) t.loss.set(key, (l = cutLoss(t.v, key)));
  return l;
};

/** Is this Sprout a Strengthen (on my own tile)? */
export const isStrengthen = (v: View, a: Action): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout' && v.board[coordKey(a.coord)]?.owner === v.player;

/**
 * How good a Strengthen is. `bestOtherUse` = the best score of anything else this card could
 * do this turn (tier 1 only strengthens with a top card that has no other good use).
 */
export const judgeStrengthen = (t: TacticsCtx, a: Extract<Action, { t: 'Sprout' }>, tier: Tier, bestOtherUse = 0): Judged => {
  const v = t.v;
  const key = coordKey(a.coord);
  const tile = v.board[key]!;
  const to = v.hand.find((c) => c.id === a.card)!.rank;
  const from = tile.strength;
  const lost = lossOf(t, key);
  const lossPts = pointsOf(v, lost) + (v.terrain[key] === 'rich' ? 2 : 1); // what I lose + what they gain
  if (tier === 0) return { score: NEVER, reason: 'does not think about Strengthen' };
  if (tier === 1) {
    if (to < v.config.maxRank || bestOtherUse >= 0.5) return { score: NEVER, reason: 'keeps the card for something else' };
    return { score: 0.5 + 0.05 * lossPts, reason: `a top card with no better use: strengthen the tile holding ${lost.length}` };
  }
  const reach = reachOf(v, key);
  if (tier === 2) {
    const value = lossPts * reach * ((to - from) / v.config.maxRank) * 1.2;
    return { score: value - 0.2, reason: `protects ${lost.length} tiles (reach ${reach}), ${from} to ${to}` };
  }
  // tiers 3-4: how much less likely the tile is to be taken, times what taking it would cost me
  const before = chanceAbove(v, t.unseen, from);
  const after = to >= v.config.maxRank ? 0 : chanceAbove(v, t.unseen, to);
  let value = lossPts * reach * (before - after);
  const reasons = [`${from} to ${to}: beatable ${Math.round(before * 100)}% to ${Math.round(after * 100)}%, protects ${lost.length} tiles`];
  const myRoot = coordKey(rootCoord(v.player, v.config.rootStyle, v.config.boardRadius));
  if (hexDistance(parseKey(key), parseKey(myRoot)) <= 1 && reach >= 0.45) {
    value += 0.5;
    reasons.push('guards my root');
  }
  if (enemyNeighbours(v, key) >= 2) {
    value += 0.3;
    reasons.push('blocks their line');
  }
  if (tier === 4) {
    if (fruitableByOpponent(v, key)) {
      value *= 0.5;
      reasons.push('they could still Fruit it');
    }
    // a tough tile on a weak supporting link does not protect much
    const weakSupport = allNeighbors(a.coord).some((n) => {
      const k = coordKey(n);
      const s = v.board[k];
      return !!s && s.owner === v.player && !s.root && s.strength <= 4 && enemyNeighbours(v, k) > 0 && lossOf(t, k).length >= lost.length;
    });
    if (weakSupport) {
      value *= 0.6;
      reasons.push('its support is weak');
    }
  }
  const cost = 0.15 + 0.03 * to;
  return { score: value - cost, reason: reasons.join('; ') };
};

/** A quick look at a Fruit: the board after it, and the plain points swing. */
export type FruitLook = { a: Extract<Action, { t: 'Fruit' }>; sim: Simulation; net: number };
export const lookFruit = (v: View, a: Extract<Action, { t: 'Fruit' }>): FruitLook | null => {
  const sim = simulate(v, a);
  return sim ? { a, sim, net: sim.botPointsLost + sim.points } : null;
};

/**
 * How good a Fruit is, from the quick look and (for tiers 2+) the full board score
 * `full` (points, their losses, my exposure and pressure, as for any move).
 */
export const judgeFruit = (v: View, f: FruitLook, tier: Tier, full: number): Judged => {
  const sac = v.config.fruitSacrifice;
  const target = v.board[coordKey(f.a.target)]!;
  if (f.sim.wins) return { score: 1000, reason: 'Fruit wins at once (Strangle)' };
  if (tier === 0) return { score: NEVER, reason: 'does not think about Fruit' };
  if (tier === 1) {
    return f.sim.botPointsLost >= 4
      ? { score: f.sim.botPointsLost, reason: `removes ${f.sim.botPointsLost} of their points` }
      : { score: NEVER, reason: 'not a big enough hit' };
  }
  const ownCut = f.sim.myLoss - sac;
  if (tier === 2) {
    if (ownCut > 0) return { score: NEVER, reason: `would cut off ${ownCut} of my own tiles` };
    return { score: full - 1, reason: `net ${f.net}` };
  }
  // tiers 3-4: the use is worth more later in a long game; less when well behind
  const deckFrac = Math.min(1, v.deckCount / 50);
  let hold = 0.6 + 2.2 * deckFrac;
  const behind = v.score - v.opponentScore;
  const reasons = [`net ${f.net}`];
  if (behind <= -4) {
    hold *= 0.5;
    reasons.push('a comeback try');
  }
  let bonus = 0;
  if (target.strength >= v.config.maxRank) {
    bonus += 1;
    reasons.push('removes a top-rank blocker');
  }
  if (ownCut > 0) reasons.push(`cuts ${ownCut} of my own`);
  return { score: full - hold + bonus, reason: reasons.join('; ') };
};
