// Phase 5 — quiet duel status strip (opponent, turn, presence). Pure helpers + DOM fill.
//
// The strip was trimmed after the two-phone playtest: Resign moved into the in-game pause menu,
// the persistent "who starts" chip was removed (the one-time lottery reveal still says who starts),
// and the time-remaining chip was removed (the match list owns the deadline). What stays is the
// opponent's name, the turn word and the presence indicator.

import { ONLINE } from '../../../src/strings.js';
import type { PresenceStatus } from './types.js';

export type DuelHudModel = {
  opponentName: string;
  presence: PresenceStatus;
  myTurn: boolean;
  notice: string | null;
  finished: boolean;
  finishedTitle: string | null;
};

export const presenceWord = (p: PresenceStatus): string => {
  if (p === 'online') return 'Online';
  if (p === 'away') return 'Away';
  return 'Unknown';
};

/**
 * Deadline urgency, as a word-free tone. The duel strip no longer draws the deadline (the match
 * list owns it), but the thresholds stay pinned here for the clock tests and any future surface.
 */
export const deadlineTone = (remainingMs: number | null): 'ok' | 'amber' | 'red' | 'none' => {
  if (remainingMs === null) return 'none';
  if (remainingMs <= 0) return 'red';
  if (remainingMs <= 15 * 60_000) return 'red';
  if (remainingMs <= 2 * 3_600_000) return 'amber';
  return 'ok';
};

export const turnWord = (myTurn: boolean, finished: boolean): string => {
  if (finished) return ONLINE.statusFinished;
  return myTurn ? ONLINE.statusYourTurn : ONLINE.statusTheirTurn;
};

export const fillDuelHud = (root: HTMLElement, model: DuelHudModel): void => {
  const name = root.querySelector('[data-duel-opponent]');
  const presence = root.querySelector('[data-duel-presence]');
  const turn = root.querySelector('[data-duel-turn]');
  const notice = root.querySelector('[data-duel-notice]');
  if (name) name.textContent = model.opponentName || ONLINE.opponentFallback;
  if (presence) {
    presence.textContent = presenceWord(model.presence);
    presence.setAttribute('data-presence', model.presence);
  }
  if (turn) turn.textContent = turnWord(model.myTurn, model.finished);
  if (notice) {
    notice.textContent = model.notice ?? '';
    (notice as HTMLElement).hidden = !model.notice;
  }
};
