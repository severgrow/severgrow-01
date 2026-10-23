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
    const alpha = Number(/rgba\(242,237,224,([.\d]+)\)/.exec(glow)?.[1]);
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
