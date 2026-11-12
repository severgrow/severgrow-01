// THE SHARE CARD (owner redesign, 2026-11-12): a 1080x1350 picture (Instagram 4:5 / a phone gallery)
// of the result. This file is the card's LAYOUT — pure, no DOM, no canvas, so every box and every
// case (a win, a loss, a draw, a very long name) is a unit test instead of a squint at a picture.
//
// WHAT A STRANGER NEEDS, AND NOTHING ELSE: the result, the score, the two names. The brand words are
// the product's own (`GAME_TITLE`, `REPLAY.mark`, `REPLAY.tagline`) — never a second copy. The old
// card's highlights, level line and subtitle are gone: they were the player's read-out, not a
// stranger's.
//
// THREE LAYOUTS live here behind `SHARE_LAYOUT`: after the owner picks one, that ONE line changes and
// the export path (`ui/sharecard.ts`) draws the winner. They share the pieces (the wordmark, the
// score rule, the planet's disc) and differ in composition:
//
//   a ORBIT   a centred stack: wordmark, result, score, names, the planet low in the frame.
//   b PLATE   an instrument plate: a hairline frame, wordmark and address on one top line, the
//             planet centred, the score under it, the names pinned to the bottom corners.
//   c POSTER  the score IS the picture: a small planet at the top, then the two numbers huge with
//             each player's name under their own number.
import { allCoords, coordKey, parseKey } from '../../../src/engine/index.js';
import { GAME_TITLE, REPLAY, RESULT } from '../../../src/strings.js';
import type { Player, Tile } from '../../../src/engine/index.js';

export const SHARE_W = 1080;
export const SHARE_H = 1350;
/** The card's one margin (the frame on B sits outside it). */
const M = 88;

/** THE PICK: flip this to 'b' or 'c' after the owner chooses. Nothing else changes. */
export const SHARE_LAYOUT: ShareLayoutId = 'a';

export type ShareLayoutId = 'a' | 'b' | 'c';
export const SHARE_LAYOUTS: readonly ShareLayoutId[] = ['a', 'b', 'c'];

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
export type SharePlanet = Box & { cx: number; cy: number; r: number; hex: number; cells: ShareCell[] };

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
 * ~0.60 em, Fragment Mono is 0.60 em exactly; 0.62 is the safe side for both, and `fillText`'s
 * maxWidth is the drawing-time backstop. Letter spacing widens every gap between characters only.
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

/** The board, as a small planet: the flat lattice placed on a disc and fitted inside it. */
const planetOf = (d: ShareData, cx: number, cy: number, r: number): SharePlanet => {
  const coords = d.cells ? d.cells.map(parseKey) : allCoords(d.radius);
  const px = coords.map((c) => Math.sqrt(3) * (c.q + c.r / 2));
  const py = coords.map((c) => 1.5 * c.r);
  const midX = (Math.min(...px) + Math.max(...px)) / 2;
  const midY = (Math.min(...py) + Math.max(...py)) / 2;
  // The farthest cell CENTRE plus the tile's own corner reach (its circumradius), so no cell is
  // clipped by the disc.
  const reach = Math.max(...coords.map((_, i) => Math.hypot(px[i]! - midX, py[i]! - midY))) + 1;
  const hex = Math.max(6, Math.floor((r * 0.94) / Math.max(1e-6, reach)));
  const cells = coords.map((c, i) => {
    const key = coordKey(c);
    const t = d.board[key];
    return { key, x: cx + hex * (px[i]! - midX), y: cy + hex * (py[i]! - midY), owner: t ? t.owner : null, root: !!t?.root };
  });
  const halfW = (Math.max(...px) - Math.min(...px)) / 2 * hex + (hex * Math.sqrt(3)) / 2;
  const halfH = (Math.max(...py) - Math.min(...py)) / 2 * hex + hex;
  return { cx, cy, r, hex, cells, x: Math.round(cx - halfW), y: Math.round(cy - halfH), w: Math.round(halfW * 2), h: Math.round(halfH * 2) };
};

/** The score's three boxes: two numbers with one quiet rule between them. */
const scoreRow = (d: ShareData, y: number, size: number, centres: readonly [number, number, number], w: number) => ({
  you: text({ x: centres[0] - w / 2, y, w, size, min: 40, weight: 600, align: 'center', family: 'display', tracking: 0, tone: 'bright', text: String(d.score[0]) }),
  dash: text({ x: centres[1] - 40, y: y + Math.round(size * 0.18), w: 80, size: Math.round(size * 0.5), min: 20, weight: 400, align: 'center', family: 'display', tracking: 0, tone: 'dim', text: '—' }),
  opp: text({ x: centres[2] - w / 2, y, w, size, min: 40, weight: 600, align: 'center', family: 'display', tracking: 0, tone: 'bright', text: String(d.score[1]) }),
});

export const shareLayout = (d: ShareData, id: ShareLayoutId = SHARE_LAYOUT): ShareLayout => {
  const result = RESULT_WORD[resultOf(d)];
  const [you, opp] = namesOf(d);
  const texts: ShareText[] = [];
  const rules: Box[] = [];
  const common = { min: 19, weight: 600 as const, family: 'ui' as const };

  if (id === 'a') {
    // ---- ORBIT: one centred column, the planet low in the frame -------------------------------
    texts.push(text({ ...common, x: M, y: 96, w: SHARE_W - 2 * M, size: 46, weight: 600, align: 'center', tracking: 0.34, tone: 'bright', text: MARK }));
    texts.push(text({ ...common, x: M, y: 196, w: SHARE_W - 2 * M, size: 26, weight: 600, align: 'center', tracking: 0.36, tone: 'cream', text: result }));
    const score = scoreRow(d, 262, 168, [300, 540, 780], 240);
    texts.push(score.you, score.dash, score.opp);
    texts.push(text({ ...common, x: M, y: 492, w: 412, size: 30, align: 'right', tracking: 0, tone: 'cream', text: fitName(you, 412, 30, 'ui') }));
    texts.push(text({ ...common, x: 580, y: 492, w: 412, size: 30, align: 'left', tracking: 0, tone: 'cream', text: fitName(opp, 412, 30, 'ui') }));
    texts.push(text({ x: M, y: 1240, w: SHARE_W - 2 * M, size: 32, min: 20, weight: 400, align: 'center', family: 'display', tracking: 0, tone: 'cream', text: TAGLINE }));
    texts.push(text({ ...common, x: M, y: 1296, w: SHARE_W - 2 * M, size: 18, weight: 600, align: 'center', tracking: 0.32, tone: 'muted', text: ADDRESS }));
    return { id, texts, score, planet: planetOf(d, 540, 888, 322), frame: null, rules };
  }

  if (id === 'b') {
    // ---- PLATE: an instrument face -----------------------------------------------------------
    const frame = { x: 44, y: 44, w: SHARE_W - 88, h: SHARE_H - 88 };
    texts.push(text({ ...common, x: 96, y: 96, w: 460, size: 34, weight: 600, align: 'left', tracking: 0.3, tone: 'bright', text: MARK }));
    texts.push(text({ ...common, x: 560, y: 104, w: 424, size: 17, weight: 600, align: 'right', tracking: 0.3, tone: 'muted', text: ADDRESS }));
    rules.push({ x: 96, y: 176, w: SHARE_W - 192, h: 1 });
    texts.push(text({ ...common, x: M, y: 966, w: SHARE_W - 2 * M, size: 26, weight: 600, align: 'center', tracking: 0.36, tone: 'cream', text: result }));
    const score = scoreRow(d, 1024, 122, [300, 540, 780], 230);
    texts.push(score.you, score.dash, score.opp);
    rules.push({ x: 96, y: 1192, w: SHARE_W - 192, h: 1 });
    texts.push(text({ ...common, x: 96, y: 1212, w: 400, size: 29, align: 'left', tracking: 0, tone: 'cream', text: fitName(you, 400, 29, 'ui') }));
    texts.push(text({ ...common, x: 584, y: 1212, w: 400, size: 29, align: 'right', tracking: 0, tone: 'cream', text: fitName(opp, 400, 29, 'ui') }));
    texts.push(text({ x: M, y: 1258, w: SHARE_W - 2 * M, size: 26, min: 18, weight: 400, align: 'center', family: 'display', tracking: 0, tone: 'muted', text: TAGLINE }));
    return { id, texts, score, planet: planetOf(d, 540, 648, 292), frame, rules };
  }

  // ---- POSTER: the score is the picture -------------------------------------------------------
  texts.push(text({ ...common, x: M, y: 88, w: SHARE_W - 2 * M, size: 38, weight: 600, align: 'center', tracking: 0.36, tone: 'bright', text: MARK }));
  texts.push(text({ ...common, x: M, y: 678, w: SHARE_W - 2 * M, size: 30, weight: 600, align: 'center', tracking: 0.38, tone: 'cream', text: result }));
  const score = scoreRow(d, 730, 226, [300, 540, 780], 420);
  score.dash.x = 510;
  score.dash.w = 60;
  score.dash.size = Math.round(226 * 0.4);
  texts.push(score.you, score.dash, score.opp);
  texts.push(text({ ...common, x: 300 - 190, y: 1046, w: 380, size: 27, align: 'center', tracking: 0, tone: 'cream', text: fitName(you, 380, 27, 'ui') }));
  texts.push(text({ ...common, x: 780 - 190, y: 1046, w: 380, size: 27, align: 'center', tracking: 0, tone: 'cream', text: fitName(opp, 380, 27, 'ui') }));
  texts.push(text({ x: M, y: 1170, w: SHARE_W - 2 * M, size: 34, min: 20, weight: 400, align: 'center', family: 'display', tracking: 0, tone: 'cream', text: TAGLINE }));
  texts.push(text({ ...common, x: M, y: 1254, w: SHARE_W - 2 * M, size: 19, weight: 600, align: 'center', tracking: 0.34, tone: 'muted', text: ADDRESS }));
  return { id, texts, score, planet: planetOf(d, 540, 408, 236), frame: null, rules };
};
