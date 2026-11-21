// THE CONTRAST TABLE (owner, 2026-11-20): when both seats chose the same skin, the opponent's tiles
// wear the fixed contrast partner in your view — and ONLY then. These tests prove the table is
// real, total and mutual, and the resolver changes nothing except on a collision.
//
// Exhaustive by construction: all 10 x 10 seat combinations are walked, so a future edit that adds
// a skin without a partner (or pairs one with itself) fails here rather than on a phone.
import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PARTNER,
  CONTRAST_SKINS,
  contrastPartner,
  resolveSeatSkins,
} from '../src/ui/skin-contrast.js';
import { SKIN_IDS } from '../src/ui/skin-catalogue.js';
import type { SkinId } from '../src/ui/skin-catalogue.js';

/** The owner's table, written once, by hand, so a code change cannot quietly redefine it. */
const EXPECTED: Record<SkinId, SkinId> = {
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
};

describe('the fixed contrast table', () => {
  it('is exactly the owner\'s five mutual pairs', () => {
    expect(CONTRAST_PARTNER).toEqual(EXPECTED);
  });

  it('knows every one of the ten skins, and nothing else', () => {
    expect([...CONTRAST_SKINS]).toEqual([...SKIN_IDS]);
    expect(Object.keys(CONTRAST_PARTNER).sort()).toEqual([...SKIN_IDS].sort());
    expect(Object.values(CONTRAST_PARTNER).sort()).toEqual([...SKIN_IDS].sort());
  });

  it('is a total involution: every skin has a partner in the table, and the partner partners back', () => {
    for (const skin of SKIN_IDS) {
      const partner = contrastPartner(skin);
      expect(SKIN_IDS, `${skin} maps outside the table`).toContain(partner);
      expect(partner, `${skin} maps to itself`).not.toBe(skin);
      expect(contrastPartner(partner), `${skin} -> ${partner} is not mutual`).toBe(skin);
    }
  });
});

describe('resolveSeatSkins', () => {
  it('changes nothing when the two seats chose differently (every non-collision, 90 pairs)', () => {
    for (const mine of SKIN_IDS) {
      for (const theirs of SKIN_IDS) {
        if (mine === theirs) continue;
        expect(resolveSeatSkins(mine, theirs), `${mine} vs ${theirs}`).toEqual({ mine, theirs });
      }
    }
  });

  it('never leaves both seats on one skin (every collision, 10 pairs)', () => {
    for (const skin of SKIN_IDS) {
      const view = resolveSeatSkins(skin, skin);
      expect(view.mine, 'your own tiles keep the skin you chose').toBe(skin);
      expect(view.theirs, 'the opponent wears the contrast partner').toBe(contrastPartner(skin));
      expect(view.theirs, 'both seats may never wear the same skin').not.toBe(view.mine);
      expect(view.theirs, 'the partner is always a real skin').not.toBe(skin);
    }
  });

  it('is symmetric: each client keeps its own skin and sees the other as the same partner', () => {
    for (const mine of SKIN_IDS) {
      for (const theirs of SKIN_IDS) {
        const myView = resolveSeatSkins(mine, theirs);
        // The opponent's client runs the same rule with the seats swapped.
        const theirView = resolveSeatSkins(theirs, mine);
        expect(myView.mine, 'I always see my own choice').toBe(mine);
        expect(theirView.mine, 'they always see their own choice').toBe(theirs);
        // What each sees for the OTHER seat agrees: on a collision both see the partner; otherwise
        // each sees the other's real choice.
        if (mine === theirs) {
          expect(myView.theirs, 'both clients see the opponent in the contrast skin').toBe(contrastPartner(mine));
          expect(theirView.theirs).toBe(contrastPartner(mine));
        } else {
          expect(myView.theirs, 'without a collision I see their real choice').toBe(theirs);
          expect(theirView.theirs, 'and they see mine').toBe(mine);
        }
      }
    }
  });

  it('is exhaustive over all 100 combinations and total', () => {
    let collisions = 0;
    for (const mine of SKIN_IDS) for (const theirs of SKIN_IDS) {
      const view = resolveSeatSkins(mine, theirs);
      expect(SKIN_IDS).toContain(view.mine);
      expect(SKIN_IDS).toContain(view.theirs);
      if (mine === theirs) collisions++;
      else expect(view.theirs).toBe(theirs);
      if (view.mine === view.theirs) expect(mine).not.toBe(theirs);
    }
    expect(collisions, 'ten diagonal collisions').toBe(SKIN_IDS.length);
  });
});
