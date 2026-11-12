// THE GATE BEHIND THE GLASS (guard test).
//
// Two rules, both learned by measurement (docs/PERF-THERMAL.md):
//   1. Nothing behind a `backdrop-filter` veil may keep animating — a backdrop blur is only
//      composited once while what it covers is still. MEASURED before this rule existed: the finish
//      card held the main thread 27% busy with 601 layouts and 602 paints in five idle seconds, and
//      90-105% of a GPU core.
//   2. A WebGL/rAF loop must consult the gate before it draws, because CSS cannot pause it.
//      MEASURED: the menu's planet asked for 30 frames a second forever, 113% of a GPU core, while
//      the page did nothing else.
//
// These tests would have caught the original problem: they fail if the gate is removed from the
// loop, if the stylesheet stops pausing the veil's backdrop, or if the gate starts holding from the
// first frame (the display:none-wrapper bug found at boot).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VEIL_SELECTORS, backdropHeld, refreshBackdropGate, veilCovering } from '../src/ui/render-gate.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** A fake element: visible unless it says otherwise, exactly like a laid-out node. */
const fakeEl = (visible = true) => ({ getClientRects: () => (visible ? [{}] : []) });

type GateDoc = Parameters<typeof veilCovering>[0];
const fakeDocument = (veils: ReturnType<typeof fakeEl>[]) => ({
  querySelectorAll: () => veils,
  documentElement: { classList: { toggle: () => undefined } },
} as unknown as GateDoc);

describe('the veil gate', () => {
  it('names the surfaces that carry a backdrop-filter', () => {
    const joined = VEIL_SELECTORS.join(' ');
    for (const id of ['#gameover', '#install-prompt', '#sheet-menu', '.sheet'])
      expect(joined).toContain(id);
  });

  it('is open with no veil and held with one', () => {
    expect(veilCovering(fakeDocument([]))).toBe(false);
    expect(veilCovering(fakeDocument([fakeEl()]))).toBe(true);
  });

  it('does NOT hold for an unhidden element inside a hidden wrapper', () => {
    // The install invitation's own `.sheet` is hidden on the WRAPPER only. Reading the attribute
    // alone held the gate from the first frame of every load; the fix is to require a laid-out box.
    // This test is that bug, pinned.
    expect(veilCovering(fakeDocument([fakeEl(false)]))).toBe(false);
  });

  it('toggles the html class the stylesheet pauses on', () => {
    let written: boolean | null = null;
    const doc = {
      querySelectorAll: () => [fakeEl()],
      documentElement: { classList: { toggle: (_c: string, on: boolean) => { written = on; } } },
    };
    expect(refreshBackdropGate(doc as unknown as Document)).toBe(true);
    expect(written).toBe(true);
    expect(backdropHeld()).toBe(true);
    refreshBackdropGate({
      querySelectorAll: () => [],
      documentElement: { classList: { toggle: () => undefined } },
    } as unknown as Document);
    expect(backdropHeld()).toBe(false);
  });
});

describe('the stylesheet silences what is behind the veil', () => {
  const css = read('../src/style.css');

  it('pauses every animation under the held gate, pseudo-elements included', () => {
    const at = css.indexOf('html.backdrop-held');
    expect(at).toBeGreaterThan(-1);
    const end = css.indexOf('}', at);
    const block = css.slice(at, end);
    expect(block).toContain('animation-play-state: paused !important');
    expect(block).toContain('#game');
    // The full-screen warm pass is `#game::before`; a bare `*` selector never matches it, and while
    // it kept running it kept the finish card's blur recompositing every frame.
    expect(block).toContain('::before');
  });
});

describe('the planet loop obeys the gate', () => {
  const planet = read('../src/sphere/planet.ts');

  it('stops drawing while a veil covers it', () => {
    const frameAt = planet.indexOf('function frame(now: number)');
    expect(frameAt).toBeGreaterThan(-1);
    const head = planet.slice(frameAt, frameAt + 700);
    expect(head).toContain('backdropHeld()');
    // …and it must be an early return, before the frame is advanced or painted.
    expect(head.indexOf('backdropHeld()')).toBeLessThan(head.indexOf('const gap ='));
  });

  it('restarts the moment the veil lifts', () => {
    expect(planet).toContain('onBackdropChange');
  });

  it('gives the menu drift a frame budget below 60 fps', () => {
    // The menu's turn is 2.25°/s; redrawing it 30 times a second cost 113% of a GPU core.
    const value = Number(/const MENU_DRIFT_MS = (\d+)/.exec(planet)?.[1]);
    expect(value).toBeGreaterThanOrEqual(16);
    expect(value).toBeLessThanOrEqual(50);
  });
});
