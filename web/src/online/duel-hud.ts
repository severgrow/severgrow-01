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
  /** The server's real turn state (never the animation gate) — see `turnWord`. */
  turn: TurnState;
  notice: string | null;
  finished: boolean;
  finishedTitle: string | null;
  /** Mid-match deadline urgency. Nothing is shown until the last two hours (absent = nothing). */
  urgency?: DeadlineUrgency;
};

/**
 * Whose turn the SERVER says it is, plus the replay state:
 * - 'mine' / 'theirs': straight from `view.actor` vs `seat` on an active match.
 * - 'replaying': the opponent's finished turn is still animating (the gate is shut). This is a
 *   distinct word, so the phone whose turn it now is never reads "Opponent's turn".
 * - 'finished': the match is over.
 */
export type TurnState = 'mine' | 'theirs' | 'replaying' | 'finished';

export const presenceWord = (p: PresenceStatus): string => {
  if (p === 'online') return ONLINE.presenceOnline;
  if (p === 'away') return ONLINE.presenceAway;
  return ONLINE.presenceUnknown;
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

/**
 * The urgency-only mid-match deadline (owner's choice, P-12): NOTHING with a full day left, amber
 * under 2 hours, red under 15 minutes. `label` is the visible word (never colour alone); `sr` is
 * the fuller sentence a screen reader announces, and only when the tone crosses a threshold.
 */
export type DeadlineUrgency = { tone: 'amber' | 'red' | null; label: string; sr: string };

export const deadlineUrgency = (remainingMs: number | null): DeadlineUrgency => {
  const tone = deadlineTone(remainingMs);
  if (tone === 'amber') return { tone, label: ONLINE.urgencyAmber, sr: ONLINE.urgencyAmberSr };
  if (tone === 'red') return { tone, label: ONLINE.urgencyRed, sr: ONLINE.urgencyRedSr };
  return { tone: null, label: '', sr: '' };
};

/**
 * The one turn word, sourced from `TurnState`. A replay is its own state — no pronoun guessing
 * and, crucially, never "Opponent's turn" while the opponent's turn is animating (that was the
 * two-phone bug: the acting player's phone read "Opponent's turn" for the whole replay).
 */
export const turnWord = (state: TurnState): string => {
  switch (state) {
    case 'finished':
      return ONLINE.statusFinished;
    case 'replaying':
      return ONLINE.statusReplaying;
    case 'mine':
      return ONLINE.statusYourTurn;
    default:
      return ONLINE.statusTheirTurn;
  }
};

export const fillDuelHud = (root: HTMLElement, model: DuelHudModel): void => {
  const name = root.querySelector('[data-duel-opponent]');
  const presence = root.querySelector('[data-duel-presence]');
  const turn = root.querySelector('[data-duel-turn]');
  const notice = root.querySelector('[data-duel-notice]');
  const urgency = root.querySelector<HTMLElement>('[data-duel-urgency]');
  if (name) name.textContent = model.opponentName || ONLINE.opponentFallback;
  if (presence) {
    presence.textContent = presenceWord(model.presence);
    presence.setAttribute('data-presence', model.presence);
  }
  if (turn) turn.textContent = turnWord(model.turn);
  if (notice) {
    notice.textContent = model.notice ?? '';
    (notice as HTMLElement).hidden = !model.notice;
  }
  if (urgency) {
    const { tone, label, sr } = model.urgency ?? deadlineUrgency(null);
    // Hidden unless the deadline actually matters. The text only changes when the tone crosses a
    // threshold (hidden → amber → red), so role="status" announces it then, and never ticks.
    urgency.hidden = tone === null;
    urgency.textContent = label;
    if (tone === null) urgency.removeAttribute('data-tone');
    else urgency.setAttribute('data-tone', tone);
    if (sr) urgency.setAttribute('aria-label', sr);
    else urgency.removeAttribute('aria-label');
  }
};
