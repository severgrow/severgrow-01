// Strengthen and Fruit judgement for the bots (v0.5), by skill tier. Pure and deterministic;
// reads only a View (public information: my hand, the board, the discard pile, counts).
//
// Strengthen tiers: 0 ignores it (levels 1-2 only stumble into it by a seeded whim, see
// levels.ts), 1 simple rules (3-4), 2 weighs exposure (5-6), 3 full evaluation (7-8), 4 also
// weighs the opponent's unseen Fruit cards and weak supporting links (9).
// v0.6 Fruit card tiers: 0-1 leave it to chance (levels 1-3 play one at a random moment, see
// levels.ts), 2 simple rules (4-6: a high tile, a big cut, a Strangle), 3 full evaluation (7-8),
// 4 also counts the unseen Fruit cards (9). A Fruit card is never an ordinary throw.
import { allNeighbors, coordKey, createCards, hexDistance, isFruitCard, legalActions, parseKey, rootCoord } from '../engine/index.js';
import type { Action, Card, Player, View } from '../engine/index.js';
import { lookBlooms } from './bloomLook.js';
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

/** The opponent could Fruit this tile: a Fruit card is still unseen and one of their tiles touches it. */
const fruitableByOpponent = (v: View, key: string): boolean => {
  const o = other(v.player);
  if (v.fruitUnseen <= 0) return false;
  return allNeighbors(parseKey(key)).some((n) => {
    const t = v.board[coordKey(n)];
    return !!t && t.owner === o && (!t.root || v.config.fruitRootCountsAsTouch);
  });
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

/** A quick look at a Fruit card: the board after it, the plain points swing, and whether it opens a Strangle. */
export type FruitLook = { a: Extract<Action, { t: 'PlayFruit' }>; sim: Simulation; net: number; opensStrangle: boolean };
export const lookFruit = (v: View, a: Extract<Action, { t: 'PlayFruit' }>): FruitLook | null => {
  const sim = simulate(v, a);
  return sim ? { a, sim, net: sim.botPointsLost + sim.points, opensStrangle: !sim.wins && opensStrangle(v, a, sim) } : null;
};

/**
 * A Fruit card can never surround a root by itself (it only empties a hex), but it can open
 * the way: after it, one of my growing moves this turn wins by Strangle (v0.8: a Bloom, since
 * the Fruit card used the turn's Sprout).
 */
const opensStrangle = (v: View, a: Extract<Action, { t: 'PlayFruit' }>, sim: Simulation): boolean => {
  const o = other(v.player);
  const ring = allNeighbors(rootCoord(o, v.config.rootStyle, v.config.boardRadius)).map(coordKey).filter((k) => k in v.board);
  // cheap first check: at most one ring hex left that is not mine or rock
  const open = ring.filter((k) => v.terrain[k] !== 'rock' && sim.board[k]?.owner !== v.player);
  if (open.length !== 1) return false;
  // v0.8: the Fruit card used the turn's Sprout, so only a Bloom can finish it (Sprouts drop out of the list)
  const after: View = { ...v, board: sim.board, hand: v.hand.filter((c) => c.id !== a.card), lastResolution: null, sproutsThisTurn: v.config.fruitUsesSprout ? v.sproutsThisTurn + 1 : v.sproutsThisTurn };
  const sprouts = legalActions(after).filter((m) => m.t === 'Sprout');
  const blooms = lookBlooms(after).filter((l) => l.strangles).map((l) => l.action);
  return [...sprouts, ...blooms].some((m) => !!simulate(after, m)?.wins);
};

/**
 * How good a Fruit is, from the quick look and (for tiers 2+) the full board score
 * `full` (points, their losses, my exposure and pressure, as for any move).
 */
export const judgeFruit = (v: View, f: FruitLook, tier: Tier, full: number): Judged => {
  const key = coordKey(f.a.target);
  const target = v.board[key]!;
  const removed = 1 + f.sim.botCut;
  if (f.sim.wins) return { score: 1000, reason: 'Fruit card wins at once (Strangle)' };
  if (tier <= 1) return { score: NEVER, reason: 'leaves Fruit cards to chance (levels 1-3)' };
  if (f.opensStrangle) return { score: 900, reason: 'opens a Strangle: a Sprout surrounds their root next' };
  if (tier === 2) {
    // simple rules: a high tile, or a big cut
    if (target.strength >= 7) return { score: full + 0.5, reason: `removes a high tile (${target.strength})` };
    if (removed >= 3) return { score: full + 0.5, reason: `a big cut (${removed} tiles)` };
    return { score: NEVER, reason: 'keeps it for a high tile or a big cut' };
  }
  // tiers 3-4: the net swing against holding it for later (worth more early in a long game)
  const deckFrac = Math.min(1, v.deckCount / 50);
  let hold = 0.6 + 2.2 * deckFrac;
  const reasons = [`net ${f.net} (${removed} of theirs gone)`];
  if (v.score - v.opponentScore <= -4) {
    hold *= 0.5;
    reasons.push('a comeback try');
  }
  // a second Fruit card in the same turn only if it pays
  if (v.lastResolution?.fruit && v.turnPlayer === v.player) {
    hold += 1;
    reasons.push('a second Fruit card: only if it pays');
  }
  let bonus = 0;
  if (target.strength >= v.config.maxRank) {
    bonus += 1;
    reasons.push('removes a top-rank blocker');
  }
  // protects my thin links: the target could take one of my tiles that holds up several
  const guarded = allNeighbors(f.a.target).some((n) => {
    const k = coordKey(n);
    const t = v.board[k];
    return !!t && t.owner === v.player && !t.root && t.strength < target.strength && cutLoss(v, k).length >= 3;
  });
  if (guarded) {
    bonus += 0.8;
    reasons.push('protects a thin link of mine');
  }
  if (tier === 4) {
    // counting: with no Fruit card left unseen, nothing can remove my blockers: less rush;
    // with several unseen, use it before the race turns
    if (v.fruitUnseen === 0) {
      hold *= 1.25;
      reasons.push('no Fruit card left unseen');
    } else if (v.fruitUnseen >= 2) {
      hold *= 0.85;
      reasons.push(`${v.fruitUnseen} Fruit cards unseen`);
    }
  }
  return { score: full - hold + bonus, reason: reasons.join('; ') };
};

/** v0.6: a Fruit card is never an ordinary throw (only when nothing else is left in hand). */
export const isFruitThrow = (v: View, a: Action): boolean =>
  a.t === 'Discard' && isFruitCard(v.hand.find((c) => c.id === a.card)!) && v.hand.some((c) => !isFruitCard(c));
