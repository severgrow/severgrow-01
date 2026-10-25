// The swipe-up throw's boomerang is ONE authored motion, built from the interface-motion
// vocabulary (`--ix-*` / INTERFACE_MOTION). It is presentation only: the plan takes rects and a
// motion gate, never a session or a legal action. Reduce motion / Speed off returns no flight.
//
// It must also FIT THE THROW: the discard step holds for `PINNED.throw` (396 ms) and the card's
// own flight is `PINNED.throwFlight` (320 ms). The boomerang is the interface vocabulary SCALED to
// that beat, so a future `INTERFACE_MOTION` edit can never silently push a throw past its step.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PINNED } from '../src/logic/motion.js';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';
import { BOOMERANG, planBoomerang } from '../src/ui/throw-boomerang.js';

const from = { left: 120, top: 600, width: 72, height: 100 };
const board = { x: 300, y: 260 };
const to = { left: 24, top: 120, width: 40, height: 56 };

/** The same legs at full interface length (a menu arriving, not a card thrown). */
const authored = INTERFACE_MOTION.open + INTERFACE_MOTION.press + INTERFACE_MOTION.close
  + Math.round(INTERFACE_MOTION.press * 0.6);

const number = (value: Keyframe['transform'], re: RegExp): number =>
  Number(re.exec(String(value))?.[1] ?? 0);

describe('the swipe-up boomerang', () => {
  it('is the interface-motion vocabulary scaled to the throw beat, not a second language', () => {
    // Each leg keeps its share of the move (within the 1 ms that integer rounding can shift).
    expect(BOOMERANG.out / BOOMERANG.total).toBeCloseTo(INTERFACE_MOTION.open / authored, 2);
    expect(BOOMERANG.hold / BOOMERANG.total).toBeCloseTo(INTERFACE_MOTION.press / authored, 2);
    expect(BOOMERANG.back / BOOMERANG.total).toBeCloseTo(INTERFACE_MOTION.close / authored, 2);
    const fadeShare = Math.round(INTERFACE_MOTION.press * 0.6) / authored;
    expect(BOOMERANG.fade / BOOMERANG.total).toBeCloseTo(fadeShare, 2);
    expect(BOOMERANG.total).toBe(BOOMERANG.out + BOOMERANG.hold + BOOMERANG.back + BOOMERANG.fade);

    const plan = planBoomerang(from, board, to, true);
    const allowed = new Set<string>([INTERFACE_MOTION.easeOpen, INTERFACE_MOTION.easeClose]);
    for (const frame of plan.frames) {
      if (frame.easing) expect(allowed.has(String(frame.easing))).toBe(true);
    }

    // No hand-written curve in the module: every easing is one of the two tokens above.
    const source = readFileSync(new URL('../src/ui/throw-boomerang.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('cubic-bezier');
  });

  it('fits the discard step: the flight is the card beat, inside the step wait', () => {
    // THE REGRESSION THIS GUARDS (2026-10-25): at interface length the boomerang was 624 ms and the
    // discard step awaited all of it, holding the turn 634 ms against a 396 ms beat (+228 ms).
    expect(BOOMERANG.total).toBe(PINNED.throwFlight);
    expect(BOOMERANG.total).toBeLessThan(PINNED.throw);
    // The beat has to leave room for the fade after the arrival, or the hand-over would unscreen
    // the old pile top. Every leg is still a real, positive segment: nothing was dropped.
    expect(BOOMERANG.out).toBeGreaterThan(0);
    expect(BOOMERANG.hold).toBeGreaterThan(0);
    expect(BOOMERANG.back).toBeGreaterThan(0);
    expect(BOOMERANG.fade).toBeGreaterThan(0);

    const plan = planBoomerang(from, board, to, true);
    expect(plan.duration).toBe(PINNED.throwFlight);
    expect(plan.duration).toBeLessThan(PINNED.throw);
    expect(plan.landMs).toBe(Math.round(BOOMERANG.total * BOOMERANG.landAt));
    expect(plan.landMs).toBeLessThan(plan.duration);
    // Most of the flight is the move out and home; the fade is the short hand-over tail.
    expect(BOOMERANG.landAt).toBeGreaterThan(0.85);
  });

  it('settles at the board, then lands on the pile rect', () => {
    const plan = planBoomerang(from, board, to, true);
    const settle = plan.frames.find((frame) => frame.offset === BOOMERANG.settleAt);
    expect(settle, 'a frame where the card settles').toBeTruthy();
    const toBoardX = board.x - (from.left + from.width / 2);
    const toBoardY = board.y - (from.top + from.height / 2);
    expect(String(settle!.transform)).toContain(`translate(${toBoardX.toFixed(1)}px, ${toBoardY.toFixed(1)}px)`);
    expect(number(settle!.transform, /rotate\((-?[\d.]+)deg\)/)).toBe(0);
    expect(String(settle!.transform)).toContain(`scale(${BOOMERANG.boardScale.toFixed(3)})`);

    const last = plan.frames.at(-1)!;
    const toPileX = to.left + to.width / 2 - (from.left + from.width / 2);
    const toPileY = to.top + to.height / 2 - (from.top + from.height / 2);
    expect(String(last.transform)).toContain(`translate(${toPileX.toFixed(1)}px, ${toPileY.toFixed(1)}px)`);
    expect(String(last.transform)).toContain(`scale(${(to.height / from.height).toFixed(3)})`);
    expect(last.opacity).toBe(0);

    // Arrival (opacity 1, on the pile) comes BEFORE the fade: the pile top is handed over while
    // the card is still covering it.
    const arrival = plan.frames.at(-2)!;
    expect(arrival.opacity).toBe(1);
    expect(arrival.offset).toBe(BOOMERANG.landAt);
    expect(String(arrival.transform)).toContain(`translate(${toPileX.toFixed(1)}px, ${toPileY.toFixed(1)}px)`);
  });

  it('turns slightly on the way out and the way home, and never spins twice', () => {
    const plan = planBoomerang(from, board, to, true);
    const rotations = plan.frames.map((frame) => number(frame.transform, /rotate\((-?[\d.]+)deg\)/));
    expect(rotations.some((r) => r === BOOMERANG.spinOut)).toBe(true);
    expect(rotations.some((r) => r === BOOMERANG.spinBack)).toBe(true);
    expect(Math.max(...rotations.map(Math.abs))).toBeLessThanOrEqual(12);
    // one turn out, one turn home, then aligned: no continuous spin
    const changes = rotations.filter((r, i) => i > 0 && r !== rotations[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(4);
  });

  it('Reduce motion / Speed off returns no flight at all', () => {
    expect(planBoomerang(from, board, to, false)).toEqual({ duration: 0, frames: [], landMs: 0 });
    // A hidden or zero-size source has nothing to fly from either.
    expect(planBoomerang({ left: 0, top: 0, width: 0, height: 0 }, board, to, true)).toEqual({ duration: 0, frames: [], landMs: 0 });
  });

  it('is pure: the same rects plan the same flight', () => {
    expect(planBoomerang(from, board, to, true)).toEqual(planBoomerang(from, board, to, true));
  });

  it('still flies when the throw was released on the pile itself', () => {
    // A drop onto the Throw pile takes off where the finger let go: `from` and `to` are the same
    // box. The card still has to visit the board, or the gesture would get no flourish at all.
    const onPile = { left: to.left, top: to.top, width: to.width, height: to.height };
    const plan = planBoomerang(onPile, board, to, true);
    expect(plan.duration).toBe(BOOMERANG.total);
    const settle = plan.frames.find((frame) => frame.offset === BOOMERANG.settleAt);
    expect(settle, 'it still settles over the board').toBeTruthy();
    expect(String(settle!.transform)).toContain(`translate(${(board.x - (onPile.left + onPile.width / 2)).toFixed(1)}px`);
    const last = plan.frames.at(-1)!;
    expect(String(last.transform)).toContain('translate(0.0px, 0.0px)');
    expect(last.opacity).toBe(0);
  });
});
