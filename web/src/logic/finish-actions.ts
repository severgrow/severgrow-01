// Which action LEADS the finish card, decided in one pure place (owner direction, 2026-10-16).
//
// The card is shared by every mode, and each mode needs a different first button:
//
//   online            Rematch (a fresh invite to the same friend — unchanged, it has its own flow)
//   campaign, won     Next level — the next level starts straight away, so the player never has to
//                     walk back to the level list to pick it. On the LAST built level there is no
//                     next one, so the same slot becomes the honest way out (the level list) rather
//                     than a button that does nothing.
//   campaign, lost    Try again
//   offline classic   Play again (a win) / Try again (a loss)
//
// It is pure and exported so the whole matrix is a unit test instead of a source-text guess — the
// level count is never read here (the caller asks the level DATA whether a next level exists), so a
// campaign that grows needs no change.
export type FinishLead = 'rematch' | 'next-level' | 'back-to-campaign' | 'play-again' | 'try-again';

export type FinishContext = {
  /** a real-time duel against another player (its own rematch flow, never a level) */
  online: boolean;
  /** an offline campaign level */
  campaign: boolean;
  /** the human won */
  won: boolean;
  /** the campaign level's next level exists in the level data */
  hasNext: boolean;
};

export const finishLead = ({ online, campaign, won, hasNext }: FinishContext): FinishLead => {
  if (online) return 'rematch';
  if (campaign && won) return hasNext ? 'next-level' : 'back-to-campaign';
  return won ? 'play-again' : 'try-again';
};

/** The modes that lead with a level the player has not played yet (the card's "next level"). */
export const leadsToNextLevel = (lead: FinishLead): boolean => lead === 'next-level';
