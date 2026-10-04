// The game screen's layout: a pure calculator from the viewport to fixed boxes. Three zones:
// the header (menu, scores, turn pill, race bar, step tracker), the board zone (flexible, the
// board centred in it) and the bottom DOCK (hint line, forecast bar, piles and moves, hand),
// whose height never changes during a game. The board is as large as the zone allows, in
// whichever orientation (points left-right or up-down) gives bigger tiles (Step 3 item 1).
import type { Orient } from './orient.js';

export type Viewport = { w: number; h: number; safeTop?: number; safeBottom?: number; safeLeft?: number; safeRight?: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Layout = {
  mode: 'stack' | 'side';
  /** the board's orientation on screen: whichever gives bigger tiles */
  orient: Orient;
  header: Box;
  /** the flexible zone between the header and the dock (corner tools sit in its corners) */
  zone: Box;
  board: Box;
  dock: Box;
  /** heights of the dock's rows, top to bottom (all fixed) */
  /** the message row (the hint line, or the forecast bar while a move waits for Confirm), the piles, the hand */
  rows: { forecast: number; table: number; hand: number };
  card: { w: number; h: number; slice: number };
  /** a tile's width on screen in CSS px (the distance between neighbouring tile centres) */
  hexPx: number;
  /** screen px per board unit */
  scale: number;
  /** the icon-only corner tools (40pt visible, 44pt hit area), in the zone's corners */
  tools: { weak: Box; targets: Box; replay: Box; help: Box };
};

/** Fixed heights, CSS px (8pt grid). */
export const HEIGHTS = { hud: 48, race: 8, forecast: 56, table: 84, handPad: 20, bottomPad: 8 } as const;
/** The largest hand a player can hold (hand size + the drawn card). */
export const MAX_HAND = 8;
/** At least this much of every card is visible in a full hand. */
export const MIN_SLICE = 36;
/** Side margin of the board zone (v0.8: 4pt, the board takes the full width on tall phones). */
export const BOARD_MARGIN = 4;
/** The largest gap allowed above or below the board (pt). */
export const MAX_GAP = 16;
/** The corner tools: visible size and hit area. */
export const TOOL = { size: 40, hit: 44, inset: 2 } as const;
const GUTTER = 16;
/** The icon-only Sort button at the right end of the hand row. */
export const SORT_W = 32;
const S = 30;

/**
 * The board's drawing area in board units for a radius and orientation: the tiles plus a thin
 * margin (v0.8: the home landmarks are drawn top-down inside their tile, so no headroom). Points left-right ("pointy" hexes): wider than tall; turned: taller than wide.
 */
export const boardUnits = (radius: number, orient: Orient = 'pointy') => {
  const m = 2;
  const halfLong = Math.sqrt(3) * S * radius + (Math.sqrt(3) / 2) * S + m; // across the points
  const halfShort = 1.5 * S * radius + S + m; // across the flat sides
  const halfW = orient === 'pointy' ? halfLong : halfShort;
  const halfH = orient === 'pointy' ? halfShort : halfLong;
  return { w: 2 * halfW, h: 2 * halfH, x0: -halfW, y0: -halfH, hexW: Math.sqrt(3) * S };
};

const isSide = (v: Viewport) => (v.w >= 760 && v.w >= v.h) || (v.w > v.h && v.h <= 560);

/** The card size for a full hand in `width` px: big numerals, at least MIN_SLICE of each card. */
export const cardSize = (width: number, maxHand = MAX_HAND) => {
  const avail = width - 2 * GUTTER - SORT_W; // room for the Sort button at the right end of the hand
  const w = Math.max(44, Math.min(72, Math.floor(avail - (maxHand - 1) * MIN_SLICE), Math.floor(width * 0.2)));
  const slice = Math.min(w + 4, Math.floor((avail - w) / (maxHand - 1)));
  return { w, h: Math.round(w * 1.42), slice };
};

/** The orientation and scale that fit the board in a w x h area with the biggest tiles (ties: points left-right). */
export const bestFit = (w: number, h: number, radius: number): { orient: Orient; scale: number } => {
  const fit = (o: Orient) => {
    const u = boardUnits(radius, o);
    return Math.min(w / u.w, h / u.h);
  };
  const p = fit('pointy');
  const f = fit('flat');
  return f > p + 1e-9 ? { orient: 'flat', scale: f } : { orient: 'pointy', scale: p };
};

const toolsIn = (zone: Box): Layout['tools'] => {
  const s = TOOL.hit;
  const i = TOOL.inset;
  return {
    weak: { x: zone.x + i, y: zone.y + i, w: s, h: s },
    targets: { x: zone.x + zone.w - s - i, y: zone.y + i, w: s, h: s },
    replay: { x: zone.x + i, y: zone.y + zone.h - s - i, w: s, h: s },
    help: { x: zone.x + zone.w - s - i, y: zone.y + zone.h - s - i, w: s, h: s },
  };
};

export const computeLayout = (v: Viewport, radius = 3, maxHand = MAX_HAND): Layout => {
  const st = v.safeTop ?? 0;
  const sb = v.safeBottom ?? 0;
  const sl = v.safeLeft ?? 0;
  const sr = v.safeRight ?? 0;
  const W = v.w - sl - sr;
  const headerH = HEIGHTS.hud + HEIGHTS.race;
  const header: Box = { x: sl, y: st, w: W, h: headerH };
  const top = st + headerH;

  if (isSide(v)) {
    // wide screens: board on the left, the dock as a column on the right
    const dockW = Math.min(420, Math.max(340, Math.round(W * 0.32)));
    const card = cardSize(dockW, maxHand);
    const rows = { forecast: HEIGHTS.forecast, table: Math.max(HEIGHTS.table, card.h + 24), hand: card.h + HEIGHTS.handPad };
    const zone: Box = { x: sl + BOARD_MARGIN, y: top, w: W - dockW - 3 * BOARD_MARGIN, h: v.h - top - sb - BOARD_MARGIN };
    const fit = bestFit(zone.w, zone.h, radius);
    const u = boardUnits(radius, fit.orient);
    const bw = u.w * fit.scale;
    const bh = u.h * fit.scale;
    const board: Box = { x: zone.x + (zone.w - bw) / 2, y: zone.y + (zone.h - bh) / 2, w: bw, h: bh };
    const dockH = rows.forecast + rows.table + rows.hand + HEIGHTS.bottomPad;
    const dock: Box = { x: sl + W - dockW - BOARD_MARGIN, y: top + Math.max(0, (zone.h - dockH) / 2), w: dockW, h: dockH };
    return { mode: 'side', orient: fit.orient, header, zone, board, dock, rows, card, hexPx: u.hexW * fit.scale, scale: fit.scale, tools: toolsIn(zone) };
  }

  const card = cardSize(W, maxHand);
  const rows: Layout['rows'] = { forecast: HEIGHTS.forecast, table: HEIGHTS.table, hand: card.h + HEIGHTS.handPad };
  const place = () => {
    const dockH = rows.forecast + rows.table + rows.hand + HEIGHTS.bottomPad + sb;
    const dock: Box = { x: sl, y: v.h - dockH, w: W, h: dockH };
    const zone: Box = { x: sl + BOARD_MARGIN, y: top, w: W - 2 * BOARD_MARGIN, h: dock.y - top };
    return { dock, zone, fit: bestFit(zone.w, zone.h, radius) };
  };
  let p = place();
  // a board limited by the width leaves spare height: the piles and the message row take it
  // first (bigger pile cards, more air), then the hand row, so no gap around the board is over 16pt
  let spare = p.zone.h - boardUnits(radius, p.fit.orient).h * p.fit.scale - 2 * MAX_GAP;
  if (spare > 0) {
    for (const [row, most] of [['table', 40], ['forecast', 40], ['hand', 32]] as const) {
      const add = Math.ceil(Math.min(most, spare));
      rows[row] += add;
      spare -= add;
    }
    p = place();
  }
  const { dock, zone, fit } = p;
  const u = boardUnits(radius, fit.orient);
  const bw = u.w * fit.scale;
  const bh = u.h * fit.scale;
  const board: Box = { x: zone.x + (zone.w - bw) / 2, y: zone.y + (zone.h - bh) / 2, w: bw, h: bh };
  return { mode: 'stack', orient: fit.orient, header, zone, board, dock, rows, card, hexPx: u.hexW * fit.scale, scale: fit.scale, tools: toolsIn(zone) };
};

/** True when two boxes overlap (touching edges do not count). */
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
