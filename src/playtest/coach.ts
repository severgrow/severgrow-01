// The built-in coach for the playable page. For the first COACH_STEPS player actions
// of a game it suggests the best move (GreedyBot's ranking), explains why using facts
// about that move, and teaches one tactic at a time. Pure and deterministic: it is
// given only the player's View, never the bot's hidden cards.
import { bestMeldPartition, coordKey, hexDistance, parseKey, rootCoord, rotCount } from '../engine/index.js';
import type { Action, Coord, Player, View } from '../engine/index.js';
import { rankActions } from '../bots/GreedyBot.js';
import type { MoveFacts, Scored } from '../bots/GreedyBot.js';
import { threats } from '../bots/evaluate.js';
import { cardName, hexName, moveCards, moveHexes, moveSentence } from './names.js';

/** How many player actions the coach helps with at the start of a game. */
export const COACH_STEPS = 15;

/** A fixed seed for the "Tutorial game" button (v0.4 defaults): in 15 coached steps it
 * teaches 10 ideas and shows lines, a clump, Sprout, taking over and a cut of 4. */
export const TUTORIAL_SEED = 10;

export type TipId =
  | 'goal'
  | 'draw'
  | 'combos'
  | 'sprout'
  | 'strength'
  | 'gold'
  | 'connection'
  | 'cutting'
  | 'leftovers'
  | 'knock'
  | 'fruit'
  | 'strangle'
  | 'planning';

/** The order ideas are taught in (a-k). */
export const TIP_ORDER: readonly TipId[] = [
  'goal',
  'draw',
  'combos',
  'sprout',
  'strength',
  'gold',
  'connection',
  'cutting',
  'leftovers',
  'knock',
  'fruit',
  'strangle',
  'planning',
];

export type CoachInput = {
  view: View;
  /** Player actions taken so far this game. */
  step: number;
  enabled: boolean;
  /** Tips already shown this game. */
  taught: readonly TipId[];
  /** Game words already explained this game. */
  known: readonly string[];
};

export type Advice = {
  action: Action;
  /** Which choice this is in the ranking (0 = best) and how many there are. */
  choice: number;
  choices: number;
  suggested: string;
  why: string[];
  tip: { id: TipId; text: string } | null;
  cards: number[];
  hexes: Coord[];
  /** Words explained so far, including any explained in this advice. */
  known: string[];
};

// ---------- words ----------

const GLOSSARY: Record<string, string> = {
  root: 'the big round bulb you start from',
  'discard pile': 'the cards already discarded',
  deck: 'the face-down pile',
  combo: '3+ cards played together',
  'gold hex': 'a yellow hex',
  strength: 'the number on a tile',
  'weak spot': 'one tile holding up others',
  withers: 'disappears',
  'leftover cards': 'cards that do not fit a combo',
  rot: 'disappear',
  knock: 'end the game early',
  strangle: 'surround it on all sides',
};

/** Returns a function that adds a short explanation the first time each word is used. */
const glossary = (known: readonly string[]) => {
  const seen = new Set(known);
  const say = (word: string): string => {
    if (seen.has(word)) return word;
    seen.add(word);
    return `${word} (${GLOSSARY[word]})`;
  };
  return { say, known: () => [...seen] };
};

// ---------- rules switched on in this game ----------

// Parked rules (spec appendix A) are taught only when switched on.
const rotOn = (v: View) => v.config.rotEnabled && rotCount(9 * (v.config.handSize + 1), v.config) > 0;
const knockOn = (v: View) => v.config.knockEnabled;
const fruitOn = (v: View) => v.config.fruitPerPlayer > 0;

// ---------- tips ----------

type Ctx = { v: View; ranked: Scored[]; say: (w: string) => string };

const boardFacts = (ranked: Scored[]): MoveFacts[] =>
  ranked.flatMap((r) => (r.facts.kind === 'meld' || r.facts.kind === 'fruit' || r.facts.kind === 'sprout' ? [r.facts.move] : []));

const other = (p: Player): Player => (p === 0 ? 1 : 0);

const TIPS: Record<TipId, { active: (c: Ctx) => boolean; fits: (c: Ctx) => boolean; text: (c: Ctx) => string }> = {
  goal: {
    active: () => true,
    fits: () => true,
    text: ({ say }) => `Grow tiles out from your ${say('root')}. Keep every tile joined to it.`,
  },
  draw: {
    active: () => true,
    fits: ({ v }) => v.phase === 'DRAW',
    text: ({ say }) => `Take the ${say('discard pile')} card only if it makes a ${say('combo')}.`,
  },
  combos: {
    active: () => true,
    fits: ({ v, ranked }) => v.phase === 'ACT' && ranked.some((r) => r.facts.kind === 'meld'),
    text: ({ say }) => `A ${say('combo')}: one suit in a row (3-4-5) grows a line; one number grows a clump.`,
  },
  sprout: {
    active: ({ v }) => v.config.sproutsPerTurn > 0,
    fits: ({ v, ranked }) => v.phase === 'ACT' && ranked.some((r) => r.facts.kind === 'sprout'),
    text: ({ say }) => `Sprout: one card, one tile. Handy when you have no ${say('combo')}.`,
  },
  strength: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.taken > 0),
    text: ({ say }) => `A higher ${say('strength')} replaces a weaker bot tile. Equal can't.`,
  },
  gold: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.onRich > 0),
    text: ({ say }) => `A ${say('gold hex')} scores 2 points.`,
  },
  connection: {
    active: () => true,
    fits: ({ v }) =>
      threats(v, v.player).length > 0 || Object.values(v.board).filter((t) => t?.owner === v.player && !t.root).length >= 3,
    text: ({ say }) => `Cut off from your root, a tile ${say('withers')}. Guard each ${say('weak spot')}.`,
  },
  cutting: {
    active: () => true,
    fits: ({ v, ranked }) => boardFacts(ranked).some((m) => m.botCut > 0) || threats(v, other(v.player)).length > 0,
    text: ({ say }) => `Take a bot ${say('weak spot')} and everything behind it ${say('withers')}.`,
  },
  leftovers: {
    active: ({ v }) => rotOn(v),
    fits: ({ v }) => v.phase === 'DISCARD' || v.phase === 'KNOCK',
    text: ({ v, say }) => `${say('leftover cards')} over ${v.config.rotThreshold} at turn end make edge tiles ${say('rot')}.`,
  },
  knock: {
    active: ({ v }) => knockOn(v),
    fits: ({ v }) => v.phase === 'KNOCK',
    text: ({ v, say }) => `Leftovers of ${v.config.knockDeadwood} or less? You can ${say('knock')}: the bot gets one last turn.`,
  },
  fruit: {
    active: ({ v }) => fruitOn(v),
    fits: ({ ranked }) => ranked.some((r) => r.facts.kind === 'fruit'),
    text: () => 'Fruit, once per game: give up 3 tiles to destroy one touching bot tile.',
  },
  strangle: {
    active: () => true,
    fits: ({ v, ranked }) => {
      const target = rootCoord(other(v.player), v.config.rootStyle, v.config.boardRadius);
      const near = Object.entries(v.board).some(([k, t]) => t?.owner === v.player && hexDistance(parseKey(k), target) <= 2);
      return near || boardFacts(ranked).some((m) => m.wins);
    },
    text: ({ say }) => `Win at once: ${say('strangle')} the bot's root.`,
  },
  planning: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.exposureAfter > m.exposureBefore),
    text: () => 'Before a big move, check what the bot could cut back.',
  },
};

const nextTip = (c: Ctx, taught: readonly TipId[]): TipId | null =>
  TIP_ORDER.find((id) => !taught.includes(id) && TIPS[id].active(c) && TIPS[id].fits(c)) ?? null;

// ---------- why ----------

const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

const whyBoard = (c: Ctx, m: MoveFacts, isFruit: boolean): string[] => {
  const { say, v } = c;
  const reasons: string[] = [];
  if (m.wins) reasons.push(`This surrounds the bot's root, so you win right away.`);
  if (isFruit) reasons.push(`Giving up 3 of your tiles destroys a bot tile you could not replace.`);
  if (m.botCut > 0) reasons.push(`This cuts the bot's link and removes ${m.taken + m.botCut} of its tiles.`);
  if (m.exposureAfter < m.exposureBefore) reasons.push(`This fixes a ${say('weak spot')} in your network.`);
  if (m.taken > 0 && m.botCut === 0 && !isFruit) reasons.push(`This replaces ${plural(m.taken, 'a weaker bot tile', 'weaker bot tiles')}.`);
  if (m.onRich > 0) {
    reasons.push(m.onRich === 1 ? `This ${say('gold hex')} is worth 2 points.` : `These ${m.onRich} gold hexes are worth 2 points each.`);
  }
  if (m.placed > 0) reasons.push(m.toward ? `This grows ${m.placed} tiles toward the bot's root.` : `This grows ${m.placed} new tiles for you.`);
  const why = reasons.slice(0, 2);
  if (m.exposureAfter > m.exposureBefore && m.weakSpot) {
    const spot = hexName(parseKey(m.weakSpot), v.config.boardRadius);
    why.splice(1, 1, `Watch out: if the bot cuts at ${spot}, you lose ${m.exposureAfter} tiles.`);
  }
  return why;
};

const whyFor = (c: Ctx, best: Scored): string[] => {
  const { v, say, ranked } = c;
  const f = best.facts;
  switch (f.kind) {
    case 'meld':
    case 'fruit':
      return whyBoard(c, f.move, f.kind === 'fruit');
    case 'sprout':
      return f.move.placed > 0 && !f.move.taken && !f.move.botCut && !f.move.onRich && !f.move.wins
        ? [`A Sprout grows one tile for you with a single card, so your ${say('combo')} cards stay in your hand.`, ...whyBoard(c, f.move, false).slice(1)]
        : whyBoard(c, f.move, false);
    case 'draw': {
      const top = v.discard.at(-1);
      if (f.from === 'discard' && top && f.completesCombo) {
        return [`The ${cardName(top)} on the ${say('discard pile')} fits with your ${f.comboWith.map(cardName).join(' and ')} to make a ${say('combo')}.`];
      }
      if (f.from === 'discard') return [`The ${say('deck')} is empty, so take the card from the ${say('discard pile')}.`];
      if (!top) return [`Draw a new card from the ${say('deck')}.`];
      return [`The ${cardName(top)} on the ${say('discard pile')} does not make a ${say('combo')}, so try a new card from the ${say('deck')}.`];
    }
    case 'discard': {
      const name = cardName(f.card);
      const loose = bestMeldPartition(v.hand).leftover.length;
      const why: string[] = [];
      if (f.fitsCombo) why.push(`Every card fits a ${say('combo')}, so let go of the ${name}: it hurts your combos least.`);
      else if (loose >= 3) why.push(`You are holding ${loose} cards that do not fit a ${say('combo')}. Discarding the ${name} keeps your hand tidy.`);
      else why.push(`The ${name} does not fit any ${say('combo')}, so it is the easiest card to let go.`);
      if (rotOn(v) && f.card.rank >= 7 && !f.fitsCombo) why.push(`It is a high card, so this also keeps your ${say('leftover cards')} low.`);
      return why;
    }
    case 'endAct': {
      if (!f.meldsAvailable) return [`You have no ${say('combo')} left to play. Keep collecting matching cards.`];
      const bestMeld = boardFacts(ranked).find(() => true);
      if (bestMeld && bestMeld.exposureAfter > bestMeld.exposureBefore) {
        return [`Your ${say('combo')} would leave a ${say('weak spot')} the bot could cut. Keep it for a better moment.`];
      }
      return [`Your ${say('combo')} would not help much right now. Keep it for later.`];
    }
    case 'knock':
      return [`You lead by ${f.lead} points and the bot has no big cut on you, so knocking now should win.`];
    case 'continue': {
      if (!rotOn(v) && !knockOn(v)) return ['End your turn and refill your hand.'];
      const rc = rotCount(v.myDeadwood, v.config);
      const why: string[] = [];
      if (rc > 0) why.push(`Your ${say('leftover cards')} add up to ${v.myDeadwood}, so ${rc} of your edge tiles will ${say('rot')}.`);
      why.push(v.myDeadwood <= v.config.knockDeadwood ? 'Knocking now is risky because your lead is small.' : 'End your turn and refill your hand.');
      return why;
    }
    case 'rotPick':
      return f.botLoss > 1
        ? [`Removing this tile also cuts off ${f.botLoss - 1} more bot tiles.`]
        : ['These bot tiles are all equally weak, so any of them is fine.'];
  }
};

// ---------- public API ----------

/** True while the coach should give hints. */
export const coachActive = (step: number, enabled: boolean): boolean => enabled && step < COACH_STEPS;

/**
 * The coach's advice for the player's current move, or null when the coach is off,
 * past COACH_STEPS, or it is not the player's move. `choice` picks the next-best moves
 * ("Not this, show another") and wraps around.
 */
export const coachAdvice = (input: CoachInput, choice = 0): Advice | null => {
  const { view: v } = input;
  if (!coachActive(input.step, input.enabled) || v.phase === 'GAME_OVER' || v.actor !== v.player) return null;
  const ranked = rankActions(v, { allowKnock: knockOn(v) });
  if (ranked.length === 0) return null;
  const pick = ((choice % ranked.length) + ranked.length) % ranked.length;
  const best = ranked[pick]!;
  const words = glossary(input.known);
  const c: Ctx = { v, ranked, say: words.say };
  const tipId = nextTip(c, input.taught);
  const tip = tipId ? { id: tipId, text: TIPS[tipId].text(c) } : null;
  const why = whyFor(c, best);
  return {
    action: best.action,
    choice: pick,
    choices: ranked.length,
    suggested: moveSentence(v, best.action),
    why,
    tip,
    cards: moveCards(best.action),
    hexes: moveHexes(best.action).map((h) => parseKey(coordKey(h))),
    known: words.known(),
  };
};

const BULLETS: Record<TipId, string> = {
  goal: 'Keep every tile joined to your root.',
  draw: 'Take the discard only if it makes a combo.',
  combos: 'Cards of one suit in a row grow lines; same numbers grow clumps.',
  sprout: 'No combo? Sprout one card as one tile.',
  strength: 'A stronger tile can replace a weaker bot tile.',
  gold: 'Gold hexes are worth 2 points.',
  connection: 'Protect weak spots that hold up many tiles.',
  cutting: "Cut the bot's weak spots to make its tiles wither.",
  leftovers: 'Keep your leftover cards low to avoid rot.',
  knock: 'Knock only when you are clearly ahead.',
  fruit: 'Save Fruit for a bot tile you cannot replace.',
  strangle: "Surround the bot's root to win at once.",
  planning: 'Before a big move, check what the bot could cut.',
};
const SUMMARY_PRIORITY: readonly TipId[] = [
  'connection',
  'cutting',
  'planning',
  'combos',
  'sprout',
  'strength',
  'gold',
  'draw',
  'goal',
  'strangle',
  'leftovers',
  'knock',
  'fruit',
];
/** The goodbye message at COACH_STEPS: three things the player used (only rules that are on). */
export const coachSummary = (taught: readonly TipId[], config: View['config']): { title: string; bullets: string[] } => {
  const allowed = (id: TipId) =>
    (id !== 'leftovers' || config.rotEnabled) && (id !== 'knock' || config.knockEnabled) && (id !== 'fruit' || config.fruitPerPlayer > 0);
  const used = SUMMARY_PRIORITY.filter((id) => taught.includes(id) && allowed(id));
  const fill = (['connection', 'cutting', 'combos', 'goal'] as TipId[]).filter((id) => !used.includes(id));
  return {
    title: "You're on your own now. Here's what to remember:",
    bullets: [...used, ...fill].slice(0, 3).map((id) => BULLETS[id]),
  };
};
