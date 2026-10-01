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
import type { Mode } from './presets.js';

/** How many player actions the coach helps with at the start of a game. */
export const COACH_STEPS = 15;

/** A fixed seed for the "Tutorial game" button (Lite rules). Checked in tests. */
export const TUTORIAL_SEED = 296;

export type TipId =
  | 'goal'
  | 'draw'
  | 'combos'
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
  mode: Mode;
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
  root: 'your starting hex, marked R',
  'discard pile': 'the cards thrown away',
  deck: 'the face-down pile',
  combo: 'cards that go together',
  'gold hex': 'a yellow hex',
  strength: 'the number on a tile',
  'weak spot': 'one tile holding up many others',
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

const rotOn = (v: View) => rotCount(9 * (v.config.handSize + 1), v.config) > 0;
const knockOn = (mode: Mode) => mode === 'classic';
const fruitOn = (v: View) => v.config.fruitPerPlayer > 0;

// ---------- tips ----------

type Ctx = { v: View; mode: Mode; ranked: Scored[]; say: (w: string) => string };

const boardFacts = (ranked: Scored[]): MoveFacts[] =>
  ranked.flatMap((r) => (r.facts.kind === 'meld' || r.facts.kind === 'fruit' ? [r.facts.move] : []));

const other = (p: Player): Player => (p === 0 ? 1 : 0);

const TIPS: Record<TipId, { active: (c: Ctx) => boolean; fits: (c: Ctx) => boolean; text: (c: Ctx) => string }> = {
  goal: {
    active: () => true,
    fits: () => true,
    text: ({ say }) => `Your goal: grow a network of tiles from your ${say('root')}. Every tile must stay joined to it.`,
  },
  draw: {
    active: () => true,
    fits: ({ v }) => v.phase === 'DRAW',
    text: ({ say }) =>
      `Each turn starts with a draw. Take the top card of the ${say('discard pile')} only if it makes a ${say('combo')}. Otherwise draw from the ${say('deck')}.`,
  },
  combos: {
    active: () => true,
    fits: ({ v, ranked }) => v.phase === 'ACT' && ranked.some((r) => r.facts.kind === 'meld'),
    text: ({ say }) =>
      `A ${say('combo')} is 3 or more cards played together. A Hypha is cards of one suit in a row, like 3-4-5: it grows a straight line. A Bloom is the same number in different suits: it grows a small clump.`,
  },
  strength: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.taken > 0),
    text: ({ say }) => `Every tile has a ${say('strength')}. A stronger tile can replace a weaker bot tile. The same strength cannot.`,
  },
  gold: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.onRich > 0),
    text: ({ say }) => `A ${say('gold hex')} is worth 2 points. Other hexes are worth 1.`,
  },
  connection: {
    active: () => true,
    fits: ({ v }) =>
      threats(v, v.player).length > 0 || Object.values(v.board).filter((t) => t?.owner === v.player && !t.root).length >= 3,
    text: ({ say }) => `A tile that loses its path to your root ${say('withers')}. Protect every ${say('weak spot')} in your network.`,
  },
  cutting: {
    active: () => true,
    fits: ({ v, ranked }) => boardFacts(ranked).some((m) => m.botCut > 0) || threats(v, other(v.player)).length > 0,
    text: ({ say }) => `Look for a ${say('weak spot')} in the bot's network. Replace that one tile and everything behind it ${say('withers')}.`,
  },
  leftovers: {
    active: ({ v }) => rotOn(v),
    fits: ({ v }) => v.phase === 'DISCARD' || v.phase === 'KNOCK',
    text: ({ v, say }) =>
      `Watch your ${say('leftover cards')}. If they add up to more than ${v.config.rotThreshold} when you end your turn, some edge tiles ${say('rot')}.`,
  },
  knock: {
    active: ({ mode }) => knockOn(mode),
    fits: ({ v }) => v.phase === 'KNOCK',
    text: ({ v, say }) =>
      `When your leftover cards add up to ${v.config.knockDeadwood} or less, you can ${say('knock')}. The bot gets one last turn, then the higher score wins.`,
  },
  fruit: {
    active: ({ v }) => fruitOn(v),
    fits: ({ ranked }) => ranked.some((r) => r.facts.kind === 'fruit'),
    text: () => 'Once per game you can use Fruit: give up 3 of your joined tiles to destroy one touching bot tile, even a strong one.',
  },
  strangle: {
    active: () => true,
    fits: ({ v, ranked }) => {
      const target = rootCoord(other(v.player), v.config.rootStyle, v.config.boardRadius);
      const near = Object.entries(v.board).some(([k, t]) => t?.owner === v.player && hexDistance(parseKey(k), target) <= 2);
      return near || boardFacts(ranked).some((m) => m.wins);
    },
    text: ({ say }) =>
      `If you ${say('strangle')} the bot's root, you win at once. Rock and the board edge help, but at least one side must be your tile.`,
  },
  planning: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.exposureAfter > m.exposureBefore),
    text: () => 'Before a big move, check what the bot could cut afterwards. Tap a tile to see how much you would lose.',
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
  const { v, mode, say, ranked } = c;
  const f = best.facts;
  switch (f.kind) {
    case 'meld':
    case 'fruit':
      return whyBoard(c, f.move, f.kind === 'fruit');
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
      else if (loose >= 3) why.push(`You are holding ${loose} cards that do not fit a ${say('combo')}. Throwing away the ${name} keeps your hand tidy.`);
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
      if (mode === 'lite') return ['End your turn and refill your hand.'];
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
  const { view: v, mode } = input;
  if (!coachActive(input.step, input.enabled) || v.phase === 'GAME_OVER' || v.actor !== v.player) return null;
  const ranked = rankActions(v, { allowKnock: knockOn(mode) });
  if (ranked.length === 0) return null;
  const pick = ((choice % ranked.length) + ranked.length) % ranked.length;
  const best = ranked[pick]!;
  const words = glossary(input.known);
  const c: Ctx = { v, mode, ranked, say: words.say };
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
  'strength',
  'gold',
  'draw',
  'goal',
  'strangle',
  'leftovers',
  'knock',
  'fruit',
];
const LITE_SAFE = (id: TipId) => id !== 'leftovers' && id !== 'knock' && id !== 'fruit';

/** The goodbye message at COACH_STEPS: three things the player used. */
export const coachSummary = (taught: readonly TipId[], mode: Mode): { title: string; bullets: string[] } => {
  const allowed = (id: TipId) => mode === 'classic' || LITE_SAFE(id);
  const used = SUMMARY_PRIORITY.filter((id) => taught.includes(id) && allowed(id));
  const fill = (['connection', 'cutting', 'combos', 'goal'] as TipId[]).filter((id) => !used.includes(id));
  return {
    title: "You're on your own now. Here's what to remember:",
    bullets: [...used, ...fill].slice(0, 3).map((id) => BULLETS[id]),
  };
};
