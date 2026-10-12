// Countdown from timestamps + serverNow offset (P-9). Never accumulate intervals.

export type ClockState = {
  /** serverNow − browserNow at last sync (ms). Positive means the server is ahead. */
  offsetMs: number;
};

export const emptyClock = (): ClockState => ({ offsetMs: 0 });

/** Fold a fresh serverNow into the offset. `receivedAt` is the local wall clock at receipt. */
export const noteServerNow = (_clock: ClockState, serverNow: number, receivedAt: number = Date.now()): ClockState => ({
  offsetMs: serverNow - receivedAt,
});

/** Browser time corrected toward the server clock. */
export const correctedNow = (clock: ClockState, browserNow: number = Date.now()): number => browserNow + clock.offsetMs;

/**
 * Remaining milliseconds until `deadlineAt`, never negative.
 * Returns null when there is no deadline.
 * At zero the caller should show "Time's up" and ask the server.
 */
export const remainingMs = (
  clock: ClockState,
  deadlineAt: number | null | undefined,
  browserNow: number = Date.now(),
): number | null => {
  if (deadlineAt === null || deadlineAt === undefined) return null;
  return Math.max(0, deadlineAt - correctedNow(clock, browserNow));
};

/** Format a remaining duration for lists / chips (P-19): "18h 42m", never a clock time. */
export const formatRemaining = (ms: number | null): string => {
  if (ms === null) return '';
  if (ms <= 0) return "Time's up";
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMin > 0) return `${totalMin}m`;
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds}s`;
};
