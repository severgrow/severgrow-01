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
  it('has the eight tokens the owner set and nothing else (2026-10-23: "alive and organic")', () => {
    expect(INTERFACE_MOTION).toEqual({
      open: 300,
      close: 180,
      press: 90,
      travel: 12,
      scale: 0.965,
      settle: 1.006,
      easeOpen: 'cubic-bezier(0.22, 1, 0.36, 1)',
      easeClose: 'cubic-bezier(0.4, 0, 1, 1)',
    });
  });

  it('stays one breath, never a bounce: short, small, and quicker to leave than to arrive', () => {
    expect(INTERFACE_MOTION.open).toBeLessThanOrEqual(320);
    expect(INTERFACE_MOTION.close).toBeLessThan(INTERFACE_MOTION.open);
    expect(INTERFACE_MOTION.press).toBeGreaterThanOrEqual(70);
    expect(INTERFACE_MOTION.press).toBeLessThanOrEqual(130);
    expect(INTERFACE_MOTION.travel).toBeLessThanOrEqual(16);
    expect(INTERFACE_MOTION.scale).toBeGreaterThanOrEqual(0.95);
    // the settle is a hair past rest, not a spring
    expect(INTERFACE_MOTION.settle).toBeGreaterThan(1);
    expect(INTERFACE_MOTION.settle).toBeLessThanOrEqual(1.01);
    // a backdrop (no travel, no growth) never settles
    expect(source).toMatch(/const settleScale = scale === 1 \? 1 : INTERFACE_MOTION\.settle;/);
  });

  it('the CSS custom properties are the same numbers, in one place', () => {
    expect(token('open')).toBe(`${INTERFACE_MOTION.open}ms`);
    expect(token('close')).toBe(`${INTERFACE_MOTION.close}ms`);
    expect(token('press')).toBe(`${INTERFACE_MOTION.press}ms`);
    expect(token('travel')).toBe(`${INTERFACE_MOTION.travel}px`);
    expect(token('scale')).toBe(String(INTERFACE_MOTION.scale));
    expect(token('settle')).toBe(String(INTERFACE_MOTION.settle));
    expect(token('ease-open')).toBe(INTERFACE_MOTION.easeOpen);
    expect(token('ease-close')).toBe(INTERFACE_MOTION.easeClose);
    // No near-duplicate token has crept in under a second spelling.
    expect(new Set(declarations('ix'))).toEqual(new Set(['open', 'close', 'press', 'travel', 'scale', 'settle', 'ease-open', 'ease-close']));
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
    for (const phrase of ['--ix-open', '300ms', '180ms', '90ms', '--ix-settle', 'enterSurface', 'exitSurface', 'data-ix-surface', 'reduced']) {
      expect(doc.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});
