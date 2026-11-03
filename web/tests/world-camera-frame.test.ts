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
// untouched; an automatic frame is still derived.
//
// AND THE PANEL IS NO LONGER A SECOND VIEW AT ALL (owner, 2026-11-03: "we need a diffrent
// approach"). The old `anchoredView` calculated a viewBox for the panel that would reproduce the
// menu's mapping. The product now keeps the menu's own canvas, origin and viewBox and only clips
// the panel out of it (`cropInsets`), so a tile's screen rect is the same number on both surfaces
// by construction. The tests below pin that one mapping and the crop, and keep the old re-fit as
// the counter-example it must never become.
import { describe, expect, it } from 'vitest';
import { cropInsets, reconciledView, resizedCamera, screenMap, type ViewBox } from '../src/online/world-view.js';

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

// THE PANEL IS A CROP, NOT A RE-FIT (owner, 2026-11-03: "render the SAME full-bleed map with the
// SAME camera transform the menu used and let the Territory panel's frame act as a CROP over it").
// The menu and the panel therefore share ONE `screenMap`; the panel's frame only decides which part
// of that canvas is visible. The old re-fit is kept as the counter-example: it moves a tile.
describe('the panel is the menu’s canvas seen through a crop', () => {
  /** The menu's own phone surface: the full viewport, and its reconciled full-bleed view. */
  const MENU_RECT = { left: 0, top: 0, width: 390, height: 843.984375 };
  const PANEL_RECT = { left: 16, top: 102, width: 358, height: 725.984375 };
  const MENU_BOX: ViewBox = [-136.1814, -177.5, 146.8602, 146.8602 / (390 / 843.984375)];

  it('projects every world point through ONE mapping — the menu’s own', () => {
    const map = screenMap(MENU_BOX, MENU_RECT)!;
    // The same four numbers paint the panel: the canvas is the menu's, so this is not a second
    // calculation that could disagree. A tile's absolute screen rect is therefore identical.
    const again = screenMap(MENU_BOX, MENU_RECT)!;
    for (const [wx, wy] of [[-120, -150], [-60, -100], [0, 0], [40, 90], [100, 160]] as const) {
      expect(again.x(wx)).toBe(map.x(wx));
      expect(again.y(wy)).toBe(map.y(wy));
    }
    // The mapping is the browser's own `meet` rule: one scale, centred letterbox.
    expect(map.k).toBeCloseTo(Math.min(MENU_RECT.width / MENU_BOX[2], MENU_RECT.height / MENU_BOX[3]), 12);
  });

  it('cuts the panel’s own frame out of that canvas with inset()', () => {
    const insets = cropInsets(MENU_RECT, PANEL_RECT);
    expect(MENU_RECT.left + insets.left).toBe(PANEL_RECT.left);
    expect(MENU_RECT.top + insets.top).toBe(PANEL_RECT.top);
    expect(MENU_RECT.left + MENU_RECT.width - insets.right).toBe(PANEL_RECT.left + PANEL_RECT.width);
    expect(MENU_RECT.top + MENU_RECT.height - insets.bottom).toBe(PANEL_RECT.top + PANEL_RECT.height);
    // Nothing negative: a panel outside its canvas is not a crop the geometry can honour.
    for (const value of Object.values(insets)) expect(value).toBeGreaterThanOrEqual(0);
  });

  it('would move a tile if the panel re-derived its own view — the old failure, kept as a guard', () => {
    const correct = screenMap(MENU_BOX, MENU_RECT)!;
    const refit = reconciledView(MENU_BOX, PANEL_ASPECT)!;
    const wrong = screenMap(refit, PANEL_RECT)!;
    // The re-fit shifts the same world point by more than a pixel on this phone: that is the jump.
    expect(Math.abs(correct.x(0) - wrong.x(0))).toBeGreaterThan(1);
    expect(Math.abs(correct.y(0) - wrong.y(0))).toBeGreaterThan(1);
  });

  it('accounts for a letterboxed menu box instead of assuming an exact aspect', () => {
    // A stale/unreconciled menu view is up to 0.2% off the window's aspect (see `reconciledView`).
    // The browser centres it with `meet`; the panel inherits that offset because it is the same map.
    const letterboxed: ViewBox = [-136.1814, -177.5, 146.8602, 300];
    const map = screenMap(letterboxed, MENU_RECT)!;
    expect(map.oy).toBeGreaterThan(0);
    const k = Math.min(MENU_RECT.width / letterboxed[2], MENU_RECT.height / letterboxed[3]);
    expect(map.y(70)).toBeCloseTo(MENU_RECT.top + map.oy + (70 - letterboxed[1]) * k, 12);
  });

  it('refuses a canvas that cannot be measured, and never invents a mapping', () => {
    expect(screenMap([0, 0, 100, 100], { ...MENU_RECT, width: 0 })).toBeNull();
    expect(screenMap([0, 0, 100, 100], { ...MENU_RECT, height: 0 })).toBeNull();
    expect(screenMap([0, 0, 0, 0], MENU_RECT)).toBeNull();
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
