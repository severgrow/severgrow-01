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
import { BLOOM, FRUIT, OPP, SPROUT } from '../strings.js';
import { t } from '../i18n/index.js';

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
  | 'strengthen'
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
  'strengthen',
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
  home: 'your tree, where your network starts',
  'throw pile': 'cards already thrown',
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
const WORD: Record<string, string> = {
  home: 'home', 'throw pile': 'throw pile', deck: 'deck', combo: 'combo',
  'gold hex': 'gold hex', strength: 'strength', 'weak spot': 'weak spot',
  withers: 'withers', 'leftover cards': 'leftover cards', rot: 'rot', knock: 'knock',
  strangle: 'strangle',
};

/** Returns a function that adds a short explanation the first time each word is used. */
const glossary = (known: readonly string[]) => {
  const seen = new Set(known);
  const say = (word: string): string => {
    if (seen.has(word)) return t(`ui.coach.word.${word}`, WORD[word] ?? word);
    seen.add(word);
    return `${t(`ui.coach.word.${word}`, WORD[word] ?? word)} (${t(`ui.coach.gloss.${word}`, GLOSSARY[word] ?? '')})`;
  };
  return { say, known: () => [...seen] };
};

// ---------- rules switched on in this game ----------

// Parked rules (spec appendix A) are taught only when switched on.
const rotOn = (v: View) => v.config.rotEnabled && rotCount(9 * (v.config.handSize + 1), v.config) > 0;
const knockOn = (v: View) => v.config.knockEnabled;
/** v0.6: Fruit cards are in the game (the deck has some). */
const fruitOn = (v: View) => v.config.fruitCardCount > 0;

// ---------- tips ----------

type Ctx = { v: View; ranked: Scored[]; say: (w: string) => string };

const boardFacts = (ranked: Scored[]): MoveFacts[] =>
  ranked.flatMap((r) => (r.facts.kind === 'bloom' || r.facts.kind === 'fruit' || r.facts.kind === 'sprout' ? [r.facts.move] : []));

const other = (p: Player): Player => (p === 0 ? 1 : 0);

const TIPS: Record<TipId, { active: (c: Ctx) => boolean; fits: (c: Ctx) => boolean; text: (c: Ctx) => string }> = {
  goal: {
    active: () => true,
    fits: () => true,
    text: ({ say }) => t('ui.coach.tip.goal', 'Grow tiles out from your {home}. Keep every tile joined to it.', { home: say('home') }),
  },
  draw: {
    active: () => true,
    fits: ({ v }) => v.phase === 'DRAW',
    text: ({ say }) => t('ui.coach.tip.draw', 'Take the {pile} card only if it makes a {combo}.', { pile: say('throw pile'), combo: say('combo') }),
  },
  combos: {
    active: () => true,
    fits: ({ v, ranked }) => v.phase === 'ACT' && ranked.some((r) => r.facts.kind === 'bloom'),
    text: () => BLOOM.hint,
  },
  sprout: {
    active: ({ v }) => v.config.sproutsPerTurn > 0,
    fits: ({ v, ranked }) => v.phase === 'ACT' && ranked.some((r) => r.facts.kind === 'sprout'),
    text: ({ say }) => SPROUT.coachTip(say('combo')),
  },
  strength: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.taken > 0),
    text: ({ say }) => t('ui.coach.tip.strength', 'A higher {strength} overgrows a weaker {opp} tile. Equal can\'t.', { strength: say('strength'), opp: OPP.noun }),
  },
  gold: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.onRich > 0),
    text: ({ say }) => t('ui.coach.tip.gold', 'A {gold} scores 2 points.', { gold: say('gold hex') }),
  },
  connection: {
    active: () => true,
    fits: ({ v }) =>
      threats(v, v.player).length > 0 || Object.values(v.board).filter((t) => t?.owner === v.player && !t.root).length >= 3,
    text: ({ say }) => t('ui.coach.tip.connection', 'Cut off from your home, a tile {withers}. Guard each {weak}.', { withers: say('withers'), weak: say('weak spot') }),
  },
  cutting: {
    active: () => true,
    fits: ({ v, ranked }) => boardFacts(ranked).some((m) => m.botCut > 0) || threats(v, other(v.player)).length > 0,
    text: ({ say }) => t('ui.coach.tip.cutting', 'Take an {opp} {weak} and everything behind it {withers}.', { opp: OPP.noun, weak: say('weak spot'), withers: say('withers') }),
  },
  leftovers: {
    active: ({ v }) => rotOn(v),
    fits: ({ v }) => v.phase === 'DISCARD' || v.phase === 'KNOCK',
    text: ({ v, say }) => t('ui.coach.tip.leftovers', '{left} over {n} at turn end make edge tiles {rot}.', { left: say('leftover cards'), n: v.config.rotThreshold, rot: say('rot') }),
  },
  knock: {
    active: ({ v }) => knockOn(v),
    fits: ({ v }) => v.phase === 'KNOCK',
    text: ({ v, say }) => t('ui.coach.tip.knock', 'Leftovers of {n} or less? You can {knock}: {opp} gets one last turn.', { n: v.config.knockDeadwood, knock: say('knock'), opp: OPP.the }),
  },
  // v0.5: Fruit and Strengthen are mentioned only when they matter: one of the best few
  // moves right now, and a good one.
  fruit: {
    active: ({ v }) => fruitOn(v),
    fits: ({ ranked }) => ranked.slice(0, 3).some((r) => r.facts.kind === 'fruit' && r.score > 0),
    text: () => FRUIT.tip,
  },
  strengthen: {
    active: ({ v }) => v.config.allowStrengthen && v.config.sproutsPerTurn > 0,
    fits: ({ ranked }) => ranked.slice(0, 3).some((r) => r.facts.kind === 'strengthen' && r.score > 0),
    text: () => t('ui.coach.tip.strengthen', 'Strengthen: a higher card on your own tile makes it harder to overgrow (no points).'),
  },
  strangle: {
    active: () => true,
    fits: ({ v, ranked }) => {
      const target = rootCoord(other(v.player), v.config.rootStyle, v.config.boardRadius);
      const near = Object.entries(v.board).some(([k, t]) => t?.owner === v.player && hexDistance(parseKey(k), target) <= 2);
      return near || boardFacts(ranked).some((m) => m.wins);
    },
    text: ({ say }) => t('ui.coach.tip.strangle', 'Win at once: {strangle} {opp} home.', { strangle: say('strangle'), opp: OPP.theirs }),
  },
  planning: {
    active: () => true,
    fits: ({ ranked }) => boardFacts(ranked).some((m) => m.exposureAfter > m.exposureBefore),
    text: () => t('ui.coach.tip.planning', 'Before a big move, check what {opp} could cut back.', { opp: OPP.the }),
  },
};

const nextTip = (c: Ctx, taught: readonly TipId[]): TipId | null =>
  TIP_ORDER.find((id) => !taught.includes(id) && TIPS[id].active(c) && TIPS[id].fits(c)) ?? null;

// ---------- why ----------

const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

const whyBoard = (c: Ctx, m: MoveFacts, isFruit: boolean): string[] => {
  const { say, v } = c;
  const reasons: string[] = [];
  if (m.wins) reasons.push(t('ui.coach.why.wins', 'This surrounds {opp} home, so you win right away.', { opp: OPP.theirs }));
  if (isFruit) reasons.push(t('ui.coach.why.bomb', 'A Fruit card removes an {opp} tile, whatever its number.', { opp: OPP.noun }));
  if (m.botCut > 0) reasons.push(t('ui.coach.why.cut', 'This cuts {opp} link and removes {n} of their tiles.', { opp: OPP.theirs, n: m.taken + m.botCut }));
  if (m.exposureAfter < m.exposureBefore) reasons.push(t('ui.coach.why.fixes', 'This fixes a {weak} in your network.', { weak: say('weak spot') }));
  if (m.taken > 0 && m.botCut === 0 && !isFruit) reasons.push(t('ui.coach.why.overgrows', 'This overgrows {count}.', { count: plural(m.taken, t('ui.coach.oneWeakTile', 'a weaker {opp} tile', { opp: OPP.noun }), t('ui.coach.manyWeakTiles', 'weaker {opp} tiles', { opp: OPP.noun })) }));
  if (m.onRich > 0) {
    reasons.push(m.onRich === 1 ? t('ui.coach.why.goldOne', 'This {gold} is worth 2 points.', { gold: say('gold hex') }) : t('ui.coach.why.goldMany', 'These {n} gold hexes are worth 2 points each.', { n: m.onRich }));
  }
  if (m.placed > 0) reasons.push(t('ui.coach.why.placed', 'This grows {n} new tiles for you.', { n: m.placed }));
  const why = reasons.slice(0, 2);
  if (m.exposureAfter > m.exposureBefore && m.weakSpot) {
    const spot = hexName(parseKey(m.weakSpot), v.config.boardRadius);
    why.splice(1, 1, t('ui.coach.why.watch', 'Watch out: if {opp} cuts at {spot}, you lose {n} tiles.', { opp: OPP.the, spot, n: m.exposureAfter }));
  }
  return why;
};

const whyFor = (c: Ctx, best: Scored): string[] => {
  const { v, say, ranked } = c;
  const f = best.facts;
  switch (f.kind) {
    case 'bloom':
    case 'fruit':
    case 'megaBomb':
      return whyBoard(c, f.move, f.kind === 'fruit' || f.kind === 'megaBomb');
    case 'sprout':
      return f.move.placed > 0 && !f.move.taken && !f.move.botCut && !f.move.onRich && !f.move.wins
        ? [SPROUT.coachWhy(say('combo')), ...whyBoard(c, f.move, false).slice(1)]
        : whyBoard(c, f.move, false);
    case 'strengthen':
      return [t('ui.coach.why.strengthen', 'Strengthen your {from} to a {to}: {opp} is much less likely to hold a card that can overgrow it. It scores no points and does not stop a cut{orBomb}.', { from: f.from, to: f.to, opp: OPP.the, orBomb: v.config.fruitCardCount > 0 ? t('ui.coach.orBomb', ' or a Fruit card') : '' })];
    case 'draw': {
      const top = v.discard.at(-1);
      if (f.from === 'discard' && top && f.completesCombo) {
        return [t('ui.coach.why.pileCombo', 'The {card} on the {pile} fits with your {cards} to make a {combo}.', { card: cardName(top), pile: say('throw pile'), cards: f.comboWith.map(cardName).join(t('ui.common.and', ' and ')), combo: say('combo') })];
      }
      if (f.from === 'discard') return [t('ui.coach.why.deckEmpty', 'The {deck} is empty, so take the card from the {pile}.', { deck: say('deck'), pile: say('throw pile') })];
      if (!top) return [t('ui.coach.why.drawNew', 'Draw a new card from the {deck}.', { deck: say('deck') })];
      return [t('ui.coach.why.pileNoCombo', 'The {card} on the {pile} makes no {combo}, so draw from the {deck}.', { card: cardName(top), pile: say('throw pile'), combo: say('combo'), deck: say('deck') })];
    }
    case 'discard': {
      const name = cardName(f.card);
      const loose = bestMeldPartition(v.hand).leftover.length;
      const why: string[] = [];
      if (f.fitsCombo) why.push(t('ui.coach.why.discardFits', 'Every card fits a {combo}, so let go of the {card}: it hurts your combos least.', { combo: say('combo'), card: name }));
      else if (loose >= 3) why.push(t('ui.coach.why.discardLoose', 'You are holding {n} cards that do not fit a {combo}. Throwing the {card} keeps your hand tidy.', { n: loose, combo: say('combo'), card: name }));
      else why.push(t('ui.coach.why.discardNoFit', 'The {card} does not fit any {combo}, so it is the easiest card to let go.', { card: name, combo: say('combo') }));
      if (rotOn(v) && f.card.rank >= 7 && !f.fitsCombo) why.push(t('ui.coach.why.discardHigh', 'It is a high card, so this also keeps your {left} low.', { left: say('leftover cards') }));
      return why;
    }
    case 'endAct': {
      if (!f.bloomsAvailable) return [t('ui.coach.why.endNoCombo', 'You have no {combo} left to play. Keep collecting matching cards.', { combo: say('combo') })];
      const bestMeld = boardFacts(ranked).find(() => true);
      if (bestMeld && bestMeld.exposureAfter > bestMeld.exposureBefore) {
        return [t('ui.coach.why.endWeak', 'Your {combo} would leave a {weak} {opp} could cut. Keep it for a better moment.', { combo: say('combo'), weak: say('weak spot'), opp: OPP.the })];
      }
      return [t('ui.coach.why.endNoHelp', 'Your {combo} would not help much right now. Keep it for later.', { combo: say('combo') })];
    }
    case 'knock':
      return [t('ui.coach.why.knockLead', 'You lead by {n} points and {opp} has no big cut on you, so knocking now should win.', { n: f.lead, opp: OPP.the })];
    case 'continue': {
      if (!rotOn(v) && !knockOn(v)) return [t('ui.coach.why.endPlain', 'End your turn and refill your hand.')];
      const rc = rotCount(v.myDeadwood, v.config);
      const why: string[] = [];
      if (rc > 0) why.push(t('ui.coach.why.leftoverRot', 'Your {left} add up to {n}, so {rc} of your edge tiles will {rot}.', { left: say('leftover cards'), n: v.myDeadwood, rc, rot: say('rot') }));
      why.push(v.myDeadwood <= v.config.knockDeadwood ? t('ui.coach.why.knockRisky', 'Knocking now is risky because your lead is small.') : t('ui.coach.why.endPlain', 'End your turn and refill your hand.'));
      return why;
    }
    case 'rotPick':
      return f.botLoss > 1
        ? [t('ui.coach.why.rotMultiple', 'Removing this tile also cuts off {n} more {opp} tiles.', { n: f.botLoss - 1, opp: OPP.noun })]
        : [t('ui.coach.why.rotAny', 'These {opp} tiles are all equally weak, so any of them is fine.', { opp: OPP.noun })];
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
  goal: t('ui.coach.bullet.goal', 'Keep every tile joined to your home.'),
  draw: t('ui.coach.bullet.draw', 'Take from the throw pile only if it makes a combo.'),
  combos: t('ui.coach.bullet.combos', 'Cards that match or follow on can bloom.'),
  sprout: t('ui.coach.bullet.sprout', 'No combo? Sprout one card as one tile.'),
  strength: t('ui.coach.bullet.strength', 'A stronger tile can overgrow a weaker {opp} tile.', { opp: OPP.noun }),
  gold: t('ui.coach.bullet.gold', 'Gold hexes are worth 2 points.'),
  connection: t('ui.coach.bullet.connection', 'Protect weak spots that hold up many tiles.'),
  cutting: t('ui.coach.bullet.cutting', 'Cut {opp} weak spots to make their tiles wither.', { opp: OPP.theirs }),
  leftovers: t('ui.coach.bullet.leftovers', 'Keep your leftover cards low to avoid rot.'),
  knock: t('ui.coach.bullet.knock', 'Knock only when you are clearly ahead.'),
  fruit: t('ui.coach.bullet.fruit', 'Save Fruit cards for an {opp} tile you cannot overgrow.', { opp: OPP.noun }),
  strengthen: t('ui.coach.bullet.strengthen', 'Strengthen the tile that holds many others up.'),
  strangle: t('ui.coach.bullet.strangle', 'Surround {opp} home to win at once.', { opp: OPP.theirs }),
  planning: t('ui.coach.bullet.planning', 'Before a big move, check what {opp} could cut.', { opp: OPP.the }),
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
  'strengthen',
];
/** The goodbye message at COACH_STEPS: three things the player used (only rules that are on; never Fruit cards). */
export const coachSummary = (taught: readonly TipId[], config: View['config']): { title: string; bullets: string[] } => {
  const allowed = (id: TipId) =>
    (id !== 'leftovers' || config.rotEnabled) && (id !== 'knock' || config.knockEnabled) && id !== 'fruit' && (id !== 'strengthen' || config.allowStrengthen);
  const used = SUMMARY_PRIORITY.filter((id) => taught.includes(id) && allowed(id));
  const fill = (['connection', 'cutting', 'combos', 'goal'] as TipId[]).filter((id) => !used.includes(id));
  return {
    title: "You're on your own now. Here's what to remember:",
    bullets: [...used, ...fill].slice(0, 3).map((id) => (id === 'sprout' ? SPROUT.bullet : BULLETS[id])),
  };
};
