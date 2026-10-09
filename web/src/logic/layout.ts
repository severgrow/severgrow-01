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
  /** the test copy's "thumb layout" (phones, portrait): the dock's parts, dock-local px */
  thumb?: Thumb;
};

/**
 * The thumb layout v2 (test copy only, phones held upright): the MAP FIRST. The board gets the
 * full width and at least 60% of the usable height; the dock below takes at most 40% of it.
 * The dock has two bands: the hand as a gentle fan (centre card flat, end cards tilted 7 degrees,
 * a shallow curve, a slight rise to the right), anchored at the right edge for the right thumb;
 * under it the deck and the throw pile (left), a slot for the move buttons, Undo and Sort
 * (right, next to the fan). "left" mirrors it all. Boxes are in the dock's own coordinates.
 */
export type Thumb = {
  side: 'right' | 'left';
  /** the fan: the anchored end card's centre x, the base line, the curve (k: its depth, at the
   *  largest hand's ends) and the rise (slope per px along the fan); lhMax: half the largest
   *  hand's length between the end cards' centres */
  fan: { anchorX: number; baseY: number; k: number; slope: number; lhMax: number; tilt: number; cx?: number };
  maxHand: number;
  slice: number;
  card: { w: number; h: number };
  piles: Box;
  deck: Box;
  discard: Box;
  pileCard: { w: number; h: number };
  /** the move buttons' fixed slot, between the piles and Undo/Sort */
  moves: Box;
  undo: Box;
  sort: Box;
  /** the coach and first-time tips: just above the dock (its y and h: the panel's bottom gap and largest height) */
  tips: Box;
  /** the band the fan lives in (dock px) */
  band: Box;
};
/** Thumb layout v3: the card slice (wanted, most), the picked card's lift, the pile column, the
 *  shared side margin (board, piles, fan, tools), icon buttons, the fan's end tilt (deg) and
 *  rise (of its width), the dock's cap (of the usable height), the most the board may reach
 *  under the dock (of its height), the bottom margin and the largest gap between map and dock. */
export const THUMB = { slice: 44, minSlice: 34, maxSlice: 48, sliceOf: 0.64, lift: 10, pileW: 56, edge: 8, icon: 44, tilt: 7, rise: 0.12, cap: 0.45, overlapMax: 0, bottom: 12, mapGap: 24, gap: 14 } as const;
/** Room kept above the dock's top element (a picked card's lift reaches into it). */
const TOP_KEEP = 2;

/** The centres, rotations (deg) and outward normals of `n` cards in the fan (dock px). */
export const fanSlots = (t: Thumb, n: number): { x: number; y: number; rot: number; nx: number; ny: number }[] => {
  if (n <= 0) return [];
  const { anchorX, baseY, k, slope, lhMax, tilt } = t.fan;
  const dir = t.side === 'left' ? -1 : 1;
  const s = t.slice;
  const lh = ((n - 1) * s) / 2;
  // this hand's middle: its anchored end card stays at anchorX (small hands sit by the thumb)
  const mid = t.fan.cx ?? anchorX - dir * lh;
  return Array.from({ length: n }, (_, i) => {
    const u = (i - (n - 1) / 2) * s; // + towards the anchored end
    const f = lhMax > 0 ? u / lhMax : 0;
    const rot = dir * tilt * f;
    const rad = (rot * Math.PI) / 180;
    // a shallow curve (both ends a little lower than the middle) and a slight rise to the anchor
    return { x: mid + dir * u, y: baseY + k * f * f - slope * u, rot, nx: Math.sin(rad), ny: -Math.cos(rad) };
  });
};

/**
 * The thumb dock v4 for a width, the usable height (header and safe areas taken off) and the
 * largest hand (7 + the card just drawn = 8 by default). Three separate bands, nothing ever
 * shares space (so nothing can sit on anything else):
 * 1. the hand, bottom-anchored and centred, compact (cards overlap: about 2/3 of each card
 *    shows), a gentle symmetric curve;
 * 2. above it one control row: the deck and the throw pile on the left, Undo and Sort on the
 *    right, the move buttons stacked in the middle between them;
 * 3. the map above, with the same gap above the control row as below it (the move buttons sit
 *    exactly halfway between the map and the hand).
 */
const thumbDock = (W: number, usable: number, maxHand: number, side: 'right' | 'left', extra = 0) => {
  const { edge: M, pileW, icon, lift, tilt } = THUMB;
  const G = THUMB.gap + extra;
  const rad = (tilt * Math.PI) / 180;
  const bottomPad = THUMB.bottom;
  const pileCard = { w: pileW - 4, h: Math.round((pileW - 4) * 1.42) };
  const rowH = pileCard.h + 16; // the label under the pile card (the count is a badge on it)
  const pilesW = 2 * pileW + 8;
  const build = (cw: number) => {
    const ch = Math.round(cw * 1.42);
    const rotPad = (ch / 2) * Math.sin(rad) + 2;
    const fanMaxW = W - 2 * M - 2 * rotPad;
    const slice = Math.min(Math.max(THUMB.minSlice, Math.round(cw * THUMB.sliceOf)), (fanMaxW - cw) / Math.max(1, maxHand - 1));
    const lhMax = ((maxHand - 1) * slice) / 2;
    const k = (lhMax * Math.tan(rad)) / 2;
    // the v3 fan's shape: tilted ends, a shallow curve and a slight rise to the right
    const slope = lhMax > 0 ? (THUMB.rise * (2 * lhMax + cw)) / (2 * lhMax) : 0;
    const ext = Array.from({ length: maxHand }, (_, i) => {
      const u = (i - (maxHand - 1) / 2) * slice;
      const f = lhMax > 0 ? u / lhMax : 0;
      const r = (tilt * f * Math.PI) / 180;
      const hy = (cw / 2) * Math.abs(Math.sin(r)) + (ch / 2) * Math.abs(Math.cos(r));
      const y = k * f * f - slope * u;
      return { y0: y - hy, y1: y + hy };
    });
    const y0 = Math.min(...ext.map((e) => e.y0));
    const y1 = Math.max(...ext.map((e) => e.y1));
    const fanH = y1 - y0 + lift;
    const h = Math.ceil(G + rowH + G + fanH + bottomPad + TOP_KEEP);
    const baseY = h - bottomPad - y1;
    const Y0 = G + TOP_KEEP; // the control row's top (dock-local)
    const deck: Box = { x: M, y: Y0, w: pileW, h: rowH };
    const discard: Box = { x: M + pileW + 8, y: Y0, w: pileW, h: rowH };
    const piles: Box = { x: M, y: Y0, w: pilesW, h: rowH };
    const iconY = Y0 + (pileCard.h - icon) / 2;
    const sort: Box = { x: W - M - icon, y: iconY, w: icon, h: icon };
    const undo: Box = { x: W - M - 2 * icon - 8, y: iconY, w: icon, h: icon };
    const mx = M + pilesW + 10;
    const moves: Box = { x: mx, y: Y0, w: Math.max(0, undo.x - 10 - mx), h: rowH };
    const tips: Box = { x: M, y: 0, w: Math.round(W * 0.44), h: 200 };
    const band: Box = { x: M, y: Y0 + rowH + G, w: W - 2 * M, h: h - (Y0 + rowH + G) };
    let t: Thumb = {
      side: 'right',
      fan: { anchorX: W / 2 + lhMax, baseY, k, slope, lhMax, tilt, cx: W / 2 },
      maxHand,
      slice,
      card: { w: cw, h: ch },
      piles,
      deck,
      discard,
      pileCard,
      moves,
      undo,
      sort,
      tips,
      band,
    };
    if (side === 'left') t = mirrorThumb(t, W);
    return { t, h };
  };
  // the biggest cards whose compact fan fits the width with at least a 34pt strip per card
  const sizes = [62, 60, 58, 56, 54, 52, 50, 48, 46, 44, 42, 40];
  for (const cw of sizes) {
    const b = build(cw);
    if (b.t.slice >= THUMB.minSlice && b.h <= usable * THUMB.cap) return b;
  }
  return build(40);
};

const mirrorThumb = (t: Thumb, W: number): Thumb => {
  const m = (b: Box): Box => ({ ...b, x: W - b.x - b.w });
  return {
    ...t,
    side: 'left',
    fan: { ...t.fan, anchorX: W - t.fan.anchorX, ...(t.fan.cx !== undefined ? { cx: W - t.fan.cx } : {}) },
    piles: m(t.piles),
    deck: m(t.discard),
    discard: m(t.deck),
    moves: m(t.moves),
    tips: m(t.tips),
    band: m(t.band),
    undo: m(t.sort),
    sort: m(t.undo),
  };
};

/** Fixed heights, CSS px (8pt grid). */
export const HEIGHTS = { hud: 48, race: 8, table: 84, handPad: 20, bottomPad: 8 } as const;
/** The largest hand a player can hold (hand size + the drawn card). */
export const MAX_HAND = 8;
/** The test copy's slim header: one 44pt row (the menu button and the score bar). */
export const SLIM_HUD = 44;
let slimHud = false;
// The active Futasaku board keeps the same tabletop orientation at every viewport size.
// Historical channels still use the fit-based choice below.
let fixedBoardOrient: Orient | null = null;
export const setFixedBoardOrient = (orient: Orient | null) => { fixedBoardOrient = orient; };
/** The test copy: the header keeps only the menu button and the score bar. */
export const setSlimHud = (on: boolean) => {
  slimHud = on;
};
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
/** The longest hint (28 characters) measures 163px at 14pt: a little air either side. */
const CENTRE_FIT = 184;
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
  if (shape) return shapeUnits(shape, orient, m);
  const halfLong = Math.sqrt(3) * S * radius + (Math.sqrt(3) / 2) * S + m; // across the points
  const halfShort = 1.5 * S * radius + S + m; // across the flat sides
  const halfW = orient === 'pointy' ? halfLong : halfShort;
  const halfH = orient === 'pointy' ? halfShort : halfLong;
  return { w: 2 * halfW, h: 2 * halfH, x0: -halfW, y0: -halfH, hexW: Math.sqrt(3) * S };
};

// The Lab (test copy): a board of any shape. Its drawing area is the box around its tiles, turned
// the way the page will turn it (the homes on the centre line). null: the classic hexagon.
type Shape = { cells: readonly string[]; rot: (o: Orient) => number };
let shape: Shape | null = null;
export const setBoardShape = (s: Shape | null) => {
  shape = s;
};
const shapeUnits = (sh: Shape, orient: Orient, m: number) => {
  const a = (((orient === 'pointy' ? 0 : -90) + 60 * sh.rot(orient)) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const k of sh.cells) {
    const [q, r] = k.split(',').map(Number) as [number, number];
    const bx = Math.sqrt(3) * S * (q + r / 2);
    const by = 1.5 * S * r;
    const x = bx * cos - by * sin;
    const y = bx * sin + by * cos;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const e = S + m; // a tile's corner reach, whatever the turn
  return { w: x1 - x0 + 2 * e, h: y1 - y0 + 2 * e, x0: x0 - e, y0: y0 - e, hexW: Math.sqrt(3) * S };
};

const isSide = (v: Viewport) => (v.w >= 760 && v.w >= v.h) || (v.w > v.h && v.h <= 560);

/** The card size for a full hand in `width` px: big numerals, at least MIN_SLICE of each card. */
export const cardSize = (width: number, maxHand = MAX_HAND, cap = 72) => {
  const avail = width - 2 * (HAND_EDGE + SORT_W); // the fan sits between the two fixed end slots
  const w = Math.max(44, Math.min(cap, Math.floor(avail - (maxHand - 1) * MIN_SLICE), Math.floor(width * 0.2)));
  const slice = Math.min(w + 4, Math.floor((avail - w) / (maxHand - 1)));
  return { w, h: Math.round(w * 1.42), slice };
};

/** The orientation and scale that fit the board in a w x h area with the biggest tiles (ties: points left-right). */
export const bestFit = (w: number, h: number, radius: number): { orient: Orient; scale: number } => {
  const fit = (o: Orient) => {
    const u = boardUnits(radius, o);
    return Math.min(w / u.w, h / u.h);
  };
  if (fixedBoardOrient) return { orient: fixedBoardOrient, scale: fit(fixedBoardOrient) };
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
  // compact: the centre column is just wide enough for the hint, so the deck and the throw pile
  // read as a pair close either side of it (the rest is equal air at both ends of the row)
  const centreW = Math.max(CENTRE_MIN, Math.min(CENTRE_FIT, dock.w - 2 * DOCK_PAD - 2 * COL_GAP - 2 * pileW));
  const centre = { x: c - centreW / 2, w: centreW };
  const deck: Box = { x: centre.x - COL_GAP - pileW, y: dock.y, w: pileW, h: rows.table };
  const discard: Box = { x: centre.x + centreW + COL_GAP, y: dock.y, w: pileW, h: rows.table };
  const piles: Box = { x: deck.x, y: dock.y, w: discard.x + pileW - deck.x, h: rows.table };
  const hint: Box = { x: centre.x, y: dock.y + (rows.table - HINT_H - MOVES_H - 6) / 2, w: centreW, h: HINT_H };
  const moves: Box = { x: centre.x, y: hint.y + HINT_H + 6, w: centreW, h: MOVES_H };
  const handY = dock.y + rows.table + (mode === 'side' ? SIDE_GAP : 0);
  const fanW = card.w + (maxHand - 1) * card.slice;
  const fan: Box = { x: c - fanW / 2, y: handY + HEIGHTS.handPad / 2, w: fanW, h: card.h };
  // at the bottom of the hand row: the tilted end cards lean outward only at the top
  const slotY = handY + rows.hand - SORT_W - 10;
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

export const computeLayout = (v: Viewport, radius = 3, maxHand = MAX_HAND, thumb: 'right' | 'left' | null = null, overlap = 0): Layout => {
  const st = v.safeTop ?? 0;
  const sb = v.safeBottom ?? 0;
  const sl = v.safeLeft ?? 0;
  const sr = v.safeRight ?? 0;
  const W = v.w - sl - sr;
  const headerH = slimHud ? SLIM_HUD : HEIGHTS.hud + HEIGHTS.race;
  const header: Box = { x: sl, y: st, w: W, h: headerH };
  const top = st + headerH;

  if (isSide(v)) {
    // Full desktops give the board a left-side stage and the cards a generous
    // right instrument area. Compact landscape screens keep their old fit.
    const wideDesktop = W >= 1500;
    const dockW = wideDesktop ? Math.min(900, Math.round(W * 0.42))
      : Math.min(420, Math.max(340, Math.round(W * 0.32)));
    const card = cardSize(dockW, maxHand, wideDesktop ? Math.min(116, Math.round(dockW * 0.155)) : 72);
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

  if (thumb) {
    // the test copy's thumb layout v2: the map first; the dock (at most 40% of the usable
    // height) below it. `overlap`: how far the board may reach under the fan's band (smart
    // overlap: granted by the page only where no tile, home, gold or target hex is under a card)
    // (the screen keeps the bottom safe area itself: the dock sits on it, 12pt up)
    const usable = v.h - top - sb;
    const first = thumbDock(W, usable, Math.max(5, maxHand), thumb);
    // a map held back by the width leaves spare height: a third of it widens the two equal gaps
    // around the control row (up to 20pt each), the rest goes above the map
    const z0 = v.h - sb - first.h - top;
    const f0 = bestFit(W - 2 * THUMB.edge, z0, radius);
    const spare = z0 - boardUnits(radius, f0.orient).h * f0.scale;
    const extra = Math.max(0, Math.min(20, Math.floor(spare / 6)));
    const { t, h } = extra > 0 ? thumbDock(W, usable, Math.max(5, maxHand), thumb, extra) : first;
    const dock: Box = { x: sl, y: v.h - sb - h, w: W, h };
    const zone: Box = { x: sl + THUMB.edge, y: top, w: W - 2 * THUMB.edge, h: dock.y - top + Math.max(0, Math.min(overlap, t.band.h)) };
    const fit = bestFit(zone.w, zone.h, radius);
    const u = boardUnits(radius, fit.orient);
    const bw = u.w * fit.scale;
    const bh = u.h * fit.scale;
    // the map sits low in its zone: at most 24pt above the dock; any spare height above it
    const gap = 0; // v4: the dock starts with the gap above its control row (the same gap as below it)
    const board: Box = { x: zone.x + (zone.w - bw) / 2, y: zone.y + zone.h - gap - bh, w: bw, h: bh };
    const card = { w: t.card.w, h: t.card.h, slice: t.slice };
    const rows = { table: 0, hand: h };
    const off = (b: Box): Box => ({ ...b, x: b.x + dock.x, y: b.y + dock.y });
    const parts: Layout['parts'] = {
      hint: { x: dock.x, y: dock.y, w: 0, h: 0 },
      piles: off(t.piles),
      deck: off(t.deck),
      discard: off(t.discard),
      moves: off(t.moves),
      pileCard: t.pileCard,
      undo: off(t.undo),
      fan: { x: dock.x, y: dock.y, w: W, h },
      sort: off(t.sort),
    };
    return { mode: 'stack', orient: fit.orient, header, zone, board, dock, rows, card, parts, hexPx: u.hexW * fit.scale, scale: fit.scale, tools: toolsIn(zone), thumb: t };
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
