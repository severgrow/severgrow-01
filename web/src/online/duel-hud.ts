// Phase 5 — quiet duel status strip (presence, turn, deadline). Pure helpers + DOM fill.

import { ONLINE } from '../../../src/strings.js';
import { formatRemaining } from './clock.js';
import type { PresenceStatus } from './types.js';

export type DuelHudModel = {
  opponentName: string;
  presence: PresenceStatus;
  myTurn: boolean;
  remainingMs: number | null;
  notice: string | null;
  finished: boolean;
  finishedTitle: string | null;
  /**
   * Who starts, seen from this seat (perspective-correct). `null` hides the chip until the match
   * is active. Never colour-only: the chip carries a word plus a non-colour icon.
   */
  starterMeStarts: boolean | null;
};

export const presenceWord = (p: PresenceStatus): string => {
  if (p === 'online') return 'Online';
  if (p === 'away') return 'Away';
  return 'Unknown';
};

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
  const deadline = root.querySelector('[data-duel-deadline]');
  const notice = root.querySelector('[data-duel-notice]');
  const starter = root.querySelector<HTMLElement>('[data-duel-starter]');
  if (name) name.textContent = model.opponentName || ONLINE.opponentFallback;
  if (presence) {
    presence.textContent = presenceWord(model.presence);
    presence.setAttribute('data-presence', model.presence);
  }
  if (turn) turn.textContent = turnWord(model.myTurn, model.finished);
  if (deadline) {
    const label = formatRemaining(model.remainingMs);
    deadline.textContent = label;
    deadline.setAttribute('data-tone', deadlineTone(model.remainingMs));
    (deadline as HTMLElement).hidden = !label;
  }
  if (notice) {
    notice.textContent = model.notice ?? '';
    (notice as HTMLElement).hidden = !model.notice;
  }
  if (starter) {
    const meStarts = model.starterMeStarts;
    starter.hidden = meStarts === null;
    if (meStarts !== null) {
      starter.setAttribute('data-starter', meStarts ? 'me' : 'opponent');
      const word = starter.querySelector('[data-duel-starter-word]');
      const sr = starter.querySelector('[data-duel-starter-sr]');
      if (word) word.textContent = meStarts ? ONLINE.starterYou : ONLINE.starterOpponent;
      if (sr) sr.textContent = meStarts ? ONLINE.starterYouSr : ONLINE.starterOpponentSr;
    }
  }
};
