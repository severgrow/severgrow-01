// THE INTERFACE MOTION LAYER IS ONE VOCABULARY (owner direction, 2026-10-22).
//
// The board's own choreography (`web/src/logic/motion.ts`) is pinned by `motion.test.ts`. This
// test pins the *interface* half: the four surfaces around the game share one small vocabulary,
// the CSS custom properties carry exactly the same numbers, the brief's ranges hold, and the layer
// can never quietly grow into a second animation framework.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTERFACE_MOTION, interfaceMotionAllowed } from '../src/ui/interface-motion.js';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const css = read('../src/style.css');
const source = read('../src/ui/interface-motion.ts');
const doc = read('../../docs/INTERFACE-MOTION.md');
const token = (name: string) => css.match(new RegExp(`--ix-${name}:\\s*([^;]+);`))?.[1]?.trim();
const declarations = (prefix: string): string[] =>
  [...css.matchAll(new RegExp(`--${prefix}-([\\w-]+):`, 'g'))].map((m) => m[1]!);

describe('one interface vocabulary', () => {
  it('has the seven tokens the brief allows and nothing else', () => {
    expect(INTERFACE_MOTION).toEqual({
      open: 200,
      close: 150,
      press: 90,
      travel: 8,
      scale: 0.99,
      easeOpen: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      easeClose: 'cubic-bezier(0.4, 0, 1, 1)',
    });
  });

  it('stays inside the owner’s ranges: 150-230 open, 110-190 close, 70-130 press, 4-10px, 98.5-99%', () => {
    expect(INTERFACE_MOTION.open).toBeGreaterThanOrEqual(150);
    expect(INTERFACE_MOTION.open).toBeLessThanOrEqual(230);
    expect(INTERFACE_MOTION.close).toBeGreaterThanOrEqual(110);
    expect(INTERFACE_MOTION.close).toBeLessThanOrEqual(190);
    expect(INTERFACE_MOTION.close).toBeLessThan(INTERFACE_MOTION.open);
    expect(INTERFACE_MOTION.press).toBeGreaterThanOrEqual(70);
    expect(INTERFACE_MOTION.press).toBeLessThanOrEqual(130);
    expect(INTERFACE_MOTION.travel).toBeGreaterThanOrEqual(4);
    expect(INTERFACE_MOTION.travel).toBeLessThanOrEqual(10);
    expect(INTERFACE_MOTION.scale).toBeGreaterThanOrEqual(0.985);
    expect(INTERFACE_MOTION.scale).toBeLessThanOrEqual(0.99);
  });

  it('the CSS custom properties are the same numbers, in one place', () => {
    expect(token('open')).toBe(`${INTERFACE_MOTION.open}ms`);
    expect(token('close')).toBe(`${INTERFACE_MOTION.close}ms`);
    expect(token('press')).toBe(`${INTERFACE_MOTION.press}ms`);
    expect(token('travel')).toBe(`${INTERFACE_MOTION.travel}px`);
    expect(token('scale')).toBe(String(INTERFACE_MOTION.scale));
    expect(token('ease-open')).toBe(INTERFACE_MOTION.easeOpen);
    expect(token('ease-close')).toBe(INTERFACE_MOTION.easeClose);
    // No near-duplicate token has crept in under a second spelling.
    expect(new Set(declarations('ix'))).toEqual(new Set(['open', 'close', 'press', 'travel', 'scale', 'ease-open', 'ease-close']));
    // The board's locked vocabulary is untouched: interface motion does not add a `--dur-*`.
    expect(new Set(declarations('dur'))).toEqual(new Set(['ack', 'consequence', 'quick', 'moment', 'tap', 'move']));
  });

  it('is a primitive layer, not a framework: three primitives and no dependency', () => {
    for (const name of ['enterSurface', 'exitSurface', 'press', 'resetSurface', 'interfaceMotionAllowed']) {
      expect(source).toMatch(new RegExp(`export (function|const) ${name}\\b`));
    }
    expect(source).not.toMatch(/from ['"]/); // dependency-free: no imports at all
    expect(source).not.toMatch(/setTimeout|setInterval/); // interruptions are state, never timers
  });

  it('reads the OS preference and the app setting, never the game speed', () => {
    expect(interfaceMotionAllowed()).toBe(false); // no document in this test = no motion
    expect(source).toContain("classList.contains('reduce-motion')");
    expect(source).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    // Speed Off is the board's time scale; an interface must still open when it is selected.
    expect(source).not.toMatch(/timeScale|animationSpeed|settings\.speed/);
  });

  it('has a designed reduced-motion state in CSS, both preferences', () => {
    expect(css).toMatch(/\.reduce-motion \.ix-arrive/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.ix-arrive/);
  });

  it('is documented, with tokens, adoption and the no-animation rule', () => {
    for (const phrase of ['--ix-open', '200ms', '150ms', '90ms', 'enterSurface', 'exitSurface', 'data-ix-surface', 'reduced']) {
      expect(doc.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});
