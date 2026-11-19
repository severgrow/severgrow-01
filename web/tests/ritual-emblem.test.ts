// The ritual's emblem cover (owner, 2026-11-16): while the kanji rises, the emblem's own kanji goes and
// its hex turns to sit on the middle tile. See player/ritual-emblem.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMBLEM_BOX, EMBLEM_VIEWBOX, RING_HOME_DEG, RING_LOCK_AT, RING_SPIN_DEG, RING_TURN_DEG, emblemParts, ringFitScale, ringReturnFrames, ringRippleFrames, ringTurnFrames } from '../src/player/ritual-emblem.js';

const source = readFileSync(new URL('../src/assets/brand/hex-emblem.svg', import.meta.url), 'utf8');
const subpaths = (svg: string) => (svg.match(/M /g) ?? []).length;
const paths = (svg: string) => (svg.match(/<path /g) ?? []).length;

describe('the emblem splits into ring, tree and kanji', () => {
  const parts = emblemParts(source)!;

  it('finds all three', () => { expect(parts).not.toBeNull(); });

  it('the ring is only the two hex outlines', () => {
    expect(subpaths(parts.ring)).toBe(2);
    expect(parts.ring).toContain('M 625 124');
  });

  it('nothing is lost or drawn twice: every path of the file is in exactly one part', () => {
    expect(subpaths(parts.ring) + subpaths(parts.tree) + subpaths(parts.kanji)).toBe(subpaths(source));
    // the main path is split in two (ring, tree); every other path is copied once
    expect(paths(parts.ring) + paths(parts.tree) + paths(parts.kanji)).toBe(paths(source) + 1);
  });

  it('the kanji keeps its placement in the emblem', () => {
    expect(parts.kanji).toContain('translate(255.244 539.224) scale(0.372) translate(-27 -59)');
  });

  it('every part is drawn in the card\'s paint, never the brand cream', () => {
    for (const part of Object.values(parts)) expect(part).not.toContain('#FCEED2');
  });

  it('all three share one frame: the ring\'s own bounds', () => {
    const vb = `viewBox="${EMBLEM_VIEWBOX.x} ${EMBLEM_VIEWBOX.y} ${EMBLEM_VIEWBOX.w} ${EMBLEM_VIEWBOX.h}"`;
    for (const part of Object.values(parts)) expect(part).toContain(vb);
  });
});

describe('the turned ring lands on the tile', () => {
  it('turns a pointy-top hex flat-top', () => { expect(RING_TURN_DEG).toBe(30); });

  // Measured in web/e2e/ritual-centering.ts: the card and the middle tile on a phone and on a desktop.
  for (const [screen, card, tile] of [['390×844', 84.93, 66.57], ['1440×900', 114.83, 123.65]] as const) {
    it(`on ${screen} the ring's point-to-point width is the tile's, within a pixel`, () => {
      const turnedWidth = card * EMBLEM_BOX.width * (EMBLEM_VIEWBOX.h / EMBLEM_VIEWBOX.w);
      expect(Math.abs(turnedWidth * ringFitScale(card, tile) - tile)).toBeLessThan(1);
    });
  }

  it('a missing or absurd measurement never throws the ring across the board', () => {
    expect(ringFitScale(0, 60)).toBe(1);
    expect(ringFitScale(80, Number.NaN)).toBe(1);
    expect(ringFitScale(80, 4000)).toBe(2.4);
    expect(ringFitScale(80, 2)).toBe(0.6);
  });
});

describe('the key turn (owner, 2026-11-17: one visible spin, landing aligned, no colour change)', () => {
  const frames = ringTurnFrames(1.2);
  const angle = (f: Keyframe) => Number(/rotate\((-?[\d.]+)deg\)/.exec(String(f.transform))![1]);
  const scale = (f: Keyframe) => Number(/scale\(([\d.]+)\)/.exec(String(f.transform))![1]);
  it('turns once round and lands flat-top: 390 degrees, the same face as 30', () => {
    expect(RING_SPIN_DEG).toBe(390);
    expect(angle(frames.at(-1)!)).toBe(390);
    expect(angle(frames.at(-1)!) % 60).toBe(RING_TURN_DEG % 60);
  });
  it('winds back first, overshoots a little, locks, clicks, and rests at the tile size', () => {
    expect(angle(frames[1]!)).toBeLessThan(0);
    expect(angle(frames[2]!)).toBeGreaterThan(390);
    expect(angle(frames[2]!) - 390).toBeLessThan(12);
    const lock = frames.find((f) => f.offset === RING_LOCK_AT)!;
    expect(angle(lock)).toBe(390);
    expect(Math.min(...frames.slice(3).map(scale))).toBeLessThan(1.2);
    expect(scale(frames.at(-1)!)).toBe(1.2);
  });
  it('never changes colour (owner: "don\'t change its color"): transform only', () => {
    for (const f of frames) expect(Object.keys(f).filter((k) => !['transform', 'offset', 'easing'].includes(k))).toEqual([]);
  });
  it('the unlock ripple grows off the locked ring and fades out: transform and opacity only', () => {
    const r = ringRippleFrames(1.2);
    expect(angle(r[0]!)).toBe(390);
    expect(scale(r.at(-1)!)).toBeGreaterThan(scale(r[0]!));
    expect(r.at(-1)!.opacity).toBe(0);
  });
});

describe('the way home: a full circle back to the emblem (owner, 2026-11-17)', () => {
  const r = ringReturnFrames(1.2);
  const angle = (f: Keyframe) => Number(/rotate\((-?[\d.]+)deg\)/.exec(String(f.transform))![1]);
  it('starts where the lock left it and turns on, never back', () => {
    expect(angle(r[0]!)).toBe(RING_SPIN_DEG);
    expect(angle(r.at(-1)!)).toBeGreaterThan(RING_SPIN_DEG);
  });
  it('lands pointy side up at the emblem\'s own size, as the painted emblem on the pile', () => {
    expect(RING_HOME_DEG % 360).toBe(0);
    expect(String(r.at(-1)!.transform)).toContain('scale(1)');
  });
  it('the turn and the way home make two whole turns: a full circle and back', () => {
    expect(RING_HOME_DEG).toBe(720);
  });
  it('spreads the home turn across the flight with a gentle ease and no blur filter', () => {
    expect(r[0]?.easing).toBe('cubic-bezier(.35,.25,.65,.75)');
    expect(r.every((frame) => frame.filter === undefined)).toBe(true);
  });
});
