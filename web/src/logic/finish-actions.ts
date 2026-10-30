// Which action LEADS the finish card, decided in one pure place (owner direction, 2026-10-16).
//
// The card is shared by every mode, and each mode needs a different first button:
//
//   online            Rematch (a fresh invite to the same friend — unchanged, it has its own flow)
//   tutorial          Back to Tutorial — a replay returns to where it was started from (Settings),
//                     never into campaign progression (owner, 2026-10-24)
//   campaign, won     Next level — the next level starts straight away, so the player never has to
//                     walk back to the level list to pick it. On the LAST built level there is no
//                     next one, so the same slot becomes the honest way out (the level list) rather
//                     than a button that does nothing. A REPLAY of a level behind the player's place
//                     also takes that honest way out: there is no "next" to march them through.
//   campaign, lost    Try again
//   offline classic   Play again (a win) / Try again (a loss)
//
// It is pure and exported so the whole matrix is a unit test instead of a source-text guess — the
// level count is never read here (the caller asks the level DATA whether a next level exists), so a
// campaign that grows needs no change.
export type FinishLead = 'rematch' | 'back-to-tutorial' | 'next-level' | 'back-to-campaign' | 'play-again' | 'try-again';

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
  if (campaign && won) return replay || !hasNext ? 'back-to-campaign' : 'next-level';
  return won ? 'play-again' : 'try-again';
};

/**
 * Does the finish card's Territory key belong on this card? (owner, 2026-10-30: "under the
 * notification of seeds payout say 'Grow tiles in Territory'").
 *
 * The owner put it WITH the payout, so the one rule is: a payout line is on the card AND Territory
 * is actually reachable. A card with no payout (a duel that paid nothing) grows no key; a build or
 * a card where Territory is not mounted grows none either, because a key that goes nowhere is
 * worse than no key. Pure, so the two halves of that rule are a unit test.
 */
export type TerritoryLinkContext = {
  /** The Seeds payout line is on the card (an award, or the one honest notice about it). */
  payout: boolean;
  /** Territory can be opened from this build: the lobby is mounted and the product ships it. */
  reachable: boolean;
};

export const territoryLinkVisible = ({ payout, reachable }: TerritoryLinkContext): boolean => payout && reachable;
