// A gold rim for bonus terrain: the Forest & Ash skin's two supplied frames (owner, 2026-11-13),
// both in one transparent atlas. A tile key picks its frame for the whole game.
// The glow is the board's own (`.gold-frame` drop-shadow in style.css); the art carries none.
import { FA_GOLD_ATLAS, FA_GOLD_ATLAS_SIZE, FA_GOLD_BOXES, faGoldVariant } from './forestAsh.js';
import { cellScale, el, S, SQ3 } from './geom.js';
import { getOrient } from '../logic/orient.js';

/** The atlas and the exact crop one bonus hex's frame uses, shared with the replay poster. The crop
 *  is the hex's own bounding box in the atlas: the frame's outer edge lies on the hex. */
export const GOLD_FRAME_ATLAS = FA_GOLD_ATLAS;
export const goldFrameCrop = (key: string, variant = faGoldVariant(key)) => {
  const [x, y, w, h] = FA_GOLD_BOXES[variant]!;
  return { variant, x, y, w, h };
};
/** How many frame looks the atlas holds. */
export const GOLD_FRAME_VARIANTS = FA_GOLD_BOXES.length;

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

export function drawGoldFrame(parent: SVGElement, key: string, x: number, y: number, occupied: boolean) {
  const crop = goldFrameCrop(key);
  const pad = 6;
  // THE FRAME IS THE CELL'S HEX, AT THE CELL'S OWN SCALE (owner, 2026-11-14: "gold frames look like
  // open arcs ... some cut at the board's edge"). Every other piece of per-cell art is drawn at
  // `cellScale(key)`, because the bent board (BOARD_BULGE, ui/geom.ts) draws an outer hex smaller than
  // S. The rim was the one piece that did not, so on a bent board its outer edge sat outside the hex
  // it belongs to — where the cell in front of it, drawn later, sliced that overhang away and left a
  // bright arc that started, ran along part of the hex and stopped. Measured on the flat product
  // board this scale is exactly 1, so nothing moves there; it keeps the rim and the hex one shape
  // wherever the board does bend.
  const k = cellScale(key);
  const width = S * 2.02 * k;
  const height = S * SQ3 * 1.01 * k;
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
