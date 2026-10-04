// Step 3 item 1: the board's orientation on screen. The engine's hex grid is drawn in one of two
// families: "pointy" (the board's own units: tiles with their points up and down) or "flat"
// (turned a quarter: points left and right), whichever gives bigger tiles for the screen.
// Positioning pass: within a family the board can also turn in steps of 60 degrees (a hex grid
// maps onto itself), so the two homes can sit on the screen's centre line. A pure rendering
// mapping: board units to screen units and back. Text, landmarks, textures and the light stay
// upright: everything is drawn in screen units. Engine coordinates never change.
import { rootCoord } from '../../../src/engine/index.js';
import type { RulesConfig } from '../../../src/engine/index.js';

export type Orient = 'pointy' | 'flat';

let cur: Orient = 'pointy';
let rot = 0;
let cos = 1;
let sin = 0;

/** Exact for the angles we use (multiples of 30 degrees): no -0 or 1e-17 crumbs. */
const tidy = (v: number) => {
  for (const exact of [0, 0.5, 1, -0.5, -1]) if (Math.abs(v - exact) < 1e-12) return exact + 0;
  return v;
};
const update = () => {
  const deg = (cur === 'pointy' ? 0 : -90) + 60 * rot;
  const a = (deg * Math.PI) / 180;
  cos = tidy(Math.cos(a));
  sin = tidy(Math.sin(a));
};

export const getOrient = (): Orient => cur;
export const setOrient = (o: Orient) => {
  cur = o;
  update();
};
/** The turn within the family, 0-5 (steps of 60 degrees, clockwise on screen). */
export const getRotation = () => rot;
export const setRotation = (k: number) => {
  rot = ((Math.round(k) % 6) + 6) % 6;
  update();
};

/** Board units to screen units (the family's quarter turn, then the rotation). */
export const toScreen = (x: number, y: number) => ({ x: x * cos - y * sin + 0, y: x * sin + y * cos + 0 });
/** Screen units back to board units. */
export const toBoard = (x: number, y: number) => ({ x: x * cos + y * sin + 0, y: -x * sin + y * cos + 0 });

/**
 * The rotation that puts the homes on the screen's centre line. Points left-right ("flat",
 * portrait phones): the opponent's home straight above mine. Points up-down ("pointy", wide
 * screens: there the homes can't be vertical): mine on the left, theirs on the right, level.
 */
export const homeRotation = (o: Orient, config: Pick<RulesConfig, 'rootStyle' | 'boardRadius'>, me: 0 | 1 = 0): number => {
  const centre = (p: 0 | 1) => {
    const c = rootCoord(p, config.rootStyle, config.boardRadius);
    return { x: Math.sqrt(3) * (c.q + c.r / 2), y: 1.5 * c.r };
  };
  const mine = centre(me);
  const theirs = centre(me === 0 ? 1 : 0);
  const want = o === 'flat' ? -90 : 0; // screen angle from my home to theirs (y points down)
  const was = { o: cur, k: rot };
  let best = 0;
  let bestErr = Infinity;
  for (let k = 0; k < 6; k++) {
    cur = o;
    rot = k;
    update();
    const a = toScreen(mine.x, mine.y);
    const b = toScreen(theirs.x, theirs.y);
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const err = Math.abs(((ang - want + 540) % 360) - 180);
    if (err < bestErr - 1e-9) {
      bestErr = err;
      best = k;
    }
  }
  cur = was.o;
  rot = was.k;
  update();
  return best;
};
