// Plain-language names for hexes, cards and moves.
import { SUIT_NAMES, coordKey } from '../engine/index.js';
import type { Action, Card, Coord, View } from '../engine/index.js';
import { simulate } from '../bots/evaluate.js';
import type { Simulation } from '../bots/evaluate.js';
import { hexName } from './names-core.js';
import { BLOOM, FRUIT, OPP, SPROUT } from '../strings.js';
import { t, tPlural } from '../i18n/index.js';

export { hexName };

export const SUIT_ICONS = ['🌿', '🪨', '💧', '🔥'] as const;

/** Suit names are player copy, not engine identifiers. */
export const suitName = (suit: Card['suit']): string =>
  suit === null ? FRUIT.card
    : t(`ui.suit.${suit}`, SUIT_NAMES[suit]);

export const cardName = (c: Card): string => (c.suit === null ? FRUIT.card : `${suitName(c.suit)} ${c.rank}`);

const effects = (sim: Simulation): string => {
  const parts: string[] = [];
  if (sim.taken > 0) parts.push(tPlural('ui.names.overgrowing', { one: 'overgrowing {n} {opp} spot', other: 'overgrowing {n} {opp} spots' }, sim.taken, { opp: OPP.noun }));
  if (sim.botCut > 0) parts.push(sim.taken > 0 ? t('ui.names.cuttingMore', 'cutting off {n} more', { n: sim.botCut }) : tPlural('ui.names.cuttingTiles', { one: 'cutting off {n} {opp} tile', other: 'cutting off {n} {opp} tiles' }, sim.botCut, { opp: OPP.noun }));
  return parts.length ? `, ${parts.join(t('ui.common.and', ' and '))}` : '';
};

const pointsText = (sim: Simulation): string => {
  if (sim.wins) return t('ui.names.wins', ' — this wins the game!');
  const sign = sim.points >= 0 ? '+' : '−';
  return ` (${sign}${tPlural('ui.count.points', { one: '{n} point', other: '{n} points' }, Math.abs(sim.points))})`;
};

/** One plain sentence describing a move. */
export const moveSentence = (v: View, a: Action): string => {
  const R = v.config.boardRadius;
  const hn = (c: Coord) => hexName(c, R);
  switch (a.t) {
    case 'Draw':
      return a.from === 'deck' ? t('ui.names.drawCard', 'Draw a card from the deck') : t('ui.names.takeFromPile', 'Take the {card} from the throw pile', { card: cardName(v.discard.at(-1)!) });
    case 'Bloom': {
      const sim = simulate(v, a)!;
      const names = a.hexes.map(hn).sort((x, y) => x[0]!.localeCompare(y[0]!) || Number(x.slice(1)) - Number(y.slice(1)));
      return `${BLOOM.suggest(a.hexes.length, names.join(', '))}${effects(sim)}${pointsText(sim)}`;
    }
    case 'Sprout': {
      const sim = simulate(v, a)!;
      const card = v.hand.find((c) => c.id === a.card)!;
      return `${SPROUT.suggest(hn(a.coord), cardName(card))}${effects(sim)}${pointsText(sim)}`;
    }
    case 'PlayFruit': {
      const sim = simulate(v, a)!;
      const more = sim.botCut > 0 ? t('ui.names.cutMoreShort', ', cutting off {n} more', { n: sim.botCut }) : '';
      return `${FRUIT.suggest(hn(a.target), v.board[coordKey(a.target)]!.strength)}${more}${pointsText(sim)}`;
    }
    case 'MegaBomb': {
      const sim = simulate(v,a)!;
      return `${tPlural('ui.names.blast', { one: 'Blast at {hex}, removing {n} {opp} tile', other: 'Blast at {hex}, removing {n} {opp} tiles' }, sim.taken, { hex: hn(a.target), opp: OPP.noun })}${pointsText(sim)}`;
    }
    case 'EndAct':
      return t('ui.names.donePlaying', "I'm done playing cards");
    case 'Discard':
      return t('ui.names.throwCard', 'Throw {card}', { card: cardName(v.hand.find((c) => c.id === a.card)!) });
    case 'Knock':
      return t('ui.names.knock', 'Knock: {opp} gets one last turn, then the higher score wins', { opp: OPP.the });
    case 'Continue':
      return t('ui.names.endTurn', 'End my turn');
    case 'RotPick':
      return t('ui.names.rot', 'Let {opp} tile at {hex} rot', { opp: OPP.theirs, hex: hn(a.coord) });
  }
};

/** Hexes a move touches, for highlighting and for the hex filter. */
export const moveHexes = (a: Action): Coord[] => {
  switch (a.t) {
    case 'Bloom':
      return a.hexes;
    case 'Sprout':
      return [a.coord];
    case 'PlayFruit':
      return [a.target];
    case 'MegaBomb':
      return [a.target];
    case 'RotPick':
      return [a.coord];
    default:
      return [];
  }
};

/** Card ids a move uses. */
export const moveCards = (a: Action): number[] => {
  if (a.t === 'Bloom' || a.t === 'MegaBomb') return a.cards;
  if (a.t === 'Sprout' || a.t === 'PlayFruit') return [a.card];
  if (a.t === 'Discard') return [a.card];
  return [];
};

export const touchesHex = (a: Action, key: string): boolean => moveHexes(a).some((c) => coordKey(c) === key);
