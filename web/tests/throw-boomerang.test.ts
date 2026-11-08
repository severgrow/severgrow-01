// THE THROW'S BOOMERANG.
// OWNER CHANGED THE RULE (2026-11-08: "how boomerang effect of card going to discard pile after throw -
// it doesn't look satisfying and is too quick. work on it to make it 10/10"). It used to be squeezed into
// the 248 ms card beat so it fit inside the discard step's wait; since 0.8 a player's own animation
// never blocks input and a throw ends the turn, so it has its own beat, `PINNED.boomerang`, and six
// readable legs: wind-up, out, kiss, a curved one-turn return, the catch, the hand-off.
// It is still presentation only (rects and a motion gate, never a session), and still transform +
// opacity with the interface easings.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PINNED } from '../src/logic/motion.js';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';
import { BOOMERANG, PILE_THUD, PILE_THUD_MS, planBoomerang } from '../src/ui/throw-boomerang.js';

const from = { left: 120, top: 600, width: 72, height: 100 };
const board = { x: 300, y: 260 };
const to = { left: 24, top: 120, width: 40, height: 56 };

const number = (value: Keyframe['transform'], re: RegExp): number =>
  Number(re.exec(String(value))?.[1] ?? 0);
const xy = (value: Keyframe['transform']): [number, number] => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(String(value))!;
  return [Number(m[1]), Number(m[2])];
};

describe('the boomerang has its own, slower beat', () => {
  it('runs PINNED.boomerang, well past the old 248 ms squeeze, and its legs partition it', () => {
    expect(BOOMERANG.total).toBe(PINNED.boomerang);
    expect(BOOMERANG.total).toBeGreaterThanOrEqual(2 * PINNED.throwFlight);
    expect(BOOMERANG.total).toBeLessThanOrEqual(700); // satisfying, never sluggish
    expect(BOOMERANG.windup + BOOMERANG.out + BOOMERANG.kiss + BOOMERANG.back + BOOMERANG.catch + BOOMERANG.fade).toBe(BOOMERANG.total);
    for (const leg of [BOOMERANG.windup, BOOMERANG.out, BOOMERANG.kiss, BOOMERANG.back, BOOMERANG.catch, BOOMERANG.fade]) {
      expect(leg).toBeGreaterThan(0);
    }
    // the way home is the longest leg: it is the boomerang
    expect(BOOMERANG.back).toBeGreaterThan(BOOMERANG.out);
    const plan = planBoomerang(from, board, to, true);
    expect(plan.duration).toBe(PINNED.boomerang);
    expect(plan.landMs).toBe(Math.round(BOOMERANG.total * BOOMERANG.landAt));
    expect(plan.landMs).toBeLessThan(plan.duration);
  });

  it('speaks the interface vocabulary: its easings are the interface tokens, transform + opacity only', () => {
    const plan = planBoomerang(from, board, to, true);
    const allowed = new Set<string>([INTERFACE_MOTION.easeOpen, INTERFACE_MOTION.easeClose]);
    for (const frame of plan.frames) {
      if (frame.easing) expect(allowed.has(String(frame.easing))).toBe(true);
      expect(Object.keys(frame).filter((k) => !['transform', 'opacity', 'offset', 'easing'].includes(k))).toEqual([]);
    }
    const source = readFileSync(new URL('../src/ui/throw-boomerang.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('cubic-bezier');
  });
});

describe('the six legs read', () => {
  const plan = planBoomerang(from, board, to, true);
  const frameAt = (offset: number) => plan.frames.find((f) => f.offset === offset)!;

  it('winds up: the card rises off the hand, tips back and grows a touch', () => {
    const lift = frameAt(BOOMERANG.liftAt);
    expect(xy(lift.transform)).toEqual([0, -BOOMERANG.liftPx]);
    expect(number(lift.transform, /rotate\((-?[\d.]+)deg\)/)).toBe(BOOMERANG.liftTip);
    expect(number(lift.transform, /scale\(([\d.]+)\)/)).toBeCloseTo(BOOMERANG.liftScale, 3);
  });

  it('arrives square on the board, gives as it touches, and is seated', () => {
    const settle = frameAt(BOOMERANG.settleAt);
    expect(xy(settle.transform)).toEqual([board.x - (from.left + from.width / 2), board.y - (from.top + from.height / 2)]);
    expect(number(settle.transform, /rotate\((-?[\d.]+)deg\)/)).toBe(0);
    const scales = plan.frames
      .filter((f) => Number(f.offset) >= BOOMERANG.settleAt && Number(f.offset) <= BOOMERANG.holdAt)
      .map((f) => number(f.transform, /scale\(([\d.]+)\)/));
    expect(Math.min(...scales)).toBeCloseTo(BOOMERANG.boardScale * BOOMERANG.press, 3);
    expect(scales.at(-1)).toBeCloseTo(BOOMERANG.boardScale, 3);
  });

  it('comes home on a curve, turning one whole turn like a real boomerang', () => {
    const rotations = plan.frames.map((f) => number(f.transform, /rotate\((-?[\d.]+)deg\)/));
    expect(rotations.at(-1)).toBe(360); // one whole turn: upright again on the pile
    expect(Math.max(...rotations)).toBe(360);
    // the middle of the way home is well off the straight board -> pile line
    const s = xy(frameAt(BOOMERANG.settleAt).transform);
    const e = xy(frameAt(BOOMERANG.landAt).transform);
    const m = xy(plan.frames.find((f) => Number(f.offset) > BOOMERANG.holdAt && Number(f.offset) < BOOMERANG.landAt)!.transform);
    const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
    const off = Math.abs((e[0] - s[0]) * (s[1] - m[1]) - (s[0] - m[0]) * (e[1] - s[1])) / len;
    expect(off / len).toBeGreaterThan(0.12);
  });

  it('is caught a touch big on the pile, seats at the pile size, then hands over with a short fade', () => {
    const toX = to.left + to.width / 2 - (from.left + from.width / 2);
    const toY = to.top + to.height / 2 - (from.top + from.height / 2);
    const pile = to.height / from.height;
    const land = frameAt(BOOMERANG.landAt);
    expect(xy(land.transform)).toEqual([Number(toX.toFixed(1)), Number(toY.toFixed(1))]);
    expect(number(land.transform, /scale\(([\d.]+)\)/)).toBeCloseTo(pile * BOOMERANG.catchScale, 3);
    expect(land.opacity).toBe(1);
    const seat = frameAt(BOOMERANG.seatAt);
    expect(number(seat.transform, /scale\(([\d.]+)\)/)).toBeCloseTo(pile, 3);
    expect(seat.opacity).toBe(1);
    const last = plan.frames.at(-1)!;
    expect(last.opacity).toBe(0);
    expect(BOOMERANG.fade).toBeLessThanOrEqual(60);
  });

  it('the pile answers the catch with a small, quick thud (transform only)', () => {
    expect(PILE_THUD_MS).toBeLessThanOrEqual(260);
    for (const f of PILE_THUD) expect(Object.keys(f).filter((k) => !['transform', 'offset'].includes(k))).toEqual([]);
    expect(Math.min(...PILE_THUD.map((f) => number(f.transform, /scale\(([\d.]+)\)/)))).toBeGreaterThan(0.93);
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(main).toContain('PILE_THUD');
  });
});

describe('the boomerang stays safe', () => {
  it('Reduce motion / Speed off returns no flight at all', () => {
    expect(planBoomerang(from, board, to, false)).toEqual({ duration: 0, frames: [], landMs: 0 });
    expect(planBoomerang({ left: 0, top: 0, width: 0, height: 0 }, board, to, true)).toEqual({ duration: 0, frames: [], landMs: 0 });
  });

  it('is pure: the same rects plan the same flight', () => {
    expect(planBoomerang(from, board, to, true)).toEqual(planBoomerang(from, board, to, true));
  });

  it('still flies when the throw was released on the pile itself', () => {
    const onPile = { left: to.left, top: to.top, width: to.width, height: to.height };
    const plan = planBoomerang(onPile, board, to, true);
    expect(plan.duration).toBe(BOOMERANG.total);
    const settle = plan.frames.find((frame) => frame.offset === BOOMERANG.settleAt);
    expect(String(settle!.transform)).toContain(`translate(${(board.x - (onPile.left + onPile.width / 2)).toFixed(1)}px`);
    expect(String(plan.frames.at(-1)!.transform)).toContain('translate(0.0px, 0.0px)');
  });
});
