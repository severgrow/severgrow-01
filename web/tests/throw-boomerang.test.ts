// THE THROW: ONE FLICK.
// OWNER CHANGED THE RULE (2026-11-08: "the flight of the card doesn't look natural, it shouldn't 'stop' on
// board and then go back to throw pile - it should be a quick flick flight natural not stopping - from hand
// towards the board and back to throw pile. doesn't always have to have the same path - can be depended on
// its position in hand ... physically correct"; spin: "light spin. player will see this moment thousands of
// times so quick - but satisfying, not annoying"). Was: six legs with a kiss and a hold on the board.
// Now one continuous curve (a cubic through the board), fast off the hand, slowest at the turn but never
// stopped, caught a touch big on the pile, a light spin whose side follows the card's place in the hand.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PINNED } from '../src/logic/motion.js';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';
import { BOOMERANG, PILE_THUD, PILE_THUD_MS, planBoomerang } from '../src/ui/throw-boomerang.js';

const from = { left: 120, top: 600, width: 72, height: 100 };
const board = { x: 300, y: 260 };
const to = { left: 24, top: 120, width: 40, height: 56 };
const view = { width: 390, height: 844 };

const num = (t: Keyframe['transform'], re: RegExp): number => Number(re.exec(String(t))?.[1] ?? 0);
const xy = (t: Keyframe['transform']): [number, number] => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(String(t))!;
  return [Number(m[1]), Number(m[2])];
};
const flight = (plan: ReturnType<typeof planBoomerang>) => plan.frames.filter((f) => Number(f.offset) <= BOOMERANG.landAt);

describe('one quick flick', () => {
  it('has its own short beat: quick, never a chore to watch', () => {
    expect(BOOMERANG.total).toBe(PINNED.boomerang);
    // OWNER CHANGED THE VALUE (2026-11-12: "lighter - snappy" and it "can be quicker"): 500 -> 420.
    expect(PINNED.boomerang).toBeGreaterThanOrEqual(400);
    expect(PINNED.boomerang).toBeLessThanOrEqual(470);
    const plan = planBoomerang(from, board, to, true, view);
    expect(plan.duration).toBe(PINNED.boomerang);
    expect(plan.landMs).toBe(Math.round(BOOMERANG.total * BOOMERANG.landAt));
  });

  it('never stops: no two consecutive flight frames share a position, and it reaches toward the board', () => {
    const f = flight(planBoomerang(from, board, to, true, view));
    expect(f.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < f.length; i++) {
      const [ax, ay] = xy(f[i - 1]!.transform); const [bx, by] = xy(f[i]!.transform);
      expect(Math.hypot(bx - ax, by - ay), `frame ${i}`).toBeGreaterThan(0.5);
    }
    // the far point of the curve is well out toward the board (it visits the board's side of the screen)
    const outX = board.x - (from.left + from.width / 2);
    const outY = board.y - (from.top + from.height / 2);
    const reach = Math.max(...f.map((k) => { const [x, y] = xy(k.transform); return (x * outX + y * outY) / Math.hypot(outX, outY); }));
    expect(reach).toBeGreaterThan(0.5 * Math.hypot(outX, outY));
  });

  it('moves like a flick: fastest off the hand, slower through the turn, a quick catch before the pile', () => {
    const f = flight(planBoomerang(from, board, to, true, view));
    const speed = f.slice(1).map((k, i) => {
      const [ax, ay] = xy(f[i]!.transform); const [bx, by] = xy(k.transform);
      return Math.hypot(bx - ax, by - ay) / (Number(k.offset) - Number(f[i]!.offset));
    });
    const mid = speed.slice(Math.floor(speed.length * 0.35), Math.ceil(speed.length * 0.65));
    // OWNER DIRECTION (2026-11-12: "fastest as it leaves the hand, decelerating like air drag, then a
    // quick final catch"): the FIRST step is the fastest of the whole flight, the middle is slower
    // than both ends, and the catch is quicker again than the turn. Never an even glide, never a stop.
    expect(speed[0]).toBe(Math.max(...speed));
    expect(speed[0]!).toBeGreaterThan(Math.min(...mid) * 1.3);
    expect(speed.at(-2)!).toBeGreaterThan(Math.min(...mid));
    expect(speed.every((s) => s > 0)).toBe(true);
  });

  // OWNER DIRECTION (2026-11-12): the card tilts in perspective as it lifts off and flattens as it
  // lands; it smears a hair along its own long axis at top speed.
  it('lifts off in 3D and a little stretched, and flattens by the landing', () => {
    const plan = planBoomerang(from, board, to, true, view);
    const lift = String(plan.frames[0]!.transform);
    expect(lift).toContain('perspective(');
    const tilt = Math.abs(num(lift, /rotateX\((-?[\d.]+)deg\)/));
    expect(tilt).toBeGreaterThan(10);
    expect(tilt).toBeLessThanOrEqual(24);
    // a two-argument scale is the smear: a touch longer along the card's long axis, a touch narrower across
    const smear = /scale\(([\d.]+), ([\d.]+)\)/.exec(lift);
    expect(smear).not.toBeNull();
    expect(Number(smear![2])).toBeGreaterThan(Number(smear![1]));
    // the landing is flat and round: no 3D, no smear, just the pile's own size and the catch
    const land = plan.frames.find((k) => k.offset === BOOMERANG.landAt)!;
    expect(String(land.transform)).not.toContain('perspective(');
    expect(String(land.transform)).not.toMatch(/scale\([\d.]+, [\d.]+\)/);
  });

  // OWNER DIRECTION (2026-11-12): "spin from the flick that decays in flight, landing at a small
  // natural rest angle of 1-3 degrees (varying between throws), NOT perfectly straight."
  it('lands at a small natural rest angle, 1-3 degrees, different from throw to throw', () => {
    const restOf = (variant: number) => {
      const plan = planBoomerang(from, board, to, true, view, { variant });
      const land = plan.frames.find((k) => k.offset === BOOMERANG.landAt)!;
      return num(land.transform, /rotate\((-?[\d.]+)deg\)/);
    };
    const angles = Array.from({ length: 12 }, (_, i) => restOf(100 + i));
    for (const a of angles) {
      expect(Math.abs(a)).toBeGreaterThanOrEqual(1);
      expect(Math.abs(a)).toBeLessThanOrEqual(3);
    }
    expect(new Set(angles.map((a) => a.toFixed(1))).size).toBeGreaterThan(2);
    // and it seats straight: a 1-3 degree flyer must never be left over the upright pile card
    const plan = planBoomerang(from, board, to, true, view, { variant: 7 });
    const seat = plan.frames.find((k) => k.offset === BOOMERANG.seatAt)!;
    expect(num(seat.transform, /rotate\((-?[\d.]+)deg\)/)).toBe(0);
  });

  it('a light spin, its side set by where the card sat in the hand', () => {
    const left = planBoomerang(from, board, to, true, view, { handMid: 300 });   // card left of the hand's middle
    const right = planBoomerang(from, board, to, true, view, { handMid: 0 });    // card right of it
    // The card turns as it flies out; the spin decays to its small landed rest angle (1-3 degrees,
    // owner 2026-11-12) and then seats straight so the hand-off to the upright pile card is clean.
    const rots = (p: ReturnType<typeof planBoomerang>) => p.frames.map((k) => num(k.transform, /rotate\((-?[\d.]+)deg\)/));
    const peak = (p: ReturnType<typeof planBoomerang>) => rots(p).reduce((m, r) => (Math.abs(r) > Math.abs(m) ? r : m), 0);
    for (const p of [left, right]) {
      expect(Math.abs(peak(p))).toBeGreaterThanOrEqual(60);
      expect(Math.abs(peak(p))).toBeLessThanOrEqual(120);
      expect(rots(p).at(-1)).toBe(0);
    }
    expect(Math.sign(peak(left))).not.toBe(Math.sign(peak(right)));
    // and the path itself differs: the two curves are not the same
    expect(JSON.stringify(xy(flight(left)[5]!.transform))).not.toBe(JSON.stringify(xy(flight(right)[5]!.transform)));
  });

  // OWNER CHANGED THE RULE (2026-11-10): the card covers the old one as it lands - no fade.
  it('is caught a touch big on the pile, seats at the pile size, and stays fully visible', () => {
    const plan = planBoomerang(from, board, to, true, view);
    const toX = to.left + to.width / 2 - (from.left + from.width / 2);
    const toY = to.top + to.height / 2 - (from.top + from.height / 2);
    const pile = to.height / from.height;
    const land = plan.frames.find((k) => k.offset === BOOMERANG.landAt)!;
    expect(xy(land.transform)).toEqual([Number(toX.toFixed(1)), Number(toY.toFixed(1))]);
    expect(num(land.transform, /scale\(([\d.]+)\)/)).toBeCloseTo(pile * BOOMERANG.catchScale, 3);
    expect(land.opacity).toBe(1);
    const seat = plan.frames.find((k) => k.offset === BOOMERANG.seatAt)!;
    expect(num(seat.transform, /scale\(([\d.]+)\)/)).toBeCloseTo(pile, 3);
    expect(plan.frames.at(-1)!.opacity).toBe(1);
  });

  it('transform + opacity only, interface easings, even clock in effects.ts', () => {
    const plan = planBoomerang(from, board, to, true, view);
    const allowed = new Set<string>([INTERFACE_MOTION.easeOpen, INTERFACE_MOTION.easeClose, 'linear']);
    for (const k of plan.frames) {
      if (k.easing) expect(allowed.has(String(k.easing))).toBe(true);
      expect(Object.keys(k).filter((x) => !['transform', 'opacity', 'offset', 'easing'].includes(x))).toEqual([]);
    }
    const effects = readFileSync(new URL('../src/ui/effects.ts', import.meta.url), 'utf8');
    const fn = effects.slice(effects.indexOf('function throwBoomerang('), effects.indexOf('function flyBack('));
    expect(fn).toMatch(/anim\(d, plan\.frames, \{ duration, easing: 'linear'/);
    expect(fn).toContain('handMid');
  });

  it('stays on screen whichever side it bows to', () => {
    for (const pileAt of [{ left: 8, top: 700, width: 40, height: 56 }, { left: 342, top: 700, width: 40, height: 56 }]) {
      for (const handMid of [0, 400]) {
        const f = flight(planBoomerang(from, board, pileAt, true, view, { handMid }));
        for (const k of f) {
          const [x, y] = xy(k.transform);
          const sx = from.left + from.width / 2 + x; const sy = from.top + from.height / 2 + y;
          expect(sx).toBeGreaterThan(-10); expect(sx).toBeLessThan(view.width + 10);
          expect(sy).toBeGreaterThan(-10); expect(sy).toBeLessThan(view.height + 10);
        }
      }
    }
  });

  it('the pile answers the catch with a small, quick thud (transform only)', () => {
    expect(PILE_THUD_MS).toBeLessThanOrEqual(260);
    for (const k of PILE_THUD) expect(Object.keys(k).filter((x) => !['transform', 'offset'].includes(x))).toEqual([]);
  });

  it('Reduce motion / Speed off: no flight; pure; a drop on the pile still flies', () => {
    expect(planBoomerang(from, board, to, false)).toEqual({ duration: 0, frames: [], landMs: 0 });
    expect(planBoomerang(from, board, to, true, view)).toEqual(planBoomerang(from, board, to, true, view));
    const onPile = { ...to };
    expect(planBoomerang(onPile, board, to, true, view).duration).toBe(BOOMERANG.total);
  });
});
