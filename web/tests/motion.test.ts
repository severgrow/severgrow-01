// Phase 0: motion is a closed vocabulary.
// Exactly two tempo tokens, four derived/legacy durations, two easings, and the pinned table.
// A new raw duration or curve has nowhere legal to go: this test fails if one appears.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EASE, EASE_SPECIAL, MOTION, PINNED, TEMPO, motionAllowed } from '../src/logic/motion.js';

const source = readFileSync(new URL('../src/logic/motion.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
const declarations = (prefix: string): string[] =>
  [...css.matchAll(new RegExp(`--${prefix}-([\\w-]+):`, 'g'))].map((m) => m[1]!);

describe('motion tokens', () => {
  it('has exactly two tempo tokens: ack and consequence', () => {
    expect(TEMPO).toEqual({ ack: 96, consequence: 336 });
    expect(Object.keys(TEMPO)).toEqual(['ack', 'consequence']);
  });

  it('derives quick and moment, and keeps the legacy names at today’s numbers', () => {
    expect(MOTION).toEqual({
      ack: 96,
      consequence: 336,
      tap: 96,
      quick: 192,
      move: 336,
      moment: 720,
    });
    expect(MOTION.quick).toBe(TEMPO.ack * 2);
    expect(MOTION.moment).toBe(TEMPO.consequence * 2 + TEMPO.ack / 2);
    expect(MOTION.tap).toBe(TEMPO.ack);
    expect(MOTION.move).toBe(TEMPO.consequence);
  });

  it('the thrown card lands inside the throw step: a 320 ms flight within the 396 ms wait (fix 32359b5)', () => {
    expect(PINNED.throwFlight).toBeLessThan(PINNED.throw);
  });

  it('pins the choreography that must never drift', () => {
    expect(PINNED).toEqual({
      humanDraw: 396,
      throw: 396,
      throwFlight: 320,
      liveReveal: 700,
      displayDwell: 2000,
      cutCap: 1800,
      flash: 60,
      hitStopShort: 60,
      hitStop: 100,
      ripple: 70,
      growHold: 160,
      growOverlap: 0.6,
    });
  });

  it('has one easing family: standard and settle over the same control points', () => {
    expect(EASE).toEqual({
      standard: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
      settle: 'cubic-bezier(0.2, 0.8, 0.3, 1.1)',
      out: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
      spring: 'cubic-bezier(0.2, 0.8, 0.3, 1.1)',
    });
    expect(EASE.out).toBe(EASE.standard);
    expect(EASE.spring).toBe(EASE.settle);
    // The only other allowed curves are the two continuous-special cases, never a new curve.
    expect(EASE_SPECIAL).toEqual({ marquee: 'linear', led: 'steps(1)' });
    expect(source.match(/cubic-bezier/g)?.length).toBe(2);
  });

  it('the CSS durations are the same two tokens and the same derivations', () => {
    expect(token('dur-ack')).toBe('96ms');
    expect(token('dur-consequence')).toBe('336ms');
    expect(token('dur-tap')).toBe('var(--dur-ack)');
    expect(token('dur-quick')).toBe('calc(var(--dur-ack) * 2)');
    expect(token('dur-move')).toBe('var(--dur-consequence)');
    expect(token('dur-moment')).toBe('calc(var(--dur-consequence) * 2 + var(--dur-ack) / 2)');
  });

  it('the CSS easings are the same family', () => {
    expect(token('ease-standard')).toBe(EASE.standard);
    expect(token('ease-settle')).toBe(EASE.settle);
    expect(token('ease-out')).toBe('var(--ease-standard)');
    expect(token('ease-spring')).toBe('var(--ease-settle)');
  });

  it('does not allow a new raw duration or easing token', () => {
    expect(new Set(declarations('dur'))).toEqual(new Set(['ack', 'consequence', 'quick', 'moment', 'tap', 'move']));
    expect(new Set(declarations('ease'))).toEqual(new Set(['standard', 'settle', 'out', 'spring']));
  });

  it('has one motion gate for Reduce motion and a zero time scale', () => {
    expect(motionAllowed(false, 1)).toBe(true);
    expect(motionAllowed(true, 1)).toBe(false);
    expect(motionAllowed(false, 0)).toBe(false);
  });
});
