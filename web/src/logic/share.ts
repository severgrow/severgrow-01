// THE SHARE CARD (owner redesign, 2026-11-12): a 1080x1350 picture (Instagram 4:5 / a phone gallery)
// of the result. This file is the card's LAYOUT — pure, no DOM, no canvas, so every box and every
// case (a win, a loss, a draw, a very long name) is a unit test instead of a squint at a picture.
//
// WHAT A STRANGER NEEDS, AND NOTHING ELSE: the result, the score, the two names. The brand words are
// the product's own (`GAME_TITLE`, `REPLAY.mark`, `REPLAY.tagline`) — never a second copy. The old
// card's highlights, level line and subtitle are gone: they were the player's read-out, not a
// stranger's.
//
// THE PAGE IS A GRID FIRST (owner correction, 2026-11-12: "create a grid for it first"). One declared
// grid — 12 columns of 54 with 24 gutters, 9 rows of 110 with the same gutters, an 84 margin — and
// every box on layout A is a span of it (`cell`, `colSpan`, `rowSpan`). The arithmetic closes exactly
// on 1080 x 1350, which is a test.
//
// THREE LAYOUTS live here behind `SHARE_LAYOUT`: after the owner picks one, that ONE line changes and
// the export path (`ui/sharecard.ts`) draws the winner.
//
//   a ORBIT   (the pick) a grid-locked stack: wordmark, result, the board as a planet with NO drawn
//             circle (its silhouette is the tiles), the score 4 | 2 | 4, each player's name centred
//             directly under their own number, then the tagline and the address.
//   b PLATE   an instrument plate: a hairline frame, wordmark and address on one top line, the
//             planet centred, the score under it, the names pinned to the bottom corners.
//   c POSTER  the score IS the picture: a small planet at the top, then the two numbers huge with
//             each player's name under their own number.
import { allCoords, coordKey, parseKey } from '../../../src/engine/index.js';
import { GAME_TITLE, REPLAY, RESULT } from '../../../src/strings.js';
import type { Player, Tile } from '../../../src/engine/index.js';

export const SHARE_W = 1080;
export const SHARE_H = 1350;
/** B and C's own margin (A takes its margin from the grid). */
const M = 88;

/** THE PICK: flip this to 'b' or 'c' to draw another composition. Nothing else changes. */
export const SHARE_LAYOUT: ShareLayoutId = 'a';

export type ShareLayoutId = 'a' | 'b' | 'c';
export const SHARE_LAYOUTS: readonly ShareLayoutId[] = ['a', 'b', 'c'];

/**
 * THE PAGE GRID — the card's one measuring system (owner, 2026-11-12). Every number a box needs is
 * here; nothing on layout A is placed by a literal:
 *
 *   1080 = 84 + 12 x 54 + 11 x 24 + 84      (margin + columns + gutters + margin)
 *   1350 = 84 +  9 x 110 + 8 x 24 + 84      (margin + rows + gutters + margin)
 *
 * A column line steps by 54 + 24 = 78 px; a row line by 110 + 24 = 134 px.
 */
export const SHARE_GRID = Object.freeze({
  margin: 84,
  columns: 12,
  column: 54,
  rows: 9,
  row: 110,
  gutter: 24,
});

/** The grid's live area: everything the type and the board may occupy. */
export const SHARE_CONTENT: Box = Object.freeze({
  x: SHARE_GRID.margin,
  y: SHARE_GRID.margin,
  w: SHARE_GRID.columns * SHARE_GRID.column + (SHARE_GRID.columns - 1) * SHARE_GRID.gutter,
  h: SHARE_GRID.rows * SHARE_GRID.row + (SHARE_GRID.rows - 1) * SHARE_GRID.gutter,
});

/** The left edge of column `c` (0-based). */
export const colX = (c: number): number => SHARE_GRID.margin + c * (SHARE_GRID.column + SHARE_GRID.gutter);
/** The top edge of row `r` (0-based). */
export const rowY = (r: number): number => SHARE_GRID.margin + r * (SHARE_GRID.row + SHARE_GRID.gutter);
/** `n` columns from `c`: their left edge and their total width (gaps included). */
export const colSpan = (c: number, n: number): { x: number; w: number } => ({
  x: colX(c),
  w: n * SHARE_GRID.column + (n - 1) * SHARE_GRID.gutter,
});
/** `n` rows from `r`: their top edge and their total height (gaps included). */
export const rowSpan = (r: number, n: number): { y: number; h: number } => ({
  y: rowY(r),
  h: n * SHARE_GRID.row + (n - 1) * SHARE_GRID.gutter,
});
/** One box of the grid: columns `c..c+cn`, rows `r..r+rn`. */
export const cell = (c: number, cn: number, r: number, rn: number): Box => ({ ...colSpan(c, cn), ...rowSpan(r, rn) });

/**
 * THE TWO APPROVED FACES (owner, 2026-11-12): Besley for display, Fragment Mono for UI — the
 * product's own tokens, verbatim (`web/src/fonts-futa04.css`). `SHARE_FONT_WEIGHTS` is what each
 * face really ships: Besley is a 600–800 variable, Fragment Mono has a single 400. A layout may not
 * ask for a weight the face does not have, because the painter refuses to synthesise one.
 */
export const SHARE_FONTS = Object.freeze({
  display: "'Besley', Georgia, serif",
  ui: "'Fragment Mono', ui-monospace, monospace",
});
export const SHARE_FONT_FAMILIES = Object.freeze({ display: 'Besley', ui: 'Fragment Mono' });
export const SHARE_FONT_WEIGHTS = Object.freeze({
  display: Object.freeze([600, 700, 800] as const),
  ui: Object.freeze([400] as const),
});

export type ShareResult = 'win' | 'loss' | 'draw';
/** The one word at the top: the result, in the product's voice, uppercased for the card. */
export const RESULT_WORD: Readonly<Record<ShareResult, string>> = Object.freeze({
  win: 'YOU WON',
  loss: 'YOU LOST',
  draw: 'DRAW',
});

export type Box = { x: number; y: number; w: number; h: number };
/** The replay poster's own text box (`web/src/replay/poster.ts`), kept compatible: it paints itself. */
export type TextBox = Box & { text: string; size: number; weight: 400 | 600 | 700 | 800; align: 'left' | 'center' | 'right' };
export type ShareText = TextBox & {
  /** The size it would like; `min` is the floor a long line may shrink to before it is cut. */
  min: number;
  /** The product's two faces: Besley (display) and Fragment Mono (ui). */
  family: 'display' | 'ui';
  /** Letter spacing in em (0 = none). */
  tracking: number;
  tone: 'bright' | 'cream' | 'muted' | 'dim';
};
export type ShareCell = { key: string; x: number; y: number; owner: Player | null; root: boolean };
export type SharePlanet = Box & {
  cx: number;
  cy: number;
  /** The FIT radius: the outermost tile is inside it. A ring layout draws its disc/rim here. */
  r: number;
  hex: number;
  cells: ShareCell[];
  /**
   * Does this planet draw a disc and a rim? Layout A says NO (owner, 2026-11-12: "no drawn circle or
   * stroked rim — the silhouette comes from the tiles"); B and C keep the disc they shipped with.
   */
  ring: boolean;
};

export type ShareData = {
  game: string;
  title: string;
  sub: string;
  score: [number, number];
  /** Kept for callers (a result's read-out); the card prints no highlights (MINIMAL text). */
  highlights: string[];
  board: Record<string, Tile | null>;
  radius: number;
  /** the Lab (test copy): the board's hexes when it is not the classic hexagon */
  cells?: readonly string[] | undefined;
  me: Player;
  /** The two sides' names, in the score's order. Defaults to the product's own words. */
  names?: readonly [string, string];
  /** The result word, when the caller knows it; otherwise it is read from `title`. */
  result?: ShareResult;
};

export type ShareLayout = {
  id: ShareLayoutId;
  /** Every text on the card, in drawing order. */
  texts: ShareText[];
  score: { you: ShareText; dash: ShareText; opp: ShareText };
  /** The two names, exposed so a test can measure each one against its OWN score box. */
  names: { you: ShareText; opp: ShareText };
  planet: SharePlanet;
  /** The hairline frame (B) and the hairline rules (B); null when the layout has none. */
  frame: Box | null;
  rules: Box[];
};

/** Cuts a line to fit `max` characters (with an ellipsis). */
export const fit = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`);

/** Which result the card says. The three titles are the product's own (`RESULT`). */
export const resultOf = (d: ShareData): ShareResult => {
  if (d.result) return d.result;
  if (d.title === RESULT.won) return 'win';
  if (d.title === RESULT.lost) return 'loss';
  return 'draw';
};

/** The two names the card prints: the caller's, else the product's own words. */
export const namesOf = (d: ShareData): readonly [string, string] => {
  const names = d.names;
  if (names && names.length === 2) return [cleanName(names[0], 'You'), cleanName(names[1], 'Opponent')];
  return ['You', 'Opponent'];
};
const cleanName = (name: string, fallback: string) => {
  const trimmed = (name ?? '').trim();
  return trimmed.length ? trimmed : fallback;
};

/**
 * HOW WIDE A LINE IS, WITHOUT A CANVAS (so the layout stays pure). Besley's digits and caps average
 * ~0.60 em; Fragment Mono is a fixed 0.60 em plus its tracking. `fillText`'s maxWidth is the
 * drawing-time backstop. Letter spacing widens every gap between characters only.
 */
export const textWidth = (text: string, size: number, family: 'display' | 'ui', tracking = 0): number =>
  text.length * size * (family === 'ui' ? 0.62 : 0.6) + Math.max(0, text.length - 1) * tracking * size;

/** The biggest size ≤ `size` at which `text` fits `maxW`, never below `min`. */
export const fittedSize = (text: string, maxW: number, size: number, min: number, family: 'display' | 'ui', tracking = 0): number => {
  const unit = text.length * (family === 'ui' ? 0.62 : 0.6) + Math.max(0, text.length - 1) * tracking;
  if (unit <= 0) return size;
  const fitSize = Math.floor(maxW / unit);
  return Math.max(min, Math.min(size, fitSize));
};

/** A name cut to the box: shrink first (down to 23 px), then honour the character budget. */
export const fitName = (name: string, maxW: number, size: number, family: 'display' | 'ui'): string => {
  const at = fittedSize(name, maxW, size, 23, family);
  const perChar = at * (family === 'ui' ? 0.62 : 0.6);
  // A one-character budget would print "…"; keep a real prefix instead.
  return fit(name, Math.max(2, Math.floor(maxW / perChar)));
};

const text = (o: Omit<ShareText, 'h'> & { h?: number }): ShareText => ({ ...o, h: o.h ?? Math.round(o.size * 1.3) });

/** Brand words, from the product's strings (never a second copy). */
const MARK = GAME_TITLE.toUpperCase();
const ADDRESS = REPLAY.mark;
const TAGLINE = REPLAY.tagline;

/** The two type recipes the grid uses: a UI label (Fragment Mono 400) and a display line (Besley). */
const LABEL = { min: 19, weight: 400 as const, family: 'ui' as const };
const DISPLAY = { min: 20, weight: 600 as const, family: 'display' as const };

/** The flat lattice, centred on the card: the cells and the box they occupy. */
const latticeOf = (d: ShareData) => {
  const coords = d.cells ? d.cells.map(parseKey) : allCoords(d.radius);
  const px = coords.map((c) => Math.sqrt(3) * (c.q + c.r / 2));
  const py = coords.map((c) => 1.5 * c.r);
  const midX = (Math.min(...px) + Math.max(...px)) / 2;
  const midY = (Math.min(...py) + Math.max(...py)) / 2;
  return { coords, px, py, midX, midY };
};

/** The cells placed at `hex` around (cx, cy) — the one thing both planet shapes share. */
const placeCells = (d: ShareData, l: ReturnType<typeof latticeOf>, cx: number, cy: number, hex: number): ShareCell[] =>
  l.coords.map((c, i) => {
    const key = coordKey(c);
    const t = d.board[key];
    return {
      key,
      x: cx + hex * (l.px[i]! - l.midX),
      y: cy + hex * (l.py[i]! - l.midY),
      owner: t ? t.owner : null,
      root: !!t?.root,
    };
  });

/**
 * THE BOARD AS A SMALL PLANET WITH NO DRAWN CIRCLE (layout A, owner 2026-11-12): the lattice is
 * sized to the grid band it is given, and its silhouette is the tiles themselves. `r` is only the
 * FIT radius — the outermost tile's reach plus a breath of air — so nothing is drawn there.
 */
const freePlanet = (d: ShareData, band: Box): SharePlanet => {
  const l = latticeOf(d);
  const halfW = Math.max(...l.px) - l.midX;
  const halfH = Math.max(...l.py) - l.midY;
  // The tile's own corner reach is one hex; a pointy-top hex is √3/2 hex wide at its middle.
  const byHeight = Math.floor(band.h / (2 * (halfH + 1)));
  const byWidth = Math.floor(band.w / (2 * halfW + Math.sqrt(3)));
  const hex = Math.max(6, Math.min(byHeight, byWidth));
  const cx = band.x + band.w / 2, cy = band.y + band.h / 2;
  const cells = placeCells(d, l, cx, cy, hex);
  const reach = (Math.max(...l.coords.map((_, i) => Math.hypot(l.px[i]! - l.midX, l.py[i]! - l.midY))) + 1) * hex;
  const r = Math.round(reach + 10);
  const w = Math.round(halfW * 2 * hex + hex * Math.sqrt(3));
  const h = Math.round(halfH * 2 * hex + hex * 2);
  return { cx, cy, r, hex, cells, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, ring: false };
};

/** The board on a DISC (layouts B and C, unchanged): the lattice fitted inside radius `r`. */
const planetOf = (d: ShareData, cx: number, cy: number, r: number): SharePlanet => {
  const l = latticeOf(d);
  // The farthest cell CENTRE plus the tile's own corner reach (its circumradius), so no cell is
  // clipped by the disc.
  const reach = Math.max(...l.coords.map((_, i) => Math.hypot(l.px[i]! - l.midX, l.py[i]! - l.midY))) + 1;
  const hex = Math.max(6, Math.floor((r * 0.94) / Math.max(1e-6, reach)));
  const cells = placeCells(d, l, cx, cy, hex);
  const halfW = (Math.max(...l.px) - Math.min(...l.px)) / 2 * hex + (hex * Math.sqrt(3)) / 2;
  const halfH = (Math.max(...l.py) - Math.min(...l.py)) / 2 * hex + hex;
  return { cx, cy, r, hex, cells, x: Math.round(cx - halfW), y: Math.round(cy - halfH), w: Math.round(halfW * 2), h: Math.round(halfH * 2), ring: true };
};

/** The score's three boxes: two numbers with one quiet rule between them. */
const scoreRow = (d: ShareData, y: number, size: number, centres: readonly [number, number, number], w: number) => ({
  you: text({ ...DISPLAY, x: centres[0] - w / 2, y, w, size, min: 40, align: 'center', tracking: 0, tone: 'bright', text: String(d.score[0]) }),
  dash: text({ ...DISPLAY, x: centres[1] - 40, y: y + Math.round(size * 0.18), w: 80, size: Math.round(size * 0.5), min: 20, align: 'center', tracking: 0, tone: 'dim', text: '—' }),
  opp: text({ ...DISPLAY, x: centres[2] - w / 2, y, w, size, min: 40, align: 'center', tracking: 0, tone: 'bright', text: String(d.score[1]) }),
});

export const shareLayout = (d: ShareData, id: ShareLayoutId = SHARE_LAYOUT): ShareLayout => {
  const result = RESULT_WORD[resultOf(d)];
  const [you, opp] = namesOf(d);
  const texts: ShareText[] = [];
  const rules: Box[] = [];

  if (id === 'a') {
    // ---- ORBIT, ON THE GRID (owner pick) ------------------------------------------------------
    //   row 0        the wordmark (Besley, tracked caps)
    //   row 1        the result
    //   rows 2–5     the board as a planet (no disc, no rim) — FOUR rows: more board (owner, 2026-11-12)
    //   row 6        the score, 4 | 2 | 4 columns around the centre line — smaller, so it reads as
    //                a score and not a second hero
    //   row 7        each name centred under its OWN number
    //   row 8        the tagline (top half) and the address (bottom half) — the board took the
    //                row the tagline used to have, so the last row carries both foot lines
    texts.push(text({ ...DISPLAY, ...cell(0, 12, 0, 1), size: 46, align: 'center', tracking: 0.34, tone: 'bright', text: MARK }));
    texts.push(text({ ...LABEL, ...cell(0, 12, 1, 1), size: 26, align: 'center', tracking: 0.36, tone: 'cream', text: result }));

    const score = {
      you: text({ ...DISPLAY, ...cell(1, 4, 6, 1), size: 80, align: 'center', tracking: 0, tone: 'bright', text: String(d.score[0]) }),
      dash: text({ ...DISPLAY, ...cell(5, 2, 6, 1), size: 40, align: 'center', tracking: 0, tone: 'dim', text: '—' }),
      opp: text({ ...DISPLAY, ...cell(7, 4, 6, 1), size: 80, align: 'center', tracking: 0, tone: 'bright', text: String(d.score[1]) }),
    };
    // THE OWNER'S KEY CORRECTION: a name shares its own number's COLUMNS, so the two centres are
    // the same x by construction — the 9 and the 4 each carry their player underneath.
    const names = {
      you: text({ ...LABEL, ...cell(1, 4, 7, 1), size: 30, align: 'center', tracking: 0, tone: 'cream', text: fitName(you, colSpan(1, 4).w, 30, 'ui') }),
      opp: text({ ...LABEL, ...cell(7, 4, 7, 1), size: 30, align: 'center', tracking: 0, tone: 'cream', text: fitName(opp, colSpan(7, 4).w, 30, 'ui') }),
    };
    texts.push(score.you, score.dash, score.opp, names.you, names.opp);
    // THE LAST ROW HOLDS BOTH FOOT LINES. It is still one grid row (43 + 24 + 43 = 110): the
    // tagline in its top half, the address in its bottom half, one gutter between them.
    const foot = cell(0, 12, 8, 1);
    const footH = (SHARE_GRID.row - SHARE_GRID.gutter) / 2;
    texts.push(text({ ...DISPLAY, x: foot.x, y: foot.y, w: foot.w, h: footH, size: 34, align: 'center', tracking: 0, tone: 'cream', text: TAGLINE }));
    texts.push(text({ ...DISPLAY, x: foot.x, y: foot.y + footH + SHARE_GRID.gutter, w: foot.w, h: footH, size: 20, align: 'center', tracking: 0.32, tone: 'muted', text: ADDRESS }));
    return { id, texts, score, names, planet: freePlanet(d, cell(0, 12, 2, 4)), frame: null, rules };
  }

  if (id === 'b') {
    // ---- PLATE: an instrument face -----------------------------------------------------------
    const frame = { x: 44, y: 44, w: SHARE_W - 88, h: SHARE_H - 88 };
    texts.push(text({ ...LABEL, x: 96, y: 96, w: 460, size: 34, align: 'left', tracking: 0.3, tone: 'bright', text: MARK }));
    texts.push(text({ ...LABEL, x: 560, y: 104, w: 424, size: 17, align: 'right', tracking: 0.3, tone: 'muted', text: ADDRESS }));
    rules.push({ x: 96, y: 176, w: SHARE_W - 192, h: 1 });
    texts.push(text({ ...LABEL, x: M, y: 966, w: SHARE_W - 2 * M, size: 26, align: 'center', tracking: 0.36, tone: 'cream', text: result }));
    const score = scoreRow(d, 1024, 122, [300, 540, 780], 230);
    const names = {
      you: text({ ...LABEL, x: 96, y: 1212, w: 400, size: 29, align: 'left', tracking: 0, tone: 'cream', text: fitName(you, 400, 29, 'ui') }),
      opp: text({ ...LABEL, x: 584, y: 1212, w: 400, size: 29, align: 'right', tracking: 0, tone: 'cream', text: fitName(opp, 400, 29, 'ui') }),
    };
    texts.push(score.you, score.dash, score.opp);
    rules.push({ x: 96, y: 1192, w: SHARE_W - 192, h: 1 });
    texts.push(names.you, names.opp);
    texts.push(text({ ...DISPLAY, x: M, y: 1258, w: SHARE_W - 2 * M, size: 26, min: 18, align: 'center', tracking: 0, tone: 'muted', text: TAGLINE }));
    return { id, texts, score, names, planet: planetOf(d, 540, 648, 292), frame, rules };
  }

  // ---- POSTER: the score is the picture -------------------------------------------------------
  texts.push(text({ ...LABEL, x: M, y: 88, w: SHARE_W - 2 * M, size: 38, align: 'center', tracking: 0.36, tone: 'bright', text: MARK }));
  texts.push(text({ ...LABEL, x: M, y: 678, w: SHARE_W - 2 * M, size: 30, align: 'center', tracking: 0.38, tone: 'cream', text: result }));
  const score = scoreRow(d, 730, 226, [300, 540, 780], 420);
  score.dash.x = 510;
  score.dash.w = 60;
  score.dash.size = Math.round(226 * 0.4);
  const names = {
    you: text({ ...LABEL, x: 300 - 190, y: 1046, w: 380, size: 27, align: 'center', tracking: 0, tone: 'cream', text: fitName(you, 380, 27, 'ui') }),
    opp: text({ ...LABEL, x: 780 - 190, y: 1046, w: 380, size: 27, align: 'center', tracking: 0, tone: 'cream', text: fitName(opp, 380, 27, 'ui') }),
  };
  texts.push(score.you, score.dash, score.opp, names.you, names.opp);
  texts.push(text({ ...DISPLAY, x: M, y: 1170, w: SHARE_W - 2 * M, size: 34, min: 20, align: 'center', tracking: 0, tone: 'cream', text: TAGLINE }));
  texts.push(text({ ...LABEL, x: M, y: 1254, w: SHARE_W - 2 * M, size: 19, align: 'center', tracking: 0.34, tone: 'muted', text: ADDRESS }));
  return { id, texts, score, names, planet: planetOf(d, 540, 408, 236), frame: null, rules };
};
