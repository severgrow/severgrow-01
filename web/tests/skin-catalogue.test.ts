// THE SKIN CATALOGUE AND THE OWNER RIM — the picker's contract with the paint branch.
//
// ui/skin-ids.ts and ui/owner-rim.ts are IDENTICAL files on `feat/wire-six-skins`; these tests pin
// the values both halves must agree on, so a drift on either branch fails here. The previews are
// placeholders on THIS branch (the recipes' real paintings live on the other one), so they are
// pinned only as "a distinct CSS material, in the recipe's own palette" — not as artwork.
import { describe, expect, it } from 'vitest';
import {
  BOARD_READY_SKIN_IDS,
  OWNER_RIM,
  PLACEHOLDER_SKIN_CSS,
  SERVER_SKIN_IDS,
  SKIN_COLOUR,
  SKIN_IDS,
  SKIN_NAMES,
  skinBaseColour,
  skinPreviewCss,
  skinnedTilePaint,
  ownerRimFor,
} from '../src/ui/skin-catalogue.js';
import { SKIN_BASE_COLOUR } from '../src/ui/skin-ids.js';
import { TERRITORY_IDS } from '../src/ui/forestAsh.js';

describe('the ten skins, one table for both branches', () => {
  it('is the approved order: the four atlas sets, then the six recipes', () => {
    expect([...SKIN_IDS]).toEqual([
      'forest', 'ash', 'water', 'toxic',
      'console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis',
    ]);
    expect([...SKIN_IDS].slice(0, 4)).toEqual([...TERRITORY_IDS]);
  });

  it('names every one of the eleven appearances, and nothing else', () => {
    expect(Object.keys(SKIN_NAMES).sort()).toEqual([...SKIN_IDS, SKIN_COLOUR].sort());
    expect(SKIN_NAMES.colour).toBe('Colour');
    expect(SKIN_NAMES.carrara).toBe('Carrara');
  });

  it('gives every skin its own base colour, matching the one the paint branch uses', () => {
    const bases = SKIN_IDS.map((id) => skinBaseColour(id));
    expect(new Set(bases).size, 'ten different bases').toBe(10);
    for (const id of SKIN_IDS) expect(skinBaseColour(id)).toBe(SKIN_BASE_COLOUR[id]);
    // The six signature colours from docs/SKINS-PROPOSAL.md, spelled out once.
    expect(SKIN_BASE_COLOUR.console).toBe('#c6d9cd');
    expect(SKIN_BASE_COLOUR.voxel).toBe('#c05a24');
    expect(SKIN_BASE_COLOUR.brushed).toBe('#5aa7dd');
    expect(SKIN_BASE_COLOUR.carrara).toBe('#eef1f4');
    expect(SKIN_BASE_COLOUR.nero).toBe('#0d0f12');
    expect(SKIN_BASE_COLOUR.hypnosis).toBe('#c3b6d6');
  });

  it('keeps the SERVER contract at the four atlas ids (the wider choice is local)', () => {
    expect([...SERVER_SKIN_IDS]).toEqual([...TERRITORY_IDS]);
    expect([...BOARD_READY_SKIN_IDS], 'this branch paints the four atlas sets only').toEqual([...TERRITORY_IDS]);
  });

  it('gives each skin a non-empty, distinct preview', () => {
    const previews = SKIN_IDS.map((id) => skinPreviewCss(id));
    expect(previews.every((css) => css.length > 20)).toBe(true);
    expect(new Set(previews).size).toBe(10);
    expect(skinPreviewCss(SKIN_COLOUR)).not.toBe(skinPreviewCss('forest'));
    for (const id of SKIN_IDS) expect(PLACEHOLDER_SKIN_CSS[id]).toBe(skinPreviewCss(id));
  });
});

describe('the paint contract the picker hands to a skin', () => {
  it('exposes the id, name, preview, base and the same rim for every skin', () => {
    for (const id of SKIN_IDS) {
      const paint = skinnedTilePaint(id);
      expect(paint.id).toBe(id);
      expect(paint.name).toBe(SKIN_NAMES[id]);
      expect(paint.base).toBe(skinBaseColour(id));
      expect(paint.preview).toBe(skinPreviewCss(id));
      expect(paint.rim('#c0247e', 23)).toEqual(ownerRimFor('#c0247e', 23));
    }
  });

  it('resolves a thin ring inside the hexagon, 1.5-3 px, and always fitting', () => {
    expect(OWNER_RIM.insetFraction).toBe(0.06);
    expect(OWNER_RIM.widthFraction).toBe(0.045);
    expect(OWNER_RIM.minWidthPx).toBe(1.5);
    expect(OWNER_RIM.maxWidthPx).toBe(3);
    const at46 = ownerRimFor('#c0247e', 23);
    expect(at46.widthPx).toBe(1.5);
    expect(at46.insetPx).toBeCloseTo(1.38, 2);
    for (const r of [0, 1, 2, 5, 23, 90, 400]) {
      const ring = ownerRimFor('#fff', r);
      const apothem = r * Math.cos(Math.PI / 6);
      expect(ring.insetPx + ring.widthPx).toBeLessThanOrEqual(apothem * OWNER_RIM.maxBandFraction + 1e-9);
      expect(Number.isFinite(ring.insetPx) && Number.isFinite(ring.widthPx)).toBe(true);
    }
  });
});
