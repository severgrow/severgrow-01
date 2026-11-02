// THE WINDOW CHANGED SHAPE; THE PLAYER'S CAMERA DID NOT (CI, 2026-11-02).
//
// The menu paints the Territory map across the whole screen, the panel keeps its framed box, so the
// two surfaces have DIFFERENT aspects (on a 390 x 844 phone: 390 / 843.984375 = 0.46209 for the
// menu, 358 / 725.984375 = 0.49312 for the panel). `reconciledView` is the drawing rule that makes
// either one fill without a letterbox band: keep the width, re-derive the height about the same
// centre.
//
// That rule was also being written back INTO the camera on every window change, so a zoom chosen
// inside the Territory came back 6.7% taller after one trip through the menu — identical x and
// width, a re-derived height, which is exactly the asymmetry the real CI log showed:
//
//   panned:   -124.46396793470825 -153.29211924396444 110.36387126390635 223.8057153690154
//   reopened: -124.46396793470825 -160.8064191379804  110.36387126390635 238.8343151570473
//
// The numbers below are those two lines. A deliberate camera must survive the frame change
// untouched; an automatic frame is still derived (and stays the same as it always was: both
// surfaces' auto viewBoxes are byte-identical to before this rule).
import { describe, expect, it } from 'vitest';
import { reconciledView, resizedCamera, type ViewBox } from '../src/online/world-view.js';

/** The camera the player zoomed to inside the Territory panel, from the CI log. */
const DELIBERATE: ViewBox = [-124.46396793470825, -153.29211924396444, 110.36387126390635, 223.8057153690154];
/** The measured aspects of the two surfaces of the same phone (390 x 844, panel 358 x 725.98). */
const MENU_ASPECT = 390 / 843.984375;
const PANEL_ASPECT = 358 / 725.984375;

describe('a deliberate camera survives the menu/territory frame change', () => {
  it('is handed back untouched by a window of another shape', () => {
    expect(resizedCamera(DELIBERATE, MENU_ASPECT, true)).toEqual(DELIBERATE);
    expect(resizedCamera(DELIBERATE, PANEL_ASPECT, true)).toEqual(DELIBERATE);
    // Not merely equal: the camera's own four numbers, byte for byte.
    expect(resizedCamera(DELIBERATE, MENU_ASPECT, true)!.join(' ')).toBe(DELIBERATE.join(' '));
  });

  it('keeps its exact viewBox across menu -> territory -> menu -> territory', () => {
    let camera: ViewBox | null = DELIBERATE;
    for (const aspect of [MENU_ASPECT, PANEL_ASPECT, MENU_ASPECT, PANEL_ASPECT]) camera = resizedCamera(camera, aspect, true);
    expect(camera!.join(' ')).toBe('-124.46396793470825 -153.29211924396444 110.36387126390635 223.8057153690154');
  });

  it('is never a reference the caller could write through', () => {
    const view = resizedCamera(DELIBERATE, MENU_ASPECT, true)!;
    view[3] = 1;
    expect(DELIBERATE[3]).toBe(223.8057153690154);
  });

  it('is the rule that made CI red, not a coincidence: the old path reproduces its numbers', () => {
    // What the camera used to become on the way back through the menu — the reopened line verbatim.
    expect(reconciledView(DELIBERATE, MENU_ASPECT)).toEqual([
      -124.46396793470825, -160.8064191379804, 110.36387126390635, 238.8343151570473,
    ]);
  });
});

describe('an automatic frame is still derived from the window', () => {
  it('is re-framed to the new aspect when the surface changes', () => {
    expect(resizedCamera(DELIBERATE, MENU_ASPECT, false)).toEqual(reconciledView(DELIBERATE, MENU_ASPECT));
    expect(resizedCamera(DELIBERATE, MENU_ASPECT, false)![3]).toBeCloseTo(DELIBERATE[2]! / MENU_ASPECT, 9);
  });

  it('keeps the width and the centre — the smallest correction to the window', () => {
    const framed = reconciledView(DELIBERATE, MENU_ASPECT)!;
    expect(framed[0]).toBe(DELIBERATE[0]);
    expect(framed[2]).toBe(DELIBERATE[2]);
    expect(framed[1]! + framed[3]! / 2).toBeCloseTo(DELIBERATE[1]! + DELIBERATE[3]! / 2, 9);
  });

  it('cannot tell the difference when the aspect already matches — the panel does not move', () => {
    expect(reconciledView(DELIBERATE, PANEL_ASPECT)).toBe(DELIBERATE);
    expect(reconciledView(DELIBERATE, PANEL_ASPECT * 1.001)).toBe(DELIBERATE);
  });
});

describe('the rule cannot invent a view', () => {
  it('passes a missing or unusable box straight through, for both kinds of camera', () => {
    expect(reconciledView(null, MENU_ASPECT)).toBeNull();
    expect(resizedCamera(null, MENU_ASPECT, true)).toBeNull();
    expect(reconciledView(null, PANEL_ASPECT)).toBeNull();
    expect(resizedCamera(null, PANEL_ASPECT, false)).toBeNull();
  });
});
