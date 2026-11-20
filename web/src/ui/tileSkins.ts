// THE SIX IN-GAME SKINS — a tile-skin axis beside the four territory sets (owner's design,
// docs/SKINS-PROPOSAL.md). Each is a family of grounds plus a home, pure CSS art ported to the
// board's own SVG paint path (ui/tileSkinArt.ts).
//
// WHY THIS IS A SECOND AXIS AND NOT SIX MORE `TerritoryId`s (2026-11-20).
// A `TerritoryId` is also the thing that crosses the wire and paints the PLANET: `claim.skin`,
// `planetSkinFor`, and the server's own whitelist
// (`server/src/seeds/service.ts` rejects anything but forest/ash/water/toxic, and
// `postgres.ts` drops an unknown stored id on read). Those four sets are PLANET skins that the
// board happens to be able to wear. The six are the opposite: fixed-colour, in-game-only cosmetic
// treatments with no planet representation at all — the design deliberately keeps colour-as-owner
// on the Planet (Slab), and a Voxel id reaching `claim.skin` would hand the globe a set that has
// no atlas. Keeping them on their own axis means every existing path — the wire, the account
// sync, the planet painter, and above all the DEFAULT look — is left literally untouched.
//
// THE OWNERSHIP-COLOUR DECISION. A skinned tile wears the SKIN'S OWN fixed colours; it is NOT
// tinted toward the owner's chosen palette colour (`claim.colour`), because the palette tint is
// exactly what would erase a signature colour. Consequence, stated plainly: on a skinned board you
// cannot read "whose" from a hex's colour. You read it from the two sides wearing two different
// families (the default), from the two homes, and from the seed stones — which is enough on a
// two-sided in-game board, and is why these never go to the Planet.
import { assignWeightedVariants, VOXEL_GROUND_WEIGHT } from './forestAsh.js';

export const TILE_SKIN_IDS = ['console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis'] as const;
export type TileSkinId = (typeof TILE_SKIN_IDS)[number];

/** The names the picker shows (owner's own names for the six). */
export const TILE_SKIN_NAMES: Record<TileSkinId, string> = {
  console: 'Console', voxel: 'Voxel', brushed: 'Brushed', carrara: 'Carrara', nero: 'Nero', hypnosis: 'Hypnosis',
};

/** How many grounds each family paints, in variant-id order (the design's counts). */
export const TILE_SKIN_GROUNDS: Record<TileSkinId, number> = {
  console: 9, voxel: 14, brushed: 7, carrara: 6, nero: 7, hypnosis: 7,
};

/** The colour under a skinned tile's art: it shows only at the hex's softened corners. */
export const TILE_SKIN_BASE: Record<TileSkinId, string> = {
  console: '#c6d9cd', voxel: '#c05a24', brushed: '#5aa7dd', carrara: '#eef1f4', nero: '#0d0f12', hypnosis: '#c3b6d6',
};

/** An id this build knows, or null. A stored value from another build is never trusted. */
export const tileSkinOf = (id: unknown): TileSkinId | null =>
  typeof id === 'string' && (TILE_SKIN_IDS as readonly string[]).includes(id) ? (id as TileSkinId) : null;

/** The variant weights: only Voxel is weighted; the other families are one uniform weight each. */
export const tileSkinWeights = (id: TileSkinId): readonly number[] => {
  if (id === 'voxel') return VOXEL_GROUND_WEIGHT;
  // One weight per ground, all equal: a uniform bag. `assignWeightedVariants` treats every variant
  // as a feature then, so no two neighbours repeat — the same rule the shipped set uses.
  return new Array<number>(TILE_SKIN_GROUNDS[id]).fill(1);
};

/**
 * One variant index per cell, for one side's family. The salt names the family, so two sides
 * wearing two families never correlate, and a board always resolves to the same art.
 */
export const tileSkinVariants = (id: TileSkinId, keys: Iterable<string>): Map<string, number> =>
  // The equal-weight families also come from the seeded stream, not the hash sort: a 6-way family
  // is as able to show a skewed walk as a weighted one, and this costs one function either way.
  assignWeightedVariants(keys, `tile-skin:${id}`, tileSkinWeights(id));

/** The two sides' families on the board: [mine, theirs]. `null` is the shipped Forest/Ash look. */
let sides: [TileSkinId | null, TileSkinId | null] = [null, null];
export const setTileSkins = (mine: TileSkinId | null, theirs: TileSkinId | null): void => {
  sides = [tileSkinOf(mine), tileSkinOf(theirs)];
};
export const tileSides = (): readonly [TileSkinId | null, TileSkinId | null] => sides;
/** The family one side wears, or null for the shipped sprite set. */
export const tileSkinFor = (owner: 0 | 1): TileSkinId | null => sides[owner];
