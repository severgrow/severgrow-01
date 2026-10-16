import type { WorldMapPayload } from '../../../server/src/protocol.js';

/** One claim as the public world payload carries it. */
export type WorldClaimView = WorldMapPayload['world']['claims'][number];

/**
 * The ONE owner line the selection pane shows, e.g. `RYK #VJJM · LEVEL 22 · YOURS`.
 *
 * The level is added only when the server recorded it (the owner's highest settled Campaign level).
 * A player who never played the campaign — or played offline as a guest — has no recorded receipts,
 * so there is no number to show; printing `LEVEL 1` would be a lie. `YOURS` is added only for the
 * viewer's own tile. Nothing here is a second colour or a badge: it is the same line, with one more
 * plain fact on it.
 *
 * Not `YOUR TERRITORY` (owner, 2026-10-16): the SCREEN is now called Territory, so "your territory"
 * would give one word two jobs — the whole board and the bit you own. `YOURS` keeps one job per word.
 */
export const ownerLine = (claim: WorldClaimView, mine: boolean): string => {
  const parts = [`${claim.ownerName ?? 'Player'} #${claim.ownerTag}`];
  const level = claim.ownerLevel;
  if (typeof level === 'number' && Number.isInteger(level) && level > 0) parts.push(`LEVEL ${level}`);
  if (mine) parts.push('YOURS');
  return parts.join(' · ');
};
