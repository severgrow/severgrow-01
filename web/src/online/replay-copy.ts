// Copy for ONE surface: replaying the opponent's last turn in an online duel.
//
// It is a group of its own rather than a line in `src/strings.ts` so the shared product copy is
// never touched for a single control. The words the player already knows for the SAME control
// offline stay in `main.ts` (`REPLAY_TIP` / `REPLAY_NONE`) and are used unchanged there; only the
// honest refusal that exists online needs a sentence of its own.

export const TURN_REPLAY = {
  /**
   * The turn cannot be offered because the reconstruction did not match the live board. It is never
   * said instead of "they haven't moved" when that is the truth, and it never enables the control.
   */
  unverified: 'Replay is off for this turn: the board could not be verified',
} as const;
