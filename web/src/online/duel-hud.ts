// Phase 5 — the duel status strip: the ONE fixed-height header lane between the menu button and
// the FUTASAKU logo. Pure helpers + a DOM fill.
//
// Owner's cleanup (2026-10-14): the lane is a single row that can never wrap, grow or draw onto the
// board. It says ONE short message at a time, chosen by a priority list, and scrolls that message
// sideways as a ticker when it is wider than the lane. There is NO frame of any kind (no border,
// outline, shadow, fill or rounded box) around the strip or its words — the header's own surface
// shows through, exactly like the menu button and the brand beside them.

import { HEADER_SOURCE, ONLINE, headerText } from '../../../src/strings.js';
import type { HeaderKey, HeaderSource } from '../../../src/strings.js';
import { waitDots } from './live/wait-dots.js';
import type { PresenceStatus } from './types.js';

export type DuelHudModel = {
  opponentName: string;
  presence: PresenceStatus;
  /** The server's real turn state (never the animation gate) — see `turnStateFrom`. */
  turn: TurnState;
  /** A temporary message (an error, a notice). It outranks the turn word while it is set. */
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
      return headerText('finished');
    case 'replaying':
      return headerText('replaying');
    case 'mine':
      return headerText('yourTurn');
    default:
      return headerText('theirTurn');
  }
};

/** Everything the priority list needs to decide the lane's one message. */
export type HeaderModel = {
  turn: TurnState;
  presence: PresenceStatus;
  /** A pressing danger/timeout message (already short) — outranks everything else. */
  danger: string | null;
  /** True while the real-time clock runs: it owns the lane (its digits are the message). */
  clock: boolean;
};

export type HeaderPick = {
  /** The word's key, or 'clock' when the live clock owns the lane. */
  key: HeaderKey | 'clock';
  /** The priority slot that won. */
  source: HeaderSource;
  /** The message text (empty when the clock owns the lane — its digits live in the clock slot). */
  text: string;
  /** True when the words should carry the shared animated ellipsis. */
  dots: boolean;
};

const pickKey = (m: HeaderModel): HeaderKey => {
  if (m.turn === 'finished') return 'finished';
  if (m.turn === 'mine') return 'yourTurn';
  if (m.turn === 'theirs') return 'theirTurn';
  if (m.turn === 'replaying') return 'replaying';
  if (m.presence === 'away') return 'opponentAway';
  if (m.presence === 'online') return 'opponentHere';
  return 'idle';
};

/**
 * The ONE place that decides what the lane says. Highest priority first (owner's list): a
 * danger/timeout message, the real-time clock, whose turn it is, the presence/opponent line, then
 * idle. Only ONE is chosen — the longer explanation belongs in the glass window.
 */
export const resolveHeader = (m: HeaderModel): HeaderPick => {
  if (m.danger) return { key: 'timeout', source: 'danger', text: m.danger, dots: false };
  if (m.clock) return { key: 'clock', source: 'clock', text: '', dots: false };
  const key = pickKey(m);
  return { key, source: HEADER_SOURCE[key], text: headerText(key), dots: key === 'waiting' };
};

// ---------------------------------------------------------------- the ticker (declarative)

/** ~40 px per second, with a 1.2 s hold at the start of every loop (owner's numbers). */
const TICKER_SPEED = 40;
const TICKER_PAUSE_MS = 1_200;
/** A tiny gap so the end of the message is clearly separated from its restart. */
const TICKER_GAP = 10;

const activeAnim = new WeakMap<HTMLElement, Animation>();

/** The browser has a DOM; the unit-test/server environment does not. */
const domAvailable = (): boolean => typeof document !== 'undefined' && typeof window !== 'undefined';

const reduceMotion = (): boolean =>
  document.documentElement.classList.contains('reduce-motion') ||
  (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/**
 * Measure one lane and (re)start or stop its ticker. A TRANSFORM animation that the browser drives
 * (no per-frame JavaScript). Under Reduce motion nothing scrolls: the CSS ellipsises the words.
 */
export const tickLane = (viewport: HTMLElement, track: HTMLElement): void => {
  if (!domAvailable()) return;
  activeAnim.get(track)?.cancel();
  activeAnim.delete(track);
  track.style.transform = '';
  const overflow = Math.max(0, track.scrollWidth - viewport.clientWidth);
  const scroll = !reduceMotion() && overflow > 1;
  viewport.dataset.scroll = scroll ? '1' : '0';
  if (!scroll) return;
  const shift = overflow + TICKER_GAP;
  const travelMs = (shift / TICKER_SPEED) * 1_000;
  const total = TICKER_PAUSE_MS + travelMs;
  const anim = track.animate(
    [
      { offset: 0, transform: 'translateX(0)' },
      { offset: TICKER_PAUSE_MS / total, transform: 'translateX(0)' },
      { offset: 1, transform: `translateX(${-shift}px)` },
    ],
    { duration: total, easing: 'linear', iterations: Infinity },
  );
  activeAnim.set(track, anim);
};

/** Re-measure every visible lane (on resize / orientation change / a text change). */
export const refreshLanes = (): void => {
  if (!domAvailable()) return;
  for (const viewport of document.querySelectorAll<HTMLElement>('#duel-hud [data-duel-turn]')) {
    const track = viewport.querySelector<HTMLElement>('[data-duel-track]');
    if (track && !viewport.hidden) tickLane(viewport, track);
  }
};

let resizeHooked = false;
const hookResize = (): void => {
  if (resizeHooked) return;
  resizeHooked = true;
  if (!domAvailable()) return;
  window.addEventListener('resize', refreshLanes);
  (window as unknown as { __futasakuHeader?: unknown }).__futasakuHeader = {
    /** Force the lane's own message (the browser tests use this to force a very long one). */
    set(text: string, dots = false): boolean {
      const viewport = document.querySelector<HTMLElement>('#duel-hud [data-duel-turn]');
      if (!viewport) return false;
      viewport.hidden = false;
      writeLane(viewport, text, dots);
      return true;
    },
    refresh: refreshLanes,
  };
};

/** The lane's track (created once); the text and the animated dots live inside it. */
const laneTrack = (viewport: HTMLElement): HTMLElement => {
  let track = viewport.querySelector<HTMLElement>('[data-duel-track]');
  if (!track) {
    track = document.createElement('span');
    track.className = 'duel-track';
    track.dataset.duelTrack = '';
    viewport.replaceChildren(track);
  }
  return track;
};

/** Write one message into the lane and keep exactly one of it on screen. */
const writeLane = (viewport: HTMLElement, text: string, dots: boolean): void => {
  const track = laneTrack(viewport);
  const signature = `${text}\u0000${dots ? '1' : '0'}`;
  if (track.dataset.signature === signature) {
    // The words did not change, but the box may have: re-measure so a resize cannot wedge it.
    if (!viewport.hidden) tickLane(viewport, track);
    return;
  }
  track.dataset.signature = signature;
  track.textContent = text;
  if (dots) track.append(waitDots());
  tickLane(viewport, track);
};

/**
 * Fill the lane. Writes at most ONE message: the danger word (a notice or the 24-hour urgency), the
 * turn/presence word, or the real-time clock (which the live module owns in the clock slot).
 */
export const fillDuelHud = (root: HTMLElement, model: DuelHudModel): void => {
  hookResize();
  const opponent = root.querySelector('[data-duel-opponent]');
  const presence = root.querySelector('[data-duel-presence]');
  const notice = root.querySelector('[data-duel-notice]');
  const urgency = root.querySelector<HTMLElement>('[data-duel-urgency]');
  const viewport = root.querySelector<HTMLElement>('[data-duel-turn]');

  // Hidden state hooks (CSS keeps them unpainted): the lane shows ONE message, but the opponent's
  // name and the current notice stay machine-readable for the page's own tests.
  if (opponent) opponent.textContent = model.opponentName || ONLINE.opponentFallback;
  if (notice) notice.textContent = model.notice ?? '';
  if (presence) {
    presence.textContent = presenceWord(model.presence);
    presence.setAttribute('data-presence', model.presence);
  }

  // The clock slot is owned by the live module while a real-time duel runs (it writes the m:ss).
  const clockOn = !!urgency?.dataset?.liveClock;

  const tone = model.urgency?.tone ?? null;
  const danger = model.notice ?? (tone !== null ? (model.urgency?.label ?? null) : null);
  const pick = resolveHeader({ turn: model.turn, presence: model.presence, danger, clock: clockOn });

  if (!viewport) return;
  if (!domAvailable()) {
    // No DOM (unit tests): report the chosen word, so the copy stays testable without a browser.
    viewport.textContent = pick.source === 'clock' ? '' : pick.text;
    viewport.hidden = pick.source === 'clock';
    return;
  }

  if (pick.source === 'clock') {
    // The clock owns the lane: hide the word viewport so only the digits show.
    viewport.hidden = true;
    return;
  }
  viewport.hidden = false;
  viewport.dataset.header = pick.key;
  viewport.dataset.tone = tone ?? (model.notice ? 'danger' : '');
  if (tone !== null && model.urgency?.sr) viewport.setAttribute('aria-label', model.urgency.sr);
  else viewport.removeAttribute('aria-label');
  writeLane(viewport, pick.text, pick.dots);
};
