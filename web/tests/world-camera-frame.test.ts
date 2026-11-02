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
import { anchoredView, reconciledView, resizedCamera, type ViewBox } from '../src/online/world-view.js';

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

// THE WINDOW IS A WINDOW, NOT A RE-FIT (owner, 2026-11-02: "entering territory still 'drops' the
// territory few pixels lower ... so tiles don't move at all when entering/exiting territory from
// main menu"). The menu and the panel are two windows onto ONE map at ONE material scale. The panel
// is the sub-rectangle of the menu's screen that its own box covers — nothing about the map may be
// re-fitted to the panel's width or aspect.
describe('the panel is the menu’s map seen through a smaller window', () => {
  /** The menu's own phone surface: the full viewport, and its reconciled full-bleed view. */
  const MENU_RECT = { left: 0, top: 0, width: 390, height: 843.984375 };
  const PANEL_RECT = { left: 16, top: 102, width: 358, height: 725.984375 };
  // The menu's automatic frame on that phone (R = 10, X = sqrt(3), PAD = 18): a little wider than
  // the panel's old auto frame, and centred on the player's home. Its aspect is the MENU's own, as
  // `reconciledView` guarantees.
  const MENU_BOX: ViewBox = [-136.1814, -177.5, 146.8602, 146.8602 / (390 / 843.984375)];

  /** What the browser paints: the SVG's own `meet` mapping from world units to CSS pixels. */
  const project = (box: ViewBox, rect: typeof MENU_RECT) => {
    const k = Math.min(rect.width / box[2], rect.height / box[3]);
    const ox = (rect.width - box[2] * k) / 2;
    const oy = (rect.height - box[3] * k) / 2;
    return { x: (wx: number) => rect.left + ox + (wx - box[0]) * k, y: (wy: number) => rect.top + oy + (wy - box[1]) * k };
  };

  it('maps every world point to the same screen pixel in the panel as in the menu', () => {
    const panel = anchoredView({ box: MENU_BOX, rect: MENU_RECT }, PANEL_RECT);
    expect(panel).not.toBeNull();
    const menuAt = project(MENU_BOX, MENU_RECT);
    const panelAt = project(panel!, PANEL_RECT);
    for (const [wx, wy] of [[-120, -150], [-60, -100], [0, 0], [40, 90], [100, 160]] as const) {
      expect(panelAt.x(wx)).toBeCloseTo(menuAt.x(wx), 10);
      expect(panelAt.y(wy)).toBeCloseTo(menuAt.y(wy), 10);
    }
  });

  it('keeps exactly the panel’s own aspect, so its SVG never letterboxes or stretches', () => {
    const panel = anchoredView({ box: MENU_BOX, rect: MENU_RECT }, PANEL_RECT)!;
    expect(panel[2] / panel[3]).toBeCloseTo(PANEL_RECT.width / PANEL_RECT.height, 12);
  });

  it('is the menu’s mapping translated, not the panel’s old re-fit', () => {
    const panel = anchoredView({ box: MENU_BOX, rect: MENU_RECT }, PANEL_RECT)!;
    const menuK = MENU_RECT.width / MENU_BOX[2];
    // Same world-units-per-pixel as the menu — the tile scale does not change.
    expect(panel[2] / PANEL_RECT.width).toBeCloseTo(MENU_BOX[2] / MENU_RECT.width, 12);
    // The panel's box is shifted by its own offset in the menu's world units.
    expect(panel[0]).toBeCloseTo(MENU_BOX[0] + PANEL_RECT.left / menuK, 12);
    expect(panel[1]).toBeCloseTo(MENU_BOX[1] + PANEL_RECT.top / menuK, 12);
    // And it is NOT the re-fit that moved the tiles: that rule keeps the menu's width.
    expect(panel[2]).not.toBeCloseTo(reconciledView(MENU_BOX, PANEL_RECT.width / PANEL_RECT.height)![2], 6);
  });

  it('leaves the settle transform as the identity (dx = dy = 0, scale = 1)', () => {
    const panel = anchoredView({ box: MENU_BOX, rect: MENU_RECT }, PANEL_RECT)!;
    // The exact formula `enter()` used to slide the panel's map onto the menu's pixels.
    const mm = MENU_BOX[2] / MENU_RECT.width;
    const mt = panel[2] / PANEL_RECT.width;
    const s = mt / mm;
    const dx = (panel[0] - MENU_BOX[0]) / mm + (MENU_RECT.left - PANEL_RECT.left) + (PANEL_RECT.width / 2) * (s - 1);
    const dy = (panel[1] - MENU_BOX[1]) / mm + (MENU_RECT.top - PANEL_RECT.top) + (PANEL_RECT.height / 2) * (s - 1);
    expect(dx).toBeCloseTo(0, 10);
    expect(dy).toBeCloseTo(0, 10);
    expect(s).toBeCloseTo(1, 12);
  });

  it('accounts for a letterboxed menu box instead of assuming an exact aspect', () => {
    // A stale/unreconciled menu view is up to 0.2% off the window's aspect (see `reconciledView`).
    // The browser centres it with `meet`; the panel must inherit that offset, not drop it.
    const letterboxed: ViewBox = [-136.1814, -177.5, 146.8602, 300];
    const panel = anchoredView({ box: letterboxed, rect: MENU_RECT }, PANEL_RECT)!;
    const menuAt = project(letterboxed, MENU_RECT);
    const panelAt = project(panel, PANEL_RECT);
    expect(panelAt.x(12)).toBeCloseTo(menuAt.x(12), 10);
    expect(panelAt.y(70)).toBeCloseTo(menuAt.y(70), 10);
  });

  it('refuses a window that cannot be measured, and never invents a view', () => {
    expect(anchoredView({ box: MENU_BOX, rect: MENU_RECT }, { ...PANEL_RECT, width: 0 })).toBeNull();
    expect(anchoredView({ box: MENU_BOX, rect: { ...MENU_RECT, height: 0 } }, PANEL_RECT)).toBeNull();
    expect(anchoredView({ box: [0, 0, 0, 0], rect: MENU_RECT }, PANEL_RECT)).toBeNull();
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
