import type { WorldMapPayload } from '../../../server/src/protocol.js';

/** One claim as the public world payload carries it. */
export type WorldClaimView = WorldMapPayload['world']['claims'][number];

/**
 * A level is a real number or it is nothing. Anything else a payload might carry (a string, a
 * fraction, zero, NaN, Infinity) is dropped rather than painted as a broken number.
 */
const asLevel = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

/**
 * The level to print for the VIEWER'S OWN ground.
 *
 * Two records exist and neither is complete on its own:
 *   - this device's campaign progress: the level the player is actually on, exact, but per-device
 *     (a second phone or a cleared browser starts over);
 *   - the server's `ownerLevel`: the highest Campaign clear it was ever TOLD about, exact, but it
 *     lags whenever a proof is still queued on a device.
 * Both are statements of "at least this far", so the larger one is the strongest true answer, and
 * picking it can never show an older number than either source already knows.
 *
 * Owner (2026-10-24): "im at level 23 - but on territory it says im level 11 - should never happen",
 * which is exactly the case this resolves: local 23 against a paid 11.
 */
export const ownLevel = (
  myLevel: number | null | undefined,
  serverLevel: number | null | undefined,
): number | null => {
  const mine = asLevel(myLevel);
  const recorded = asLevel(serverLevel);
  if (mine === null) return recorded;
  if (recorded === null) return mine;
  return Math.max(mine, recorded);
};

/**
 * The ONE owner line the selection pane shows, e.g. `RYK #VJJM · LEVEL 22 · YOURS`.
 *
 * The level is added only when a number is actually known. For somebody else's tile that is the
 * server's `ownerLevel` — the highest Campaign clear it recorded for them — and a player who never
 * played the campaign has none, so there is nothing to print (a made-up `LEVEL 1` would be a lie;
 * the client has no way to know another account's progress).
 *
 * For the viewer's OWN tile, `myLevel` is this device's campaign progress, and `ownLevel` takes the
 * stronger of the two records — see its comment. That is the fix for the owner's 2026-10-24 report.
 *
 * `YOURS` is added only for the viewer's own tile. Nothing here is a second colour or a badge: it is
 * the same line, with one more plain fact on it.
 *
 * Not `YOUR TERRITORY` (owner, 2026-10-16): the SCREEN is now called Territory, so "your territory"
 * would give one word two jobs — the whole board and the bit you own. `YOURS` keeps one job per word.
 */
export const ownerLine = (
  claim: WorldClaimView,
  mine: boolean,
  myLevel: number | null = null,
): string => {
  const parts = [`${claim.ownerName ?? 'Player'} #${claim.ownerTag}`];
  const level = mine ? ownLevel(myLevel, claim.ownerLevel) : asLevel(claim.ownerLevel);
  if (level !== null) parts.push(`LEVEL ${level}`);
  if (mine) parts.push('YOURS');
  return parts.join(' · ');
};
