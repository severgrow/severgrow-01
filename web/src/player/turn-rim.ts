/** A state indicator, deliberately independent of the queued turn pill/sound/replay. */
import type { Player } from '../../../src/engine/index.js';
import { LIGHT_TONES } from './light.js';

type Turn = { readonly phase: string; readonly turnPlayer: Player };
type ConfirmedOnline = { status: string; serverPhase: string; view: { turnPlayer: Player } };
/** Drafts may show a provisional win; the confirmed server phase remains authoritative. */
export const confirmedTurn = (online: ConfirmedOnline): Turn | null => online.status === 'active'
  ? { phase: online.serverPhase, turnPlayer: online.view.turnPlayer } : null;

/**
 * Everything that must be true for a tap to be MY move right now — one honest answer, no DOM.
 *
 * These are INPUT signals, in the same sense the tap handlers read them:
 *  - `actor` is the engine's acting seat (`state.actor`, not merely the turn owner): ROT_PICK hands
 *    the tap to the other seat, so ownership alone cannot answer "can I move".
 *  - `inputOpen` is the page's own gate for this mode, passed in as a value (the module never
 *    imports the game loop): offline `!blocking()` (`main.ts`, `blocking = busy && !playThrough`),
 *    online `!onlineGateShut()` (the replay gate).
 *  - `ritualHold` / `covered` / `paused` are the board being unreachable for a reason other than the
 *    turn: the pre-game ceremony, a sheet or a lesson's input lock, and the pause.
 *
 * Ownership of the turn is NOT part of this: it is answered separately by `turnRimState`.
 */
export type TapAvailability = {
  /** Whose move the engine says it is (`state.actor` / the server's confirmed actor). */
  readonly actor: Player | null;
  readonly me: Player;
  /** The phase on screen. Only an actionable one can accept a tap; GAME_OVER never does. */
  readonly phase: string | null;
  /** The mode's input gate is open (no replay/opponent animation/veil in front of the board). */
  readonly inputOpen: boolean;
  /** The pre-game ceremony still owns the board (`pregameHold`, the starter ritual). */
  readonly ritualHold: boolean;
  /** A sheet covers the board, or a lesson step locks its input. */
  readonly covered: boolean;
  /** The match is paused. */
  readonly paused: boolean;
};

export const moveTappable = (a: TapAvailability): boolean =>
  a.phase !== null
  && a.phase !== 'GAME_OVER'
  && a.actor === a.me
  && a.inputOpen
  && !a.ritualHold
  && !a.covered
  && !a.paused;

export type TurnRimState = 'you' | 'opponent' | 'none';

/**
 * The rim's one answer. `tappable` is `moveTappable(...)`: the light means "you can move NOW", so a
 * turn I own while the board is still showing something else stays dark (`none`) until it is
 * genuinely tappable. The opponent's side is only ever the quiet trace, never lit.
 */
export const turnRimState = (turn: Turn | null, me: Player, tappable: boolean): TurnRimState =>
  !turn || turn.phase === 'GAME_OVER' ? 'none' : turn.turnPlayer !== me ? 'opponent' : tappable ? 'you' : 'none';

/** One style publication on mount; subsequent updates write only when the rim's state changes. */
export function mountTurnRim(target: { dataset: { turn?: string }; style: Pick<CSSStyleDeclaration, 'setProperty'> }) {
  target.style.setProperty('--turn-rim-ink', LIGHT_TONES.amber.core);
  return (turn: Turn | null, me: Player, tappable: boolean): void => {
    const next = turnRimState(turn, me, tappable);
    if (target.dataset.turn !== next) target.dataset.turn = next;
  };
}
