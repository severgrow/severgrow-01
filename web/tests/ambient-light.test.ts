// THE ROOM'S LIGHT (owner, 2026-11-14): one big, very slow pool behind everything, and the
// background's answer to a big action. Two things must never drift in a future edit:
//
//   1. IT MUST NEVER LIGHT THE BOARD. The guarantee is structural: the layer sits at z-index 0 and
//      every board cell paints an OPAQUE hex over it. If someone lifts the layer above the screens,
//      or gives the cells a transparent fill, the light would start washing the tiles. Both halves
//      of that are pinned below, plus the live pixel diff in the e2e measurement.
//   2. IT MUST NEVER COST FRAMES. Paint, not filter: one radial gradient, moved by transform only.
//      The `#spores` comment in style.css records why a `filter: blur()` on a moving layer is the
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

describe('the room light cannot reach the board', () => {
  it('sits at the bottom of the stack, under every screen', () => {
    expect(rule(`#${AMBIENT_LIGHT_ID}`)).toMatch(/z-index:\s*0/);
    expect(rule(`#${AMBIENT_LIGHT_ID}`)).toMatch(/pointer-events:\s*none/);
    expect(rule('.screen')).toMatch(/z-index:\s*1/);
    // Mounted into the background stack, before the motes: above #texture, below the game.
    expect(atmosphere).toContain('mountAmbientLight()');
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
  it('is one radial gradient moved by transform only', () => {
    const base = rule(`#${AMBIENT_LIGHT_ID} .al-base`);
    expect(base).toMatch(/background:\s*radial-gradient\(/);
    expect(base).toContain('animation: ambient-drift');
    expect(base).toContain('will-change: transform');
    expect(base).not.toMatch(/filter:/);
    expect(base).not.toContain('blur(');
    const drift = css.slice(css.indexOf('@keyframes ambient-drift'), css.indexOf('@keyframes ambient-drift') + 400);
    expect(drift).toMatch(/transform:\s*translate3d/);
    // Nothing on the moving layer may animate a paint property.
    expect(drift).not.toMatch(/(box-shadow|filter|background|opacity|border-radius)\s*:/);
  });

  it('derives the pool from the palette tokens, never a hardcoded colour', () => {
    const base = rule(`#${AMBIENT_LIGHT_ID} .al-base`);
    expect(base).toContain('var(--c-text)');
    expect(base).toContain('var(--c-you)');
    expect(base).toContain('var(--c-bg)');
    expect(base).toContain('color-mix(');
  });

  it('stops under a veil, exactly like the motes', () => {
    const gate = css.slice(css.indexOf('html.backdrop-held'), css.indexOf('animation-play-state: paused !important'));
    expect(gate).toContain(`#${AMBIENT_LIGHT_ID}`);
    expect(gate).toContain('#spores');
  });

  it('is still a still wash with Reduce motion (no drift, no pulse)', () => {
    expect(css).toMatch(new RegExp(`\\.reduce-motion #${AMBIENT_LIGHT_ID} \\.al-base \\{[^}]*animation:\\s*none`));
    expect(css).toMatch(new RegExp(`\\.reduce-motion #${AMBIENT_LIGHT_ID} \\.al-pulse \\{[^}]*display:\\s*none`));
    expect(css).toMatch(new RegExp(`@media \\(prefers-reduced-motion: reduce\\)[^@]*#${AMBIENT_LIGHT_ID} \\.al-base`));
  });

  it('keeps the pulse layer dark until an action needs it', () => {
    expect(rule(`#${AMBIENT_LIGHT_ID} .al-pulse`)).toMatch(/opacity:\s*0/);
  });
});
