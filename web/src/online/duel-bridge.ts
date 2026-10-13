// Phase 5 — bridge OnlineDriver snapshots to the shared board/hand UI (perspective applied).

import type { Action, Event, View } from '../../../src/engine/index.js';
import { ONLINE } from '../../../src/strings.js';
import type { OnlineDriver } from './driver.js';
import { fillDuelHud } from './duel-hud.js';
import type { DuelHudModel } from './duel-hud.js';
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
  hasDraft: boolean;
  canUndo: boolean;
  coachOff: true;
  hiddenDeckHintsOff: true;
  scoreMe: number;
  scoreOpp: number;
  scoreLabel: string;
  hud: DuelHudModel;
};

export const duelUiFromSnapshot = (
  snap: MatchDriverSnapshot,
  canUndo: boolean,
  /** True while the opponent's finished turn is still replaying: it is NOT this seat's turn yet. */
  revealing = false,
): DuelUiModel => {
  const myTurn = !revealing && snap.view.actor === snap.seat && snap.status === 'active';
  const finished = snap.status === 'finished' || snap.view.phase === 'GAME_OVER';
  return {
    seat: snap.seat,
    view: snap.view,
    screenView: snap.screenView,
    legal: snap.legal,
    screenLegal: snap.screenLegal,
    screenEvents: snap.screenEvents,
    myTurn,
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
      myTurn,
      remainingMs: snap.remainingMs,
      notice: snap.notice,
      finished,
      finishedTitle: finished
        ? snap.result?.winner === snap.seat
          ? 'You won'
          : snap.result?.winner === null
            ? 'Draw'
            : 'You lost'
        : null,
      // Perspective-correct: the shared engine's starting seat vs this seat (not seat 0).
      starterMeStarts: snap.startingPlayer === snap.seat,
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
  return ok ? { ok: true } : { ok: false, message: 'That move is not legal right now.' };
};

export const renderDuelHud = (root: HTMLElement | null, model: DuelUiModel): void => {
  if (!root) return;
  root.hidden = false;
  fillDuelHud(root, model.hud);
};
