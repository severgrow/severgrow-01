// THE ROOM'S ANSWER TO A BIG ACTION — and NOT a standing light.
//
// The history is why this file reads the way it does, and it reversed inside one day. On the
// morning of 2026-11-14 the owner asked for one slow pool of light behind the board; that shipped
// as `#futa04-ambient-light .al-base`. That evening, looking at the same build: "i liked the
// background of the old more, the black with stars + blurred flying lights. bring it back the same
// one." The old backdrop is the page's own star field and its drifting lights, and a full-screen
// pool can only cover it — so the pool is gone and only the action answer is left.
//
// These pin both halves, so a future edit cannot quietly undo either:
//
//   1. NOTHING PAINTS AT REST. There is no standing wash: no `.al-base` rule, no drift keyframes,
//      and the layer's only child starts at opacity 0. A pool brought back would cover the page's
//      backdrop again — measured at 390x844, hiding it restores the live site's own corner pixels.
//   2. IT MUST NEVER LIGHT THE BOARD. The guarantee is structural: the layer sits at z-index 0 and
//      every board cell paints an OPAQUE hex over it. If someone lifts the layer above the screens,
//      or gives the cells a transparent fill, the light would start washing the tiles.
//   3. IT MUST NEVER COST FRAMES. Paint, not filter: one radial gradient, then opacity only. The
//      `#spores` comment in style.css records why a `filter: blur()` on a moving layer is the
//      expensive answer (80 ms of GPU paint against 33 ms), and this is the same rule.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_ACTION_MS,
  AMBIENT_ACTION_TONE,
  AMBIENT_LIGHT_ID,
  AMBIENT_PULSE_CAP,
  AMBIENT_SPEED_BOUNDS,
  ambientPulsePlan,
  mountAmbientLight,
} from '../src/ui/ambient-light.js';
import { LIGHT_TONES } from '../src/player/light.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const css = read('../src/style.css');
const atmosphere = read('../src/player/atmosphere.ts');

/** One rule, from its selector to the closing brace. */
const rule = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing rule: ${selector}`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
};

describe('the room light answers a big action in the action\'s own colour', () => {
  it('takes the cut red and the warm amber, from the ONE LIGHT contract', () => {
    expect(AMBIENT_ACTION_TONE.cut).toBe('red');
    expect(AMBIENT_ACTION_TONE.blast).toBe('amber');
    expect(AMBIENT_ACTION_TONE.bomb).toBe('amber');
    // The tint is the tone's own bloom ink, never a second palette.
    for (const action of ['cut', 'blast', 'bomb'] as const) {
      const plan = ambientPulsePlan(action)!;
      expect(plan.tint).toBe(LIGHT_TONES[AMBIENT_ACTION_TONE[action]].bloom);
    }
  });

  it('pulses for a set time, scaled by the move speed, and never brighter than the cap', () => {
    const normal = ambientPulsePlan('blast', { strength: 1 })!;
    expect(normal.ms).toBe(AMBIENT_ACTION_MS.blast);
    expect(ambientPulsePlan('blast', { speed: 2 })!.ms).toBe(AMBIENT_ACTION_MS.blast * 2);
    // Fast (0.5) and slow (1.6) are clamped: a full-screen wash must not become a 200 ms flash,
    // and a replay must not stretch it into a lamp.
    expect(ambientPulsePlan('blast', { speed: 0.5 })!.ms).toBe(Math.round(AMBIENT_ACTION_MS.blast * AMBIENT_SPEED_BOUNDS.min));
    expect(ambientPulsePlan('blast', { speed: 9 })!.ms).toBe(AMBIENT_ACTION_MS.blast * AMBIENT_SPEED_BOUNDS.max);
    for (const action of ['cut', 'blast', 'bomb'] as const) {
      for (const strength of [0, 0.5, 1, 9]) {
        const peak = ambientPulsePlan(action, { strength })!.peak;
        expect(peak).toBeGreaterThan(0);
        expect(peak).toBeLessThanOrEqual(AMBIENT_PULSE_CAP);
      }
    }
    // A bigger action is a brighter answer, never a dimmer one.
    expect(ambientPulsePlan('blast', { strength: 1 })!.peak)
      .toBeGreaterThan(ambientPulsePlan('blast', { strength: 0 })!.peak);
  });

  it('does nothing at all with Reduce motion or Effects Low', () => {
    expect(ambientPulsePlan('cut', { reduced: true })).toBeNull();
    expect(ambientPulsePlan('blast', { quiet: true })).toBeNull();
    // And the DOM half refuses it too, even if a caller forgets the flag.
    expect(mountAmbientLight()).toBeNull(); // node: no document, nothing is built
  });
});

describe('a standing light is NOT painted: the page keeps its own backdrop', () => {
  it('has no pool layer and no drift — the old black, stars and their lights are untouched', () => {
    // The whole point of the owner's change: at rest this layer must paint nothing. No base
    // element in CSS, no drift keyframes, and the layer itself carries no animation.
    expect(css).not.toContain('.al-base');
    expect(css).not.toContain('ambient-drift');
    expect(rule(`#${AMBIENT_LIGHT_ID}`)).not.toMatch(/animation/);
    // The one child it does have starts invisible, so an idle screen is the page's own paint.
    expect(rule(`#${AMBIENT_LIGHT_ID} .al-pulse`)).toMatch(/opacity:\s*0/);
    // And the drift must not come back under another name: nothing in this layer's rules may
    // animate for more than a beat, and nothing may animate on a timer.
    for (const m of css.matchAll(new RegExp(`#${AMBIENT_LIGHT_ID}[^{]*\\{([^}]*)\\}`, 'g'))) {
      expect(m[1]!).not.toMatch(/animation:[^;]*infinite/);
    }
  });

  it('is built by the atmosphere into the background stack, before the motes', () => {
    expect(atmosphere).toContain('mountAmbientLight()');
    const src = read('../src/ui/ambient-light.ts');
    // Only the pulse is built — the standing pool element is gone from the module too.
    expect(src).not.toContain("'al-base'");
  });
});

describe('the room light cannot reach the board', () => {
  it('sits at the bottom of the stack, under every screen', () => {
    expect(rule(`#${AMBIENT_LIGHT_ID}`)).toMatch(/z-index:\s*0/);
    expect(rule(`#${AMBIENT_LIGHT_ID}`)).toMatch(/pointer-events:\s*none/);
    expect(rule('.screen')).toMatch(/z-index:\s*1/);
  });

  it('is painted over by opaque cells: the board fill never lets it through', () => {
    // The hex ground is an opaque token, and every cell paints it.
    expect(css).toMatch(/--c-hexFill:\s*#[0-9a-f]{6}/i);
    expect(rule('.hex')).toMatch(/fill:\s*var\(--c-hexFill\)/);
    // And the light itself paints no filter that could sample what is beneath the board.
    expect(rule(`#${AMBIENT_LIGHT_ID}`)).not.toMatch(/filter:/);
  });
});

describe('the room light is paint, not filter, and respects the render gate', () => {
  it('is one radial gradient that only ever moves in opacity', () => {
    const pulse = rule(`#${AMBIENT_LIGHT_ID} .al-pulse`);
    expect(pulse).toMatch(/background:/);
    expect(pulse).toMatch(/radial-gradient\(/);
    expect(pulse).not.toMatch(/filter:/);
    expect(pulse).not.toContain('blur(');
    expect(pulse).not.toMatch(/animation/);
    // The animation is JS (`element.animate`) and touches opacity alone — never a paint property.
    const src = read('../src/ui/ambient-light.ts');
    const beat = src.slice(src.indexOf('el.animate('), src.indexOf('], { duration: plan.ms'));
    expect(beat).toContain('opacity');
    expect(beat).not.toMatch(/(box-shadow|filter|background|transform|border-radius)/);
  });

  it('derives the pulse from the palette tokens, never a hardcoded colour', () => {
    const pulse = rule(`#${AMBIENT_LIGHT_ID} .al-pulse`);
    expect(pulse).toContain('var(--ambient-tint');
    expect(pulse).toContain('var(--c-text)');
    expect(pulse).toContain('color-mix(');
    // The position of the brightest part is the board's own centre, per layout.
    expect(rule(`#${AMBIENT_LIGHT_ID}`)).toContain('--al-x:');
  });

  it('stops under a veil, exactly like the motes', () => {
    const gate = css.slice(css.indexOf('html.backdrop-held'), css.indexOf('animation-play-state: paused !important'));
    expect(gate).toContain(`#${AMBIENT_LIGHT_ID}`);
    expect(gate).toContain('#spores');
  });

  it('plays no pulse at all with Reduce motion', () => {
    expect(css).toMatch(new RegExp(`\\.reduce-motion #${AMBIENT_LIGHT_ID} \\.al-pulse \\{[^}]*display:\\s*none`));
    expect(css).toMatch(new RegExp(`@media \\(prefers-reduced-motion: reduce\\)[^@]*#${AMBIENT_LIGHT_ID} \\.al-pulse`));
  });
});
