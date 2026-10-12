// Pure helpers for turn clocks and gated views. No I/O.
import type { Player, State } from '../../src/engine/index.js';
import type { MatchRecord } from './storage/types.js';

/** Deadline refreshes when the seat that must act changes (or the match activates). */
export const actorChanged = (before: State, after: State): boolean =>
  after.phase !== 'GAME_OVER' && after.actor !== before.actor;

/** Turn boundary for gated reveals: turn handed over, or the game ended. */
export const turnBoundaryAdvanced = (before: State, after: State): boolean =>
  after.phase === 'GAME_OVER' || after.turnPlayer !== before.turnPlayer;

/** State the given seat is allowed to see right now. */
export const gatedStateFor = (match: MatchRecord, seat: Player): State => {
  if (match.status !== 'active') return match.state;
  if (match.turnStartState === null) return match.state;
  const midTurn = match.revision > match.turnStartRevision;
  if (!midTurn) return match.state;
  // The player who owns the in-progress turn sees the live Draw/draft; everyone else is gated.
  if (seat === match.state.turnPlayer) return match.state;
  return match.turnStartState;
};

/** Public revision exposed to a seat (opponent stays on the last boundary mid-turn). */
export const gatedRevisionFor = (match: MatchRecord, seat: Player): number => {
  if (match.status !== 'active') return match.revision;
  const midTurn = match.revision > match.turnStartRevision;
  if (!midTurn) return match.revision;
  if (seat === match.state.turnPlayer) return match.revision;
  return match.turnStartRevision;
};

export const clearDeadline = <T extends MatchRecord>(match: T, now: number): T => ({
  ...match,
  turnDeadlineAt: null,
  status: match.status,
  updatedAt: now,
});
