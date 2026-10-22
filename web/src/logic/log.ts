// Plain sentences for the history list and the result line. Never reveals the bot's
// hidden cards (it only names cards the bot has already shown by playing them).
import { coordKey, viewFor } from '../../../src/engine/index.js';
import type { Action, Coord, EndReason, Event, GameResult, Player, State } from '../../../src/engine/index.js';
import { cardName, hexName, moveSentence } from '../../../src/playtest/names.js';
import { BLAST, BLOOM, FRUIT, OPP, RESULT, SPROUT } from '../../../src/strings.js';
import { t, tPlural } from '../../../src/i18n/index.js';

const other = (p: Player): Player => (p === 0 ? 1 : 0);

/**
 * The result the finish screen can be handed: the engine's end reasons plus the online-only
 * `timeout` / `resigned` (see `server/src/protocol.ts`). Offline and online share the same
 * title and reason sentences, so the two finish screens can never drift apart again.
 */
export type FinishReason = EndReason | 'timeout' | 'resigned';
export type FinishResult = Omit<GameResult, 'reason'> & { reason: FinishReason };

export const resultTitle = (r: FinishResult, me: Player): string =>
  r.winner === null ? RESULT.draw : r.winner === me ? RESULT.won : RESULT.lost;

export const resultReason = (r: FinishResult, me: Player): string => {
  const won = r.winner === me;
  const strengthNote =
    r.winner === null && r.scores[0] === r.scores[1]
      ? RESULT.trueDraw
      : r.strengths && r.scores[0] === r.scores[1] && r.winner !== null
        ? RESULT.decidedByStrength
        : '';
  switch (r.reason) {
    case 'double_strangle':
      return RESULT.doubleStrangle;
    case 'strangle':
      return won ? RESULT.strangleWon : RESULT.strangleLost;
    case 'knock':
      if (!r.undercut) return won ? RESULT.knockAheadWon : RESULT.knockAheadLost;
      return other(r.winner!) === me ? RESULT.knockUndercutWon : RESULT.knockUndercutLost;
    case 'turn_limit':
      return `${RESULT.turnLimit}${strengthNote}`;
    case 'deck_exhaustion':
      return `${RESULT.deckEnd}${strengthNote}`;
    case 'timeout':
      return won ? RESULT.timeoutWon : RESULT.timeoutLost;
    case 'resigned':
      return won ? RESULT.resignedWon : RESULT.resignedLost;
  }
};

const resolution = (s: State, me: Player): string => {
  const r = s.lastResolution;
  if (!r) return '';
  const parts: string[] = [];
  if (r.overgrown.length) parts.push(tPlural('ui.log.overgrew', { one: 'overgrew {n} spot', other: 'overgrew {n} spots' }, r.overgrown.length));
  for (const cut of r.severed) parts.push(cut.player === me ? t('ui.log.cutMine', '{n} of your tiles were cut off', { n: cut.coords.length }) : t('ui.log.cutTheirs', '{n} of your opponent’s tiles were cut off', { n: cut.coords.length }));
  return parts.length ? ` — ${parts.join(', ')}` : '';
};

/** One history line for an action. */
export const describe = (before: State, a: Action, after: State, me: Player): string => {
  const R = before.config.boardRadius;
  const hn = (c: Coord) => hexName(c, R);
  const placed = a.t === 'Bloom' || a.t === 'MegaBomb' || a.t === 'Sprout' || a.t === 'PlayFruit';
  const tail = placed && after.lastResolution !== before.lastResolution ? resolution(after, me) : '';
  if (before.actor === me) {
    if (a.t === 'Bloom') return `${BLOOM.youDid(a.cards.length)}${tail}`;
    if (a.t === 'Sprout') return `${SPROUT.youDid(hn(a.coord))}${tail}`;
    return t('ui.log.youDid', 'You: {move}', { move: moveSentence(viewFor(before, me), a) });
  }
  const hand = before.hands[before.actor];
  const name = (id: number) => cardName(hand.find((c) => c.id === id)!);
  switch (a.t) {
    case 'Draw':
      return a.from === 'deck' ? t('ui.log.oppDrew', '{opp} drew a card', { opp: OPP.The }) : t('ui.log.oppTook', '{opp} took the {card}', { opp: OPP.The, card: cardName(before.discard.at(-1)!) });
    case 'Bloom':
      return `${BLOOM.oppDid(a.cards.length)} (${a.cards.map(name).join(', ')})${tail}`;
    case 'MegaBomb':
      return `${BLAST.oppDid(hn(a.target))}${tail}`;
    case 'Sprout':
      return `${SPROUT.oppDid(name(a.card), hn(a.coord))}${tail}`;
    case 'EndAct':
      return t('ui.log.oppFinished', '{opp} finished playing cards', { opp: OPP.The });
    case 'Discard':
      return t('ui.log.oppThrew', '{opp} threw away {card}', { opp: OPP.The, card: name(a.card) });
    case 'Knock':
      return t('ui.log.oppKnocked', '{opp} knocked: you get one last turn', { opp: OPP.The });
    case 'Continue':
      return t('ui.log.oppEnded', '{opp} ended their turn', { opp: OPP.The });
    case 'PlayFruit':
      return `${FRUIT.oppDid(before.board[coordKey(a.target)]?.strength ?? 0)} ${t('ui.log.atHex', 'at {hex}', { hex: hn(a.target) })}${tail}`;
    case 'RotPick':
      return t('ui.log.oppRot', '{opp} chose your tile at {hex} to rot', { opp: OPP.The, hex: hn(a.coord) });
  }
};

const count = (n: number) => tPlural('ui.count.tiles', { one: '{n} tile', other: '{n} tiles' }, n);

/** UX pass (result screen): what I did with the one-card move this game, or null if nothing. */
export const moveSummary = (history: readonly Event[], me: Player): string | null => {
  const grown = history.filter((e) => e.t === 'Sprout' && e.player === me).length;
  const strong = history.filter((e) => e.t === 'Strengthen' && e.player === me).length;
  const parts: string[] = [];
  if (grown) parts.push(t('ui.log.sprouted', 'sprouted {count}', { count: count(grown) }));
  if (strong) parts.push(t('ui.log.strengthened', 'strengthened {count}', { count: count(strong) }));
  return parts.length ? t('ui.log.youSummary', 'You {parts}.', { parts: parts.join(t('ui.common.and', ' and ')) }) : null;
};
