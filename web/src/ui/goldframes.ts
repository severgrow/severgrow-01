// A gold rim for bonus terrain: the Forest & Ash skin's two supplied frames (owner, 2026-11-13),
// both in one transparent atlas. Which design a bonus hex wears is decided per BOARD, not per key
// (`faGoldVariants`, ui/forestAsh.ts), so neighbours never repeat a design when the board allows.
// Every painter (the live board, the replay canvas and the poster) hands the same map in; the glow
// is the board's own (`.gold-frame` drop-shadow in style.css); the art carries none.
import { FA_GOLD_ATLAS, FA_GOLD_ATLAS_SIZE, FA_GOLD_BOXES } from './forestAsh.js';
import { cellScale, el } from './geom.js';
import { goldFrameSize } from './goldframe-geometry.js';
import { getOrient } from '../logic/orient.js';

export { GOLD_FRAME_SCALE, goldFrameSize } from './goldframe-geometry.js';

/** The atlas and the exact crop one bonus hex's frame uses, shared with the replay poster. The crop
 *  is the hex's own bounding box in the atlas: the frame's outer edge lies on the hex. */
export const GOLD_FRAME_ATLAS = FA_GOLD_ATLAS;
/** How many frame looks the atlas holds. */
export const GOLD_FRAME_VARIANTS = FA_GOLD_BOXES.length;

/** One design's box in the atlas, plus the design's own number. */
export type GoldFrameLook = { variant: number; x: number; y: number; w: number; h: number };

/**
 * The atlas box of one DESIGN. For a caller that has no board to look at — the Art Lab exports both
 * designs as palette files. A board must go through `goldFrameCrop` instead.
 */
export const goldFrameBox = (variant: number): GoldFrameLook => {
  const [x, y, w, h] = FA_GOLD_BOXES[variant]!;
  return { variant, x, y, w, h };
};

/**
 * The crop one bonus hex's frame uses, from its board's assignment (`faGoldVariants`).
 *
 * The map is REQUIRED and has no default on purpose: a board-aware caller cannot fall back to a
 * key-only design by accident (that fallback is exactly how the live board, the replay and the
 * poster would drift apart). A key that is not on the board's gold list is a wiring bug, so it says
 * so instead of quietly inventing a design. `goldFrameBox` is the explicit no-board path.
 */
export const goldFrameCrop = (looks: ReadonlyMap<string, number>, key: string): GoldFrameLook => {
  const variant = looks.get(key);
  if (variant === undefined) throw new Error(`gold-frame: ${key} is not on this board's gold list`);
  return goldFrameBox(variant);
};

/**
 * The atlas (one file for every frame) failed to load on this device. The art loader reports it
 * through the same `error` path every other picture uses; the frame then falls back to no frame at
 * all — a bonus hex still has its stone and its "2" — because an `<image>` whose file is gone is
 * exactly what the browser paints its own "broken image" tile over.
 */
let atlasMissing = false;
/** Report a failed picture; it is the gold-frame atlas this module draws. */
export const noteGoldFrameArtFailure = (url: string): void => {
  if (url === FA_GOLD_ATLAS) atlasMissing = true;
};

export function drawGoldFrame(
  parent: SVGElement,
  looks: ReadonlyMap<string, number>,
  key: string,
  x: number,
  y: number,
  occupied: boolean,
) {
  const crop = goldFrameCrop(looks, key);
  const pad = 6;
  // THE FRAME IS THE CELL'S HEX, AT THE CELL'S OWN SCALE: `cellScale(key)` (see goldframe-geometry)
  // keeps the rim and the hex one shape wherever a bent board draws the hex smaller than S, and the
  // shared GOLD_FRAME_SCALE keeps it just inside the seam like the rocks.
  const { width, height } = goldFrameSize(cellScale(key));
  const group = el('g', {
    class: `gold-frame ${occupied ? 'occupied' : 'empty'}`,
    'data-key': key,
    'data-variant': crop.variant,
    'aria-hidden': 'true',
    ...(getOrient() === 'pointy' ? { transform: `rotate(-30 ${x} ${y})` } : {}),
  }, parent);
  // A picture that failed to load is never drawn: the browser would paint its own placeholder.
  if (atlasMissing) return group;
  const viewport = el('svg', {
    x: x - width / 2, y: y - height / 2, width, height,
    viewBox: `${crop.x - pad} ${crop.y - pad} ${crop.w + pad * 2} ${crop.h + pad * 2}`,
    preserveAspectRatio: 'none', overflow: 'hidden', class: 'gold-frame-art',
  }, group);
  el('image', { href: FA_GOLD_ATLAS, x: 0, y: 0, width: FA_GOLD_ATLAS_SIZE.w, height: FA_GOLD_ATLAS_SIZE.h }, viewport);
  return group;
}
