// THE DEFAULT SKIN IS THE ONLY LOOK (owner, 2026-10-29, on a live screenshot of his home tile: "that
// should NEVER happen - default skin should be the only thing that shows").
//
// The "home grows with the history of play" pass (8b5f6b41) drew a procedural tree — a lobed green
// canopy with red apples — on top of the default garden sprite of the player's own home. It is drawn
// in code, not from the skin's art, so on the live board it read as a different skin. It is switched
// off at its single drawing point; the history logic stays (logic/home-growth.ts) so a future growth
// can be expressed in the default skin's own art if the owner asks for it.
import { describe, expect, it } from 'vitest';
import { HOME_GROWTH_DRAWN, mountHomeGrowth, setHomeGrowthSource } from '../src/ui/home-growth.js';

describe('the player home shows only the default skin', () => {
  it('the procedural growth tree is switched off', () => {
    expect(HOME_GROWTH_DRAWN).toBe(false);
  });

  it('mounting a home never reads the growth history or draws anything, even with a source installed', () => {
    let asked = 0;
    setHomeGrowthSource(() => {
      asked++;
      return { earned: 4, seenRaw: null, motion: true, ready: true, record: () => undefined };
    });
    // A bare object: if the function touched the element at all, this would throw.
    expect(() => mountHomeGrowth({} as SVGGElement, 'home-0', {})).not.toThrow();
    expect(asked).toBe(0);
    setHomeGrowthSource(null);
  });
});
