/**
 * A TURN JUST COMMITTED (owner report, 2026-11-13: "Your matches still shows that it's my turn even
 * though I just took my turn"). The duel session announces it; the lobby re-reads the list, so its
 * rows and the PLAY ONLINE marker say "their turn" at once instead of on the next poll.
 */
export const TURN_COMMITTED_EVENT = 'futasaku:turn-committed';
export const announceTurnCommitted = (): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TURN_COMMITTED_EVENT));
};
