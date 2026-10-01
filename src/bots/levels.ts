// Bot levels 1-9 (v0.5). Each level is a small config of "knobs". Level 7 is the
// original GreedyBot, unchanged. All levels read only their own View, are pure and
// deterministic: the same (view, level, seed) always gives the same action. Search
// budgets are counted in iterations, never in time.
import { bestMeldPartition, createCards, legalActions, mulberry32, score } from '../engine/index.js';
import type { Action, Card, Player, View } from '../engine/index.js';
import { simulate } from './evaluate.js';
import { GreedyBot, WEIGHTS, rankActions } from './GreedyBot.js';
import type { Scored, Weights } from './GreedyBot.js';

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
};

const base = { mistakeRate: 0, topN: 1, skipGrowth: 0, dangerWeight: WEIGHTS.exposure, pressureWeight: WEIGHTS.pressure, cardDenial: false, discardStyle: 'greedy', replyWeight: 0.5, lookahead: 0, searchIterations: 0 } as const;

/** Tuned with the ladder simulation (docs/LADDER.md). */
export const LEVEL_CONFIGS: Record<Level, LevelConfig> = {
  1: { ...base, mistakeRate: 0.85, topN: 8, dangerWeight: 0, pressureWeight: 0 },
  2: { ...base, mistakeRate: 0.7, topN: 6, dangerWeight: 0, pressureWeight: 0 },
  3: { ...base, mistakeRate: 0.55, topN: 5, dangerWeight: 0, pressureWeight: 0 },
  4: { ...base, mistakeRate: 0.4, topN: 4, dangerWeight: 0.2, pressureWeight: 0.1 },
  5: { ...base, mistakeRate: 0.28, topN: 3, dangerWeight: 0.4, pressureWeight: 0.2 },
  6: { ...base, mistakeRate: 0.15, topN: 2, dangerWeight: 0.6, pressureWeight: 0.3 },
  7: { ...base }, // the original GreedyBot
  8: { ...base, lookahead: 1, cardDenial: true },
  9: { ...base, lookahead: 1, cardDenial: true, searchIterations: 6 },
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
const bestFollowUp = (v: View, weights: Weights): number => {
  const next = rankActions(v, { allowKnock: false, weights }).find((x) => growing(x.action));
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

/** The level's move. Same (view, level, seed) -> same action. */
export const chooseLevelAction = (v: View, level: Level, seed: number): Action => {
  if (level === 7) {
    if (legalActions(v).length === 0) throw new Error('Level 7 bot: no legal actions');
    return GreedyBot.chooseAction(v); // the original bot, exactly
  }
  return chooseWithConfig(v, LEVEL_CONFIGS[level], seed);
};

/** A move for any knob settings (used by the levels and by the ladder's tuning runs). */
export const chooseWithConfig = (v: View, c: LevelConfig, seed: number): Action => {
  const legal = legalActions(v);
  if (legal.length === 0) throw new Error('Bot: no legal actions');
  if (legal.length === 1) return legal[0]!;

  const weights = { ...WEIGHTS, exposure: c.dangerWeight, pressure: c.pressureWeight };
  const rng = mulberry32(seed);
  let ranked: Scored[] = rankActions(v, { weights });

  // Look one move further inside its own turn, and (level 9) at the opponent's reply.
  if ((c.lookahead > 0 || c.searchIterations > 0) && v.phase === 'ACT' && ranked[0]!.score < WEIGHTS.win / 2) {
    const unseen = c.searchIterations > 0 ? unseenCards(v) : [];
    const handSize = v.opponentHandCount + 1; // after their draw
    const value = new Map<Scored, number>();
    for (const r of ranked.filter((x) => growing(x.action)).slice(0, CANDIDATES)) {
      const after = viewAfter(v, r.action);
      let val = r.score + (after && c.lookahead > 0 ? 0.9 * bestFollowUp(after, weights) : 0);
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
    if (options.length > 0) return options.reduce((x, y) => (cost(y) < cost(x) ? y : x));
  }

  // Card denial: among discards about as good as the best, give away the least useful card.
  if (c.cardDenial && v.phase === 'DISCARD') {
    const unseen = unseenCards(v);
    const top = ranked[0]!.score;
    const close = ranked.filter((r) => r.action.t === 'Discard' && r.score >= top - 1);
    if (close.length > 1) {
      const card = (r: Scored) => v.hand.find((h) => h.id === (r.action as { card: number }).card)!;
      const best = close.reduce((a, b) => (usefulness(card(b), unseen) < usefulness(card(a), unseen) ? b : a));
      return best.action;
    }
  }

  // Laziness: sometimes stop growing even though it could.
  if (c.skipGrowth > 0 && v.phase === 'ACT' && rng() < c.skipGrowth) {
    const stop = legal.find((a) => a.t === 'EndAct');
    if (stop) return stop;
  }

  // Mistakes: sometimes settle for one of the next-best moves.
  if (c.mistakeRate > 0 && ranked.length > 1 && rng() < c.mistakeRate) {
    const n = Math.min(c.topN, ranked.length);
    if (n > 1) return ranked[1 + Math.floor(rng() * (n - 1))]!.action;
  }
  return ranked[0]!.action;
};
