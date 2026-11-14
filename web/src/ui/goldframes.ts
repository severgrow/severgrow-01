// A gold rim for bonus terrain: the Forest & Ash skin's two supplied frames (owner, 2026-11-13),
// both in one transparent atlas. Which LOOK a bonus hex wears — design, 60-degree turn, mirror — is
// decided per BOARD (`faGoldLooks`, ui/forestAsh.ts), so neighbours never repeat one when the board
// allows, and both frames are used. Every painter (the live board, the replay canvas and the poster)
// hands the same map in; the glow is the board's own (`.gold-frame` drop-shadow in style.css) and the
// art carries none.
import { FA_GOLD_ATLAS, FA_GOLD_ATLAS_SIZE, FA_GOLD_BOXES, goldLookId } from './forestAsh.js';
import type { GoldLook } from './forestAsh.js';
import { cellScale, el } from './geom.js';
import { goldFrameSize } from './goldframe-geometry.js';
import { getOrient } from '../logic/orient.js';

export { GOLD_FRAME_SCALE, goldFrameSize } from './goldframe-geometry.js';

/** The atlas and the exact crop one bonus hex's frame uses, shared with the replay poster. The crop
 *  is the hex's own bounding box in the atlas: the frame's outer edge lies on the hex. */
export const GOLD_FRAME_ATLAS = FA_GOLD_ATLAS;
/** How many frame DESIGNS the atlas holds (the looks are these, turned and mirrored). */
export const GOLD_FRAME_VARIANTS = FA_GOLD_BOXES.length;

/** One look's atlas box, plus the look itself (design, turn, mirror). */
export type GoldFrameLook = GoldLook & { x: number; y: number; w: number; h: number };

/**
 * One DESIGN's atlas box, unturned and unmirrored. For a caller with no board to look at — the Art
 * Lab exports both designs as palette files. A board must go through `goldFrameCrop` instead: the
 * rotation is a draw-time transform of this same crop, so the lab needs no extra art for it.
 */
export const goldFrameBox = (design: number): GoldFrameLook => {
  const [x, y, w, h] = FA_GOLD_BOXES[design]!;
  return { design, rotation: 0, mirror: 0, x, y, w, h };
};

/**
 * The crop one bonus hex's frame uses, from its board's assignment (`faGoldLooks`).
 *
 * The map is REQUIRED and has no default on purpose: a board-aware caller cannot fall back to a
 * key-only look by accident (that fallback is exactly how the live board, the replay and the poster
 * would drift apart). A key that is not on the board's gold list is a wiring bug, so it says so
 * instead of quietly inventing a look. `goldFrameBox` is the explicit no-board path.
 */
export const goldFrameCrop = (looks: ReadonlyMap<string, GoldLook>, key: string): GoldFrameLook => {
  const look = looks.get(key);
  if (look === undefined) throw new Error(`gold-frame: ${key} is not on this board's gold list`);
  const [x, y, w, h] = FA_GOLD_BOXES[look.design]!;
  return { ...look, x, y, w, h };
};

/** Rounded to six places: enough for a transform, short enough to keep the DOM readable. */
const n = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * The look as one SVG transform about the hex centre, or '' when it is the plain upright frame.
 *
 * The frame is a HEXAGON, so a 60-degree turn (and a reflection about its own vertical axis) maps it
 * onto itself: the box, the silhouette and the closed ring are unchanged, only the lighting and the
 * embossing turn. `pointy` is the board's own -30 degrees, which puts the flat-top atlas art on a
 * pointy cell; it composes with the look because a 60-degree turn commutes with it up to another
 * 60-degree turn.
 */
export const goldLookTransform = (look: GoldLook, x: number, y: number, pointy: boolean): string => {
  if (!pointy && look.rotation === 0 && look.mirror === 0) return '';
  const deg = look.rotation * 60 + (pointy ? -30 : 0);
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  // Mirror first (about the cell's own vertical axis), then turn: R * M as one matrix. The
  // translation is chosen so the cell's centre maps onto itself — the turn must not move the frame.
  const a = look.mirror ? -c : c, b = look.mirror ? -s : s;
  return `matrix(${n(a)} ${n(b)} ${n(-s)} ${n(c)} ${n(x - (a * x - s * y))} ${n(y - (b * x + c * y))})`;
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
  looks: ReadonlyMap<string, GoldLook>,
  key: string,
  x: number,
  y: number,
  occupied: boolean,
) {
  const crop = goldFrameCrop(looks, key);
  const pad = 6;
  // THE FRAME IS THE CELL'S HEX, AT THE CELL'S OWN SCALE: `cellScale(key)` (see goldframe-geometry)
  // keeps the rim and the hex one shape wherever a bent board draws the hex smaller than S, and the
  // shared GOLD_FRAME_SCALE keeps it just inside the seam like the rocks. The look turns the SAME
  // box (a hexagon is its own 60-degree rotation), so the geometry never moves.
  const { width, height } = goldFrameSize(cellScale(key));
  const transform = goldLookTransform(crop, x, y, getOrient() === 'pointy');
  const group = el('g', {
    class: `gold-frame ${occupied ? 'occupied' : 'empty'}`,
    'data-key': key,
    'data-variant': goldLookId(crop),
    'data-design': crop.design,
    'aria-hidden': 'true',
    ...(transform ? { transform } : {}),
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
