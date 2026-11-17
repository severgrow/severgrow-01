// THE BOLT SAYS WHO IS HERE (owner, 2026-11-17: "EVERY online game should show the lightning in the top
// left corner as it used to be. Filled when opp online and empty inside when opp offline"). The header's
// "● Online / Away" line was removed on 2026-11-16, so the bolt is now THE presence signal. Its look
// follows the opponent's presence only; whether a tap can start a live duel (`PillModel.kind`) is a
// separate question and never empties a bolt whose opponent is here.
import type { LiveStatusWire } from '../../../../server/src/live/service.js';

export type BoltLook = 'hidden' | 'online' | 'offline';

/**
 * `failed`: the status for the open match could not be read. The bolt still shows (empty), so an
 * online game never loses it; before the first answer it waits a beat rather than flash empty.
 */
export const boltLook = (s: Pick<LiveStatusWire, 'status' | 'live' | 'opponent'> | null, failed = false): BoltLook => {
  if (!s) return failed ? 'offline' : 'hidden';
  if (s.status !== 'active') return 'hidden';
  if (s.live) return 'online';
  return s.opponent.presence === 'offline' ? 'offline' : 'online';
};
