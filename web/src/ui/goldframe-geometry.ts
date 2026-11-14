// THE GOLD FRAME'S BOX, in board units: pure numbers only, so the live board, the replay's canvas
// painter and the browser suites can share them without loading a picture.
import { S, SQ3 } from './geom.js';

/**
 * THE FRAME SITS INSIDE ITS HEX (owner, 2026-11-14: "gold frames and rock tiles are too big, they
 * should be a bit smaller a bit more contained in their hex"). The supplied frame's outer edge is
 * exactly the hex box, so the metal reads as a rim over the seams; the board's physical pieces
 * (rocks) already carry the same 5% trim. Centred, so the frame stays symmetric on every side.
 */
export const GOLD_FRAME_SCALE = 0.95;

/**
 * The frame's box around its hex centre (2.02S by 1.01√3S, trimmed and kept centred).
 *
 * `cellScale` is the cell's own scale on a bent board (`BOARD_BULGE`, ui/geom.ts): an outer hex is
 * drawn smaller than S, so per-cell art is drawn through `cellScale(key)`. The rim was the one piece
 * that did not, so on a bent board its outer edge sat outside the hex it belongs to — where the cell
 * in front of it, drawn later, sliced that overhang away and left a bright arc that started, ran
 * along part of the hex and stopped. On the flat product board this scale is exactly 1, so nothing
 * moves there.
 */
export const goldFrameSize = (cellScale = 1) => ({
  width: S * 2.02 * GOLD_FRAME_SCALE * cellScale,
  height: S * SQ3 * 1.01 * GOLD_FRAME_SCALE * cellScale,
});
