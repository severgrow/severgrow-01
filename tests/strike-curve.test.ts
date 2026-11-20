/**
 * ONE STRIKE CURVE FOR THE REPLAY AND THE GAME (owner, 2026-11-20: the recorded replay's Bomb "looks
 * good and that could be in the game reused, adjusted").
 *
 * The recorded replay paints the strike on a canvas (`replay/strike.ts`); the live game plays the
 * same beat over the board (`ui/effects.ts` for my Bomb, `ui/live-strike.ts` for theirs). Both read
 * `logic/strike.ts`. This suite is the guard that they cannot drift into two similar-looking curves:
 *
 *  - the curve's marks and its geometry are pinned (a change to the replay's feel is deliberate), and
 *  - the live landing's frames are the curve's own numbers at the curve's own offsets, and
 *  - every other player of the beat IMPORTS the curve instead of restating its numbers.
 *
 * Why the last point is a source check and not an import: the root project is DOM-free (`lib:
 * ES2022`), so it cannot type-check `replay/strike.ts` (it owns a canvas painter) — the same reason
 * `tests/throw-pile.test.ts` reads `ui/effects.ts` as text.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  STRIKE_ART_ASPECT, STRIKE_CARD_HEIGHT, STRIKE_OVERSHOOT, STRIKE_TIMING,
  fitStrikeLanding, strikeCardSize, strikeFlightFrames, strikeLook,
} from '../web/src/logic/strike.js';

const T = STRIKE_TIMING;
const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('the strike beat', () => {
  it('keeps the replay’s marks', () => {
    expect(T).toEqual({ landEnd: 0.16, burst: 0.36, burstEnd: 0.72, cardOutStart: 0.42, cardOutEnd: 0.64 });
    expect(STRIKE_CARD_HEIGHT).toBe(2.15);
    expect(STRIKE_ART_ASPECT).toBeCloseTo(256 / 356, 10);
  });

  it('lands with the 0.72 → 1.06 → 1 overshoot, then swells as it leaves', () => {
    expect(strikeLook(0).card.scale).toBeCloseTo(0.72, 5);
    const peak = strikeLook(T.landEnd * 0.7).card.scale;
    expect(peak).toBeCloseTo(1.06, 5);
    expect(STRIKE_OVERSHOOT).toBeCloseTo(0.06, 5);
    expect(strikeLook(T.landEnd).card.scale).toBeCloseTo(1, 5);
    // the card is solid from the landing until it starts to leave, then fades to nothing
    expect(strikeLook(0).card.alpha).toBe(0);
    expect(strikeLook(T.landEnd).card.alpha).toBeCloseTo(1, 5);
    expect(strikeLook(T.cardOutStart).card.alpha).toBeCloseTo(1, 5);
    expect(strikeLook(T.cardOutEnd).card.alpha).toBe(0);
    expect(strikeLook(T.cardOutEnd).card.scale).toBeCloseTo(1.12, 5);
    // the tiny lift is over before the card lands
    expect(strikeLook(0).card.lift).toBeCloseTo(0.5, 5);
    expect(strikeLook(T.landEnd).card.lift).toBeCloseTo(0, 5);
  });

  it('bursts at its own mark and is gone by burstEnd', () => {
    expect(strikeLook(T.burst - 0.01).burst).toBe(0);
    expect(strikeLook(T.burst + 0.03).burst).toBeCloseTo(0.5, 5);
    expect(strikeLook(T.burstEnd).burst).toBe(0);
    expect(strikeLook(1).burst).toBe(0);
  });

  it('is the SAME curve the replay paints with (one module, imported — never a copy)', () => {
    const replay = source('../web/src/replay/strike.ts');
    expect(replay).toMatch(/from '\.\.\/logic\/strike\.js'/);
    expect(replay).toMatch(/export \{ STRIKE_TIMING, strikeLook \}/);
    // …and the replay never restates the numbers or the curve itself
    expect(replay).not.toMatch(/landEnd:\s*0\.16/);
    expect(replay).not.toMatch(/const strikeLook\s*=/);
    // the live cue and the live landing read the same module
    for (const path of ['../web/src/ui/live-strike.ts', '../web/src/ui/effects.ts']) {
      expect(source(path)).toMatch(/from '\.\.\/logic\/strike\.js'/);
    }
  });

  it('sizes the card like the replay: 2.15 hex radii tall', () => {
    // a flat-top hex of radius 33 px has a 66 px long side: the card is 2.15 x 33 tall
    const size = strikeCardSize({ left: 0, top: 0, width: 66, height: 57 }, 72 / 102);
    expect(size.height).toBeCloseTo(2.15 * 33, 5);
    expect(size.width / size.height).toBeCloseTo(72 / 102, 10);
  });
});

describe('the live landing', () => {
  const hand = { dx: -100, dy: 300 };
  const frames = strikeFlightFrames({ ...hand, startScale: 72 / 51, liftPx: 33 });

  it('starts exactly where the card was picked up, at its own size', () => {
    const first = frames[0]!;
    expect(first.offset).toBe(0);
    expect(first.opacity).toBe(1);
    expect(String(first.transform)).toBe(`translate(${hand.dx.toFixed(2)}px, ${hand.dy.toFixed(2)}px) scale(${(72 / 51).toFixed(4)})`);
  });

  it('lands on the curve’s mark and is whole on the tile', () => {
    const land = frames.find((f) => f.offset === T.landEnd)!;
    expect(land).toBeDefined();
    expect(String(land.transform)).toContain('translate(0.00px, 0.00px)');
    expect(String(land.transform)).toContain('scale(1.0000)');
    expect(land.opacity).toBe(1);
  });

  it('every frame after the landing IS the curve (scale, lift and fade, no second hand-tuned number)', () => {
    for (const f of frames.filter((frame) => (frame.offset ?? 0) >= T.landEnd)) {
      const look = strikeLook(f.offset!);
      expect(f.opacity).toBeCloseTo(look.card.alpha, 3);
      expect(String(f.transform)).toContain(`scale(${look.card.scale.toFixed(4)})`);
      expect(String(f.transform)).toContain(`translate(0.00px, ${(-33 * look.card.lift).toFixed(2)}px)`);
    }
    // …and it is gone at the end (a fade, never a jump-cut)
    expect(frames.at(-1)!.opacity).toBe(0);
  });

  it('arrives with the curve’s overshoot rather than a straight line', () => {
    const mid = frames.find((f) => f.offset === T.landEnd * 0.7)!;
    expect(String(mid.transform)).toContain(`scale(${(72 / 51 + (1 - 72 / 51) * (1 - (1 - 0.7) ** 3) + STRIKE_OVERSHOOT).toFixed(4)})`);
  });

  it('keeps the whole card (overshoot included) inside the screen at every edge', () => {
    const view = { left: 0, top: 0, width: 390, height: 844 };
    const card = strikeCardSize({ left: 0, top: 0, width: 66, height: 57 }, 72 / 102);
    for (const [left, top] of [[0, 0], [324, 0], [0, 787], [324, 787], [160, 400]] as const) {
      const l = fitStrikeLanding({ left, top, width: 66, height: 57 }, view, card.width, card.height);
      const halfW = (l.width * (1 + STRIKE_OVERSHOOT)) / 2;
      const halfH = (l.height * (1 + STRIKE_OVERSHOOT)) / 2;
      expect(l.x - halfW).toBeGreaterThanOrEqual(view.left);
      expect(l.x + halfW).toBeLessThanOrEqual(view.left + view.width);
      expect(l.y - halfH).toBeGreaterThanOrEqual(view.top);
      expect(l.y + halfH).toBeLessThanOrEqual(view.top + view.height);
    }
  });
});
