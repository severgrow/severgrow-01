// The swipe-up throw's boomerang is ONE authored motion, built from the interface-motion
// vocabulary (`--ix-*` / INTERFACE_MOTION). It is presentation only: the plan takes rects and a
// motion gate, never a session or a legal action. Reduce motion / Speed off returns no flight.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';
import { BOOMERANG, planBoomerang } from '../src/ui/throw-boomerang.js';

const from = { left: 120, top: 600, width: 72, height: 100 };
const board = { x: 300, y: 260 };
const to = { left: 24, top: 120, width: 40, height: 56 };

const number = (value: Keyframe['transform'], re: RegExp): number =>
  Number(re.exec(String(value))?.[1] ?? 0);

describe('the swipe-up boomerang', () => {
  it('spends the interface-motion tokens, so it is not a second animation language', () => {
    expect(BOOMERANG.out).toBe(INTERFACE_MOTION.open);
    expect(BOOMERANG.hold).toBe(INTERFACE_MOTION.press);
    expect(BOOMERANG.back).toBe(INTERFACE_MOTION.close);
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

  it('runs 0.5-0.8s, settles at the board, then lands on the pile rect', () => {
    const plan = planBoomerang(from, board, to, true);
    expect(plan.duration).toBe(BOOMERANG.total);
    expect(plan.duration).toBeGreaterThanOrEqual(500);
    expect(plan.duration).toBeLessThanOrEqual(800);
    expect(plan.landMs).toBe(Math.round(BOOMERANG.total * BOOMERANG.landAt));
    expect(plan.landMs).toBeLessThan(plan.duration);

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
