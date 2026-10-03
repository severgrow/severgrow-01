// The game screen's layout (UI overhaul, items 1-2): a pure calculator from the viewport to
// fixed boxes. The bottom DOCK (toolbar, hint line, forecast bar, piles and actions, hand) has
// one fixed height for the whole game, so nothing that appears during a turn can move the board
// or push the hand. The board gets everything else and is a function of the viewport only.

export type Viewport = { w: number; h: number; safeTop?: number; safeBottom?: number; safeLeft?: number; safeRight?: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Layout = {
  mode: 'stack' | 'side';
  header: Box;
  board: Box;
  dock: Box;
  /** heights of the dock's rows, top to bottom (all fixed) */
  rows: { toolbar: number; hint: number; forecast: number; table: number; hand: number };
  card: { w: number; h: number; slice: number };
  /** a hex's width on screen, in CSS pixels */
  hexPx: number;
};

/** Fixed heights, CSS px (8pt grid). */
export const HEIGHTS = { hud: 48, steps: 36, race: 8, toolbar: 40, hint: 24, forecast: 56, tableMin: 72, handPad: 34, bottomPad: 8 } as const;
/** The largest hand a player can hold (hand size + the drawn card). */
export const MAX_HAND = 8;
/** At least this much of every card is visible in a full hand. */
export const MIN_SLICE = 40;
const GUTTER = 16;

/**
 * The board's drawing area in board units for a given radius (hex size S = 30): the hexes plus
 * a thin rim for the plate. Pointy-top hexes: the board is wider than tall.
 */
export const boardUnits = (radius: number, S = 30) => {
  const { padX, padY } = boardPad(S);
  const halfW = Math.sqrt(3) * S * radius + padX;
  const halfH = 1.5 * S * radius + padY;
  return { w: 2 * halfW, h: 2 * halfH, hexW: Math.sqrt(3) * S, pad: padX };
};

/** The rim around the outermost hex centres: the plate reaches S*1.35 past the corner hexes, plus its pins. */
export const boardPad = (S = 30) => ({ padX: Math.ceil(S * 1.35 + 3.5), padY: Math.ceil(S * 1.2 + 2) });

const isSide = (v: Viewport) => (v.w >= 760 && v.w >= v.h) || (v.w > v.h && v.h <= 560);

/** The card size for a full hand in `width` px: big numerals, at least MIN_SLICE of each card. */
export const cardSize = (width: number, maxHand = MAX_HAND) => {
  const avail = width - 2 * GUTTER;
  // as wide as the screen allows (up to 76px), but a full hand must show MIN_SLICE per card
  const w = Math.max(44, Math.min(72, Math.floor(avail - (maxHand - 1) * MIN_SLICE), Math.floor(width * 0.2)));
  const slice = Math.min(w + 4, Math.floor((avail - w) / (maxHand - 1)));
  return { w, h: Math.round(w * 1.42), slice };
};

export const computeLayout = (v: Viewport, radius = 3, maxHand = MAX_HAND): Layout => {
  const st = v.safeTop ?? 0;
  const sb = v.safeBottom ?? 0;
  const sl = v.safeLeft ?? 0;
  const sr = v.safeRight ?? 0;
  const W = v.w - sl - sr;
  const units = boardUnits(radius);
  const aspect = units.w / units.h;
  const headerH = HEIGHTS.hud + HEIGHTS.steps + HEIGHTS.race;
  const header: Box = { x: sl, y: st, w: W, h: headerH };

  if (isSide(v)) {
    // wide screens: board on the left, the dock as a column on the right
    const dockW = Math.min(420, Math.max(340, Math.round(W * 0.32)));
    const card = cardSize(dockW, maxHand);
    const rows = { toolbar: HEIGHTS.toolbar, hint: HEIGHTS.hint, forecast: HEIGHTS.forecast, table: Math.max(HEIGHTS.tableMin, card.h + 24), hand: card.h + HEIGHTS.handPad };
    const top = st + headerH;
    const avail = { w: W - dockW - 24, h: v.h - top - sb - 12 };
    const bw = Math.min(avail.w, avail.h * aspect);
    const bh = bw / aspect;
    const board: Box = { x: sl + 8 + (avail.w - bw) / 2, y: top + (avail.h - bh) / 2, w: bw, h: bh };
    const dockH = rows.toolbar + rows.hint + rows.forecast + rows.table + rows.hand + HEIGHTS.bottomPad;
    const dock: Box = { x: sl + W - dockW - 8, y: top + Math.max(0, (avail.h - dockH) / 2), w: dockW, h: dockH };
    return { mode: 'side', header, board, dock, rows, card, hexPx: (units.hexW * bw) / units.w };
  }

  const card = cardSize(W, maxHand);
  const rows = { toolbar: HEIGHTS.toolbar, hint: HEIGHTS.hint, forecast: HEIGHTS.forecast, table: HEIGHTS.tableMin, hand: card.h + HEIGHTS.handPad };
  const dockH = rows.toolbar + rows.hint + rows.forecast + rows.table + rows.hand + HEIGHTS.bottomPad + sb;
  const top = st + headerH;
  const dock: Box = { x: sl, y: v.h - dockH, w: W, h: dockH };
  const avail = { w: W - 8, h: dock.y - top };
  const bw = Math.min(avail.w, avail.h * aspect);
  const bh = bw / aspect;
  const board: Box = { x: sl + (W - bw) / 2, y: top + (avail.h - bh) / 2, w: bw, h: bh };
  return { mode: 'stack', header, board, dock, rows, card, hexPx: (units.hexW * bw) / units.w };
};

/** True when two boxes overlap (touching edges do not count). */
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
