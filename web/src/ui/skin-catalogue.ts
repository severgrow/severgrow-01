// THE SKIN CATALOGUE (owner, 2026-11-20): ten real skins plus the plain "Colour" treatment.
//
// THE IDS ARE NOT THIS FILE'S. They live in ui/skin-ids.ts, which is the SAME FILE on the recipe
// branch (`feat/wire-six-skins`): two halves of one feature must never disagree about an id, a name
// or a base colour. This module re-exports that table (so every existing import keeps working) and
// adds the one thing only the picker needs: a preview swatch and the paint contract's facade.
//
// "Colour" is Slab: the plain owner colour, PLANET ONLY — it has no in-game tile, which is why
// choosing it forces a second, deliberate choice of a real skin for the match (ui/skinChoice.ts,
// online/skin-switch.ts).
import { TERRITORY_IDS } from './forestAsh.js';
import { SKIN_BASE_COLOUR, SKIN_IDS, SKIN_NAMES, isPlanetSkin, isSkinId } from './skin-ids.js';
import type { GameSkin, PlanetSkin, SkinId } from './skin-ids.js';
import { OWNER_RIM, ownerRimFor } from './owner-rim.js';
import type { OwnerRimPx } from './owner-rim.js';

export { SKIN_COLOUR, BOARD_READY_SKIN_IDS, atlasSkinFor, boardSkinFor, SHIPPED_SKIN_IDS, RECIPE_SKIN_IDS } from './skin-ids.js';
export { SKIN_IDS, SKIN_NAMES, isPlanetSkin, isSkinId };
export type { GameSkin, PlanetSkin, SkinId };

/**
 * PLACEHOLDER PREVIEWS (assumption, stated plainly). The six recipes' real paintings live on the
 * recipe branch (`ui/tileSkinArt.ts`), which builds each thumbnail from the same SVG paint servers
 * the board draws — so this table is only what THIS branch can show until the branches merge.
 * They are material studies in the recipes' OWN signature palettes (docs/SKINS-PROPOSAL.md), not
 * invented looks: a Console chip is pastel, a Nero chip is monochrome, a Voxel chip is terracotta.
 * Cheap: gradients only, no images, no dependency.
 */
export const PLACEHOLDER_SKIN_CSS: Readonly<Record<SkinId, string>> = {
  forest: 'radial-gradient(circle at 35% 30%, #5b7f3b, #315321 65%, #233a18)',
  ash: 'radial-gradient(circle at 35% 30%, #57504c, #302c2c 65%, #211f1f)',
  water: 'radial-gradient(circle at 35% 30%, #2b668b, #173a52 65%, #0d2333)',
  toxic: 'radial-gradient(circle at 35% 30%, #5d7a2e, #2b2a1c 65%, #1b1a10)',
  // Console: the three pastel rhombi, and one hairline of the CRT.
  console:
    'repeating-linear-gradient(0deg, #221f1418 0 1px, transparent 1px 2px), conic-gradient(from 300deg, #e7dcc4, #b4cabc 0 33%, #cfc4d9 33% 66%, #c6d9cd 66% 100%)',
  // Voxel: sand over terracotta over earth, with the pixel props' greens.
  voxel:
    'repeating-linear-gradient(0deg, transparent 0 6px, #20120c14 6px 7px), linear-gradient(180deg, #e89a52 0 32%, #c05a24 32% 74%, #6b3018 74%), radial-gradient(circle at 42% 58%, #3f6b3a 0 3px, transparent 4px)',
  // Brushed: the bevel and the specular sweep of an anodised plate. The specular is the product's
  // warm off-white (#f2ede4), never pure white (owner, 2026-11-08; same rule as the tile recipes).
  brushed:
    'linear-gradient(180deg, #f2ede4 0 8%, #d3ebfd 14%, #5aa7dd 46%, #2a6597 78%, #0b2438 100%), repeating-linear-gradient(96deg, transparent 0 2px, #ffffff2b 2px 3px, #0b243826 3px 4px)',
  // Carrara: cool white stone, one bold seam that swells and thins.
  carrara:
    'linear-gradient(111deg, transparent 34%, #78858f40 40%, #78858f1f 46%, transparent 52%), linear-gradient(168deg, #f8fafb, #eef1f4 42%, #c3ccd5)',
  // Nero: GTA-2 monochrome — pale blocks carved by dark roads, one red car.
  nero:
    'linear-gradient(180deg, transparent 46.5%, #191d23 46.5% 53.5%, transparent 53.5%), linear-gradient(120deg, transparent 47.2%, #191d23 47.2% 52.8%, transparent 52.8%), linear-gradient(60deg, transparent 47.2%, #191d23 47.2% 52.8%, transparent 52.8%), linear-gradient(165deg, #dfe3e4, #c4cbcd), radial-gradient(circle at 56% 60%, #ff4d3d 0 2px, transparent 3px)',
  // Hypnosis: the five muted pearl hues, as fine rings.
  hypnosis:
    'repeating-radial-gradient(circle at 46% 45%, #f4f2ee 0 3px, #c3b6d6 3px 6px, #aabfd4 6px 9px, #b6c9b4 9px 12px, #d8c6a8 12px 15px, #d8b8b4 15px 18px)',
};

/** The CSS a picker thumbnail wears. The four shipped sets are overridden with a real tile render. */
export const skinPreviewCss = (id: PlanetSkin): string =>
  id === 'colour'
    ? 'conic-gradient(from 210deg, #c4553f, #d6a04a, #8fae5a, #4f9bb5, #7b6bb0, #c4553f)'
    : PLACEHOLDER_SKIN_CSS[id];

/**
 * The colour the art sits on, visible at softened corners. The six recipes' values are the
 * signature colours from the design document, shared with the recipe branch (ui/skin-ids.ts), so
 * an unloaded tile reads as its own family rather than as Forest green.
 */
export const skinBaseColour = (id: PlanetSkin): string =>
  id === 'colour' ? '#3a3a3e' : SKIN_BASE_COLOUR[id];

export { OWNER_RIM, ownerRimFor };
export type { OwnerRimPx };

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

/** The four shapes the server's `skin` column can hold (re-exported for the wire contract). */
export const SERVER_SKIN_IDS: readonly SkinId[] = TERRITORY_IDS;
