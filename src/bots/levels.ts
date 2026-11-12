// Bot levels 1-9 (v0.5). Each level is a small config of "knobs". Level 7 is the
// original GreedyBot, unchanged. All levels read only their own View, are pure and
// deterministic: the same (view, level, seed) always gives the same action. Search
// budgets are counted in iterations, never in time.
import { allNeighbors, bestMeldPartition, coordKey, createCards, hexDistance, homeCoord, legalActions, mulberry32, onBoard, parseKey, score } from '../engine/index.js';
import type { Action, Card, Player, Tile, View } from '../engine/index.js';
import { lookBlooms, shortlistBlooms } from './bloomLook.js';
import { simulate } from './evaluate.js';
import { WEIGHTS, rankActions } from './GreedyBot.js';
import type { Scored, Weights } from './GreedyBot.js';
import { NEVER, isFruitThrow, isStrengthen } from './tactics.js';
import type { Tier } from './tactics.js';

export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Level = (typeof LEVELS)[number];

/**
 * The rivals (bots-v0.11): three bots above level 9, each with its own way of playing. They are not
 * rungs of the 1-9 ladder (none is "10 = better than 9, 11 = better than 10"); they sit beside each
 * other at the top. Their names are for the code and docs only; the game never shows them.
 *   10 Ironwood       defensive: compact, guards its home ring, wins on score
 *   11 Strangler Fig  aggressive: grows toward your home and tries to Strangle it
 *   12 Night Bloom    patient: holds Blooms and Fruit cards for the turn that counts
 * Bots 1-9 are frozen (tests/bots/levels-frozen.test.ts): nothing here changes what they choose.
 */
export const RIVALS = [10, 11, 12] as const;
export type Rival = (typeof RIVALS)[number];
/** Every bot a level, a ticket or a proof may name: the 1-9 ladder plus the rivals. */
export const BOT_LEVELS = [...LEVELS, ...RIVALS] as const;
export type BotLevel = Level | Rival;
export const isRival = (n: number): n is Rival => (RIVALS as readonly number[]).includes(n);
export const isBotLevel = (n: number): n is BotLevel => (BOT_LEVELS as readonly number[]).includes(n);
/**
 * The level a player sees and their stats count. The rivals are never named or numbered in the game:
 * they show (and are counted) as level 9, the top of the ladder they sit above.
 */
export const ladderLevel = (n: BotLevel): Level => (isRival(n) ? 9 : n);

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
  /** v0.5: chance per Grow step of a whim: a random Strengthen, good or not. */
  whimRate: number;
  /** v0.6: chance per Grow step (holding a Fruit card with a target) of playing it on a random legal target (levels 1-3). */
  fruitRandomRate: number;
  /** v0.6: chance per Throw step of throwing a Fruit card away (levels 1-2). */
  fruitThrowRate: number;
  /** v0.7: how it picks a Bloom: 'random' (any legal one), 'quick' (the quick look only), 'full' (the full evaluation). */
  bloomBand: 'random' | 'quick' | 'full';
  /** v0.7: chance of not blooming when it would (levels 1-3). */
  bloomSkip: number;
  /** v0.7: holds a plain 3-card Bloom when the unseen cards make a Bloom of 4 likely (levels 8-9). */
  bloomHold: boolean;
  // ---- rivals only (bots-v0.11). Absent on levels 1-9, which therefore behave exactly as before. ----
  /** Search the Lab's / campaign's authored boards as fully as the classic board (no iteration caps). */
  fullSearch?: boolean;
  /** Candidate moves the turn search judges (default 6). */
  candidates?: number;
  /** The rival's way of playing: an extra board term added to every growing move's score. */
  style?: Style;
  /** How much the style term counts (points per unit of the term). */
  styleWeight?: number;
  /** Bloom holding: the chance of a Bloom of 4 needed to wait (default HOLD_CHANCE). */
  holdChance?: number;
  /** Bloom holding: how much the best move without it may cost (default HOLD_MARGIN). */
  holdMargin?: number;
  /** Fruit patience: a Fruit card worth less than this is kept for later while the deck is long. */
  fruitPatience?: number;
  /**
   * Two-step search (rivals): after the opponent's best imagined reply, also find MY best answer to
   * it with the cards I keep, and count it back at this weight (0 = level 9's one-step reply search).
   */
  counterWeight?: number;
  /**
   * Endgame: once the draw pile holds this many cards or fewer, the danger and pressure terms fade
   * out in proportion (a threat the opponent has no turns left to carry out is not a threat).
   */
  endgame?: number;
};

/** A rival's way of playing (see `styleTerm`). */
export type Style = 'fortress' | 'siege' | 'patient';

const base = { mistakeRate: 0, topN: 1, skipGrowth: 0, dangerWeight: WEIGHTS.exposure, pressureWeight: WEIGHTS.pressure, cardDenial: false, discardStyle: 'greedy', replyWeight: 0.5, lookahead: 0, searchIterations: 0, strengthenTier: 3, fruitTier: 3, whimRate: 0, fruitRandomRate: 0, fruitThrowRate: 0, bloomBand: 'full', bloomSkip: 0, bloomHold: false } as const;

/** Tuned with the ladder simulation (docs/LADDER.md). */
export const LEVEL_CONFIGS: Record<Level, LevelConfig> = {
  // 1-6: one "sloppiness" dial k (0 = level 7, 1 = careless) sets mistakes, laziness and
  // how little it cares about danger. k = 0.95, 0.85, 0.72, 0.55, 0.40, 0.15.
  // Strengthen: 1-2 ignore it but act on a rare whim; 3-4 simple rules; 5-6 weigh exposure;
  // 7-8 full evaluation; 9 also the opponent's unseen Fruit cards.
  // v0.6 Fruit cards: 1-3 play one on a random target at a random moment (1-2 sometimes throw
  // one away); 4-6 simple rules; 7-8 full evaluation; 9 also counts the unseen Fruit cards.
  // v0.7 Blooms: 1-3 a random legal Bloom, and sometimes none (45%, 35%, 25%); 4-6 the best
  // quick look (tiles, gold, strongest replacement, compact); 7-9 the full evaluation, and 8-9
  // hold a plain 3-card Bloom when the unseen cards make a Bloom of 4 likely.
  1: { ...base, bloomBand: 'random', bloomSkip: 0.45, mistakeRate: 0.855, topN: 8, skipGrowth: 0.57, dangerWeight: 0.03, pressureWeight: 0.015, strengthenTier: 0, fruitTier: 0, whimRate: 0.03, fruitRandomRate: 0.35, fruitThrowRate: 0.25 },
  2: { ...base, bloomBand: 'random', bloomSkip: 0.35, mistakeRate: 0.765, topN: 7, skipGrowth: 0.51, dangerWeight: 0.09, pressureWeight: 0.045, strengthenTier: 0, fruitTier: 0, whimRate: 0.03, fruitRandomRate: 0.3, fruitThrowRate: 0.15 },
  3: { ...base, bloomBand: 'random', bloomSkip: 0.25, mistakeRate: 0.648, topN: 6, skipGrowth: 0.432, dangerWeight: 0.168, pressureWeight: 0.084, strengthenTier: 1, fruitTier: 0, fruitRandomRate: 0.3 },
  4: { ...base, bloomBand: 'quick', mistakeRate: 0.495, topN: 5, skipGrowth: 0.33, dangerWeight: 0.27, pressureWeight: 0.135, strengthenTier: 1, fruitTier: 2 },
  5: { ...base, bloomBand: 'quick', mistakeRate: 0.36, topN: 4, skipGrowth: 0.24, dangerWeight: 0.36, pressureWeight: 0.18, strengthenTier: 2, fruitTier: 2 },
  6: { ...base, bloomBand: 'quick', mistakeRate: 0.135, topN: 3, skipGrowth: 0.09, dangerWeight: 0.51, pressureWeight: 0.255, strengthenTier: 2, fruitTier: 2 },
  7: { ...base }, // GreedyBot (v0.5: with the full Strengthen and Fruit evaluation)
  // 8: keeps its strong cards and combos when throwing (level 7's weak spot), but still
  //    slips now and then (v0.5 ladder: 0.45 slipped too often, 57.4% vs 7; 0.15 gives
  //    68.4% vs 7 and still loses to 9, 35.7%; docs/LADDER.md).
  8: { ...base, bloomHold: true, discardStyle: 'keepHigh', mistakeRate: 0.15, topN: 3 },
  // 9: plans its whole turn, keeps strong cards, throws what helps the opponent least,
  //    and imagines 6 possible opponent hands to judge their best reply.
  9: { ...base, bloomHold: true, lookahead: 1, discardStyle: 'keepHigh', cardDenial: true, searchIterations: 6, replyWeight: 0.3, strengthenTier: 4, fruitTier: 4 },
};

/** Level 9's planner at full strength on every board: the base every rival starts from. */
const PLANNER: LevelConfig = { ...LEVEL_CONFIGS[9], fullSearch: true };

/**
 * The rivals' knobs. Tuned with `src/sim/rivals.ts` (docs/RIVALS.md): each at least matches the
 * full-strength level 9 on campaign boards, two clearly beat it, and each style shows in the numbers.
 */
export const RIVAL_CONFIGS: Record<Rival, LevelConfig> = {
  10: { ...PLANNER, style: 'fortress', styleWeight: 0.8, dangerWeight: 1.0, pressureWeight: 0.2 },
  11: { ...PLANNER, style: 'siege', styleWeight: 0.9, dangerWeight: 0.45, pressureWeight: 0.45 },
  12: { ...PLANNER, style: 'patient', styleWeight: 1, holdChance: 0.12, holdMargin: 4, fruitPatience: 4, candidates: 8, searchIterations: 8, replyWeight: 0.4 },
};

/** Any bot's knobs: a ladder level or a rival. */
export const configFor = (level: BotLevel): LevelConfig => (isRival(level) ? RIVAL_CONFIGS[level] : LEVEL_CONFIGS[level]);

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
/** Moves that change the board in my Grow step (v0.6: a Fruit card too). */
const growing = (a: Action) => a.t === 'Bloom' || a.t === 'Sprout' || a.t === 'PlayFruit';
const usedCards = (a: Action): number[] => (a.t === 'Sprout' || a.t === 'PlayFruit' ? [a.card] : a.t === 'Bloom' ? a.cards : []);

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
    // (a Fruit card played: the next one is judged as a second Fruit card this turn)
    lastResolution: a.t === 'PlayFruit' ? { placed: [], overgrown: [], rotted: [], severed: [], fruit: { card: a.card, target: a.target, strength: v.board[`${a.target.q},${a.target.r}`]?.strength ?? 0 } } : null,
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
const replyDamage = (oppView: View, uncapped = false): number => {
  let worst = 0;
  // (v0.7: Blooms through the quick look's short list, not all of them)
  const blooms = shortlistBlooms(lookBlooms(oppView), REPLY_BLOOMS).map((l) => l.action as Action);
  let others = legalActions(oppView).filter((x) => x.t !== 'Bloom');
  // the Lab's boards (config.board set; never the classic board): at most LAB_REPLY_CAP other
  // replies, those landing next to my tiles first (an iteration cap, never a time cap)
  if (oppView.config.board && !uncapped && others.length > LAB_REPLY_CAP) {
    const me = other(oppView.player);
    const nearMe = (a: Action) => {
      const c = a.t === 'Sprout' ? a.coord : a.t === 'PlayFruit' ? a.target : null;
      return c ? allNeighbors(c).some((n) => oppView.board[coordKey(n)]?.owner === me) : false;
    };
    others = [...others.filter(nearMe), ...others.filter((a) => !nearMe(a))].slice(0, LAB_REPLY_CAP);
  }
  for (const a of [...blooms, ...others]) {
    if (!growing(a)) continue;
    const sim = simulate(oppView, a);
    if (!sim) continue;
    if (sim.wins) return 50;
    worst = Math.max(worst, sim.points + sim.botPointsLost);
  }
  return worst;
};

/** The best immediate result of any growing move in a view: points gained + points the other side loses. */
const bestStrike = (v: View): { value: number; board: View['board'] | null } => {
  const blooms = shortlistBlooms(lookBlooms(v), REPLY_BLOOMS).map((l) => l.action as Action);
  const others = legalActions(v).filter((x) => x.t !== 'Bloom');
  let value = 0;
  let board: View['board'] | null = null;
  for (const a of [...blooms, ...others]) {
    if (!growing(a)) continue;
    const sim = simulate(v, a);
    if (!sim) continue;
    if (sim.wins) return { value: 50, board: sim.board };
    const gain = sim.points + sim.botPointsLost;
    if (gain > value) {
      value = gain;
      board = sim.board;
    }
  }
  return { value, board };
};

/**
 * Rivals' two-step search: the opponent's best reply in an imagined hand (as `replyDamage`, never
 * capped), then my best answer to it with the hand I keep. Returns reply minus weighted answer.
 */
const replyThenCounter = (oppView: View, mine: View, counterWeight: number): number => {
  const reply = bestStrike(oppView);
  if (reply.value >= 50 || !reply.board) return reply.value;
  const me = mine.player;
  const ctx = { config: mine.config, terrain: mine.terrain, board: reply.board };
  const answerView: View = {
    ...mine,
    board: reply.board,
    phase: 'ACT',
    turnPlayer: me,
    actor: me,
    sproutsThisTurn: 0,
    drawnFromDiscard: null,
    score: score(ctx, me),
    opponentScore: score(ctx, other(me)),
    lastResolution: null,
  };
  const answer = bestStrike(answerView);
  return reply.value - counterWeight * Math.min(answer.value, 50);
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
/** Blooms the imagined opponent reply considers (the quick look's best). */
const REPLY_BLOOMS = 6;
/** The Lab's boards only: other (non-Bloom) replies weighed per imagined opponent hand. */
export const LAB_REPLY_CAP = 12;
/** The Lab's boards only: candidate moves searched, and imagined opponent hands per candidate. */
export const LAB_CANDIDATES = 4;
export const LAB_ITERATIONS = 3;

/** A bot decision, with a short plain-words reason for Strengthen and Fruit (debug only). */
export type Decision = { action: Action; reason?: string };

/** The level's move. Same (view, level, seed) -> same action. */
export const chooseLevelAction = (v: View, level: BotLevel, seed: number): Action => decideLevelAction(v, level, seed).action;

/** The level's move and why (the reason is for debugging and simulation reports only). */
export const decideLevelAction = (v: View, level: BotLevel, seed: number): Decision => {
  if (level === 7) {
    const best = rankActions(v)[0];
    if (!best) throw new Error('Level 7 bot: no legal actions');
    return withReason(best); // GreedyBot's choice, exactly
  }
  return decideWithConfig(v, configFor(level), seed);
};

const withReason = (s: Scored): Decision =>
  s.facts.kind === 'strengthen' || s.facts.kind === 'fruit'
    ? { action: s.action, reason: s.facts.reason ?? '' }
    : s.facts.kind === 'bloom'
      ? { action: s.action, reason: `full evaluation: the best Bloom (score ${s.score.toFixed(2)})` }
      : { action: s.action };

/** A plain 3-card Bloom is held when the unseen cards give at least this chance of a 4 soon. */
export const HOLD_CHANCE = 0.2;
/** ...and the best move without it costs at most this much (about two tiles). */
export const HOLD_MARGIN = 2.5;

/**
 * v0.7: the chance that waiting turns these 3 Bloom cards into a Bloom of 4: the unseen cards
 * (not in my hand, not thrown) that would join it ("outs"), over my next draws (at most 3, fewer
 * near the end). Public information only.
 */
export const holdChance = (v: View, cards: readonly Card[]): { outs: number; chance: number } => {
  const unseen = unseenCards(v).filter((c) => c.suit !== null);
  const isSet = cards.every((c) => c.rank === cards[0]!.rank);
  const suits = new Set(cards.map((c) => c.suit));
  const lo = Math.min(...cards.map((c) => c.rank));
  const hi = Math.max(...cards.map((c) => c.rank));
  const outs = unseen.filter((c) => (isSet ? c.rank === cards[0]!.rank && !suits.has(c.suit) : c.suit === cards[0]!.suit && (c.rank === lo - 1 || c.rank === hi + 1))).length;
  const max = v.config.maxTurnsPerPlayer;
  const byLimit = max > 0 ? max - Math.ceil(v.turnNumber / 2) : Infinity;
  const byDeck = Math.floor(v.deckCount / 2);
  const draws = Math.max(0, Math.min(3, byLimit, byDeck));
  const chance = unseen.length && draws ? 1 - (1 - outs / unseen.length) ** draws : 0;
  return { outs, chance };
};

/** The level's Bloom band applied to its chosen move (levels 1-6 and the holding of 8-9). */
const bloomBand = (v: View, c: LevelConfig, ranked: readonly Scored[], pick: Scored, seed: number): Decision => {
  const b = pick.action;
  if (v.phase !== 'ACT' || b.t !== 'Bloom' || pick.score >= WEIGHTS.win / 2) return withReason(pick);
  // (its own random stream, so the rest of the bot's choices are not shifted by it)
  const br = mulberry32(seed ^ 0x68e31da4);
  const other = () => ranked.find((r) => r.action.t !== 'Bloom' && r.score > NEVER / 2);
  if (c.bloomBand === 'random') {
    const alt = other();
    if (alt && br() < c.bloomSkip) return { action: alt.action, reason: 'skipped a bloom (levels 1-3 sometimes do)' };
    const looks = lookBlooms(v);
    return { action: looks[Math.floor(br() * looks.length)]!.action, reason: `a random bloom (levels 1-3: one of ${looks.length})` };
  }
  if (c.bloomBand === 'quick') return { action: lookBlooms(v)[0]!.action, reason: 'best quick look (levels 4-6: tiles, gold, strongest replacement, compact)' };
  if (c.bloomHold && b.cards.length === 3 && b.hexes.every((h) => !v.board[coordKey(h)])) {
    const cards = b.cards.map((id) => v.hand.find((h) => h.id === id)!);
    const h = holdChance(v, cards);
    const alt = ranked.find((r) => r.action.t !== 'Bloom' && r.action.t !== 'EndAct' && r.score > NEVER / 2 && !usesAny(r.action, b.cards));
    if (alt && h.chance >= (c.holdChance ?? HOLD_CHANCE) && alt.score >= pick.score - (c.holdMargin ?? HOLD_MARGIN)) {
      return { action: alt.action, reason: `holds ${cards.map((x) => x.rank).join('-')} for a Bloom of 4 (${h.outs} unseen cards would join it, ${Math.round(h.chance * 100)}% soon)` };
    }
  }
  return withReason(pick);
};

const usesAny = (a: Action, ids: readonly number[]) =>
  (a.t === 'Sprout' && ids.includes(a.card)) || (a.t === 'Bloom' && a.cards.some((x) => ids.includes(x))) || ((a.t === 'PlayFruit' || a.t === 'Discard') && ids.includes(a.card));

/** A move for any knob settings (used by the levels and by the ladder's tuning runs). */
export const chooseWithConfig = (v: View, c: LevelConfig, seed: number): Action => decideWithConfig(v, c, seed).action;

export const decideWithConfig = (v: View, c: LevelConfig, seed: number): Decision => {
  const legal = legalActions(v);
  if (legal.length === 0) throw new Error('Bot: no legal actions');
  if (legal.length === 1) return { action: legal[0]! };

  const fade = c.endgame && v.deckCount < c.endgame ? v.deckCount / c.endgame : 1;
  const weights = { ...WEIGHTS, exposure: c.dangerWeight * fade, pressure: c.pressureWeight * fade };
  const rng = mulberry32(seed);
  // Levels 1-2: now and then a whim - a random Strengthen, whether it helps or not.
  // (Its own random stream, so the rest of the bot's choices are not shifted by it.)
  const whim = mulberry32(seed ^ 0x5bd1e995);
  if (c.whimRate > 0 && v.phase === 'ACT' && whim() < c.whimRate) {
    const odd = legal.filter((a) => isStrengthen(v, a));
    if (odd.length > 0) return { action: odd[Math.floor(whim() * odd.length)]!, reason: 'a whim (levels 1-2 sometimes waste it)' };
  }
  // v0.6 Fruit cards, levels 1-3: a random legal target at a random moment; levels 1-2 also
  // sometimes throw one away. (Their own random stream too.)
  const fr = mulberry32(seed ^ 0x2545f491);
  if (c.fruitRandomRate > 0 && v.phase === 'ACT') {
    const fruits = legal.filter((a) => a.t === 'PlayFruit');
    if (fruits.length > 0 && fr() < c.fruitRandomRate) return { action: fruits[Math.floor(fr() * fruits.length)]!, reason: 'a Fruit card on a random target, at a random moment (levels 1-3)' };
  }
  if (c.fruitThrowRate > 0 && v.phase === 'DISCARD') {
    const throws = legal.filter((a) => a.t === 'Discard' && v.hand.find((h) => h.id === a.card)?.suit === null);
    if (throws.length > 0 && fr() < c.fruitThrowRate) return { action: throws[0]!, reason: 'throws a Fruit card away (levels 1-2)' };
  }
  let ranked: Scored[] = rankActions(v, { weights, strengthenTier: c.strengthenTier, fruitTier: c.fruitTier });
  // Rivals: their way of playing, added to every growing move before the turn search.
  if (c.style && v.phase === 'ACT') ranked = withStyle(v, c, ranked);

  // Look one move further inside its own turn, and (level 9) at the opponent's reply.
  if ((c.lookahead > 0 || c.searchIterations > 0) && v.phase === 'ACT' && ranked[0]!.score < WEIGHTS.win / 2) {
    const unseen = c.searchIterations > 0 ? unseenCards(v) : [];
    const handSize = v.opponentHandCount + 1; // after their draw
    const value = new Map<Scored, number>();
    // the Lab's boards only: fewer candidates and imagined hands (iteration caps, never time)
    const lab = v.config.board !== null && v.config.board !== undefined && !c.fullSearch;
    const iters = lab ? Math.min(c.searchIterations, LAB_ITERATIONS) : c.searchIterations;
    for (const r of ranked.filter((x) => growing(x.action)).slice(0, lab ? LAB_CANDIDATES : (c.candidates ?? CANDIDATES))) {
      const after = viewAfter(v, r.action);
      let val = r.score + (after && c.lookahead > 0 ? 0.9 * bestFollowUp(after, weights, c) : 0);
      if (after && c.searchIterations > 0) {
        let dmg = 0;
        for (let i = 0; i < iters; i++) {
          const opp = opponentView(after, sample(unseen, handSize, rng));
          dmg += c.counterWeight ? replyThenCounter(opp, after, c.counterWeight) : replyDamage(opp, !lab);
        }
        val -= c.replyWeight * (dmg / iters);
      }
      value.set(r, val);
    }
    if (c.searchIterations > 0) {
      // Stopping now also leaves the opponent a reply: judge it the same way.
      const stop = ranked.find((x) => !growing(x.action));
      if (stop) {
        let dmg = 0;
        for (let i = 0; i < iters; i++) {
          const opp = opponentView(v, sample(unseen, handSize, rng));
          dmg += c.counterWeight ? replyThenCounter(opp, v, c.counterWeight) : replyDamage(opp, !lab);
        }
        value.set(stop, stop.score - c.replyWeight * (dmg / iters));
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
    // (v0.6: a Fruit card is never an ordinary throw)
    const cost = (a: Extract<Action, { t: 'Discard' }>) =>
      (isFruitThrow(v, a) ? 10_000 : 0) + (loose.has(a.card) ? 0 : 100) + rankOf(a) * 2 + (c.cardDenial ? usefulness(v.hand.find((h) => h.id === a.card)!, unseen) * 0.5 : 0);
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

  // v0.6: a Fruit card that wins or opens a Strangle is never lost to laziness or a slip
  if (ranked[0]!.facts.kind === 'fruit' && ranked[0]!.score >= 900) return withReason(ranked[0]!);

  // Laziness: sometimes stop growing even though it could.
  if (c.skipGrowth > 0 && v.phase === 'ACT' && rng() < c.skipGrowth) {
    const stop = legal.find((a) => a.t === 'EndAct');
    if (stop) return { action: stop };
  }

  // Mistakes: sometimes settle for one of the next-best moves (never one it rules out
  // altogether, such as throwing a Fruit card or a Fruit card it would keep).
  if (c.mistakeRate > 0 && ranked.length > 1 && rng() < c.mistakeRate) {
    const ok = ranked.filter((r) => r.score > NEVER / 2);
    const n = Math.min(c.topN, ok.length);
    if (n > 1) return bloomBand(v, c, ranked, ok[1 + Math.floor(rng() * (n - 1))]!, seed);
  }
  return bloomBand(v, c, ranked, ranked[0]!, seed);
};

// ---------- the rivals' ways of playing (bots-v0.11) ----------

type Board = Readonly<Record<string, Tile | null>>;

/** The on-board hexes around a player's home (its root ring: what a Strangle must fill). */
const ringOf = (v: View, p: Player): string[] =>
  allNeighbors(homeCoord(p, v.config)).filter((n) => onBoard(n, v.config)).map(coordKey);

const tilesIn = (b: Board, keys: readonly string[], owner: Player) => keys.filter((k) => b[k]?.owner === owner).length;

/** How close my nearest tile is to a hex (capped, so an empty network does not swamp the term). */
const reach = (b: Board, me: Player, to: string): number => {
  const target = parseKey(to);
  let best = 6;
  for (const [k, t] of Object.entries(b)) if (t?.owner === me) best = Math.min(best, hexDistance(parseKey(k), target));
  return best;
};

/**
 * Siege (Strangler Fig): my tiles in the opponent's root ring, minus their own guards there, minus
 * how far my network still is from their home. Rock in the ring needs no term: it never moves.
 */
const siege = (v: View, b: Board): number => {
  const me = v.player;
  const opp: Player = me === 0 ? 1 : 0;
  const ring = ringOf(v, opp);
  return 1.0 * tilesIn(b, ring, me) - 0.4 * tilesIn(b, ring, opp) - 0.35 * reach(b, me, coordKey(homeCoord(opp, v.config)));
};

/** Fortress (Ironwood): no enemy tile in my root ring, and a few of my own guarding it. */
const fortress = (v: View, b: Board): number => {
  const me = v.player;
  const opp: Player = me === 0 ? 1 : 0;
  const ring = ringOf(v, me);
  return -1.0 * tilesIn(b, ring, opp) + 0.3 * Math.min(3, tilesIn(b, ring, me));
};

/** The deck is short: a patient bot stops waiting (about four turns each are left). */
const PATIENT_ENDGAME = 8;

/**
 * Patience (Night Bloom), judged on the move itself: while the deck is long it keeps a Fruit card that
 * is not worth much yet, and it does not spend a high card on a plain empty hex.
 */
const patience = (v: View, c: LevelConfig, r: Scored): number => {
  if (v.deckCount <= PATIENT_ENDGAME) return 0;
  const a = r.action;
  if (a.t === 'PlayFruit') return r.score < (c.fruitPatience ?? 0) ? -1.5 : 0;
  if (a.t === 'Sprout' && !v.board[coordKey(a.coord)]) {
    const rank = v.hand.find((h) => h.id === a.card)?.rank ?? 0;
    return -0.08 * Math.max(0, rank - 5);
  }
  return 0;
};

/** The style term of one growing move: the change it makes (siege, fortress) or the move itself (patient). */
export const styleTerm = (v: View, c: LevelConfig, r: Scored): number => {
  if (!c.style) return 0;
  if (c.style === 'patient') return patience(v, c, r);
  const sim = simulate(v, r.action);
  if (!sim) return 0;
  const f = c.style === 'siege' ? siege : fortress;
  return f(v, sim.board) - f(v, v.board);
};

/** The ranking with each growing move's style term added (decisive moves and ruled-out moves untouched). */
const withStyle = (v: View, c: LevelConfig, ranked: readonly Scored[]): Scored[] =>
  ranked
    .map((r, i) => {
      const plain = !growing(r.action) || r.score <= NEVER / 2 || r.score >= WEIGHTS.win / 2;
      return { r: plain ? r : { ...r, score: r.score + (c.styleWeight ?? 1) * styleTerm(v, c, r) }, i };
    })
    .sort((x, y) => y.r.score - x.r.score || x.i - y.i)
    .map((x) => x.r);
