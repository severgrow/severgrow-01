// A gold rim for bonus terrain: the Forest & Ash skin's two supplied frames (owner, 2026-11-13),
// both in one transparent atlas. A tile key picks its frame for the whole game.
// The glow is the board's own (`.gold-frame` drop-shadow in style.css); the art carries none.
import { FA_GOLD_ATLAS, FA_GOLD_ATLAS_SIZE, FA_GOLD_BOXES, faGoldVariant } from './forestAsh.js';
import { el, S, SQ3 } from './geom.js';
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
  const width = S * 2.02;
  const height = S * SQ3 * 1.01;
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
