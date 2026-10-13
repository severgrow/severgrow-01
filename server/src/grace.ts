// Timeout grace (one grace period per player per match). Pure — no I/O, no clock.
//
// The rule: the FIRST time a seat misses its turn deadline it is warned and the deadline is
// extended by one full turn window; a later timeout from that same seat finishes the match with
// reason 'timeout' (unchanged). Grace is tracked per seat and is snapshotted on the match row, so
// the decision is a pure function of the row (deterministic under test and replay).
import type { Player } from '../../src/engine/index.js';
import type { MatchRecord } from './storage/types.js';

/** Does this seat still have a grace to spend in this match? */
export const hasGrace = (match: MatchRecord, seat: Player): boolean =>
  match.gracePeriods > 0 && (match.graceUsed[seat] ?? 0) < match.gracePeriods;

/**
 * Spend one grace: the deadline moves forward by one grace window and the seat's spent count
 * increments. Status stays `active`. Extending from the OLD deadline (not `now`) keeps the clock
 * honest — a late sweep never gifts extra time.
 */
export const spendGrace = (match: MatchRecord, seat: Player, now: number): MatchRecord => {
  const graceUsed: [number, number] = [match.graceUsed[0], match.graceUsed[1]];
  graceUsed[seat] = graceUsed[seat] + 1;
  const from = match.turnDeadlineAt ?? now;
  return {
    ...match,
    graceUsed,
    turnDeadlineAt: from + match.graceExtensionMs,
    updatedAt: now,
  };
};

/** True when a seat spent a grace between `before` and `after`. */
export const graceSpentBetween = (before: MatchRecord | null, after: MatchRecord): boolean => {
  if (!before) return false;
  return after.graceUsed[0] !== before.graceUsed[0] || after.graceUsed[1] !== before.graceUsed[1];
};

/** Which seat most recently spent a grace (the seat whose count grew), or null. */
export const graceSeatBetween = (before: MatchRecord | null, after: MatchRecord): Player | null => {
  if (!before) return null;
  if (after.graceUsed[1] > before.graceUsed[1]) return 1;
  if (after.graceUsed[0] > before.graceUsed[0]) return 0;
  return null;
};
