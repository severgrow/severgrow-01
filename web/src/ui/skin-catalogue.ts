// THE SKIN CATALOGUE (owner, 2026-11-20): ten real skins plus the plain "Colour" treatment.
//
// TEN REAL SKINS: the four the atlas already paints (Forest, Ash, Water, Toxic) and the six the
// recipe branch is building (Console, Voxel, Brushed, Carrara, Nero, Hypnosis). "Colour" is Slab:
// the plain owner colour, PLANET ONLY — it has no in-game tile, which is why choosing it forces a
// second, deliberate choice of a real skin for the match (ui/skinChoice.ts, online/skin-switch.ts).
//
// THIS FILE IS THE PICKER'S CONTRACT WITH THE ART. The picker never reaches into the recipes: it
// asks this module for an id's name and preview, and it paints the owner-colour rim from
// `ownerRimFor`. The recipe branch owns the pictures and the variant families; this module owns the
// ids, the names and the rim geometry.
//
// A SKINNED TILE MUST BE ABLE TO CARRY AN OWNER-COLOUR RIM (owner, 2026-11-20: the owner's colour
// on the planet is "a thin inner rim on a skinned tile"). `ownerRimFor(colour, hexRadiusPx)` returns
// the exact ring the painter must draw INSIDE the hex boundary: never an outline outside it (that
// is what made the owner's land read as "colour on tiles and skin on top"), never a tint of the art.
// The planet renderer, the live board and the replay all resolve the same ring, so a tile looks the
// same in every surface.
import { TERRITORY_BASE_COLOUR, TERRITORY_IDS } from './forestAsh.js';
import type { TerritoryId } from './forestAsh.js';

/**
 * The ten real skins. Order is the picker's order: the four shipped sets first, then the six new
 * recipes. Engine/paint identifiers are stable; only the labels are player-facing.
 */
export const SKIN_IDS = [
  'forest', 'ash', 'water', 'toxic',
  'console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis',
] as const;
export type SkinId = (typeof SKIN_IDS)[number];

/** Slab: the plain owner colour. A planet appearance, never a game appearance. */
export const SKIN_COLOUR = 'colour' as const;

/** What the PLANET shows: a real skin, or the plain owner colour. */
export type PlanetSkin = SkinId | typeof SKIN_COLOUR;
/** What a MATCH shows: always a real skin (there are no plain-colour board tiles). */
export type GameSkin = SkinId;

export const isSkinId = (value: unknown): value is SkinId =>
  typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value);

export const isPlanetSkin = (value: unknown): value is PlanetSkin =>
  value === SKIN_COLOUR || isSkinId(value);

/** Player-facing names. One table, so the picker, the docs and a screen reader agree. */
export const SKIN_NAMES: Readonly<Record<PlanetSkin, string>> = {
  colour: 'Colour',
  forest: 'Forest',
  ash: 'Ash',
  water: 'Water',
  toxic: 'Toxic',
  console: 'Console',
  voxel: 'Voxel',
  brushed: 'Brushed',
  carrara: 'Carrara',
  nero: 'Nero',
  hypnosis: 'Hypnosis',
};

/** The skins this build's board can paint today (the four atlas sets). */
export const BOARD_READY_SKIN_IDS: readonly SkinId[] = TERRITORY_IDS;

/**
 * THE SEAM WITH THE RECIPE BRANCH. The board painter still takes a `TerritoryId`; the recipe branch
 * widens `BOARD_READY_SKIN_IDS` and adds its `TERRITORIES` entries. Until that lands, a game skin
 * that has no board recipe paints the seat's product fallback rather than crashing the board. The
 * MODEL keeps the real choice (so the picker, storage and the planet preview are already correct).
 */
export const boardSkinFor = (skin: GameSkin | null | undefined, fallback: TerritoryId): TerritoryId =>
  skin && (BOARD_READY_SKIN_IDS as readonly string[]).includes(skin) ? (skin as TerritoryId) : fallback;

/**
 * PLACEHOLDER PREVIEWS (assumption, stated plainly): the six new skins' tile paintings live on the
 * recipe branch, so this branch previews them as CSS material studies. They are deliberately
 * material-accurate (Console = scanlined green glass, Carrara = white marble, Nero = black marble
 * with a gold vein, …) and cheap: no images, no new dependency. The picker reads ONLY through
 * `skinPreviewCss`, so swapping in the real tiny tile renders is a one-table edit.
 */
export const PLACEHOLDER_SKIN_CSS: Readonly<Record<SkinId, string>> = {
  forest: 'radial-gradient(circle at 35% 30%, #5b7f3b, #315321 65%, #233a18)',
  ash: 'radial-gradient(circle at 35% 30%, #57504c, #302c2c 65%, #211f1f)',
  water: 'radial-gradient(circle at 35% 30%, #2b668b, #173a52 65%, #0d2333)',
  toxic: 'radial-gradient(circle at 35% 30%, #5d7a2e, #2b2a1c 65%, #1b1a10)',
  console:
    'repeating-linear-gradient(0deg, #0a1b12 0 2px, #123322 2px 4px), radial-gradient(circle at 30% 20%, #2c7a4b, #07130c 70%)',
  voxel:
    'linear-gradient(135deg, #93a3b1 25%, transparent 25%) 0 0 / 10px 10px, linear-gradient(315deg, #93a3b1 25%, transparent 25%) 0 0 / 10px 10px, linear-gradient(45deg, #4b5966 25%, transparent 25%) 5px 5px / 10px 10px, linear-gradient(225deg, #4b5966 25%, transparent 25%) 5px 5px / 10px 10px, #6d7d8a',
  brushed:
    'repeating-linear-gradient(102deg, #aab2b8 0 1px, #7c848a 1px 3px, #929aa0 3px 4px, #6b7379 4px 6px), linear-gradient(160deg, #b9c1c7, #6d757b 70%)',
  carrara:
    'repeating-linear-gradient(114deg, transparent 0 16px, #9b978d55 16px 17px, transparent 17px 31px), radial-gradient(ellipse at 25% 10%, #faf8f2, #ddd9d0 55%, #b5b0a5)',
  nero:
    'repeating-linear-gradient(62deg, transparent 0 21px, #c9a45a44 21px 22px, transparent 22px 37px), radial-gradient(ellipse at 70% 20%, #323236, #121215 60%, #050506)',
  hypnosis:
    'repeating-radial-gradient(circle at 50% 45%, #15142a 0 4px, #6a4b8a 4px 8px, #e8d9a8 8px 10px)',
};

/** The CSS a picker thumbnail wears. The four shipped sets are overridden with a real tile render. */
export const skinPreviewCss = (id: PlanetSkin): string =>
  id === SKIN_COLOUR
    ? 'conic-gradient(from 210deg, #c4553f, #d6a04a, #8fae5a, #4f9bb5, #7b6bb0, #c4553f)'
    : PLACEHOLDER_SKIN_CSS[id];

/** The colour the art sits on, visible at softened corners (matches the shipped sets' own base). */
export const skinBaseColour = (id: PlanetSkin): string =>
  id === SKIN_COLOUR ? '#3a3a3e' : (TERRITORY_BASE_COLOUR[id as TerritoryId] ?? '#2a2b2e');

/**
 * THE OWNER-COLOUR RIM (the contract the recipe branch paints against). A "thin inner rim" means a
 * band just inside the hexagon: it never touches the neighbour, never sits outside the tile and
 * never multiplies the skin's own pixels.
 */
export const OWNER_RIM = Object.freeze({
  /** How far inside the hex boundary the rim's outer edge starts, as a fraction of the radius. */
  insetFraction: 0.06,
  /** The band's thickness as a fraction of the radius. */
  widthFraction: 0.045,
  /** Never thinner than this on a phone, never fatter than this on a desktop. */
  minWidthPx: 1.5,
  maxWidthPx: 3,
});

export type OwnerRimPx = Readonly<{ colour: string; insetPx: number; widthPx: number }>;

/**
 * Resolve one tile's rim. The painter calls this with the tile's owner colour and the hexagon's
 * on-screen circumradius in CSS pixels; the returned ring is drawn in the SAME pass as the skin art.
 * A skinned tile that does not call this has no owner colour at all — which is why every recipe must
 * accept it (see docs/SKINS.md).
 */
export const ownerRimFor = (colour: string, hexRadiusPx: number): OwnerRimPx => {
  const radius = Number.isFinite(hexRadiusPx) && hexRadiusPx > 0 ? hexRadiusPx : 0;
  return {
    colour,
    insetPx: Math.max(1, radius * OWNER_RIM.insetFraction),
    widthPx: Math.min(OWNER_RIM.maxWidthPx, Math.max(OWNER_RIM.minWidthPx, radius * OWNER_RIM.widthFraction)),
  };
};

/** Everything a skin's tile paint must expose to the picker and the board. */
export type SkinnedTilePaint = Readonly<{
  id: SkinId;
  name: string;
  /** Picker preview (a CSS background). */
  preview: string;
  /** The colour under the art. */
  base: string;
  /** The owner-colour ring this tile must carry. */
  rim: (ownerColour: string, hexRadiusPx: number) => OwnerRimPx;
}>;

export const skinnedTilePaint = (id: SkinId): SkinnedTilePaint => ({
  id,
  name: SKIN_NAMES[id],
  preview: skinPreviewCss(id),
  base: skinBaseColour(id),
  rim: ownerRimFor,
});
