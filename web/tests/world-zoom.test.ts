// THE MAP CANNOT LOSE ITS ZOOM (owner, 2026-10-29: "sometimes zoom in zoom out on territory doesnt
// work — i was just testing on desktop and wasnt able to zoom at some point randomly — add a fix").
//
// Two ways the map could stop answering, both of them STATE, not a missed event:
//
//   1. THE VIEW WENT NON-FINITE. `zoom()` divided the finger's position by the map's measured box;
//      a 0-wide box (measured while hidden, mid-transition or mid-repaint) makes that Infinity or
//      NaN, the new view inherits it, and every later clamp (`Math.max(closest, Math.min(frame, NaN))`)
//      stays NaN. `viewBox` is then written as "NaN NaN NaN NaN" and nothing draws again — for the
//      rest of the session, with no error anywhere.
//   2. THE VIEW WAS NULL. `open()` drops the view so a fresh visit re-frames; the re-frame only
//      happened inside `paint()`, and `paint()` is SKIPPED when the world has not changed. Second
//      visit: `this.box === null`, and `set`/`zoom`/`toggleZoom`/the pan all guard on it — wheel and
//      double-tap dead, the map still showing yesterday's viewBox (see web/e2e/territory-zoom.ts).
//
// These are the pure decisions the gesture code makes, so they are tested as numbers: the anchor of
// a zoom, one zoom step, the clamp, and which tracked pointers a new event proves are gone. The
// browser suite proves the wiring and the states (pane, chat, re-entry, resize, both limits).
import { describe, expect, it } from 'vitest';
import {
  clampedView,
  finiteView,
  stalePointers,
  usableView,
  viewAnchor,
  zoomedView,
  type ViewBox,
} from '../src/online/world-view.js';

const FRAME: ViewBox = [0, 0, 700, 350];

describe('a view is only real when its four numbers are', () => {
  it('accepts a measured view', () => {
    expect(usableView([0, 0, 400, 200])).toBe(true);
    expect(usableView([-1.5, 2.25, 0.5, 0.25])).toBe(true);
  });

  it('rejects the missing, the NaN, the endless and the empty', () => {
    expect(usableView(null)).toBe(false);
    expect(usableView(undefined)).toBe(false);
    expect(usableView([0, 0, NaN, 200])).toBe(false);
    expect(usableView([0, 0, 400, Infinity])).toBe(false);
    expect(usableView([0, 0, 0, 200])).toBe(false);
    expect(usableView([0, 0, 400, -1])).toBe(false);
    expect(usableView([0, 0, 400])).toBe(false);
  });

  it('falls back to the frame, and the fallback is always sound', () => {
    expect(finiteView(null, FRAME)).toEqual(FRAME);
    expect(finiteView([NaN, 0, 0, 0], FRAME)).toEqual(FRAME);
    expect(finiteView([0, 0, Infinity, 2], FRAME)).toEqual(FRAME);
    expect(usableView(finiteView([NaN, NaN, NaN, NaN], FRAME))).toBe(true);
  });

  it('hands back a copy, never the frame itself', () => {
    const fallback: ViewBox = [0, 0, 700, 350];
    const view = finiteView([NaN, 0, 0, 0], fallback);
    view[2] = 1;
    expect(fallback[2]).toBe(700);
  });
});

describe('the anchor of a zoom', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };

  it('is the finger as a fraction of the map', () => {
    expect(viewAnchor(300, 150, rect)).toEqual([0.5, 0.5]);
    expect(viewAnchor(100, 50, rect)).toEqual([0, 0]);
    expect(viewAnchor(500, 250, rect)).toEqual([1, 1]);
    // a quarter in from the left, three quarters down
    expect(viewAnchor(200, 200, rect)).toEqual([0.25, 0.75]);
  });

  it('never lands outside the map, even for a point outside it', () => {
    expect(viewAnchor(-500, -500, rect)).toEqual([0, 0]);
    expect(viewAnchor(5000, 5000, rect)).toEqual([1, 1]);
  });

  it('is the CENTRE of a map that cannot be measured (no Infinity, no NaN)', () => {
    expect(viewAnchor(300, 150, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0.5, 0.5]);
    // Only the axis that cannot be measured is centred; the other stays honest.
    expect(viewAnchor(300, 150, { left: 0, top: 0, width: 400, height: 0 })).toEqual([0.75, 0.5]);
    expect(viewAnchor(300, 150, { left: 0, top: 0, width: Infinity, height: 200 })).toEqual([0.5, 0.75]);
  });

  it('survives a NaN coordinate', () => {
    expect(viewAnchor(NaN, 150, rect)).toEqual([0.5, 0.5]);
    expect(viewAnchor(300, NaN, rect)).toEqual([0.5, 0.5]);
  });
});

describe('one zoom step', () => {
  const box: ViewBox = [0, 0, 400, 200];

  it('keeps the feel: the anchor stays put and both axes scale together', () => {
    const out = zoomedView(box, [0.5, 0.5], 2.2, FRAME);
    expect(out[2]).toBeCloseTo(400 / 2.2, 9);
    expect(out[3]).toBeCloseTo(200 / 2.2, 9);
    // the point under the anchor does not move
    expect(out[0]).toBeCloseTo(0.5 * (400 - 400 / 2.2), 9);
    expect(out[1]).toBeCloseTo(0.5 * (200 - 200 / 2.2), 9);
  });

  it('pins the corner under a corner anchor', () => {
    const corner = zoomedView(box, [0, 0], 2, FRAME);
    expect(corner[0]).toBeCloseTo(0, 9);
    expect(corner[1]).toBeCloseTo(0, 9);
    expect(corner[2]).toBeCloseTo(200, 9);
  });

  it('clamps in at a quarter of the frame and out at the frame', () => {
    let view = box;
    for (let i = 0; i < 40; i++) view = zoomedView(view, [0.5, 0.5], 1.22, FRAME);
    expect(view[2]).toBeCloseTo(FRAME[2] / 4, 9);
    expect(view[3]).toBeCloseTo(FRAME[2] / 4 / 2, 9);
    for (let i = 0; i < 40; i++) view = zoomedView(view, [0.5, 0.5], 1 / 1.22, FRAME);
    expect(view[2]).toBeCloseTo(FRAME[2], 9);
  });

  it('is still usable from a poisoned view', () => {
    for (const bad of [
      [NaN, 0, 400, 200],
      [0, 0, Infinity, 200],
      [0, 0, 400, NaN],
      [0, 0, 0, 0],
    ] as ViewBox[]) {
      const out = zoomedView(bad, [0.5, 0.5], 1.22, FRAME);
      expect(out.every((n) => Number.isFinite(n))).toBe(true);
      expect(out[2]).toBeGreaterThanOrEqual(FRAME[2] / 4 - 1e-9);
      expect(out[2]).toBeLessThanOrEqual(FRAME[2] + 1e-9);
      expect(out[3]).toBeGreaterThan(0);
    }
  });

  it('treats a NaN or negative scale as no step at all', () => {
    expect(zoomedView(box, [0.5, 0.5], NaN, FRAME)[2]).toBeCloseTo(400, 9);
    expect(zoomedView(box, [0.5, 0.5], -2, FRAME)[2]).toBeCloseTo(400, 9);
    expect(zoomedView(box, [0.5, 0.5], 0, FRAME)[2]).toBeCloseTo(400, 9);
  });

  it('treats a NaN anchor as the centre', () => {
    const out = zoomedView(box, [NaN, NaN], 2, FRAME);
    expect(out[0]).toBeCloseTo(0.5 * (400 - 200), 9);
    expect(out[1]).toBeCloseTo(0.5 * (200 - 100), 9);
  });
});

describe('the one clamp every view goes through', () => {
  // The desktop stage: the widest view (the frame) is WIDER than the world's fit box, by design.
  const FIT: ViewBox = [-10, -10, 720, 360];
  const STAGE: ViewBox = [0, 0, 900, 450];

  it('is the clamp the map has always had', () => {
    // wider than the fit: centred on it
    const wide = clampedView([-500, 500, 900, 450], FIT, STAGE, 100);
    expect(wide).toEqual([FIT[0] + (FIT[2] - 900) / 2, FIT[1] + (FIT[3] - 450) / 2, 900, 450]);
    // narrower than the fit: held inside it
    expect(clampedView([-500, -500, 400, 200], FIT, STAGE, 100)[0]).toBeCloseTo(FIT[0], 9);
    expect(clampedView([-500, -500, 400, 200], FIT, STAGE, 100)[1]).toBeCloseTo(FIT[1], 9);
    expect(clampedView([500, 500, 400, 200], FIT, STAGE, 100)[0]).toBeCloseTo(FIT[0] + FIT[2] - 400, 9);
    expect(clampedView([500, 500, 400, 200], FIT, STAGE, 100)[1]).toBeCloseTo(FIT[1] + FIT[3] - 200, 9);
    // the framed view is both ends of the zoom: a quarter of it, and all of it
    expect(clampedView([0, 0, 10, 5], FIT, STAGE, 175)[2]).toBeCloseTo(175, 9);
    expect(clampedView([0, 0, 9000, 4500], FIT, STAGE, 175)[2]).toBeCloseTo(STAGE[2], 9);
  });

  it('keeps the view’s own aspect when it re-derives the height', () => {
    const out = clampedView([0, 0, 400, 100], FIT, STAGE, 100);
    expect(out[2] / out[3]).toBeCloseTo(400 / 100, 9);
  });

  it('never poisons the map: every bad input comes back finite and legal', () => {
    const bad: (ViewBox | null)[] = [
      null,
      [NaN, NaN, NaN, NaN],
      [0, 0, NaN, 200],
      [Infinity, 0, 400, 200],
      [0, 0, 400, Infinity],
      [0, 0, 0, 0],
    ];
    for (const box of bad) {
      const out = clampedView(box, FIT, STAGE, 100);
      expect(out.every((n) => Number.isFinite(n))).toBe(true);
      expect(out[2]).toBeGreaterThan(0);
      expect(out[3]).toBeGreaterThan(0);
      expect(out[2]).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(out[2]).toBeLessThanOrEqual(STAGE[2] + 1e-9);
      if (out[2] < FIT[2]) {
        // inside the world: the window is clamped into the fit box
        expect(out[0]).toBeGreaterThanOrEqual(FIT[0] - 1e-9);
        expect(out[0]).toBeLessThanOrEqual(FIT[0] + FIT[2] - out[2] + 1e-9);
        expect(out[1]).toBeGreaterThanOrEqual(FIT[1] - 1e-9);
        expect(out[1]).toBeLessThanOrEqual(FIT[1] + FIT[3] - out[3] + 1e-9);
      } else {
        // wider than the world: centred on it
        expect(out[0]).toBeCloseTo(FIT[0] + (FIT[2] - out[2]) / 2, 9);
        expect(out[1]).toBeCloseTo(FIT[1] + (FIT[3] - out[3]) / 2, 9);
      }
    }
  });

  it('still gives a finite view when the cell floor cannot be measured (pixels 0)', () => {
    // `cellFloor()` is Infinity before the first measurement: the framed quarter is the floor then.
    const out = clampedView([0, 0, 50, 25], FIT, STAGE, Infinity);
    expect(out.every((n) => Number.isFinite(n))).toBe(true);
    expect(out[2]).toBeCloseTo(STAGE[2] / 4, 9);
  });

  it('ignores a NaN floor', () => {
    const out = clampedView([0, 0, 50, 25], FIT, STAGE, NaN);
    expect(out.every((n) => Number.isFinite(n))).toBe(true);
    expect(out[2]).toBeCloseTo(STAGE[2] / 4, 9);
  });
});

describe('a pointer the browser never released', () => {
  const mouse = (id: number): [number, { touch: boolean }] => [id, { touch: false }];
  const finger = (id: number): [number, { touch: boolean }] => [id, { touch: true }];

  it('is dropped by the next press: a mouse is ONE pointer', () => {
    const pointers = new Map([mouse(1)]);
    // pointerId 1 never sent its pointerup; pointerId 7 comes down
    const stale = stalePointers(pointers, { id: 7, pointerType: 'mouse', buttons: 1, down: true });
    expect(stale).toEqual([1]);
  });

  it('is dropped when a move proves every button is up', () => {
    const pointers = new Map([mouse(1)]);
    expect(stalePointers(pointers, { id: 1, pointerType: 'mouse', buttons: 0, down: false })).toEqual([1]);
    // a real drag always has a button held
    expect(stalePointers(pointers, { id: 1, pointerType: 'mouse', buttons: 1, down: false })).toEqual([]);
  });

  it('does not drop the mouse it is currently tracking', () => {
    const pointers = new Map([mouse(1)]);
    expect(stalePointers(pointers, { id: 1, pointerType: 'mouse', buttons: 1, down: true })).toEqual([]);
  });

  it('never drops a FINGER: the touch path has its own release', () => {
    const pointers = new Map([finger(3), mouse(1)]);
    // a mouse press drops the ghost MOUSE, and leaves the finger alone
    expect(stalePointers(pointers, { id: 7, pointerType: 'mouse', buttons: 1, down: true })).toEqual([1]);
    expect(stalePointers(pointers, { id: 1, pointerType: 'mouse', buttons: 1, down: true })).toEqual([]);
    // touch events never apply the mouse rule at all
    expect(stalePointers(pointers, { id: 9, pointerType: 'touch', buttons: 1, down: true })).toEqual([]);
    expect(stalePointers(pointers, { id: 9, pointerType: 'touch', buttons: 0, down: false })).toEqual([]);
  });

  it('leaves the map with nothing latched once the ghost is gone', () => {
    const pointers = new Map([mouse(1)]);
    for (const id of stalePointers(pointers, { id: 7, pointerType: 'mouse', buttons: 1, down: true })) pointers.delete(id);
    pointers.set(7, { touch: false });
    // one pointer held is one finger: the multi-gesture latch cannot survive a new press
    expect(pointers.size).toBe(1);
    expect([...pointers.keys()]).toEqual([7]);
  });
});
