// Which action LEADS the finish card, decided in one pure place (owner direction, 2026-10-16;
// the four-key card is the owner brief of 2026-11-11).
//
// The card is shared by every mode, and each mode needs a different first button:
//
//   online            Rematch (a fresh invite to the same friend — unchanged, it has its own flow)
//   tutorial          Back to Tutorial — a replay returns to where it was started from (Settings),
//                     never into campaign progression (owner, 2026-10-24)
//   campaign, won     Next level — the next level starts straight away, so the player never has to
//                     walk back to the level list to pick it.
//   campaign, lost    Try again
//   offline classic   Play again (a win) / Try again (a loss)
//
// "BACK TO LEVELS" IS GONE (owner brief, 2026-11-11: "player should only be able to play his latest
// level"). So the two cases that used to fall back to the list — the last built level, and a REPLAY
// of a level behind the place (a win there unlocks nothing) — now lead with PLAY AGAIN: the same
// level, from its own fixed seed. The way out of any card is Back to menu, which is right beside it.
//
// It is pure and exported so the whole matrix is a unit test instead of a source-text guess — the
// level count is never read here (the caller asks the level DATA whether a next level exists), so a
// campaign that grows needs no change.
export type FinishLead = 'rematch' | 'back-to-tutorial' | 'next-level' | 'play-again' | 'try-again';

export type FinishContext = {
  /** a real-time duel against another player (its own rematch flow, never a level) */
  online: boolean;
  /** an offline campaign level */
  campaign: boolean;
  /** the human won */
  won: boolean;
  /** the campaign level's next level exists in the level data */
  hasNext: boolean;
  /** a Tutorial replay: the way out is the Tutorial it started from, never the campaign */
  tutorial?: boolean;
  /** a level BEHIND the player's place: a win unlocks nothing, so it never leads forward */
  replay?: boolean;
};

export const finishLead = ({ online, campaign, won, hasNext, tutorial, replay }: FinishContext): FinishLead => {
  if (tutorial) return 'back-to-tutorial';
  if (online) return 'rematch';
  if (campaign && won && !replay && hasNext) return 'next-level';
  return won ? 'play-again' : 'try-again';
};
