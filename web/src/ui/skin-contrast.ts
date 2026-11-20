// THE CONTRAST PAIR (owner, 2026-11-20): "when skin is chosen - and opp is using the same skin as
// player - dont load opps skin, but a contrast one. so his chosen skin is overwriten in players
// view." If both seats chose the same skin, the OPPONENT's tiles wear the fixed partner in your
// view — and only then. A collision never changes your own tiles, and no collision ever leaves both
// seats wearing one picture.
//
// THE TABLE IS THE RULE. Ten skins, five mutual pairs. It is deliberately a fixed table rather than
// a computation on hue or brightness: the owner picked pairs that read apart from each other at
// phone size, and a rule that drifted with an art tweak could silently pair two similar skins.
//
// WHERE IT IS CALLED (not in this module, and NOT in the painter — the painter branch consumes the
// export): the one place that resolves the two seats' appearances for a match, before the board is
// painted. `resolveSeatSkins(mine, theirs)` returns the pair to draw: `theirs` is passed through
// untouched unless the two ids are equal, in which case it becomes `contrastPartner(theirs)`.
//
// This module is pure and total: every SkinId has a partner, no id maps to itself, and the mapping
// is mutual (its own inverse). See web/tests/skin-contrast.test.ts, which proves all three
// properties exhaustively over the 10 x 10 combinations.
import { SKIN_IDS } from './skin-catalogue.js';
import type { SkinId } from './skin-catalogue.js';

/**
 * The fixed contrast table. Each line is MUTUAL: if A shows B when B collides, B shows A. Keeping
 * both directions written out (rather than deriving one) makes the table auditable by eye and lets
 * a future asymmetric pairing exist without a code change hiding it.
 */
export const CONTRAST_PARTNER: Readonly<Record<SkinId, SkinId>> = Object.freeze({
  forest: 'ash',
  ash: 'forest',
  water: 'toxic',
  toxic: 'water',
  carrara: 'nero',
  nero: 'carrara',
  console: 'hypnosis',
  hypnosis: 'console',
  voxel: 'brushed',
  brushed: 'voxel',
});

/** The skin the opponent wears instead when both seats chose `skin`. */
export const contrastPartner = (skin: SkinId): SkinId => CONTRAST_PARTNER[skin];

export type SeatSkins = Readonly<{ mine: SkinId; theirs: SkinId }>;

/**
 * Resolve what the two seats wear in ONE viewer's match.
 *
 *  - The two differ: nothing changes (`theirs` is passed through untouched).
 *  - The two collide: the opponent wears the contrast partner; your own choice is untouched.
 *
 * The rule is symmetric for the two clients: when both chose X, each player's own tile keeps X and
 * each sees the other as the partner of X — the same picture, resolved the same way.
 */
export const resolveSeatSkins = (mine: SkinId, theirs: SkinId): SeatSkins =>
  mine === theirs ? { mine, theirs: contrastPartner(theirs) } : { mine, theirs };

/** Every skin the table knows, in picker order (re-exported so a consumer needs one import). */
export const CONTRAST_SKINS: readonly SkinId[] = SKIN_IDS;
