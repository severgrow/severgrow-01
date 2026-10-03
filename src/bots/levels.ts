// Bot levels 1-9 (v0.5). Each level is a small config of "knobs". Level 7 is the
// original GreedyBot, unchanged. All levels read only their own View, are pure and
// deterministic: the same (view, level, seed) always gives the same action. Search
// budgets are counted in iterations, never in time.
import { bestMeldPartition, createCards, legalActions, mulberry32, score } from '../engine/index.js';
import type { Action, Card, Player, View } from '../engine/index.js';
import { simulate } from './evaluate.js';
import { WEIGHTS, rankActions } from './GreedyBot.js';
import type { Scored, Weights } from './GreedyBot.js';
import { isStrengthen } from './tactics.js';
import type { Tier } from './tactics.js';

export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Level = (typeof LEVELS)[number];

export type LevelConfig = {
  /** Chance (0..1) of not playing the best move on a turn step. */
  mistakeRate: number;
  /** When making a mistake: pick among the best `topN` moves (never the best one). */
  topN: number;
  /** Chance (0..1) of stopping growth early: ending its play while it still could grow. */
  skipGrowth: number;
  /** How much the bot cares about leaving a big piece of its network cuttable. */
  dangerWeight: number;
  /** How much it cares about threatening the opponent's weak spots. */
  pressureWeight: number;
  /** Prefers discards that are least useful to the opponent. */
  cardDenial: boolean;
  /** How it picks a discard: 'greedy' (level 7's rule) or 'keepHigh' (keep combos and strong cards). */
  discardStyle: 'greedy' | 'keepHigh';
  /** Weight of the imagined opponent reply in level 9's search. */
  replyWeight: number;
  /** 0: one move at a time. 1: also weighs its best follow-up move this turn. */
  lookahead: 0 | 1;
  /** Determinized search: imagined opponent hands per candidate move (0 = none). */
  searchIterations: number;
  /** v0.5: how well it judges Strengthen and Fruit (tactics.ts tiers 0-4). */
  strengthenTier: Tier;
  fruitTier: Tier;
  /** v0.5: chance per Grow step of a whim: a random Strengthen or Fruit, good or not. */
  whimRate: number;
};

const base = { mistakeRate: 0, topN: 1, skipGrowth: 0, dangerWeight: WEIGHTS.exposure, pressureWeight: WEIGHTS.pressure, cardDenial: false, discardStyle: 'greedy', replyWeight: 0.5, lookahead: 0, searchIterations: 0, strengthenTier: 3, fruitTier: 3, whimRate: 0 } as const;

/** Tuned with the ladder simulation (docs/LADDER.md). */
export const LEVEL_CONFIGS: Record<Level, LevelConfig> = {
  // 1-6: one "sloppiness" dial k (0 = level 7, 1 = careless) sets mistakes, laziness and
  // how little it cares about danger. k = 0.95, 0.85, 0.72, 0.55, 0.40, 0.15.
  // v0.5 Strengthen/Fruit: 1-2 ignore them but act on a rare whim; 3-4 simple rules;
  // 5-6 weigh exposure and net swing; 7-8 full evaluation; 9 also the opponent's Fruit.
  1: { ...base, mistakeRate: 0.855, topN: 8, skipGrowth: 0.57, dangerWeight: 0.03, pressureWeight: 0.015, strengthenTier: 0, fruitTier: 0, whimRate: 0.03 },
  2: { ...base, mistakeRate: 0.765, topN: 7, skipGrowth: 0.51, dangerWeight: 0.09, pressureWeight: 0.045, strengthenTier: 0, fruitTier: 0, whimRate: 0.03 },
  3: { ...base, mistakeRate: 0.648, topN: 6, skipGrowth: 0.432, dangerWeight: 0.168, pressureWeight: 0.084, strengthenTier: 1, fruitTier: 1 },
  4: { ...base, mistakeRate: 0.495, topN: 5, skipGrowth: 0.33, dangerWeight: 0.27, pressureWeight: 0.135, strengthenTier: 1, fruitTier: 1 },
  5: { ...base, mistakeRate: 0.36, topN: 4, skipGrowth: 0.24, dangerWeight: 0.36, pressureWeight: 0.18, strengthenTier: 2, fruitTier: 2 },
  6: { ...base, mistakeRate: 0.135, topN: 3, skipGrowth: 0.09, dangerWeight: 0.51, pressureWeight: 0.255, strengthenTier: 2, fruitTier: 2 },
  7: { ...base }, // GreedyBot (v0.5: with the full Strengthen and Fruit evaluation)
  // 8: keeps its strong cards and combos when throwing (level 7's weak spot), but still
  //    slips now and then (v0.5 ladder: 0.45 slipped too often, 57.4% vs 7; 0.15 gives
  //    68.4% vs 7 and still loses to 9, 35.7%; docs/LADDER.md).
  8: { ...base, discardStyle: 'keepHigh', mistakeRate: 0.15, topN: 3 },
  // 9: plans its whole turn, keeps strong cards, throws what helps the opponent least,
  //    and imagines 6 possible opponent hands to judge their best reply.
  9: { ...base, lookahead: 1, discardStyle: 'keepHigh', cardDenial: true, searchIterations: 6, replyWeight: 0.3, strengthenTier: 4, fruitTier: 4 },
};

/** A 32-bit seed for the bot's choices, from public numbers only (FNV-1a over the inputs). */
export const botSeed = (gameSeed: number, level: number, turnNumber: number, actionIndex: number): number => {
  let h = 2166136261;
  for (const n of [gameSeed, level, turnNumber, actionIndex]) {
    let x = n >>> 0;
    for (let i = 0; i < 4; i++) {
      h = Math.imul(h ^ (x & 0xff), 16777619);
      x >>>= 8;
    }
  }
  return h >>> 0;
};

const other = (p: Player): Player => (p === 0 ? 1 : 0);
const growing = (a: Action) => a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout';
const usedCards = (a: Action): number[] => (a.t === 'Sprout' ? [a.card] : a.t === 'MeldRun' || a.t === 'MeldSet' ? a.cards : []);

/** The bot's own view after one of its growing moves (needs nothing hidden). */
const viewAfter = (v: View, a: Action): View | null => {
  const sim = simulate(v, a);
  if (!sim || sim.wins) return null;
  const used = new Set(usedCards(a));
  const ctx = { config: v.config, terrain: v.terrain, board: sim.board };
  return {
    ...v,
    board: sim.board,
    hand: v.hand.filter((c) => !used.has(c.id)),
    sproutsThisTurn: v.sproutsThisTurn + (a.t === 'Sprout' ? 1 : 0),
    score: score(ctx, v.player),
    opponentScore: score(ctx, other(v.player)),
    lastResolution: null,
  };
};

/** The best follow-up growing move's score in a view (0 if none is worth it). */
const bestFollowUp = (v: View, weights: Weights, c: LevelConfig): number => {
  const next = rankActions(v, { allowKnock: false, weights, strengthenTier: c.strengthenTier, fruitTier: c.fruitTier }).find((x) => growing(x.action));
  return Math.max(0, next?.score ?? 0);
};

/**
 * Cards the bot cannot see: every card of the deck minus its own hand and the discard
 * pile. (Cards already played are not tracked by id; this slightly over-counts.)
 */
const unseenCards = (v: View): Card[] => {
  const seen = new Set([...v.hand, ...v.discard].map((c) => c.id));
  return createCards(v.config).filter((c) => !seen.has(c.id));
};

/** The opponent's view at the start of their next growing step, with an imagined hand. */
const opponentView = (after: View, hand: Card[]): View => {
  const ctx = { config: after.config, terrain: after.terrain, board: after.board };
  const o = other(after.player);
  return {
    ...after,
    player: o,
    hand,
    opponentHandCount: after.hand.length,
    turnPlayer: o,
    actor: o,
    phase: 'ACT',
    drawnFromDiscard: null,
    sproutsThisTurn: 0,
    turnNumber: after.turnNumber + 1,
    score: score(ctx, o),
    opponentScore: score(ctx, after.player),
    myDeadwood: 0,
    lastResolution: null,
  };
};

/**
 * How much the opponent's best reply hurts me: their points gained plus my points lost,
 * over every growing move they could make with this hand. (Lighter than full ranking:
 * no danger checks, just the immediate result of each move.)
 */
const replyDamage = (oppView: View): number => {
  let worst = 0;
  for (const a of legalActions(oppView)) {
    if (!growing(a)) continue;
    const sim = simulate(oppView, a);
    if (!sim) continue;
    if (sim.wins) return 50;
    worst = Math.max(worst, sim.points + sim.botPointsLost);
  }
  return worst;
};

/** A random sample of `n` cards from `pool` (seeded, without repeats). */
const sample = (pool: readonly Card[], n: number, rng: () => number): Card[] => {
  const a = [...pool];
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
};

/** How useful a card would be to the opponent: unseen cards it could combine with. */
const usefulness = (c: Card, unseen: readonly Card[]): number =>
  unseen.filter((u) => u.id !== c.id && ((u.rank === c.rank && u.suit !== c.suit) || (u.suit === c.suit && Math.abs(u.rank - c.rank) <= 2))).length;

const CANDIDATES = 6;

/** A bot decision, with a short plain-words reason for Strengthen and Fruit (debug only). */
export type Decision = { action: Action; reason?: string };

/** The level's move. Same (view, level, seed) -> same action. */
export const chooseLevelAction = (v: View, level: Level, seed: number): Action => decideLevelAction(v, level, seed).action;

/** The level's move and why (the reason is for debugging and simulation reports only). */
export const decideLevelAction = (v: View, level: Level, seed: number): Decision => {
  if (level === 7) {
    const best = rankActions(v)[0];
    if (!best) throw new Error('Level 7 bot: no legal actions');
    return withReason(best); // GreedyBot's choice, exactly
  }
  return decideWithConfig(v, LEVEL_CONFIGS[level], seed);
};

const withReason = (s: Scored): Decision =>
  s.facts.kind === 'strengthen' || s.facts.kind === 'fruit' ? { action: s.action, reason: s.facts.reason ?? '' } : { action: s.action };

/** A move for any knob settings (used by the levels and by the ladder's tuning runs). */
export const chooseWithConfig = (v: View, c: LevelConfig, seed: number): Action => decideWithConfig(v, c, seed).action;

export const decideWithConfig = (v: View, c: LevelConfig, seed: number): Decision => {
  const legal = legalActions(v);
  if (legal.length === 0) throw new Error('Bot: no legal actions');
  if (legal.length === 1) return { action: legal[0]! };

  const weights = { ...WEIGHTS, exposure: c.dangerWeight, pressure: c.pressureWeight };
  const rng = mulberry32(seed);
  // Levels 1-2: now and then a whim - a random Strengthen or Fruit, whether it helps or not.
  // (Its own random stream, so the rest of the bot's choices are not shifted by it.)
  const whim = mulberry32(seed ^ 0x5bd1e995);
  if (c.whimRate > 0 && v.phase === 'ACT' && whim() < c.whimRate) {
    const odd = legal.filter((a) => a.t === 'PlayFruit' || isStrengthen(v, a));
    if (odd.length > 0) return { action: odd[Math.floor(whim() * odd.length)]!, reason: 'a whim (levels 1-2 sometimes waste it)' };
  }
  let ranked: Scored[] = rankActions(v, { weights, strengthenTier: c.strengthenTier, fruitTier: c.fruitTier });

  // Look one move further inside its own turn, and (level 9) at the opponent's reply.
  if ((c.lookahead > 0 || c.searchIterations > 0) && v.phase === 'ACT' && ranked[0]!.score < WEIGHTS.win / 2) {
    const unseen = c.searchIterations > 0 ? unseenCards(v) : [];
    const handSize = v.opponentHandCount + 1; // after their draw
    const value = new Map<Scored, number>();
    for (const r of ranked.filter((x) => growing(x.action)).slice(0, CANDIDATES)) {
      const after = viewAfter(v, r.action);
      let val = r.score + (after && c.lookahead > 0 ? 0.9 * bestFollowUp(after, weights, c) : 0);
      if (after && c.searchIterations > 0) {
        let dmg = 0;
        for (let i = 0; i < c.searchIterations; i++) dmg += replyDamage(opponentView(after, sample(unseen, handSize, rng)));
        val -= c.replyWeight * (dmg / c.searchIterations);
      }
      value.set(r, val);
    }
    if (c.searchIterations > 0) {
      // Stopping now also leaves the opponent a reply: judge it the same way.
      const stop = ranked.find((x) => !growing(x.action));
      if (stop) {
        let dmg = 0;
        for (let i = 0; i < c.searchIterations; i++) dmg += replyDamage(opponentView(v, sample(unseen, handSize, rng)));
        value.set(stop, stop.score - c.replyWeight * (dmg / c.searchIterations));
      }
    }
    // Re-rank: judged moves by their new value; ties keep the original (canonical) order.
    ranked = ranked
      .map((r, i) => ({ r, i, s: value.get(r) ?? (growing(r.action) ? -Infinity : r.score) }))
      .sort((x, y) => y.s - x.s || x.i - y.i)
      .map((x) => x.r);
  }

  // Keep strong cards and combos: discard a loose card, the lowest one first.
  if (c.discardStyle === 'keepHigh' && v.phase === 'DISCARD') {
    const loose = new Set(bestMeldPartition(v.hand).leftover.map((x) => x.id));
    const options = legal.filter((a): a is Extract<Action, { t: 'Discard' }> => a.t === 'Discard');
    const rankOf = (a: Extract<Action, { t: 'Discard' }>) => v.hand.find((h) => h.id === a.card)!.rank;
    const unseen = c.cardDenial ? unseenCards(v) : [];
    const cost = (a: Extract<Action, { t: 'Discard' }>) =>
      (loose.has(a.card) ? 0 : 100) + rankOf(a) * 2 + (c.cardDenial ? usefulness(v.hand.find((h) => h.id === a.card)!, unseen) * 0.5 : 0);
    if (options.length > 0) return { action: options.reduce((x, y) => (cost(y) < cost(x) ? y : x)) };
  }

  // Card denial: among discards about as good as the best, give away the least useful card.
  if (c.cardDenial && v.phase === 'DISCARD') {
    const unseen = unseenCards(v);
    const top = ranked[0]!.score;
    const close = ranked.filter((r) => r.action.t === 'Discard' && r.score >= top - 1);
    if (close.length > 1) {
      const card = (r: Scored) => v.hand.find((h) => h.id === (r.action as { card: number }).card)!;
      const best = close.reduce((a, b) => (usefulness(card(b), unseen) < usefulness(card(a), unseen) ? b : a));
      return { action: best.action };
    }
  }

  // Laziness: sometimes stop growing even though it could.
  if (c.skipGrowth > 0 && v.phase === 'ACT' && rng() < c.skipGrowth) {
    const stop = legal.find((a) => a.t === 'EndAct');
    if (stop) return { action: stop };
  }

  // Mistakes: sometimes settle for one of the next-best moves.
  if (c.mistakeRate > 0 && ranked.length > 1 && rng() < c.mistakeRate) {
    const n = Math.min(c.topN, ranked.length);
    if (n > 1) return withReason(ranked[1 + Math.floor(rng() * (n - 1))]!);
  }
  return withReason(ranked[0]!);
};
