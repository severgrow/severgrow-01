import type { WorldMapPayload } from '../../../server/src/protocol.js';

/** One claim as the public world payload carries it. */
export type WorldClaimView = WorldMapPayload['world']['claims'][number];

/**
 * The ONE owner line the selection pane shows, e.g. `RYK #VJJM · LEVEL 22 · YOUR TERRITORY`.
 *
 * The level is added only when the server recorded it (the owner's highest settled Campaign level).
 * A player who never played the campaign — or played offline as a guest — has no recorded receipts,
 * so there is no number to show; printing `LEVEL 1` would be a lie. `YOUR TERRITORY` is added only
 * for the viewer's own tile. Nothing here is a second colour or a badge: it is the same line, with
 * one more plain fact on it.
 */
export const ownerLine = (claim: WorldClaimView, mine: boolean): string => {
  const parts = [`${claim.ownerName ?? 'Player'} #${claim.ownerTag}`];
  const level = claim.ownerLevel;
  if (typeof level === 'number' && Number.isInteger(level) && level > 0) parts.push(`LEVEL ${level}`);
  if (mine) parts.push('YOUR TERRITORY');
  return parts.join(' · ');
};
