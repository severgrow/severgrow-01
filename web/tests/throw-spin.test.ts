// OWNER, 2026-11-20: "the animation of card flying to discard pile --- create new variations when
// the card makes 1 full spin while flying to the throw pile. make it look really smooth and clean
// and nice ... then use that animation of spin instead of the current existing one roughly 20% of
// times but randomly. so its always a bit of surpise."
//
// The turn is on the card's own Z axis (in the screen plane, around its centre): the face stays
// towards the eye for the whole flight. A Y-axis turn would foreshorten the card to an edge in the
// middle of the flight — the one moment the player is reading which card they are losing.
//
// The choice is presentation only and deterministic: the same game + turn + card always makes the
// same call (a replay never changes), and the engine is never touched.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PINNED } from '../src/logic/motion.js';
import { BOOMERANG, SPIN_RATE, planBoomerang, spinSelected, throwSpinKey } from '../src/ui/throw-boomerang.js';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

const from = { left: 120, top: 600, width: 72, height: 100 };
const board = { x: 300, y: 260 };
const to = { left: 24, top: 120, width: 40, height: 56 };
const view = { width: 390, height: 844 };

const rot = (t: Keyframe['transform']): number => Number(/rotate\((-?[\d.]+)deg\)/.exec(String(t))?.[1] ?? 0);
const flight = (plan: ReturnType<typeof planBoomerang>) => plan.frames.filter((f) => Number(f.offset) <= BOOMERANG.landAt);

describe('the full-turn throw (one clean 360 through the flight)', () => {
  it('is one whole turn, so it arrives in exactly the pose it left in', () => {
    const f = flight(planBoomerang(from, board, to, true, view, { variant: 7, spin: true }));
    const r = f.map((k) => rot(k.transform));
    const travelled = r.at(-1)! - r[0]!;
    expect(Math.abs(travelled)).toBeCloseTo(360, 0); // exactly one turn, not 350 or 400
    // ... and the card seats upright afterwards, as the plain flick does. A spin's upright pose is
    // its whole turn (±360): writing 0 there would interpolate a second full circle backwards.
    const seat = planBoomerang(from, board, to, true, view, { variant: 7, spin: true }).frames
      .find((k) => k.offset === BOOMERANG.seatAt)!;
    expect(Math.abs(rot(seat.transform)) % 360).toBe(0);
    expect(Math.abs(rot(seat.transform))).toBeCloseTo(360, 5);
  });

  it('starts at the resting angle (no teleport) and turns forwards, never snapping mid-air', () => {
    const f = flight(planBoomerang(from, board, to, true, view, { variant: 7, spin: true }));
    const r = f.map((k) => rot(k.transform));
    // frame 0 is the card as it is picked up: the same 1-3 degree rest the plain flick starts on
    expect(Math.abs(r[0]!)).toBeLessThanOrEqual(3);
    // every step turns the same way, and no single sample jumps more than ~90 degrees in one go
    const deltas = r.slice(1).map((v, i) => v - r[i]!);
    const sign = Math.sign(deltas.reduce((a, b) => a + b, 0));
    for (const d of deltas) {
      expect(Math.sign(d)).toBe(sign);
      expect(Math.abs(d)).toBeLessThan(90);
    }
  });

  it('has spent the turn by the catch: it is upright and never still rotating when it lands', () => {
    const plan = planBoomerang(from, board, to, true, view, { variant: 7, spin: true });
    const f = flight(plan);
    const r = f.map((k) => rot(k.transform));
    const total = Math.abs(r.at(-1)! - r[0]!);
    // most of the turn is behind it at 3/4 of the flight (its near-constant middle)...
    const threeQuarters = r[Math.round((r.length - 1) * 0.75)]! - r[0]!;
    expect(Math.abs(threeQuarters)).toBeGreaterThan(total * 0.78);
    // ...yet it is still turning between the last two samples (no early stop, then a flat slide)
    expect(Math.abs(r.at(-1)! - r.at(-2)!)).toBeGreaterThan(0.2);
  });

  it('is still the same flight: same beat, same catch, fully visible, transform+opacity only', () => {
    const plain = planBoomerang(from, board, to, true, view, { variant: 7 });
    const spun = planBoomerang(from, board, to, true, view, { variant: 7, spin: true });
    expect(spun.duration).toBe(plain.duration);
    expect(spun.duration).toBe(PINNED.boomerang);
    expect(spun.landMs).toBe(plain.landMs);
    // a full turn is sampled more finely than the plain flick, so its angle is a curve, not steps
    expect(spun.frames.length).toBeGreaterThan(plain.frames.length);
    for (const k of spun.frames) {
      expect(Object.keys(k).filter((x) => !['transform', 'opacity', 'offset', 'easing'].includes(x))).toEqual([]);
      expect(k.opacity).toBe(1);
    }
    // the landing frame is the pile's own seat, exactly as the plain flick's (only the angle differs:
    // the spin arrives a whole turn further round, which is the same pose)
    const strip = (t: Keyframe['transform']) => String(t).replace(/rotate\(-?[\d.]+deg\)/, 'rotate(0deg)');
    const land = spun.frames.find((k) => k.offset === BOOMERANG.landAt)!;
    expect(strip(land.transform)).toBe(strip(plain.frames.find((k) => k.offset === BOOMERANG.landAt)!.transform));
  });

  it('the plain flick is unchanged: no full turn when the variant is off', () => {
    const f = flight(planBoomerang(from, board, to, true, view, { variant: 7 }));
    const peak = f.map((k) => Math.abs(rot(k.transform)));
    expect(Math.max(...peak)).toBeLessThanOrEqual(120);
  });

  it('Reduce motion / Speed off: no flight at all, so no spin either', () => {
    expect(planBoomerang(from, board, to, false, view, { spin: true })).toEqual({ duration: 0, frames: [], landMs: 0 });
  });
});

describe('one throw in five turns a full circle, chosen deterministically', () => {
  it('the rate is a named 20%', () => {
    expect(SPIN_RATE).toBe(20);
  });

  it('the same throw always makes the same call (replays never change)', () => {
    const key = throwSpinKey(4242, 9, 17);
    const first = spinSelected(key);
    for (let i = 0; i < 50; i++) expect(spinSelected(key)).toBe(first);
    expect(spinSelected(throwSpinKey(4242, 9, 17))).toBe(first);
  });

  it('the key carries the game, the turn and the card (never the card alone)', () => {
    // The card ids are the deck's faces, so a card-only key would make "the Moss 3 always spins".
    expect(throwSpinKey(1, 2, 3)).not.toBe(throwSpinKey(1, 2, 3).replace('1', '2'));
    const keys = new Set<string>();
    for (let seed = 1; seed <= 4; seed++) for (let turn = 1; turn <= 5; turn++) for (let card = 0; card < 8; card++) keys.add(throwSpinKey(seed, turn, card));
    expect(keys.size).toBe(4 * 5 * 8);
  });

  it('about a fifth of throws spin, and different throws differ', () => {
    let spins = 0;
    const total = 1000;
    const calls = new Set<boolean>();
    for (let i = 0; i < total; i++) {
      const on = spinSelected(throwSpinKey(7 + (i % 13), 1 + (i % 41), i % 60));
      spins += on ? 1 : 0;
      calls.add(on);
    }
    expect(calls.size).toBe(2); // both variants really occur
    expect(spins / total).toBeGreaterThan(0.15);
    expect(spins / total).toBeLessThan(0.25);
  });

  it('the throw chooses the variant from the game, the turn and the card, never Math.random', () => {
    expect(main).toContain('spinSelected(throwSpinKey(session.state.seed, session.state.turnNumber, step.card.id))');
    // the throw's own decision never touches Math.random (the page has other, unrelated uses)
    const at = main.indexOf('const flightMs = throwBoomerang(');
    expect(main.slice(at, at + 700)).not.toContain('Math.random(');
    const effects = readFileSync(new URL('../src/ui/effects.ts', import.meta.url), 'utf8');
    expect(effects).toContain('spin: opts.spin === true');
  });
});
