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

/** The owner's name as the game writes it: a real name, or the neutral word. Never an id. */
const ownerName = (claim: WorldClaimView): string => claim.ownerName ?? 'Player';

/** The line's facts, in the order every surface reads them. */
const ownerParts = (claim: WorldClaimView, mine: boolean, myLevel: number | null): string[] => {
  const parts = [ownerName(claim)];
  const level = mine ? ownLevel(myLevel, claim.ownerLevel) : asLevel(claim.ownerLevel);
  if (level !== null) parts.push(`LEVEL ${level}`);
  if (mine) parts.push('YOURS');
  return parts;
};

/**
 * THE VISIBLE LINE (owner, 2026-10-30): "after clicking someone's tile - it still shows it's tag
 * id". The #tag is NOT shown here any more. It was never a name — it is the machine's
 * disambiguator, and the ranking list already keeps it out of the eye's way while leaving it on the
 * row for assistive tech. Two players with the same name are still told apart by the tile itself
 * (their own colour and place), and by `ownerSpokenLine` wherever a name is spoken.
 *
 * e.g. `RYK · LEVEL 22 · YOURS` (own) or `RYK` (a rival who never played the campaign).
 */
export const ownerLine = (
  claim: WorldClaimView,
  mine: boolean,
  myLevel: number | null = null,
): string => ownerParts(claim, mine, myLevel).join(' · ');

/**
 * THE SPOKEN LINE — the same facts plus the permanent `#tag`, for an accessible name or a title.
 * The ranking row and the territory chat already carry the tag this way; this is the same rule for
 * a tapped tile, so nothing has to guess which of two "RYK"s the bar is about.
 */
export const ownerSpokenLine = (
  claim: WorldClaimView,
  mine: boolean,
  myLevel: number | null = null,
): string => {
  const [name = 'Player', ...rest] = ownerParts(claim, mine, myLevel);
  return [`${name} #${claim.ownerTag}`, ...rest].join(' · ');
};

/**
 * THE ALWAYS-ON NAME AND LEVEL (owner, 2026-10-30): "make sure in territory the name and level is
 * always visible". It is the wallet line's left half, present at every viewport and every pane —
 * not only inside a sheet or the ranking page. Null when neither fact is known, so an unknown
 * identity never prints a made-up word.
 */
export const meLine = (name: string | null | undefined, level: number | null | undefined): string | null => {
  const parts: string[] = [];
  const shown = typeof name === 'string' ? name.trim() : '';
  if (shown) parts.push(shown);
  const known = asLevel(level);
  if (known !== null) parts.push(`LEVEL ${known}`);
  return parts.length ? parts.join(' · ') : null;
};
