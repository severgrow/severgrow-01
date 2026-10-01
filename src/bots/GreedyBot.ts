// GreedyBot (spec 16): scores every legal action by its immediate effect and picks the
// best. Simple and explainable: each score comes with the facts it was built from,
// which the playtest coach turns into plain-language reasons.
import { DIRECTIONS as DIR, bestMeldPartition, coordKey, deadwood, hexDistance, legalActions, rootCoord } from '../engine/index.js';
import type { Action, Card, Player, View } from '../engine/index.js';
import type { Bot } from './Bot.js';
import { cutLoss, simulate, threats } from './evaluate.js';
import type { Ctx } from './evaluate.js';

/** Weights. Points are worth 1 each; everything else is measured against that. */
export const WEIGHTS = {
  /** Per tile of change in my biggest cuttable weak spot (bigger = worse). */
  exposure: 0.6,
  /** Per tile of change in the bot's biggest weak spot I can reach next turn. */
  pressure: 0.3,
  /** A move that wins the game at once. */
  win: 1000,
  /** Taking the discard: + if it completes a combo, - otherwise (deck is 0). */
  discardDraw: 1,
  /** Knock only with a lead bigger than this plus my own weak spot. */
  knockMargin: 2,
  /** Per strength point spent on a plain empty hex (keeps high cards for takeovers). */
  wastedStrength: 0.02,
  /** Sprouting a card that belongs to a combo in hand (v0.4). */
  breakCombo: 1.5,
} as const;

export type MoveFacts = {
  placed: number;
  onRich: number;
  taken: number;
  botCut: number;
  myLoss: number;
  points: number;
  botPointsLost: number;
  wins: boolean;
  /** A Hypha whose tip ends closer to the opponent's root than its start. */
  toward: boolean;
  exposureBefore: number;
  exposureAfter: number;
  /** My biggest weak spot after the move (coord key), if any. */
  weakSpot: string | null;
  pressureBefore: number;
  pressureAfter: number;
};

export type Facts =
  | { kind: 'meld' | 'fruit' | 'sprout'; move: MoveFacts }
  | { kind: 'draw'; from: 'deck' | 'discard'; completesCombo: boolean; comboWith: Card[] }
  | { kind: 'discard'; card: Card; fitsCombo: boolean; deadwoodAfter: number }
  | { kind: 'endAct'; meldsAvailable: boolean }
  | { kind: 'knock'; lead: number; risk: number }
  | { kind: 'continue' }
  | { kind: 'rotPick'; botLoss: number };

export type Scored = { action: Action; score: number; facts: Facts };
/** The weights' shape; a bot level may pass its own (the default bot uses WEIGHTS). */
export type Weights = { readonly [K in keyof typeof WEIGHTS]: number };
export type GreedyOptions = { allowKnock?: boolean; weights?: Weights };

const other = (p: Player): Player => (p === 0 ? 1 : 0);
const worst = (ctx: Ctx, p: Player) => threats(ctx, p)[0] ?? null;

const inCombo = (hand: readonly Card[], c: Card): boolean =>
  bestMeldPartition(hand).melds.some((m) => m.some((x) => x.id === c.id));

const scoreBoardMove = (v: View, a: Extract<Action, { t: 'MeldRun' | 'MeldSet' | 'Fruit' | 'Sprout' }>, w: Weights): Scored => {
  const me = v.player;
  const opp = other(me);
  const sim = simulate(v, a)!;
  const after: Ctx = { config: v.config, terrain: v.terrain, board: sim.board };
  const myBefore = worst(v, me)?.loss ?? 0;
  const myAfterThreat = worst(after, me);
  const myAfter = myAfterThreat?.loss ?? 0;
  const pressureBefore = worst(v, opp)?.loss ?? 0;
  const pressureAfter = worst(after, opp)?.loss ?? 0;

  const placedKeys =
    a.t === 'MeldRun'
      ? Array.from({ length: a.cards.length }, (_, i) => coordKey({ q: a.start.q + DIR[a.dir]!.q * i, r: a.start.r + DIR[a.dir]!.r * i }))
      : a.t === 'MeldSet'
        ? a.hexes.map(coordKey)
        : a.t === 'Sprout'
          ? [coordKey(a.coord)]
          : [];
  let toward = false;
  if (a.t === 'MeldRun') {
    const target = rootCoord(opp, v.config.rootStyle, v.config.boardRadius);
    const d = DIR[a.dir]!;
    const tip = { q: a.start.q + d.q * (a.cards.length - 1), r: a.start.r + d.r * (a.cards.length - 1) };
    toward = hexDistance(tip, target) < hexDistance(a.start, target);
  }
  const move: MoveFacts = {
    placed: sim.placed,
    onRich: placedKeys.filter((k) => v.terrain[k] === 'rich').length,
    taken: sim.taken,
    botCut: sim.botCut,
    myLoss: sim.myLoss,
    points: sim.points,
    botPointsLost: sim.botPointsLost,
    wins: sim.wins,
    toward,
    exposureBefore: myBefore,
    exposureAfter: myAfter,
    weakSpot: myAfterThreat?.key ?? null,
    pressureBefore,
    pressureAfter,
  };
  // Strength placed on empty hexes is "spent" without taking anything.
  const strengths =
    a.t === 'Fruit'
      ? []
      : a.t === 'Sprout'
        ? [v.hand.find((c) => c.id === a.card)!.rank]
        : a.cards
          .map((id) => v.hand.find((c) => c.id === id)!.rank)
          .sort((x, y) => x - y)
          .map((r, _i, all) => (a.t === 'MeldSet' ? all[0]! : r));
  const wasted = placedKeys.reduce((sum, k, i) => sum + (v.board[k] ? 0 : (strengths[i] ?? 0)), 0);
  const breaksCombo = a.t === 'Sprout' && inCombo(v.hand, v.hand.find((c) => c.id === a.card)!);
  const score =
    (sim.wins ? w.win : 0) -
    (breaksCombo ? w.breakCombo : 0) -
    w.wastedStrength * wasted +
    sim.points +
    sim.botPointsLost -
    w.exposure * (myAfter - myBefore) +
    w.pressure * (pressureAfter - pressureBefore);
  return { action: a, score, facts: { kind: a.t === 'Fruit' ? 'fruit' : a.t === 'Sprout' ? 'sprout' : 'meld', move } };
};


const scoreAction = (v: View, a: Action, meldsAvailable: boolean, w: Weights): Scored => {
  switch (a.t) {
    case 'MeldRun':
    case 'MeldSet':
    case 'Sprout':
    case 'Fruit':
      return scoreBoardMove(v, a, w);
    case 'Draw': {
      if (a.from === 'deck') return { action: a, score: 0, facts: { kind: 'draw', from: 'deck', completesCombo: false, comboWith: [] } };
      const top = v.discard.at(-1)!;
      const withTop = [...v.hand, top];
      const meld = bestMeldPartition(withTop).melds.find((m) => m.some((x) => x.id === top.id)) ?? null;
      return {
        action: a,
        score: meld ? w.discardDraw : -w.discardDraw,
        facts: { kind: 'draw', from: 'discard', completesCombo: meld !== null, comboWith: (meld ?? []).filter((x) => x.id !== top.id) },
      };
    }
    case 'Discard': {
      const c = v.hand.find((x) => x.id === a.card)!;
      const rest = v.hand.filter((x) => x.id !== a.card);
      const dw = deadwood(rest);
      // Lowest leftover total first; then shed the higher card.
      return { action: a, score: -dw + c.rank / 100, facts: { kind: 'discard', card: c, fitsCombo: inCombo(v.hand, c), deadwoodAfter: dw } };
    }
    case 'EndAct':
      return { action: a, score: 0, facts: { kind: 'endAct', meldsAvailable } };
    case 'Knock': {
      const lead = v.score - v.opponentScore;
      const risk = worst(v, v.player)?.loss ?? 0;
      return { action: a, score: lead - risk - w.knockMargin, facts: { kind: 'knock', lead, risk } };
    }
    case 'Continue':
      return { action: a, score: 0, facts: { kind: 'continue' } };
    case 'RotPick': {
      const loss = cutLoss(v, coordKey(a.coord)).length;
      return { action: a, score: loss, facts: { kind: 'rotPick', botLoss: loss } };
    }
  }
};

/**
 * Every legal action (minus Knock when not allowed), scored and sorted best first.
 * Ties keep the engine's legal-action order, so the result is deterministic.
 */
export const rankActions = (v: View, opts: GreedyOptions = {}): Scored[] => {
  const acts = legalActions(v).filter((a) => opts.allowKnock !== false || a.t !== 'Knock');
  const meldsAvailable = acts.some((a) => a.t === 'MeldRun' || a.t === 'MeldSet');
  const w = opts.weights ?? WEIGHTS;
  const scored = acts.map((a) => scoreAction(v, a, meldsAvailable, w));
  return scored
    .map((s, i) => ({ s, i }))
    .sort((x, y) => y.s.score - x.s.score || x.i - y.i)
    .map((x) => x.s);
};

export const createGreedyBot = (opts: GreedyOptions = {}): Bot => ({
  chooseAction(view) {
    const best = rankActions(view, opts)[0];
    if (!best) throw new Error('GreedyBot: no legal actions');
    return best.action;
  },
});

export const GreedyBot: Bot = createGreedyBot();
