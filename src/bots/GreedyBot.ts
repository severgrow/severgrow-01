// GreedyBot (spec 16): scores every legal action by its immediate effect and picks the
// best. Simple and explainable: each score comes with the facts it was built from,
// which the playtest coach turns into plain-language reasons.
import { bestMeldPartition, coordKey, deadwood, legalActions } from '../engine/index.js';
import { BLOOM_SHORTLIST, lookBlooms, shortlistBlooms } from './bloomLook.js';
import type { Action, Card, Player, View } from '../engine/index.js';
import type { Bot } from './Bot.js';
import { cutLoss, simulate, threats } from './evaluate.js';
import type { Ctx } from './evaluate.js';
import { NEVER, isFruitThrow, isStrengthen, judgeFruit, judgeStrengthen, lookFruit, tacticsCtx } from './tactics.js';
import type { FruitLook, Tier } from './tactics.js';

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
  exposureBefore: number;
  exposureAfter: number;
  /** My biggest weak spot after the move (coord key), if any. */
  weakSpot: string | null;
  pressureBefore: number;
  pressureAfter: number;
};

export type Facts =
  | { kind: 'bloom' | 'fruit' | 'sprout'; move: MoveFacts; reason?: string }
  | { kind: 'strengthen'; from: number; to: number; reason: string }
  | { kind: 'draw'; from: 'deck' | 'discard'; completesCombo: boolean; comboWith: Card[] }
  | { kind: 'discard'; card: Card; fitsCombo: boolean; deadwoodAfter: number }
  | { kind: 'endAct'; bloomsAvailable: boolean }
  | { kind: 'knock'; lead: number; risk: number }
  | { kind: 'continue' }
  | { kind: 'rotPick'; botLoss: number };

export type Scored = { action: Action; score: number; facts: Facts };
/** The weights' shape; a bot level may pass its own (the default bot uses WEIGHTS). */
export type Weights = { readonly [K in keyof typeof WEIGHTS]: number };
/**
 * v0.5: how well the bot judges Strengthen and Fruit (see tactics.ts). Default 3, the full
 * evaluation (levels 7-8). `fruitShortlist`: Fruits fully scored after a quick look.
 */
export type GreedyOptions = { allowKnock?: boolean; weights?: Weights; strengthenTier?: Tier; fruitTier?: Tier; fruitShortlist?: number; bloomShortlist?: number };

const other = (p: Player): Player => (p === 0 ? 1 : 0);
const emptyMove = (): MoveFacts => ({ placed: 0, onRich: 0, taken: 0, botCut: 0, myLoss: 0, points: 0, botPointsLost: 0, wins: false, exposureBefore: 0, exposureAfter: 0, weakSpot: null, pressureBefore: 0, pressureAfter: 0 });
const worst = (ctx: Ctx, p: Player) => threats(ctx, p)[0] ?? null;

const inCombo = (hand: readonly Card[], c: Card): boolean =>
  bestMeldPartition(hand).melds.some((m) => m.some((x) => x.id === c.id));

type BoardMove = Extract<Action, { t: 'Bloom' | 'PlayFruit' | 'Sprout' }>;

/** The full board score of one Bloom, Sprout or Fruit card (also for moves off the Bloom shortlist). */
export const scoreBoardMove = (v: View, a: BoardMove, w: Weights = WEIGHTS): Scored => {
  const me = v.player;
  const opp = other(me);
  const sim = simulate(v, a)!;
  const after: Ctx = { config: v.config, terrain: v.terrain, board: sim.board };
  const myBefore = worst(v, me)?.loss ?? 0;
  const myAfterThreat = worst(after, me);
  const myAfter = myAfterThreat?.loss ?? 0;
  const pressureBefore = worst(v, opp)?.loss ?? 0;
  const pressureAfter = worst(after, opp)?.loss ?? 0;

  const placedKeys = a.t === 'Bloom' ? a.hexes.map(coordKey) : a.t === 'Sprout' ? [coordKey(a.coord)] : [];
  const move: MoveFacts = {
    placed: sim.placed,
    onRich: placedKeys.filter((k) => v.terrain[k] === 'rich').length,
    taken: sim.taken,
    botCut: sim.botCut,
    myLoss: sim.myLoss,
    points: sim.points,
    botPointsLost: sim.botPointsLost,
    wins: sim.wins,
    exposureBefore: myBefore,
    exposureAfter: myAfter,
    weakSpot: myAfterThreat?.key ?? null,
    pressureBefore,
    pressureAfter,
  };
  // Strength placed on empty hexes is "spent" without taking anything.
  const strengths =
    a.t === 'PlayFruit'
      ? []
      : a.t === 'Sprout'
        ? [v.hand.find((c) => c.id === a.card)!.rank]
        : a.cards.map((id) => v.hand.find((c) => c.id === id)!.rank); // hexes[i] gets cards[i]
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
  return { action: a, score, facts: { kind: a.t === 'PlayFruit' ? 'fruit' : a.t === 'Sprout' ? 'sprout' : 'bloom', move } };
};


const scoreAction = (v: View, a: Action, bloomsAvailable: boolean, w: Weights): Scored => {
  switch (a.t) {
    case 'Bloom':
    case 'Sprout':
    case 'PlayFruit':
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
      // v0.6: a Fruit card is never an ordinary throw (it would feed the opponent)
      if (isFruitThrow(v, a)) return { action: a, score: NEVER, facts: { kind: 'discard', card: c, fitsCombo: false, deadwoodAfter: 0 } };
      const rest = v.hand.filter((x) => x.id !== a.card);
      const dw = deadwood(rest);
      // Lowest leftover total first; then shed the higher card.
      return { action: a, score: -dw + c.rank / 100, facts: { kind: 'discard', card: c, fitsCombo: inCombo(v.hand, c), deadwoodAfter: dw } };
    }
    case 'EndAct':
      return { action: a, score: 0, facts: { kind: 'endAct', bloomsAvailable } };
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
  const all = legalActions(v).filter((a) => opts.allowKnock !== false || a.t !== 'Knock');
  const bloomsAvailable = all.some((a) => a.t === 'Bloom');
  // v0.7 Blooms: a quick look at every legal one, the full board score only for a shortlist
  const blooms = bloomsAvailable ? shortlistBlooms(lookBlooms(v), opts.bloomShortlist ?? BLOOM_SHORTLIST).map((l) => l.action as Action) : [];
  const acts = [...blooms, ...all.filter((a) => a.t !== 'Bloom')];
  const w = opts.weights ?? WEIGHTS;
  const sTier = opts.strengthenTier ?? 3;
  const fTier = opts.fruitTier ?? 3;
  const tctx = tacticsCtx(v);
  // Fruits: a quick look at all of them, the full board score only for the most promising.
  const fruits = acts.filter((a): a is Extract<Action, { t: 'PlayFruit' }> => a.t === 'PlayFruit');
  const looks = new Map<Action, FruitLook>();
  for (const f of fruits) {
    const l = lookFruit(v, f);
    if (l) looks.set(f, l);
  }
  const shortlist = new Set(
    [...looks.values()]
      .sort((x, y) => (y.sim.wins ? 1 : 0) - (x.sim.wins ? 1 : 0) || (y.opensStrangle ? 1 : 0) - (x.opensStrangle ? 1 : 0) || y.net - x.net || y.sim.botPointsLost - x.sim.botPointsLost)
      .slice(0, fTier >= 2 ? (opts.fruitShortlist ?? 4) : looks.size)
      .map((l) => l.a as Action),
  );
  const plain = acts.map((a) => (isStrengthen(v, a) || a.t === 'PlayFruit' ? null : scoreAction(v, a, bloomsAvailable, w)));
  // the best other use of each card this turn (for tier 1 Strengthen)
  const bestUse = new Map<number, number>();
  for (const s of plain) {
    if (!s) continue;
    const used = s.action.t === 'Sprout' ? [s.action.card] : s.action.t === 'Bloom' ? s.action.cards : [];
    for (const id of used) bestUse.set(id, Math.max(bestUse.get(id) ?? -Infinity, s.score));
  }
  const scored = acts.map((a, i): Scored => {
    if (plain[i]) return plain[i]!;
    if (isStrengthen(v, a)) {
      const j = judgeStrengthen(tctx, a, sTier, bestUse.get(a.card) ?? 0);
      const tile = v.board[coordKey(a.coord)]!;
      return { action: a, score: j.score, facts: { kind: 'strengthen', from: tile.strength, to: v.hand.find((c) => c.id === a.card)!.rank, reason: j.reason } };
    }
    const look = looks.get(a);
    if (!look || !shortlist.has(a)) return { action: a, score: NEVER, facts: { kind: 'fruit', move: emptyMove(), reason: 'not on the shortlist' } };
    const full = fTier >= 2 ? scoreBoardMove(v, a as Extract<Action, { t: 'PlayFruit' }>, w) : null;
    const j = judgeFruit(v, look, fTier, full?.score ?? look.net);
    return { action: a, score: j.score, facts: { kind: 'fruit', move: full ? (full.facts as { move: MoveFacts }).move : emptyMove(), reason: j.reason } };
  });
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
