// The game screen's layout: a pure calculator from the viewport to fixed boxes. Three zones:
// the header (menu, scores, turn pill, race bar), the board zone (flexible, the board centred in
// it) and the bottom DOCK, whose height never changes during a game. Positioning pass: the dock
// has two rows, both symmetric about its centre line: [hint | deck + throw pile | moves] (the
// forecast bar covers that row while a move waits for Confirm) and [Undo | hand fan | Sort]. The board is as large as the zone allows, in
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
  /** heights of the dock's rows, top to bottom (all fixed): the pile row, the hand */
  rows: { table: number; hand: number };
  /** the dock's parts, each symmetric about the dock's centre line */
  parts: { hint: Box; piles: Box; deck: Box; discard: Box; moves: Box; pileCard: { w: number; h: number }; undo: Box; fan: Box; sort: Box };
  card: { w: number; h: number; slice: number };
  /** a tile's width on screen in CSS px (the distance between neighbouring tile centres) */
  hexPx: number;
  /** screen px per board unit */
  scale: number;
  /** the icon-only corner tools (40pt visible, 44pt hit area), in the zone's corners */
  tools: { weak: Box; targets: Box; replay: Box; help: Box };
};

/** Fixed heights, CSS px (8pt grid). */
export const HEIGHTS = { hud: 48, race: 8, table: 84, handPad: 20, bottomPad: 8 } as const;
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
/** Desktop (side layout): the air between the dock's rows (hint, piles, hand). */
export const SIDE_GAP = 20;
/** The hand row's fixed end slots (Undo left, Sort right) and their distance from the edge. */
export const SORT_W = 28;
export const HAND_EDGE = 4;
/** The pile row: side padding, the gap between the deck and the throw pile, and around the pair. */
const DOCK_PAD = 12;
const COL_GAP = 8;
/** The centre column (the hint over the moves): wide enough for a 28-character hint on one line
 *  at 14pt, or two move buttons side by side; never wider than it needs. */
export const CENTRE_MIN = 172;
/** A pile's column: its card, or its label with the count ("Throw pile 1", 12pt), if wider. */
const PILE_META_W = 72;
const CENTRE_MAX = 260;
/** One line of hint and one row of move buttons. */
export const HINT_H = 18;
export const MOVES_H = 44;
/** A pile card: the pile row minus its label line, card proportions. */
const PILE_LABEL = 22;
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
  const avail = width - 2 * (HAND_EDGE + SORT_W); // the fan sits between the two fixed end slots
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

/**
 * A pile card's height: what the pile row leaves under its label line, but never taller than the
 * hand's cards and never so wide that the centre column (the hint over the moves) drops under
 * CENTRE_MIN.
 */
const pileHeightFor = (dock: Box, table: number, card: Layout['card']) => {
  const widest = (dock.w - 2 * DOCK_PAD - 2 * COL_GAP - CENTRE_MIN) / 2;
  return Math.min(table - PILE_LABEL, card.h, Math.max(PILE_META_W, widest) * 1.42);
};

/**
 * The dock's parts, all centred on the dock's centre line: the deck and the throw pile mirrored
 * either side of the centre column (the hint, the moves under it), then the hand row.
 */
const partsIn = (dock: Box, rows: Layout['rows'], card: Layout['card'], mode: Layout['mode'], maxHand: number): Layout['parts'] => {
  const c = dock.x + dock.w / 2;
  const ph = pileHeightFor(dock, rows.table, card);
  const pileCard = { w: ph / 1.42, h: ph };
  // both pile columns are the same width (the wider of the card and the label), so the pair is
  // a true mirror and the centre column sits exactly on the centre line
  const pileW = Math.max(PILE_META_W, pileCard.w);
  const centreW = Math.min(CENTRE_MAX, dock.w - 2 * DOCK_PAD - 2 * COL_GAP - 2 * pileW);
  const centre = { x: c - centreW / 2, w: centreW };
  const deck: Box = { x: centre.x - COL_GAP - pileW, y: dock.y, w: pileW, h: rows.table };
  const discard: Box = { x: centre.x + centreW + COL_GAP, y: dock.y, w: pileW, h: rows.table };
  const piles: Box = { x: deck.x, y: dock.y, w: discard.x + pileW - deck.x, h: rows.table };
  const hint: Box = { x: centre.x, y: dock.y + (rows.table - HINT_H - MOVES_H - 6) / 2, w: centreW, h: HINT_H };
  const moves: Box = { x: centre.x, y: hint.y + HINT_H + 6, w: centreW, h: MOVES_H };
  const handY = dock.y + rows.table + (mode === 'side' ? SIDE_GAP : 0);
  const fanW = card.w + (maxHand - 1) * card.slice;
  const fan: Box = { x: c - fanW / 2, y: handY + HEIGHTS.handPad / 2, w: fanW, h: card.h };
  const slotY = handY + (rows.hand - SORT_W) / 2;
  const undo: Box = { x: dock.x + HAND_EDGE, y: slotY, w: SORT_W, h: SORT_W };
  const sort: Box = { x: dock.x + dock.w - HAND_EDGE - SORT_W, y: slotY, w: SORT_W, h: SORT_W };
  return { hint, piles, deck, discard, moves, pileCard, undo, fan, sort };
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
    const rows = { table: Math.max(HEIGHTS.table, card.h + PILE_LABEL), hand: card.h + HEIGHTS.handPad };
    const zone: Box = { x: sl + BOARD_MARGIN, y: top, w: W - dockW - 3 * BOARD_MARGIN, h: v.h - top - sb - BOARD_MARGIN };
    const fit = bestFit(zone.w, zone.h, radius);
    const u = boardUnits(radius, fit.orient);
    const bw = u.w * fit.scale;
    const bh = u.h * fit.scale;
    const board: Box = { x: zone.x + (zone.w - bw) / 2, y: zone.y + (zone.h - bh) / 2, w: bw, h: bh };
    const dockH = rows.table + rows.hand + SIDE_GAP + HEIGHTS.bottomPad;
    const dock: Box = { x: sl + W - dockW - BOARD_MARGIN, y: top + Math.max(0, (zone.h - dockH) / 2), w: dockW, h: dockH };
    return { mode: 'side', orient: fit.orient, header, zone, board, dock, rows, card, parts: partsIn(dock, rows, card, 'side', maxHand), hexPx: u.hexW * fit.scale, scale: fit.scale, tools: toolsIn(zone) };
  }

  const card = cardSize(W, maxHand);
  const rows: Layout['rows'] = { table: HEIGHTS.table, hand: card.h + HEIGHTS.handPad };
  const place = () => {
    const dockH = rows.table + rows.hand + HEIGHTS.bottomPad + sb;
    const dock: Box = { x: sl, y: v.h - dockH, w: W, h: dockH };
    const zone: Box = { x: sl + BOARD_MARGIN, y: top, w: W - 2 * BOARD_MARGIN, h: dock.y - top };
    return { dock, zone, fit: bestFit(zone.w, zone.h, radius) };
  };
  let p = place();
  // a board limited by the width leaves spare height: the pile row takes it first (bigger pile
  // cards up to the hand's card height, then room for the forecast bar and stacked move
  // buttons), then the hand row, so no gap around the board is over 16pt
  let spare = p.zone.h - boardUnits(radius, p.fit.orient).h * p.fit.scale - 2 * MAX_GAP;
  if (spare > 0) {
    // the pile row grows to its largest piles plus 16pt of air above and below them; the hand
    // row by up to 32pt (room to lift a card); a board that already spans the full width can't
    // use the rest, which becomes equal space above and below it
    const pileMax = pileHeightFor({ x: sl, y: 0, w: W, h: 0 }, Infinity, card);
    const tableMost = Math.max(0, pileMax + PILE_LABEL + 32 - rows.table);
    for (const [row, most] of [['table', tableMost], ['hand', 32]] as const) {
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
  return { mode: 'stack', orient: fit.orient, header, zone, board, dock, rows, card, parts: partsIn(dock, rows, card, 'stack', maxHand), hexPx: u.hexW * fit.scale, scale: fit.scale, tools: toolsIn(zone) };
};

/** True when two boxes overlap (touching edges do not count). */
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
