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

// OWNER CHANGED THE VALUES (0.75 polish pass, 2026-11-04: "Tighten all in-game animations ... shorter,
// crisper, precise, tactile; never bouncy or floaty"). This test pins the NEW numbers: tempo 96/336 ->
// 80/264, the pinned beats about a fifth shorter, and the settle curve's overshoot 1.1 -> 1.03.
describe('motion tokens', () => {
  it('has exactly two tempo tokens: ack and consequence', () => {
    expect(TEMPO).toEqual({ ack: 80, consequence: 264 });
    expect(Object.keys(TEMPO)).toEqual(['ack', 'consequence']);
  });

  it('derives quick and moment, and keeps the legacy names at today’s numbers', () => {
    expect(MOTION).toEqual({
      ack: 80,
      consequence: 264,
      tap: 80,
      quick: 160,
      move: 264,
      moment: 568,
    });
    expect(MOTION.quick).toBe(TEMPO.ack * 2);
    expect(MOTION.moment).toBe(TEMPO.consequence * 2 + TEMPO.ack / 2);
    expect(MOTION.tap).toBe(TEMPO.ack);
    expect(MOTION.move).toBe(TEMPO.consequence);
  });

  it('the thrown card lands inside the throw step: a 248 ms flight within the 312 ms wait (fix 32359b5)', () => {
    expect(PINNED.throwFlight).toBeLessThan(PINNED.throw);
  });

  it('pins the choreography that must never drift', () => {
    expect(PINNED).toEqual({
      humanDraw: 312,
      throw: 312,
      throwFlight: 248,
      // OWNER CHANGED THE VALUE (2026-11-08): the throw's own beat. 620 for the six-leg boomerang, then
      // 500 for the one-flick throw ("quick - but satisfying, not annoying"); OWNER CHANGED IT AGAIN
      // (2026-11-12): "lighter - snappy" and it "can be quicker" -> 420.
      boomerang: 420,
      liveReveal: 600,
      displayDwell: 1000,
      lessonDwell: 2000,
      // OWNER CHANGED THE VALUES (Beta 0.8, 2026-11-06: "slow down big blasts or big cuts", "Recommended
      // 2s is good"; Bloom "Slower, ~0.3 s apart"; opponent "Same weight, a touch slower"). See
      // docs/HANDOFF-0.8.md.
      cutCap: 2000,
      flash: 60,
      hitStopShort: 48,
      hitStop: 80,
      ripple: 56,
      growHold: 120,
      growOverlap: 0.5,
      // A Bloom's tiles land 1.14 of a move apart: 0.3 s at the 264 ms move (was 0.8, 2026-11-05; 0.5
      // before that). Other multi-tile reveals keep growOverlap's 0.5.
      bloomGap: 1.14,
      /** Big and Huge cuts ripple slower, one ring every 80 / 96 ms (Small and Severe keep `ripple`). */
      rippleBig: 80,
      rippleHuge: 96,
      /** Blast: tiles fall one ring every 64 ms (was 36), and it may hold up to 1.5 s for the biggest. */
      blastRing: 64,
      blastMax: 1500,
      /** The opponent's moves play 10% slower than mine: same weight, easier to follow. */
      opponentPace: 1.1,
    });
  });

  it('has one easing family: standard and settle over the same control points', () => {
    expect(EASE).toEqual({
      standard: 'cubic-bezier(0.2, 0.9, 0.2, 1)',
      settle: 'cubic-bezier(0.2, 0.9, 0.2, 1.03)',
      out: 'cubic-bezier(0.2, 0.9, 0.2, 1)',
      spring: 'cubic-bezier(0.2, 0.9, 0.2, 1.03)',
    });
    expect(EASE.out).toBe(EASE.standard);
    expect(EASE.spring).toBe(EASE.settle);
    // The only other allowed curves are the two continuous-special cases, never a new curve.
    expect(EASE_SPECIAL).toEqual({ marquee: 'linear', led: 'steps(1)' });
    expect(source.match(/cubic-bezier/g)?.length).toBe(2);
  });

  it('the CSS durations are the same two tokens and the same derivations', () => {
    expect(token('dur-ack')).toBe('80ms');
    expect(token('dur-consequence')).toBe('264ms');
    expect(token('dur-tap')).toBe('var(--dur-ack)');
    expect(token('dur-quick')).toBe('calc(var(--dur-ack) * 2)');
    expect(token('dur-move')).toBe('var(--dur-consequence)');
    expect(token('dur-moment')).toBe('calc(var(--dur-consequence) * 2 + var(--dur-ack) / 2)');
  });

  it('a new top-rank halo arrives on the move beat, not a half-second fade', () => {
    expect(css).toMatch(/\.top-glow\.glow-in \{\s*animation: glow-in var\(--dur-move\) var\(--ease-out\) both;/);
  });

  it('a newly painted hex clicks once on the move beat and then stays still', () => {
    expect(css).toMatch(/\.draw-ghost\.arrive \{\s*transform-box: fill-box;\s*transform-origin: center;\s*animation: ghost-click var\(--dur-move\) var\(--ease-spring\) both;\s*\}/);
    expect(css).toMatch(/\.draw-ghost\.arrive \.ghost-tile \{\s*animation: none;\s*\}/);
    expect(css).not.toMatch(/draw-ghost\.arrive \.ghost-tile \{[^}]*ghost-breathe/);
  });

  it('the score bar eases on the move beat and does not spring past the score', () => {
    expect(css).toMatch(/\.race-fill \{[^}]*transition:\s*--share var\(--dur-move\) var\(--ease-standard\);/);
    expect(css).not.toMatch(/cubic-bezier\(0\.34,\s*1\.4/);
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
