// Plain-language names for hexes, cards and moves.
import { DIRECTIONS, SUIT_NAMES, coordKey, hexDistance, rootCoord } from '../engine/index.js';
import type { Action, Card, Coord, Player, View } from '../engine/index.js';
import { simulate } from '../bots/evaluate.js';
import type { Simulation } from '../bots/evaluate.js';
import { hexName } from './names-core.js';
import { OPP, SPROUT } from '../strings.js';

export { hexName };

export const SUIT_ICONS = ['🌿', '🪨', '💧', '🔥'] as const;
export const cardName = (c: Card): string => `${SUIT_NAMES[c.suit]} ${c.rank}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const effects = (sim: Simulation): string => {
  const parts: string[] = [];
  if (sim.taken > 0) parts.push(`taking ${plural(sim.taken, `${OPP.noun} tile`)}`);
  if (sim.botCut > 0) parts.push(sim.taken > 0 ? `cutting off ${sim.botCut} more` : `cutting off ${plural(sim.botCut, `${OPP.noun} tile`)}`);
  return parts.length ? `, ${parts.join(' and ')}` : '';
};

const pointsText = (sim: Simulation): string => {
  if (sim.wins) return ' — this wins the game!';
  const sign = sim.points >= 0 ? '+' : '−';
  return ` (${sign}${plural(Math.abs(sim.points), 'point')})`;
};

/** One plain sentence describing a move. */
export const moveSentence = (v: View, a: Action): string => {
  const R = v.config.boardRadius;
  const hn = (c: Coord) => hexName(c, R);
  switch (a.t) {
    case 'Draw':
      return a.from === 'deck' ? 'Draw a card from the deck' : `Take the ${cardName(v.discard.at(-1)!)} from the throw pile`;
    case 'MeldRun': {
      const sim = simulate(v, a)!;
      const opp: Player = v.player === 0 ? 1 : 0;
      const target = rootCoord(opp, v.config.rootStyle, R);
      const d = DIRECTIONS[a.dir]!;
      const tip = { q: a.start.q + d.q * (a.cards.length - 1), r: a.start.r + d.r * (a.cards.length - 1) };
      const before = hexDistance(a.start, target);
      const after = hexDistance(tip, target);
      const way = after < before ? `toward ${OPP.the}` : after > before ? `away from ${OPP.the}` : 'sideways';
      return `Grow a line of ${a.cards.length} tiles from ${hn(a.start)} ${way}${effects(sim)}${pointsText(sim)}`;
    }
    case 'MeldSet': {
      const sim = simulate(v, a)!;
      const names = a.hexes.map(hn).sort((x, y) => x[0]!.localeCompare(y[0]!) || Number(x.slice(1)) - Number(y.slice(1)));
      return `Grow a clump of ${a.hexes.length} tiles at ${names.join(', ')}${effects(sim)}${pointsText(sim)}`;
    }
    case 'Sprout': {
      const sim = simulate(v, a)!;
      const card = v.hand.find((c) => c.id === a.card)!;
      return `${SPROUT.suggest(hn(a.coord), cardName(card))}${effects(sim)}${pointsText(sim)}`;
    }
    case 'Fruit': {
      const sim = simulate(v, a)!;
      const more = sim.botCut > 0 ? `, cutting off ${sim.botCut} more` : '';
      return `Give up 3 of your tiles to destroy ${OPP.theirs} tile at ${hn(a.target)}${more}${pointsText(sim)}`;
    }
    case 'EndAct':
      return "I'm done playing cards";
    case 'Discard':
      return `Throw ${cardName(v.hand.find((c) => c.id === a.card)!)}`;
    case 'Knock':
      return `Knock: ${OPP.the} gets one last turn, then the higher score wins`;
    case 'Continue':
      return 'End my turn';
    case 'RotPick':
      return `Let ${OPP.theirs} tile at ${hn(a.coord)} rot`;
  }
};

/** Hexes a move touches, for highlighting and for the hex filter. */
export const moveHexes = (a: Action): Coord[] => {
  switch (a.t) {
    case 'MeldRun':
      return Array.from({ length: a.cards.length }, (_, i) => ({
        q: a.start.q + DIRECTIONS[a.dir]!.q * i,
        r: a.start.r + DIRECTIONS[a.dir]!.r * i,
      }));
    case 'MeldSet':
      return a.hexes;
    case 'Sprout':
      return [a.coord];
    case 'Fruit':
      return [...a.sacrifice, a.target];
    case 'RotPick':
      return [a.coord];
    default:
      return [];
  }
};

/** Card ids a move uses. */
export const moveCards = (a: Action): number[] => {
  if (a.t === 'MeldRun' || a.t === 'MeldSet') return a.cards;
  if (a.t === 'Sprout') return [a.card];
  if (a.t === 'Discard') return [a.card];
  return [];
};

export const touchesHex = (a: Action, key: string): boolean => moveHexes(a).some((c) => coordKey(c) === key);
