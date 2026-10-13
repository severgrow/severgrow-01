// Phase 5 — bridge OnlineDriver snapshots to the shared board/hand UI (perspective applied).

import type { Action, Event, View } from '../../../src/engine/index.js';
import { ONLINE, RESULT } from '../../../src/strings.js';
import type { OnlineDriver } from './driver.js';
import { deadlineUrgency, fillDuelHud } from './duel-hud.js';
import type { DuelHudModel, TurnState } from './duel-hud.js';
import type { MatchDriverSnapshot } from './types.js';

export type DuelUiModel = {
  seat: 0 | 1;
  /** Engine view (server coords) — drafts / legal / send. */
  view: View;
  /** Screen view (mapped hexes, Me=moss) — paint / camera. */
  screenView: View;
  legal: Action[];
  screenLegal: Action[];
  screenEvents: Event[];
  myTurn: boolean;
  /** The server's real turn state (never the gate) — the one source of the HUD turn word. */
  turn: TurnState;
  hasDraft: boolean;
  canUndo: boolean;
  coachOff: true;
  hiddenDeckHintsOff: true;
  scoreMe: number;
  scoreOpp: number;
  scoreLabel: string;
  hud: DuelHudModel;
};

/**
 * The server's real turn state for this seat. `revealing` only distinguishes the third state; it
 * never turns a real "it is my turn" into "theirs" (which is what made both phones read the same
 * words). `finished` wins over everything.
 */
export const turnStateFrom = (snap: MatchDriverSnapshot, revealing: boolean): TurnState => {
  if (snap.status === 'finished' || snap.view.phase === 'GAME_OVER') return 'finished';
  if (snap.status !== 'active') return 'theirs';
  if (revealing) return 'replaying';
  // Status is 'active' here, so a GAME_OVER phase cannot occur: the actor alone decides.
  return snap.view.actor === snap.seat ? 'mine' : 'theirs';
};

export const duelUiFromSnapshot = (
  snap: MatchDriverSnapshot,
  canUndo: boolean,
  /** True while the opponent's finished turn is still replaying: it is NOT this seat's turn yet. */
  revealing = false,
): DuelUiModel => {
  const turn = turnStateFrom(snap, revealing);
  // `myTurn` stays the GATE (input is refused while a replay drains). The HUD word does not: it
  // reads `turn`, from the server's actor, so it is honest during a replay.
  const myTurn = turn === 'mine';
  const finished = turn === 'finished';
  return {
    seat: snap.seat,
    view: snap.view,
    screenView: snap.screenView,
    legal: snap.legal,
    screenLegal: snap.screenLegal,
    screenEvents: snap.screenEvents,
    myTurn,
    turn,
    hasDraft: snap.hasDraft,
    canUndo,
    coachOff: true,
    hiddenDeckHintsOff: true,
    scoreMe: snap.view.score,
    scoreOpp: snap.view.opponentScore,
    scoreLabel: `${snap.perspective.scoreMeLabel}:${snap.perspective.scoreOpponentLabel}`,
    hud: {
      opponentName: snap.opponentName ?? ONLINE.opponentFallback,
      presence: snap.presence,
      turn,
      notice: snap.notice,
      finished,
      finishedTitle: finished
        ? snap.result?.winner === snap.seat
          ? RESULT.won
          : snap.result?.winner === null
            ? RESULT.draw
            : RESULT.lost
        : null,
      urgency: deadlineUrgency(snap.remainingMs),
    },
  };
};

/** Map a screen-hex action (from taps) to engine coords, then hand to the driver. */
export const playScreenAction = async (
  driver: OnlineDriver,
  screenAction: Action,
): Promise<{ ok: boolean; message?: string }> => {
  const engine = driver.toEngineAction(screenAction);
  if (engine.t === 'Draw') return driver.draw(engine);
  if (engine.t === 'EndAct' || engine.t === 'Discard') return driver.throwTurn(engine);
  const ok = driver.draftPlay(engine);
  return ok ? { ok: true } : { ok: false, message: ONLINE.errMoveIllegal };
};

export const renderDuelHud = (root: HTMLElement | null, model: DuelUiModel): void => {
  if (!root) return;
  root.hidden = false;
  fillDuelHud(root, model.hud);
};
