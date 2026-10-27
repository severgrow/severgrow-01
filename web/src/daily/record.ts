// The Daily Puzzle's record on this device, and the words it is shown in. Pure: no storage, no DOM.
import type { DailyGoal, TurnOutcome } from '../../../src/daily/core.js';
import { TRIES } from '../../../src/daily/calendar.js';
import { DAILY } from '../../../src/strings.js';

export const DAILY_RECORD_KEY = 'severgrow.daily.v1';

export type DailyDay = { tries: number; solved: boolean };
export type DailyRecord = {
  /** Every puzzle solved on this device (the streak is read from it). */
  solved: number[];
  /** Tries used per puzzle number, and whether one of them solved it. */
  days: Record<string, DailyDay>;
  /** Puzzles whose tile was earned and not yet placed. */
  toPlace: number[];
};

export const EMPTY_RECORD: DailyRecord = Object.freeze({ solved: [], days: {}, toPlace: [] }) as DailyRecord;

/** One day, with whether it can still be played. */
export const dayOf = (r: DailyRecord, no: number): DailyDay & { over: boolean } => {
  const d = r.days[String(no)] ?? { tries: 0, solved: false };
  return { tries: d.tries, solved: d.solved, over: d.solved || d.tries >= TRIES };
};

/** A try ended (solved or not). A day that is already over is left as it is. */
export const recordTry = (r: DailyRecord, no: number, solved: boolean): DailyRecord => {
  const d = dayOf(r, no);
  if (d.over) return r;
  return {
    solved: solved ? [...r.solved.filter((n) => n !== no), no].sort((a, b) => a - b) : r.solved,
    days: { ...r.days, [String(no)]: { tries: d.tries + 1, solved } },
    toPlace: solved ? [...r.toPlace.filter((n) => n !== no), no] : r.toPlace,
  };
};

/** One earned tile was placed (the oldest first). */
export const recordPlaced = (r: DailyRecord): DailyRecord => ({ ...r, toPlace: r.toPlace.slice(1) });

const isInt = (v: unknown): v is number => Number.isInteger(v);

export const decodeRecord = (raw: string | null | undefined): DailyRecord => {
  if (!raw) return EMPTY_RECORD;
  try {
    const v = JSON.parse(raw) as Partial<DailyRecord>;
    if (!v || !Array.isArray(v.solved) || !v.days || typeof v.days !== 'object' || Array.isArray(v.days) || !Array.isArray(v.toPlace)) return EMPTY_RECORD;
    const days: Record<string, DailyDay> = {};
    for (const [k, d] of Object.entries(v.days)) {
      if (d && isInt((d as DailyDay).tries) && typeof (d as DailyDay).solved === 'boolean') days[k] = { tries: (d as DailyDay).tries, solved: (d as DailyDay).solved };
    }
    return { solved: v.solved.filter(isInt), days, toPlace: v.toPlace.filter(isInt) };
  } catch {
    return EMPTY_RECORD;
  }
};
export const encodeRecord = (r: DailyRecord): string => JSON.stringify(r);

/** The LED token (at most five cells for one-digit goals). */
export const goalToken = (g: DailyGoal): string =>
  g.kind === 'win' ? 'WIN!' : g.kind === 'cut' ? `CUT ${g.n}` : `+${g.n}PTS`;

/** The goal in one line, in exactly the terms `goalMet` checks. */
export const goalLine = (g: DailyGoal): string =>
  g.kind === 'win' ? 'Surround their home this turn.'
  : g.kind === 'cut' ? `Cut off ${g.n} of their tiles this turn.`
  : `Grow your lead by ${g.n} this turn.`;

/** The goal as the header strip says it during play (short, upper case). */
export const hudGoal = (g: DailyGoal): string =>
  g.kind === 'win' ? 'WIN THIS TURN' : g.kind === 'cut' ? `CUT OFF ${g.n} TILES` : `LEAD +${g.n}`;

/** After a miss: how close it came. */
export const shortfallLine = (g: DailyGoal, o: Pick<TurnOutcome, 'gain' | 'cut' | 'won'>): string =>
  g.kind === 'win' ? 'Their home is still open. There is a way to close it.'
  : g.kind === 'cut' ? `You cut off ${o.cut}. The best turn cuts off ${g.n}.`
  : `Your lead grew by ${o.gain}. The best turn grows it by ${g.n}.`;

/** The quiet caption under the PLAY submenu's DAILY key. */
export const menuCaption = (s: { day: DailyDay & { over: boolean }; streak: number; toPlace: number }): string => {
  if (s.toPlace > 0) return DAILY.toPlace(s.toPlace);
  const streak = s.streak > 0 ? ` · ${DAILY.streak(s.streak)}` : '';
  if (s.day.solved) return `${DAILY.solved}${streak}`;
  if (s.day.over) return DAILY.tomorrow;
  if (s.day.tries > 0) return `${DAILY.triesLeft(TRIES - s.day.tries)}${streak}`;
  return `${DAILY.newToday}${streak}`;
};
