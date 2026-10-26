// THE REPLAY POSTER (owner brief, 2026-10-26): "make it look shareable" — the finished match as
// one picture: the two display names, the score, the board's final position and the FUTASAKU mark.
//
// Drawn by hand on a canvas from the replay's own data. No dependency, no DOM cloning, no fonts
// loaded twice: the hex grid is five lines of trigonometry and the rest is text. The layout is a
// pure function, so a test can prove the image carries the names, the score and the board — and
// nothing else (no ids, no tokens, no hidden player records).
import { allCoords, coordKey, mirror, parseKey } from '../../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../../src/engine/index.js';
import { REPLAY } from '../../../src/strings.js';
import { fit } from '../logic/share.js';
import type { TextBox } from '../logic/share.js';
import type { ReplayModel } from './timeline.js';

export const POSTER_W = 1080;
export const POSTER_H = 1350;
const M = 72;
const BOARD_TOP = 392;
const BOARD_H = 700;
const MARK_TOP = 1204;
const SQ3 = Math.sqrt(3);

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

export type PosterCell = {
  key: string;
  x: number;
  y: number;
  owner: Player | null;
  strength: number;
  root: boolean;
  terrain: Terrain;
};

export type PosterLayout = {
  width: number;
  height: number;
  names: readonly [TextBox, TextBox];
  score: { you: TextBox; dash: TextBox; opp: TextBox };
  mark: TextBox;
  board: { hex: number; cells: PosterCell[] };
};

/** Everything the poster paints, taken from the replay and nothing else. */
export const posterFor = (model: ReplayModel): PosterData => {
  const final = model.frames.at(-1);
  const score: readonly [number, number] = model.result?.scores ?? final?.scores ?? [model.from.scores[0], model.from.scores[1]];
  const board = final?.board ?? model.from.board;
  // The frames' boards are already in SCREEN coordinates (seat 1 is turned 180°). A set board's
  // cell list comes from the engine, so it gets the same turn; the classic hexagon is symmetric but
  // is mapped anyway, through the one rule.
  const toScreen = (key: string) => (model.me === 0 ? key : coordKey(mirror(parseKey(key))));
  const coords = model.config.board?.cells?.length
    ? model.config.board.cells.map(toScreen)
    : allCoords(model.config.boardRadius).map((c) => toScreen(coordKey(c)));
  return {
    names: model.names,
    score: [score[0], score[1]] as const,
    winner: model.result?.winner ?? (score[0] === score[1] ? null : ((score[0] > score[1] ? 0 : 1) as Player)),
    board,
    coords,
    terrain: model.terrain,
    me: model.me,
    mark: REPLAY.mark,
  };
};

/** A pure, testable description of the poster's text and hexes. */
export const posterLayout = (d: PosterData): PosterLayout => {
  const inner = POSTER_W - 2 * M;
  const name = (text: string, align: 'left' | 'right'): TextBox => ({
    x: M,
    y: 86,
    w: inner,
    h: 44,
    text: fit(text.toUpperCase(), 22),
    size: 36,
    weight: 700,
    align,
  });
  const third = inner / 3;
  const score = {
    you: { x: M, y: 154, w: third, h: 180, text: String(d.score[0]), size: 148, weight: 800 as const, align: 'center' as const },
    dash: { x: M + third, y: 154, w: third, h: 180, text: '–', size: 88, weight: 400 as const, align: 'center' as const },
    opp: { x: M + 2 * third, y: 154, w: third, h: 180, text: String(d.score[1]), size: 148, weight: 800 as const, align: 'center' as const },
  };
  const mark: TextBox = { x: M, y: MARK_TOP, w: inner, h: 40, text: d.mark, size: 26, weight: 600, align: 'center' };

  const coords = d.coords.map(parseKey);
  if (coords.length === 0) return { width: POSTER_W, height: POSTER_H, names: [name(d.names[0], 'left'), name(d.names[1], 'right')], score, mark, board: { hex: 1, cells: [] } };
  const px = coords.map((c) => SQ3 * (c.q + c.r / 2));
  const py = coords.map((c) => 1.5 * c.r);
  const midX = (Math.min(...px) + Math.max(...px)) / 2;
  const midY = (Math.min(...py) + Math.max(...py)) / 2;
  const unitW = Math.max(...px) - Math.min(...px) + SQ3;
  const unitH = Math.max(...py) - Math.min(...py) + 2;
  const hex = Math.floor(Math.min(inner / unitW, BOARD_H / unitH));
  const cx = Math.round(POSTER_W / 2);
  const cy = Math.round(BOARD_TOP + BOARD_H / 2);
  const cells = coords.map((c) => {
    const key = coordKey(c);
    const tile = d.board[key] ?? null;
    return {
      key,
      x: cx + hex * (SQ3 * (c.q + c.r / 2) - midX),
      y: cy + hex * (1.5 * c.r - midY),
      owner: tile ? tile.owner : null,
      strength: tile ? tile.strength : 0,
      root: !!tile?.root,
      terrain: d.terrain[key] ?? ('normal' as const),
    };
  });
  return {
    width: POSTER_W,
    height: POSTER_H,
    names: [name(d.names[0], 'left'), name(d.names[1], 'right')],
    score,
    mark,
    board: { hex, cells },
  };
};

/** `futasaku-<winner>-<score>.png` — the winner's own name, made safe for a file. */
export const posterFileName = (d: PosterData): string => {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'player';
  const winner = d.winner === null ? 'draw' : slug(d.names[d.winner] ?? 'player');
  return `futasaku-${winner}-${d.score[0]}-${d.score[1]}.png`;
};

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Paint the poster on a canvas. The one impure call; the layout above is pure. */
export const drawReplayPoster = (d: PosterData, canvas: HTMLCanvasElement = document.createElement('canvas')): HTMLCanvasElement => {
  const L = posterLayout(d);
  canvas.width = L.width;
  canvas.height = L.height;
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

  text(L.names[0], col.you, 3);
  text(L.names[1], col.opp, 3);
  text(L.score.you, col.you);
  text(L.score.dash, col.dim);
  text(L.score.opp, col.opp);
  text(L.mark, col.dim, 12);

  const hexAt = (x: number, y: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = x + r * Math.cos(a);
      const py = y + r * Math.sin(a);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  };
  for (const cell of L.board.cells) {
    hexAt(cell.x, cell.y, L.board.hex - 2);
    if (cell.owner === null) {
      g.fillStyle = cell.terrain === 'rich' ? 'rgba(233, 216, 173, .12)' : cell.terrain === 'rock' ? 'rgba(255, 255, 255, .045)' : 'rgba(255, 255, 255, .035)';
      g.fill();
    } else {
      g.fillStyle = cell.owner === d.me ? col.you : col.opp;
      g.globalAlpha = cell.root ? 1 : 0.78;
      g.fill();
      g.globalAlpha = 1;
    }
    g.strokeStyle = col.line;
    g.lineWidth = 2;
    g.stroke();
    if (cell.owner !== null) {
      if (cell.strength > 0) {
        g.font = `700 ${Math.round(L.board.hex * 0.48)}px ${font}`;
        g.fillStyle = 'rgba(7, 9, 8, .84)';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(cell.strength), cell.x, cell.y + 1);
      }
      if (cell.root) {
        // A ring, never a disc over the number: the root tile still has to read its strength.
        g.beginPath();
        g.arc(cell.x, cell.y, L.board.hex * 0.27, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(240, 233, 220, .72)';
        g.lineWidth = Math.max(2, L.board.hex * 0.045);
        g.stroke();
      }
    }
  }
  return canvas;
};

export const posterBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((ok) => canvas.toBlob(ok, 'image/png'));

/** The phone's share sheet when it can take a file; otherwise a plain download. */
export const shareReplayPoster = async (d: PosterData): Promise<'shared' | 'saved' | 'cancelled'> => {
  const blob = await posterBlob(drawReplayPoster(d));
  if (!blob) return 'cancelled';
  const file = new File([blob], posterFileName(d), { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: d.mark });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: posterFileName(d) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
};
