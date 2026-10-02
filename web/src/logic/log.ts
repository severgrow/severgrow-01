// Plain sentences for the history list and the result line. Never reveals the bot's
// hidden cards (it only names cards the bot has already shown by playing them).
import { viewFor } from '../../../src/engine/index.js';
import type { Action, Coord, Event, GameResult, Player, State } from '../../../src/engine/index.js';
import { cardName, hexName, moveSentence } from '../../../src/playtest/names.js';
import { OPP, moveWords } from '../../../src/strings.js';

const other = (p: Player): Player => (p === 0 ? 1 : 0);

export const resultTitle = (r: GameResult, me: Player): string =>
  r.winner === null ? 'A draw' : r.winner === me ? 'You won' : 'You lost';

export const resultReason = (r: GameResult, me: Player): string => {
  const won = r.winner === me;
  const tie = r.scores[0] === r.scores[1] ? ` A tie goes to ${OPP.the}.` : '';
  switch (r.reason) {
    case 'double_strangle':
      return 'Both roots were surrounded at once.';
    case 'strangle':
      return won ? `You surrounded ${OPP.theirs} root.` : `${OPP.The} surrounded your root.`;
    case 'knock':
      if (!r.undercut) return won ? 'You knocked and stayed ahead.' : `${OPP.The} knocked and stayed ahead.`;
      return other(r.winner!) === me ? 'You knocked but did not finish ahead.' : `${OPP.The} knocked and you held on.`;
    case 'turn_limit':
      return `Time's up: 30 turns each. The higher score wins.${tie}`;
    case 'deck_exhaustion':
      return `The deck ran out. The higher score wins.${tie}`;
  }
};

const resolution = (s: State, me: Player): string => {
  const r = s.lastResolution;
  if (!r) return '';
  const parts: string[] = [];
  if (r.overgrown.length) parts.push(`took over ${r.overgrown.length} tile${r.overgrown.length > 1 ? 's' : ''}`);
  for (const cut of r.severed) parts.push(`${cut.coords.length} of ${cut.player === me ? 'your' : OPP.theirs} tiles were cut off`);
  return parts.length ? ` — ${parts.join(', ')}` : '';
};

/** One history line for an action. */
export const describe = (before: State, a: Action, after: State, me: Player): string => {
  const R = before.config.boardRadius;
  const hn = (c: Coord) => hexName(c, R);
  const placed = a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout';
  const tail = placed && after.lastResolution !== before.lastResolution ? resolution(after, me) : '';
  if (before.actor === me) {
    if (a.t === 'MeldRun') return `You grew a line of ${a.cards.length}${tail}`;
    if (a.t === 'MeldSet') return `You grew a clump of ${a.cards.length}${tail}`;
    if (a.t === 'Sprout') return `${moveWords(before.config).youDid(hn(a.coord))}${tail}`;
    return `You: ${moveSentence(viewFor(before, me), a)}`;
  }
  const hand = before.hands[before.actor];
  const name = (id: number) => cardName(hand.find((c) => c.id === id)!);
  switch (a.t) {
    case 'Draw':
      return a.from === 'deck' ? `${OPP.The} drew a card` : `${OPP.The} took the ${cardName(before.discard.at(-1)!)}`;
    case 'MeldRun':
      return `${OPP.The} grew a line of ${a.cards.length} from ${hn(a.start)} (${a.cards.map(name).join(', ')})${tail}`;
    case 'MeldSet':
      return `${OPP.The} grew a clump of ${a.cards.length} (${a.cards.map(name).join(', ')})${tail}`;
    case 'Sprout':
      return `${moveWords(before.config).oppDid(name(a.card), hn(a.coord))}${tail}`;
    case 'EndAct':
      return `${OPP.The} finished playing cards`;
    case 'Discard':
      return `${OPP.The} threw away ${name(a.card)}`;
    case 'Knock':
      return `${OPP.The} knocked: you get one last turn`;
    case 'Continue':
      return `${OPP.The} ended their turn`;
    case 'Fruit':
      return `${OPP.The} used a fruit on ${hn(a.target)}`;
    case 'RotPick':
      return `${OPP.The} chose your tile at ${hn(a.coord)} to rot`;
  }
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** UX pass (result screen): what I did with the one-card move this game, or null if nothing. */
export const moveSummary = (history: readonly Event[], me: Player, config: { ruleset?: string }): string | null => {
  const grown = history.filter((e) => e.t === 'Sprout' && e.player === me).length;
  const strong = history.filter((e) => e.t === 'Strengthen' && e.player === me).length;
  const parts: string[] = [];
  if (grown) parts.push(config.ruleset === 'seed' ? `planted ${count(grown, 'seed', 'seeds')}` : `sprouted ${count(grown, 'tile', 'tiles')}`);
  if (strong) parts.push(`strengthened ${count(strong, 'tile', 'tiles')}`);
  return parts.length ? `You ${parts.join(' and ')}.` : null;
};
