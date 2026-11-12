// UNDO IS ONE PRESS (owner, 2026-10-25): "undo shouldnt need 2 taps to confirm - undo button undoes
// the latest move straight away".
//
// The button used to ask `session.pending || session.presetMove` before anything else and spend the
// press on clearing the pick. `pending` is DERIVED from the pick (it is the move the picked hex
// would play), so merely having a hex picked made the first press a cancel and only the second one
// reached undo(). The whole decision lives here, as one pure question, so the handler cannot drift
// from it and every branch is unit-tested.

export type UndoIntent = 'undo' | 'cancel' | 'none';

export type UndoAsks = {
  /**
   * A move of this turn can be taken back. Offline: `Session.canUndo`. Online: the OnlineSession's
   * draft (the offline mirror the page rebuilds after every move has an empty stack), so the caller
   * asks the session that actually owns the stack.
   */
  canUndo: boolean;
  /** A drawn placement is waiting for Confirm (`Session.presetMove`) — drawn, never played. */
  hasStagedPreview: boolean;
  /** Something is picked in the hand or on the board (the live selection the next Confirm would use). */
  hasSelection: boolean;
  /** An online duel. */
  online: boolean;
};

/**
 * What the Undo button does, in one press.
 *
 * `undo` — a move that was played is taken back. It always wins: the pick and the waiting preview
 *   are cleared AS PART of the take-back (Session.undo clears both), never instead of it. This is
 *   the rule the owner asked for, and the reason a pick can never swallow the press again.
 * `cancel` — nothing to take back, but something is waiting (a preview, a pick, a half-painted
 *   Bloom): clear it, so the press is not wasted and it never falls through to the Replay slot the
 *   same button also shows.
 * `none` — nothing to do; the button is already disabled (offline it may instead be showing Replay,
 *   which the caller drives). Online there is no Replay slot at all, and the slot's only job is the
 *   local draft, so a pick is never turned into a cancel there.
 */
export const undoIntent = ({ canUndo, hasStagedPreview, hasSelection, online }: UndoAsks): UndoIntent => {
  if (canUndo) return 'undo';
  if (online) return 'none';
  if (hasStagedPreview || hasSelection) return 'cancel';
  return 'none';
};
