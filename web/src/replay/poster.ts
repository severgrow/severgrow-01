// THE REPLAY POSTER (owner brief, 2026-10-26): "make it look shareable" — the finished match as
// one picture: the two display names, the score, the board's final position and the FUTASAKU mark.
//
// Drawn by hand on a canvas from the replay's own data. No dependency, no DOM cloning, no fonts
// loaded twice. The board is NOT drawn here: `board-canvas.ts` owns the hex geometry, the palette
// and the sprite faces, and the exported video paints its frames through this same layout and the
// same painter — that is what keeps the still and the video from drifting apart. The layout is a
// pure function, so a test can prove the image carries the names, the score and the board — and
// nothing else (no ids, no tokens, no hidden player records).
import type { Player, Terrain, Tile } from '../../../src/engine/index.js';
import { REPLAY } from '../../../src/strings.js';
import { fit } from '../logic/share.js';
import type { TextBox } from '../logic/share.js';
import {
  boardBottom,
  brandWordmark,
  boardTop,
  layoutBoard,
  paintBoard,
  screenCoordsOf,
  SIGNATURE_FONT,
  warmBoardArt,
} from './board-canvas.js';
import type { BoardArt, BoardCell, BoardLayout, TileMotion } from './board-canvas.js';
import type { ReplayModel } from './timeline.js';

// THE FRAME (owner, 2026-10-30: "board as big as in the game, scoring small, the space between the
// board and FUTASAKU.COM the same as between FUTASAKU.COM and the bottom edge … clean and elegant,
// but also free advertisement"). A full phone screen, portrait 9:16 — what Stories, Reels, TikTok and
// a phone's own player fill edge to edge — so a shared replay never sits in black bars.
export const POSTER_W = 1080;
export const POSTER_H = 1920;
/** The side margin of the score row; the board itself runs nearly edge to edge. */
const M = 64;
const BOARD_SIDE = 28;
const BOARD_MAX_H = 1140;
/** The slim score row: names at the edges, the score in the middle, all small. */
const NAME_SIZE = 30;
const SCORE_SIZE = 60;
/** The sign-off lockup: the 双サク mark, the address, and one line that says what the game is. */
const WORDMARK_H = 62;
const SITE_SIZE = 44;
const TAG_SIZE = 22;
/** Half a capital's height, as a share of its font size (the gaps are measured to the ink). */
const CAP = 0.36;

/** The one extra line a video frame carries (centred in the gap between the score and the board). */
export const TURN_H = 40;

/** The board's own pictures, handed over by the module the on-screen board already loaded. */
export type PosterArt = BoardArt;
/** Decode those pictures once (idempotent, cached, never rejects). Shared with the video. */
export const warmPosterArt = warmBoardArt;

export type PosterData = {
  names: readonly [string, string];
  /** [me, opponent] in screen order. */
  score: readonly [number, number];
  /** Screen seat that won, or null for a draw. */
  winner: Player | null;
  board: Record<string, Tile | null>;
  /** Every cell of the match's board shape, empty or not. */
  coords: readonly string[];
  terrain: Record<string, Terrain>;
  me: Player;
  /** The one brand word the picture carries. */
  mark: string;
};

export type PosterCell = BoardCell;

export type PosterLayout = {
  /** The result line's box (the video's end hold), centred in the gap under the score row. */
  turn: TextBox;
  width: number;
  height: number;
  names: readonly [TextBox, TextBox];
  score: { you: TextBox; dash: TextBox; opp: TextBox };
  /** FUTASAKU.COM. */
  mark: TextBox;
  /** The 双サク mark above it: its top-centre point and height. */
  wordmark: { x: number; y: number; h: number };
  /** One quiet line under the address that says what the game is. */
  tagline: TextBox;
  board: BoardLayout;
};

/** Everything the poster paints, taken from the replay and nothing else. */
export const posterFor = (model: ReplayModel): PosterData => {
  const final = model.frames.at(-1);
  const score: readonly [number, number] = model.result?.scores ?? final?.scores ?? [model.from.scores[0], model.from.scores[1]];
  const board = final?.board ?? model.from.board;
  return {
    names: model.names,
    score: [score[0], score[1]] as const,
    winner: model.result?.winner ?? (score[0] === score[1] ? null : ((score[0] > score[1] ? 0 : 1) as Player)),
    board,
    coords: screenCoordsOf(model),
    terrain: model.terrain,
    me: model.me,
    mark: REPLAY.mark,
  };
};

/** A pure, testable description of the poster's text and hexes. */
export const posterLayout = (d: PosterData): PosterLayout => {
  const inner = POSTER_W - 2 * M;
  // The board first, as large as the frame allows (the game's own size: nearly edge to edge).
  const fitted = layoutBoard(d, { w: POSTER_W - 2 * BOARD_SIDE, h: BOARD_MAX_H, cx: POSTER_W / 2, cy: POSTER_H / 2 });
  const hexTop = fitted.cells.length ? boardTop(fitted) : POSTER_H / 2 - BOARD_MAX_H / 2;
  const hexBottom = fitted.cells.length ? boardBottom(fitted) : POSTER_H / 2 + BOARD_MAX_H / 2;
  const boardInk = hexBottom - hexTop;
  // The inks, top to bottom: the score row, the board, the sign-off lockup. The free height is
  // shared in FOUR equal gaps — above the score row, score row to board, board to the lockup, and
  // the lockup to the bottom edge — so the address sits exactly between the board and the edge.
  const rowInk = 2 * SCORE_SIZE * CAP;
  const lockInk = WORDMARK_H + 22 + 2 * SITE_SIZE * CAP + 20 + 2 * TAG_SIZE * CAP;
  const gap = Math.max(40, Math.floor((POSTER_H - rowInk - boardInk - lockInk) / 4));
  const rowMid = gap + rowInk / 2;
  const shift = gap + rowInk + gap - hexTop;
  const board = { ...fitted, cells: fitted.cells.map((c) => ({ ...c, y: c.y + shift })) };
  const line = (y: number, size: number, text: string, weight: 400 | 600 | 700 | 800, align: 'left' | 'center' | 'right', x = M, w = inner): TextBox => ({
    x,
    y: Math.round(y - size * 0.6),
    w,
    h: Math.round(size * 1.2),
    text,
    size,
    weight,
    align,
  });
  // The score row: each name at its edge, the score in the middle ("8 – 10"), set small.
  const half = inner / 2;
  const nameW = half - 150;
  const names: readonly [TextBox, TextBox] = [
    line(rowMid, NAME_SIZE, fit(d.names[0].toUpperCase(), 16), 700, 'left', M, nameW),
    line(rowMid, NAME_SIZE, fit(d.names[1].toUpperCase(), 16), 700, 'right', POSTER_W - M - nameW, nameW),
  ];
  const score = {
    you: line(rowMid, SCORE_SIZE, String(d.score[0]), 700, 'right', POSTER_W / 2 - 150, 120),
    dash: line(rowMid, SCORE_SIZE * 0.6, '–', 400, 'center', POSTER_W / 2 - 30, 60),
    opp: line(rowMid, SCORE_SIZE, String(d.score[1]), 700, 'left', POSTER_W / 2 + 30, 120),
  };
  // The lockup, centred under the board: the mark, the address, one line of what the game is.
  const lockTop = hexBottom + shift + gap;
  const wordmark = { x: POSTER_W / 2, y: Math.round(lockTop), h: WORDMARK_H };
  const siteMid = lockTop + WORDMARK_H + 22 + SITE_SIZE * CAP;
  const mark = line(siteMid, SITE_SIZE, d.mark, 800, 'center');
  const tagMid = siteMid + SITE_SIZE * CAP + 20 + TAG_SIZE * CAP;
  const tagline = line(tagMid, TAG_SIZE, REPLAY.tagline, 600, 'center');
  const turn = line(gap + rowInk + gap / 2, 30, '', 700, 'center');
  return { width: POSTER_W, height: POSTER_H, names, score, mark, wordmark, tagline, turn, board };
};

/** `futasaku-<winner>-<score>` — the winner's own name, made safe for a file. */
export const replayFileBase = (d: PosterData): string => {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'player';
  const winner = d.winner === null ? 'draw' : slug(d.names[d.winner] ?? 'player');
  return `futasaku-${winner}-${d.score[0]}-${d.score[1]}`;
};

/** `futasaku-<winner>-<score>.png` — the still image's name. */
export const posterFileName = (d: PosterData): string => `${replayFileBase(d)}.png`;

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export type PosterTurn = { text: string; seat: Player | null };


// The on-screen game has an analogue film overlay above every element. Canvas exports do not
// capture DOM overlays, so replay stills and video frames need the same finish baked into pixels.
// One small deterministic tile is generated once and reused across frames (no per-frame noise).
let filmTile: HTMLCanvasElement | null = null;
const replayFilmTile = (): HTMLCanvasElement => {
  if (filmTile) return filmTile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const pixels = g.createImageData(128, 128);
  let seed = 0x51f07a5a;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const light = (seed >>> 0) & 1;
    pixels.data[i] = light ? 234 : 18;
    pixels.data[i + 1] = light ? 231 : 19;
    pixels.data[i + 2] = light ? 223 : 18;
    pixels.data[i + 3] = light ? 33 : 24;
  }
  g.putImageData(pixels, 0, 0);
  filmTile = c;
  return c;
};

/** Consistent, subtle film grain over the entire export — including artwork and lettering. */
export const paintReplayFilm = (g: CanvasRenderingContext2D, width: number, height: number): void => {
  const pattern = g.createPattern(replayFilmTile(), 'repeat');
  if (!pattern) return;
  g.save();
  g.fillStyle = pattern;
  g.fillRect(0, 0, width, height);
  g.restore();
};

/** Paint the poster on a canvas. The one impure call; the layout above is pure. */
export const drawReplayPoster = (
  d: PosterData,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
  turn?: PosterTurn,
  motion?: Readonly<Record<string, TileMotion>>,
  /** The video's moment: whose move it is, and whether this is the final hold. */
  opts?: { live?: Player | null; end?: boolean },
  /** Cache painters add the film after drawing their moving cells, never twice. */
  withFilm = true,
): HTMLCanvasElement => {
  const L = posterLayout(d);
  // A recording reuses one canvas for every frame, so the buffer is only resized when it must be.
  if (canvas.width !== L.width) canvas.width = L.width;
  if (canvas.height !== L.height) canvas.height = L.height;
  const g = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'ui-monospace, monospace';
  const col = {
    bg: '#070908',
    ink: css('--rp-ink', '#f0e9dc'),
    dim: css('--rp-dim', 'rgba(240, 233, 220, .62)'),
    line: css('--rp-line', 'rgba(233, 216, 173, .16)'),
    you: css('--c-you', '#7fcf8d'),
    opp: css('--c-bot', '#ff6b4a'),
  };

  g.fillStyle = col.bg;
  g.fillRect(0, 0, L.width, L.height);
  const light = g.createRadialGradient(L.width * 0.5, 0, 40, L.width * 0.5, 0, L.height * 0.9);
  light.addColorStop(0, 'rgba(52, 58, 44, .55)');
  light.addColorStop(0.58, 'rgba(12, 15, 13, .25)');
  light.addColorStop(1, 'rgba(0, 0, 0, .35)');
  g.fillStyle = light;
  g.fillRect(0, 0, L.width, L.height);

  const text = (t: TextBox, color: string, spacing = 0) => {
    g.font = `${t.weight} ${t.size}px ${font}`;
    g.fillStyle = color;
    g.textAlign = t.align;
    g.textBaseline = 'middle';
    const ctx = g as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    const x = t.align === 'center' ? t.x + t.w / 2 : t.align === 'right' ? t.x + t.w : t.x;
    g.fillText(t.text, x, t.y + t.h / 2, t.w);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  };

  // A soft light behind the board: the picture's subject, lifted off the dark (the menu's own glow).
  {
    const ys = L.board.cells.map((c) => c.y);
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : L.height / 2;
    const glow = g.createRadialGradient(L.width / 2, cy, 40, L.width / 2, cy, L.width * 0.62);
    glow.addColorStop(0, 'rgba(70, 82, 56, .26)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, L.width, L.height);
  }

  // THE SCORE ROW: small, the way the replay screen sets it — each name at its edge in its own ink,
  // the score in the middle. While the match plays, a pip marks whose move it is; at the end the
  // winner's side is lit and the other steps back.
  const ended = opts?.end === true;
  const seatInk = (seat: Player) => (seat === 0 ? col.you : col.opp);
  const quiet = (seat: Player) => ended && d.winner !== null && d.winner !== seat;
  const withAlpha = (seat: Player, draw: () => void) => {
    g.save();
    if (quiet(seat)) g.globalAlpha = 0.38;
    draw();
    g.restore();
  };
  withAlpha(0, () => text(L.names[0], seatInk(0), 4));
  withAlpha(1, () => text(L.names[1], seatInk(1), 4));
  withAlpha(0, () => text(L.score.you, ended && d.winner === 0 ? col.you : col.ink));
  text(L.score.dash, col.dim);
  withAlpha(1, () => text(L.score.opp, ended && d.winner === 1 ? col.opp : col.ink));
  const live = opts?.live;
  if (!ended && (live === 0 || live === 1)) {
    // the pip sits on the inner side of the mover's name, toward the score
    g.font = `${L.names[live].weight} ${L.names[live].size}px ${font}`;
    const ctx = g as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    const w = Math.min(g.measureText(L.names[live].text).width, L.names[live].w);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const y = L.names[live].y + L.names[live].h / 2;
    const x = live === 0 ? L.names[0].x + w + 22 : L.names[1].x + L.names[1].w - w - 22;
    g.save();
    g.fillStyle = seatInk(live);
    g.shadowColor = seatInk(live);
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // The end hold's one line: the result, in the winner's ink, in the gap above the board.
  if (turn) {
    text({ ...L.turn, text: turn.text.toUpperCase() }, d.winner === null || d.winner === undefined ? col.ink : seatInk(d.winner), 8);
  }

  paintBoard(g, L.board, { me: d.me, line: col.line, font, motion });

  // THE SIGN-OFF LOCKUP, centred under the board: the 双サク mark, FUTASAKU.COM in Besley and the
  // game's cream with the replay footer's low carved edge, and one quiet line of what the game is.
  const mark = brandWordmark(col.ink, L.wordmark.h);
  if (mark) {
    g.save();
    g.globalAlpha = 0.9;
    g.drawImage(mark, Math.round(L.wordmark.x - mark.width / 2), L.wordmark.y);
    g.restore();
  }
  {
    const t = L.mark;
    const ctx = g as CanvasRenderingContext2D & { letterSpacing?: string };
    g.font = `${t.weight} ${t.size}px ${SIGNATURE_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(t.size * 0.1).toFixed(1)}px`;
    // tracking also adds space after the last letter; this pulls the word back to true centre
    const x = t.x + t.w / 2 + t.size * 0.05;
    const y = t.y + t.h / 2;
    const k = t.size / 11.5 / 2.4; // the footer's carved edge, kept low at poster size
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, .55)';
    g.shadowBlur = 6 * k;
    g.shadowOffsetY = 3 * k;
    g.fillStyle = 'rgba(40, 33, 24, .7)';
    g.fillText(t.text, x, y + 2 * k, t.w);
    g.restore();
    g.fillStyle = 'rgba(92, 78, 56, .95)';
    g.fillText(t.text, x, y + k, t.w);
    g.fillStyle = col.ink;
    g.fillText(t.text, x, y, t.w);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  text({ ...L.tagline, text: L.tagline.text.toUpperCase(), x: L.tagline.x + 2 }, col.dim, 4);
  if (withFilm) paintReplayFilm(g, L.width, L.height);
  return canvas;
};

/**
 * Repaint just these cells of a poster already on the canvas (the video's moving tiles over a
 * picture of everything that holds still). Same layout and painter as the whole poster.
 */
export const paintPosterCells = (
  d: PosterData,
  canvas: HTMLCanvasElement,
  keys: ReadonlySet<string>,
  motion?: Readonly<Record<string, TileMotion>>,
): void => {
  const L = posterLayout(d);
  const g = canvas.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'ui-monospace, monospace';
  paintBoard(g, L.board, { me: d.me, line: css('--rp-line', 'rgba(233, 216, 173, .16)'), font, motion, only: keys });
};

export const posterBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((ok) => canvas.toBlob(ok, 'image/png'));
