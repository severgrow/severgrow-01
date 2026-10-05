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
 * The thumb layout (test copy only, phones in portrait): no hint row. The hand is a curved fan
 * along an arc that rises from near the bottom centre to the right edge, just under the board
 * (cards held by the right thumb); the deck and the throw pile sit side by side in the lower
 * left; Undo and Sort in the free bottom-right corner, under the arc. "left" mirrors it all.
 * Every box is in the dock's own coordinates (0,0 = the dock's top-left corner).
 */
export type Thumb = {
  side: 'right' | 'left';
  /** the arc the card centres sit on: its centre, radius and the angles (deg, screen y down)
   *  of the first and last slots for the largest hand */
  arc: { cx: number; cy: number; r: number; a0: number; a1: number };
  /** the largest hand the arc is sized for, and the visible slice per card along the arc */
  maxHand: number;
  slice: number;
  card: { w: number; h: number };
  piles: Box;
  deck: Box;
  discard: Box;
  pileCard: { w: number; h: number };
  moves: Box;
  undo: Box;
  sort: Box;
  /** the coach and first-time tips: the free corner over the move buttons, left of the fan */
  tips: Box;
};
/** Thumb layout: the visible part of every card along the arc (pt), the outward lift of a
 *  picked card, the pile column width, and the space kept free at the edges. */
export const THUMB = { slice: 42, lift: 18, pileW: 60, edge: 8, icon: 44 } as const;

/** The centres, rotations (deg) and outward normals of `n` cards on the thumb arc (dock px). */
export const fanSlots = (t: Thumb, n: number): { x: number; y: number; rot: number; nx: number; ny: number }[] => {
  if (n <= 0) return [];
  const { cx, cy, r, a0, a1 } = t.arc;
  const span = a1 - a0;
  // the slice for this hand: the arc's full length shared out, but no wider than 85% of a card
  // (or the slice, if that is wider): a small hand stays a fan, centred on the arc
  const full = (Math.abs(span) * Math.PI * r) / 180;
  const step = n > 1 ? Math.min(Math.max(t.slice, t.card.w * 0.85), full / (n - 1)) : 0;
  const used = ((step * (n - 1)) / full) * span;
  const start = a0 + (span - used) / 2;
  return Array.from({ length: n }, (_, i) => {
    const a = n > 1 ? start + (used * i) / (n - 1) : a0 + span / 2;
    const rad = (a * Math.PI) / 180;
    const nx = Math.cos(rad);
    const ny = Math.sin(rad);
    // the card's top points away from the arc's centre (a real fan)
    return { x: cx + r * nx, y: cy + r * ny, rot: a + 90, nx, ny };
  });
};

/**
 * The thumb dock for a width, its available height (dock plus board zone), the bottom safe area
 * and the largest hand: the smallest dock that gives every card a slice of THUMB.slice, trying
 * slightly smaller cards before the board's tiles drop under 44pt.
 */
const thumbDock = (W: number, avail: number, sb: number, maxHand: number, radius: number, side: 'right' | 'left') => {
  const { edge, pileW, lift, icon } = THUMB;
  const build = (cw: number, slice: number, minH = 0) => {
    const ch = Math.round(cw * 1.42);
    const hd = Math.hypot(cw, ch) / 2; // a turned card stays inside this radius
    const pilesW = 2 * pileW + 8;
    const pileCard = { w: pileW - 8, h: Math.round((pileW - 8) * 1.42) };
    const pileBoxH = pileCard.h + 26;
    // first and last card centres: low beside the piles, high at the right edge
    const sx = edge + pilesW + 6 + hd * 0.8;
    const ex = W - edge - hd;
    const dx = Math.max(40, ex - sx);
    const need = (maxHand - 1) * slice;
    // a gentle bow (radius 1.3x the chord): the arc is about 2.7% longer than its chord
    const chord = Math.max(need / 1.0265, dx * 1.12);
    const bottomPad = 8 + sb;
    // a taller dock (the board can't use the height) lets the arc climb further: wider slices
    const dy = Math.max(Math.sqrt(Math.max(0, chord * chord - dx * dx)), minH - (2 * hd + lift + 4 + bottomPad));
    const h = Math.ceil(Math.max(dy + 2 * hd + lift + 4 + bottomPad, pileBoxH + 52 + bottomPad + 8));
    // dock-local points (y down): S low, E high
    const S = { x: sx, y: h - bottomPad - hd };
    const E = { x: ex, y: S.y - dy };
    const c = Math.hypot(E.x - S.x, E.y - S.y);
    const r = 1.3 * c;
    const mx = (S.x + E.x) / 2;
    const my = (S.y + E.y) / 2;
    // the arc's centre lies below-right of the chord (the fan bulges up and to the left)
    const ux = (E.x - S.x) / c;
    const uy = (E.y - S.y) / c;
    const k = Math.sqrt(r * r - (c / 2) * (c / 2));
    const cx = mx - uy * k;
    const cy = my + ux * k;
    const ang = (p: { x: number; y: number }) => (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;
    const a0 = ang(S);
    let a1 = ang(E);
    if (a1 < a0 - 180) a1 += 360;
    if (a1 > a0 + 180) a1 -= 360;
    const pileY = h - bottomPad - pileBoxH;
    const deck: Box = { x: edge, y: pileY, w: pileW, h: pileBoxH };
    const discard: Box = { x: edge + pileW + 8, y: pileY, w: pileW, h: pileBoxH };
    const piles: Box = { x: edge, y: pileY, w: pilesW, h: pileBoxH };
    // the move buttons: a column over the piles, left of the fan (two rows if they need them)
    const moves: Box = { x: edge, y: Math.max(4, pileY - 124), w: pilesW, h: 120 };
    const sort: Box = { x: W - edge - icon, y: h - bottomPad - icon, w: icon, h: icon };
    const undo: Box = { x: W - edge - 2 * icon - 8, y: h - bottomPad - icon, w: icon, h: icon };
    let t: Thumb = { side: 'right', arc: { cx, cy, r, a0, a1 }, maxHand, slice, card: { w: cw, h: ch }, piles, deck, discard, pileCard, moves, undo, sort, tips: { x: edge, y: 4, w: 0, h: 0 } };
    // the tips' corner: from the dock's top down to the move buttons, as wide as the fan allows
    const tipsBottom = moves.y - 6;
    const fanLeft = Math.min(...fanSlots(t, maxHand).filter((p) => p.y - hd < tipsBottom).map((p) => p.x - hd), W - edge);
    t = { ...t, tips: { x: edge, y: 4, w: Math.max(pilesW, W * 0.5, fanLeft - edge - 6), h: Math.max(44, tipsBottom - 4) } };
    if (side === 'left') t = mirrorThumb(t, W);
    // the board above it
    const fit = bestFit(W - 2 * BOARD_MARGIN, avail - h, radius);
    const hexPx = boardUnits(radius, fit.orient).hexW * fit.scale;
    return { t, h, hexPx, boardH: boardUnits(radius, fit.orient).h * fit.scale, cw, slice };
  };
  /** A board limited by the width can't use all the height: the fan takes the rest (no empty
   *  strip between the board and the hand), up to 16pt of air either side of the board. */
  const fill = (b: ReturnType<typeof build>) => {
    const spare = avail - b.h - b.boardH - 2 * MAX_GAP;
    return spare > 4 ? build(b.cw, b.slice, b.h + Math.floor(spare)) : b;
  };
  // the dock takes at most 60% of the screen (then the slice gives, for very big hands)
  const maxDock = avail * 0.6;
  const sizes = [64, 60, 56, 52, 48, 44];
  // 1) a 42pt slice, cards a little smaller if that keeps the tiles at 44pt or more
  // 2) a 40pt slice, the same
  // 3) a 40pt slice within 60% of the screen (the board's tiles go under 44pt)
  // 4) the slice shrinks (never under 30pt) until the dock fits 60% of the screen
  for (const slice of [42, 40]) {
    for (const cw of sizes) {
      const b = build(cw, slice);
      if (b.hexPx >= 44 && b.h <= maxDock) return fill(b);
    }
  }
  for (const cw of sizes) {
    const b = build(cw, 40);
    if (b.h <= maxDock) return fill(b);
  }
  for (let slice = 38; slice >= 30; slice -= 2) {
    const b = build(44, slice);
    if (b.h <= maxDock || slice === 30) return fill(b);
  }
  return build(44, 30);
};

const mirrorThumb = (t: Thumb, W: number): Thumb => {
  const m = (b: Box): Box => ({ ...b, x: W - b.x - b.w });
  return {
    ...t,
    side: 'left',
    arc: { cx: W - t.arc.cx, cy: t.arc.cy, r: t.arc.r, a0: 180 - t.arc.a0, a1: 180 - t.arc.a1 },
    piles: m(t.piles),
    deck: m(t.discard),
    discard: m(t.deck),
    moves: m(t.moves),
    tips: m(t.tips),
    undo: m(t.sort),
    sort: m(t.undo),
  };
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

export const computeLayout = (v: Viewport, radius = 3, maxHand = MAX_HAND, thumb: 'right' | 'left' | null = null): Layout => {
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

  if (thumb) {
    // the test copy's thumb layout: one dock, no hint row; the board gets the rest, centred
    const { t, h } = thumbDock(W, v.h - top, sb, Math.max(5, maxHand), radius, thumb);
    const dock: Box = { x: sl, y: v.h - h, w: W, h };
    const zone: Box = { x: sl + BOARD_MARGIN, y: top, w: W - 2 * BOARD_MARGIN, h: dock.y - top };
    const fit = bestFit(zone.w, zone.h, radius);
    const u = boardUnits(radius, fit.orient);
    const bw = u.w * fit.scale;
    const bh = u.h * fit.scale;
    const board: Box = { x: zone.x + (zone.w - bw) / 2, y: zone.y + (zone.h - bh) / 2, w: bw, h: bh };
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
