// THE TEN SKINS, IN ONE TABLE (owner, 2026-11-20). This file is IDENTICAL on both skins branches:
// the recipe branch (`feat/wire-six-skins`) paints them on the board, the picker branch
// (`feat/skins-picker`) chooses them. Two halves of one feature must never disagree about an id, a
// name or a base colour, so both import this file and neither keeps a second copy of the table.
//
// THE TEN, AND THE TWO KINDS:
//   the four ATLAS SETS  forest / ash / water / toxic — pictures cut from the supplied sheets, and
//                        the only ids the server's `skin` column can hold. These are also the four
//                        `TerritoryId`s, so nothing about the wire, the account save or the planet
//                        atlas changes.
//   the six RECIPES      console / voxel / brushed / carrara / nero / hypnosis — pure CSS/SVG paint,
//                        fixed colours, in-game only (docs/SKINS-PROPOSAL.md).
// A GAME appearance is any of the ten. A PLANET appearance is any of the ten OR 'colour' (Slab: the
// plain owner colour, planet-only). That is the whole two-axis model the picker implements.
import { TERRITORY_BASE_COLOUR, TERRITORY_IDS } from './forestAsh.js';
import type { TerritoryId } from './forestAsh.js';

/** The four atlas sets: pictures, a planet atlas cell, and a valid value of the server's column. */
export const SHIPPED_SKIN_IDS = TERRITORY_IDS;

/** The six painted families, in the owner's design-document order. */
export const RECIPE_SKIN_IDS = ['console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis'] as const;
export type RecipeSkinId = (typeof RECIPE_SKIN_IDS)[number];

/**
 * All ten, in picker order: the four sets first, then the six recipes. Written out rather than
 * spread so the type is the ten literals; a test pins it against `SHIPPED_SKIN_IDS` and
 * `RECIPE_SKIN_IDS` so the three can never drift apart.
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

/**
 * The colour under each skin's art — what shows at a hex's softened corners, and what the board
 * paints under a picture that has not loaded. The four sets' values are the shipped ones; the six
 * recipes' are the signature colours from docs/SKINS-PROPOSAL.md, so an unloaded tile still reads as
 * its own family rather than as Forest green.
 */
export const SKIN_BASE_COLOUR: Readonly<Record<SkinId, string>> = {
  ...TERRITORY_BASE_COLOUR,
  console: '#c6d9cd',
  voxel: '#c05a24',
  brushed: '#5aa7dd',
  carrara: '#eef1f4',
  nero: '#0d0f12',
  hypnosis: '#c3b6d6',
};

/**
 * The skins this build's BOARD can paint: ALL TEN. The merge of the recipe branch and the picker
 * makes the board two painters — the four atlas sets through `setFaSides`, the six recipes through
 * `setTileSkins` (ui/tileSkins.ts) — so every picker id has a board behind it. `atlasSkinFor` is
 * the narrower question the territory painter must ask: only four ids have a picture atlas.
 */
export const BOARD_READY_SKIN_IDS: readonly SkinId[] = SKIN_IDS;

/**
 * The id the board paints for a game appearance, or the seat's product fallback when this build
 * cannot paint it. Never returns 'colour': a game appearance is always a real skin.
 */
export const boardSkinFor = (skin: GameSkin | null | undefined, fallback: TerritoryId): SkinId =>
  skin && (BOARD_READY_SKIN_IDS as readonly string[]).includes(skin) ? skin : fallback;

/**
 * The ATLAS set the territory painter wears for a game appearance. Only the four shipped sets are
 * pictures in the ground atlas; a recipe is painted by the tile-skin path instead and must never
 * reach `setFaSides`, whose atlas has no cell for it.
 */
export const atlasSkinFor = (skin: GameSkin | null | undefined, fallback: TerritoryId): TerritoryId =>
  skin && (TERRITORY_IDS as readonly string[]).includes(skin) ? (skin as TerritoryId) : fallback;
