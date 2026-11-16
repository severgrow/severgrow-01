// A gold rim for bonus terrain: the Forest & Ash skin's two supplied frames (owner, 2026-11-13),
// both in one transparent atlas. WHICH bonus hexes wear one is `goldFrameKeys` below — EVERY bonus
// hex on the board (owner, 2026-11-16). Which LOOK a bonus hex wears — design, 60-degree turn,
// mirror — is decided per BOARD (`faGoldLooks`, ui/forestAsh.ts), so neighbours never repeat one
// when the board allows, and both frames are used. Every painter (the live board, the replay canvas
// and the poster) hands the same map in; the glow is the board's own (`.gold-frame` drop-shadow in
// style.css) and the art carries none.
import { FA_GOLD_ATLAS, FA_GOLD_ATLAS_SIZE, FA_GOLD_BOXES, goldLookId } from './forestAsh.js';
import type { GoldLook } from './forestAsh.js';
import { cellScale, cornerPts, el, hexPath, S } from './geom.js';
import { goldFrameFit, goldFrameSize } from './goldframe-geometry.js';
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
 * How far a hex is from the board's centre, in rings (the cube distance; the outer ring of a
 * radius-3 board is 3). Pure and total: any axial key has a ring.
 */
export const ringOf = (key: string): number => {
  const [q, r] = key.split(',').map(Number) as [number, number];
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
};

/**
 * WHICH HEXES WEAR A GOLD FRAME: EVERY bonus ("rich") hex on the board.
 *
 * Owner, 2026-11-16: "i don't get what the issue is. every 'gold tile' is getting one of the gold
 * tile frames we prepared and that's it". A bonus hex is engine terrain (`src/engine/terrain.ts`:
 * the centre plus two mirrored pairs, `richCount: 5`) and every one of them scores 2
 * (`src/engine/scoring.ts`), so a bonus hex with no frame is a double-scoring tile with no mark —
 * the defect. The frame is the ONLY thing that says "this tile is worth 2".
 *
 * HISTORY, so the rule is not read backwards again: on 2026-11-14 the owner said "the bug with gold
 * tile in middle - should never happen". That was about a frame painted at the WRONG PLACE — loose
 * metal floating in the middle of the board — and the repo answered it by restricting frames to the
 * board's outermost ring. He has now corrected that reading: the "middle" complaint was never a
 * reason to leave interior bonus hexes bare. The outer-ring rule is gone; every bonus hex wears one.
 *
 * This is still the ONE resolver for the decision, and every painter calls it with the board's own
 * cells and its own bonus keys: the live board (`ui/board.ts`), the replay canvas and the poster
 * (`replay/board-canvas.ts`). `boardKeys` keeps the list to cells this board actually has (a Lab
 * shape, or a future board, need not be a radius-3 hexagon), and keeps the order deterministic.
 */
export const goldFrameKeys = (boardKeys: Iterable<string>, bonusKeys: Iterable<string>): string[] => {
  const onBoard = new Set(boardKeys);
  return [...bonusKeys].filter((key) => onBoard.has(key));
};

/**
 * The look as a rigid transform about the HEX CENTRE, as six numbers (SVG's `matrix(a b c d e f)`).
 *
 * Both halves are symmetries of the cell's own hexagon, which is why a look can never move the
 * frame off its hex:
 *
 *  - a turn is a multiple of 60 degrees, and a regular hexagon has 60-degree rotational symmetry;
 *  - the mirror is a reflection about the cell's VERTICAL axis. This board's cell is a flat-top
 *    hexagon (its corners land on multiples of 60 degrees), which has an axis of symmetry on every
 *    multiple of 30 degrees, the vertical one included — and a pointy cell's set of corners is the
 *    same set turned by 30 degrees, so the same axis works there too.
 *
 * The translation is chosen so the cell's centre maps onto itself: `t = centre - L·centre`. `pointy`
 * adds the board's own -30 degrees, which puts the flat-top atlas art on a pointy cell; a 60-degree
 * turn commutes with it up to another turn, so it composes without ever leaving the hexagon.
 *
 * Using the `transform` ATTRIBUTE (a matrix) rather than a CSS `transform` is deliberate: the
 * attribute has no `transform-origin`/`transform-box` to get wrong, so it cannot pivot about the SVG
 * origin instead of the hex centre.
 */
export const goldLookMatrix = (look: GoldLook, x: number, y: number, pointy: boolean) => {
  const deg = look.rotation * 60 + (pointy ? -30 : 0);
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  // Mirror first (about the cell's own vertical axis), then turn: R * M as one matrix.
  const a = look.mirror ? -c : c, b = look.mirror ? -s : s;
  return { a, b, c: -s, d: c, e: x - (a * x - s * y), f: y - (b * x + c * y) };
};

/** The look as one SVG transform about the hex centre, or '' when it is the plain upright frame. */
export const goldLookTransform = (look: GoldLook, x: number, y: number, pointy: boolean): string => {
  if (!pointy && look.rotation === 0 && look.mirror === 0) return '';
  const m = goldLookMatrix(look, x, y, pointy);
  return `matrix(${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.e)} ${n(m.f)})`;
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
  /** A document-unique id for this frame's clip (the board's own `id()` factory). */
  clipId: string,
) {
  const crop = goldFrameCrop(looks, key);
  const pad = 6;
  // THE FRAME IS THE CELL'S HEX, AT THE CELL'S OWN SCALE: `cellScale(key)` (see goldframe-geometry)
  // keeps the rim and the hex one shape wherever a bent board draws the hex smaller than S, and the
  // shared GOLD_FRAME_SCALE keeps it just inside the seam like the rocks. The look turns the SAME
  // box (a hexagon is its own 60-degree rotation), so the geometry never moves.
  const base = goldFrameSize(cellScale(key));
  // …AND ITS PAINT MUST FIT THE CELL THE BOARD ACTUALLY DRAWS. `cellScale` is the MEAN of a cell's
  // six corners, which is exact on the flat product board but a shade too big on the bent 0.5 board
  // (the bulge moves the corners by up to two degrees and two per cent); `goldFrameFit` trims the
  // frame to the smallest boundary of its own hexagon, so NO look can paint past the seam. The art's
  // hexagon sits inside the padded crop at `crop.w / (crop.w + 2*pad)` of the box.
  const cell = cornerPts(key, S);
  const painted = (base.width / 2) * (crop.w / (crop.w + pad * 2));
  const fit = goldFrameFit(cell, x, y, painted);
  const width = base.width * fit, height = base.height * fit;
  const transform = goldLookTransform(crop, x, y, getOrient() === 'pointy');
  const group = el('g', {
    class: `gold-frame ${occupied ? 'occupied' : 'empty'}`,
    'data-key': key,
    'data-variant': goldLookId(crop),
    'data-design': crop.design,
    'aria-hidden': 'true',
    // THE FRAME IS CLIPPED TO ITS OWN HEX (owner, 2026-11-15). The rim's metal is fitted inside the
    // cell above; this also bounds what the rim's GLOW paints. `.gold-frame`'s drop-shadow is a
    // filter, and a filter is applied before a clip, so the shadow is cut at the seam too — half of
    // it used to be painted outside the board's silhouette, which is the gold the owner saw on
    // /test/. Nothing a frame paints can now leave its hex, at ANY look, on the rim or inside.
    //
    // …AND NOTHING MAY PAINT OVER IT (owner, 2026-11-16: "gold tiles still an issue"): the single
    // frame layer (`l-rich-frames`) is placed ABOVE the ground treatments — the planet skin's limb
    // shade, the rocks, the tile art — and below the homes. Painted below the limb shade, an
    // outer-ring frame lost up to three quarters of its metal to the board-edge darkening (measured
    // 175 -> 32 warmth on /test/), so the rim read as a broken arc exactly at the board's edge.
    'clip-path': `url(#${clipId})`,
  }, parent);
  const defs = el('defs', {}, group);
  el('path', { d: hexPath(key, S, 'flat') }, el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, defs));
  // The look's transform lives on an inner group so that the clip is resolved in BOARD units: a
  // clipPath on the element that carries the transform would turn with the frame.
  const turned = el('g', { class: 'gold-frame-look', ...(transform ? { transform } : {}) }, group);
  // A picture that failed to load is never drawn: the browser would paint its own placeholder.
  if (atlasMissing) return group;
  const viewport = el('svg', {
    x: x - width / 2, y: y - height / 2, width, height,
    viewBox: `${crop.x - pad} ${crop.y - pad} ${crop.w + pad * 2} ${crop.h + pad * 2}`,
    preserveAspectRatio: 'none', overflow: 'hidden', class: 'gold-frame-art',
  }, turned);
  el('image', { href: FA_GOLD_ATLAS, x: 0, y: 0, width: FA_GOLD_ATLAS_SIZE.w, height: FA_GOLD_ATLAS_SIZE.h }, viewport);
  return group;
}
