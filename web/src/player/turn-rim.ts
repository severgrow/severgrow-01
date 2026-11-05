/** A state indicator, deliberately independent of the queued turn pill/sound/replay. */
import type { Player } from '../../../src/engine/index.js';
import { LIGHT_TONES } from './light.js';

type Turn = { readonly phase: string; readonly turnPlayer: Player };
type ConfirmedOnline = { status: string; serverPhase: string; view: { turnPlayer: Player } };
/** Drafts may show a provisional win; the confirmed server phase remains authoritative. */
export const confirmedTurn = (online: ConfirmedOnline): Turn | null => online.status === 'active'
  ? { phase: online.serverPhase, turnPlayer: online.view.turnPlayer } : null;
export type TurnRimState = 'you' | 'opponent' | 'none';
export const turnRimState = (turn: Turn | null, me: Player): TurnRimState =>
  !turn || turn.phase === 'GAME_OVER' ? 'none' : turn.turnPlayer === me ? 'you' : 'opponent';

/** One style publication on mount; subsequent updates write only when ownership changes. */
export function mountTurnRim(target: { dataset: { turn?: string }; style: Pick<CSSStyleDeclaration, 'setProperty'> }) {
  target.style.setProperty('--turn-rim-ink', LIGHT_TONES.amber.core);
  return (turn: Turn | null, me: Player): void => {
    const next = turnRimState(turn, me);
    if (target.dataset.turn !== next) target.dataset.turn = next;
  };
}
