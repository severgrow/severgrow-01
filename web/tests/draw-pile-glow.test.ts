// The Draw step's piles (owner, 2026-10-22): "remove the contour thing, make the glow a tiny bit
// brighter, and make it breathe — changing opacity slowly, in the same movement as the cards". The
// glow is its own layer whose OPACITY breathes on the pile's own 1.8 s breath; no outline box, and
// no shadow is re-painted per frame.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const cockpit = read('../src/player/smart-cockpit.ts');
const info = read('../src/player/information.ts');
const rule = (src: string, selector: string) => {
  const i = src.indexOf(selector);
  expect(i, selector).toBeGreaterThanOrEqual(0);
  return src.slice(i, src.indexOf('}', i) + 1);
};

describe('the Draw step piles glow and breathe, with no outline box', () => {
  it('the pile card carries no outline ring', () => {
    const card = rule(cockpit, "html.futa04-information[data-step='draw'] :is(#deck,#discard).ready .pile-card {");
    expect(card).toMatch(/box-shadow:none !important/);
    expect(card).not.toMatch(/0 0 0 1px/);
  });

  it('the glow is a soft light a little brighter than before (0.27), and only its opacity breathes', () => {
    const glow = rule(cockpit, "html.futa04-information[data-step='draw'] :is(#deck,#discard).ready .pile-card::after {");
    // The light comes from the cockpit's one shared colour token (owner, 2026-11-15: "use the same on
    // draw pile during draw"), so the alpha is the colour-mix percentage rather than a literal rgba.
    const alpha = Number(/color-mix\(in srgb, var\(--fa-light[^)]*\) ([.\d]+)%/.exec(glow)?.[1]) / 100;
    expect(alpha).toBeGreaterThan(0.27);
    expect(alpha).toBeLessThanOrEqual(0.5);
    expect(glow).toMatch(/animation:futa04-draw-pile-glow 1\.8s ease-in-out 240ms infinite/);
    const frames = cockpit.slice(cockpit.indexOf('@keyframes futa04-draw-pile-glow'), cockpit.indexOf('}', cockpit.indexOf('@keyframes futa04-draw-pile-glow') + 40) + 2);
    expect(frames).toMatch(/opacity/);
    expect(frames).not.toMatch(/shadow|filter|scale|transform/);
  });

  it('the glow breathes on the pile’s own breath, and rests under reduce motion', () => {
    expect(info).toMatch(/animation: futa04-draw-pile-breathe 1\.8s ease-in-out 240ms infinite/);
    expect(cockpit).toMatch(/\.reduce-motion\[data-step='draw'\] :is\(#deck,#discard\)\.ready \.pile-card::after \{ animation:none; \}/);
    // A Throw pile that completes a Bloom keeps its own gold edge, not the white glow.
    expect(cockpit).toMatch(/#discard\.futa04-bloom-draw \.pile-card::after \{ display:none; \}/);
  });
});

// Owner, 2026-11-20: "during DRAW the piles size up — make them size up a tiny bit more, like 8%
// more, so it's even more tappable and obvious. unless it doesn't leave margin from the optional
// bloom button in middle — can't overlayer it". The swell used to be 1.16; 1.16 * 1.08 = 1.2532.
describe('the drawn piles are 8% bigger, without eating the middle control column', () => {
  const BASE_SCALE = 1.16;
  const pile = Number(/--box-pile: ([\d.]+)px/.exec(info)?.[1]);
  const scale = Number(/--draw-pile-scale: ([\d.]+)/.exec(info)?.[1]);
  /** The air between the drawn pile's inner edge and the middle grid track (the Bloom's column).
   *  The grid is [piles | middle | tools] with a 6px column gap; the drawn pile overhangs its own
   *  box on the middle side by `pile * (scale - 1)`, and Draw's gap between the two pile boxes is
   *  18px. With the shift toward the hand the piles travel into the middle track by design — this
   *  measures the reservation at their resting (unshifted) place, which is what the Bloom inherits. */
  const clearance = (boxPiles: number) => boxPiles - pile - 18 + 6 - pile * scale;

  it('one variable drives the swell, and it is the 8% step', () => {
    expect(Number.isFinite(pile) && pile > 0, '--box-pile').toBe(true);
    expect(scale / BASE_SCALE).toBeGreaterThan(1.075);
    expect(scale / BASE_SCALE).toBeLessThan(1.085);
    // Both the phone transform and the thumb variant read the same number, or one of them drifts.
    expect(rule(info, "html.futa04-information[data-step='draw'] .dock #futa04-box > .piles > .pile.ready {"))
      .toMatch(/transform: scale\(var\(--draw-pile-scale/);
    expect(rule(info, "html.futa04-information[data-thumb][data-step='draw'] .dock #futa04-box > .piles > .pile.ready {"))
      .toMatch(/transform: translateY\(10px\) scale\(var\(--draw-pile-scale/);
  });

  it('the Draw slot reserves the room the bigger piles need', () => {
    const slot = Number(/\[data-step='draw'\] \.dock > #futa04-box \{ --box-piles: ([\d.]+)px/.exec(info)?.[1]);
    expect(slot).toBe(133);
    expect(clearance(slot)).toBeGreaterThanOrEqual(8);
    // The old 128px slot cannot hold the bigger pile away from the middle column (3.3px of air),
    // so the same swell with the old reservation is exactly the overlap the owner ruled out.
    expect(clearance(128)).toBeLessThan(4);
  });

  it('the wide desktop reserves it too, and keeps its own larger margin', () => {
    const slot = Number(/\[data-layout='side'\]\[data-step='draw'\] \.dock > #futa04-box \{[^}]*--box-piles:([\d.]+)px/.exec(cockpit)?.[1]);
    const widePile = Number(/--box-pile:(\d+)px/.exec(cockpit)?.[1]);
    expect(slot).toBe(232);
    expect(widePile).toBe(88);
    const wide = (boxPiles: number) => boxPiles - widePile - 18 + 6 - widePile * scale;
    expect(wide(slot)).toBeGreaterThanOrEqual(21);
    expect(wide(224)).toBeLessThan(16);
  });

  it('the hand-alignment travel reserves the swell it now has', () => {
    // main.ts caps how far the piles may travel toward the hand: the cap must include the same
    // scale the swell uses, or the bigger pile could travel into the tools. It must also refuse to
    // cap against a tools box that has not laid out yet (0 width), or it locks a wrong anchor in.
    const main = read('../src/main.ts');
    expect(main).toMatch(/--draw-pile-scale/);
    expect(main).toMatch(/const overflow = pileWidth \* \(\(drawScale - 1\) \+ drawScale \* \.035\);/);
    expect(main).toMatch(/if \(!actions\?\.offsetWidth\) \{/);
    // The anchor may only be cached once the inputs it was computed from hold still: the Draw track
    // grows 108px -> 133px after the first frame, and a travel capped against the Grow slot is what
    // put a short hand's piles 1.9px inside the tools.
    expect(main).toMatch(/const geometryKey = `\$\{box\.clientWidth\}\|\$\{piles\.offsetWidth\}\|\$\{actions\?\.offsetWidth \?\? 0\}`/);
    expect(main).toMatch(/drawPileGeometry === geometryKey/);
    // Both branches use the same overflow: a `.21` literal reappearing in one of them is the drift.
    expect(main).not.toMatch(/pileWidth \* \.21/);
  });
});
