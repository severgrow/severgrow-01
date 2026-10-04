// The share card (UI overhaul item 20): a picture of the result, drawn on a canvas in the
// browser and handed to the phone's share sheet (or saved as a file). Nothing is uploaded.
// This file is the card's layout: pure, so a test can check nothing overlaps or spills.
import { allCoords, coordKey, parseKey } from '../../../src/engine/index.js';
import type { Player, Tile } from '../../../src/engine/index.js';

export const SHARE_W = 1080;
export const SHARE_H = 1350;
const M = 64; // margin

export type Box = { x: number; y: number; w: number; h: number };
export type TextBox = Box & { text: string; size: number; weight: 400 | 600 | 800; align: 'left' | 'center' };

export type ShareData = {
  game: string;
  title: string;
  sub: string;
  score: [number, number];
  highlights: string[];
  board: Record<string, Tile | null>;
  radius: number;
  /** the Lab (test copy): the board's hexes when it is not the classic hexagon */
  cells?: readonly string[] | undefined;
  me: Player;
};

/** Cuts a line to fit `max` characters (with an ellipsis). */
export const fit = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

export type ShareLayout = {
  texts: TextBox[];
  score: { you: TextBox; dash: TextBox; opp: TextBox };
  board: { cx: number; cy: number; hex: number; cells: { key: string; x: number; y: number; owner: Player | null; root: boolean }[] } & Box;
};

export const shareLayout = (d: ShareData): ShareLayout => {
  const W = SHARE_W - 2 * M;
  const texts: TextBox[] = [];
  let y = M;
  const line = (text: string, size: number, weight: TextBox['weight'], gap = 16, maxChars = Math.floor(W / (size * 0.52))) => {
    const h = Math.round(size * 1.25);
    texts.push({ x: M, y, w: W, h, text: fit(text, maxChars), size, weight, align: 'center' });
    y += h + gap;
  };
  line(d.game.toUpperCase(), 40, 800, 36);
  line(d.title, 72, 800, 12);
  line(d.sub, 34, 400, 28);
  const sh = 140;
  const third = W / 3;
  const score = {
    you: { x: M, y, w: third, h: sh, text: String(d.score[0]), size: 128, weight: 800 as const, align: 'center' as const },
    dash: { x: M + third, y, w: third, h: sh, text: '–', size: 96, weight: 400 as const, align: 'center' as const },
    opp: { x: M + 2 * third, y, w: third, h: sh, text: String(d.score[1]), size: 128, weight: 800 as const, align: 'center' as const },
  };
  y += sh + 28;
  // the board: as big as fits between the score and the highlights
  const hl = d.highlights.slice(0, 3);
  const hlH = hl.length * (Math.round(34 * 1.25) + 12);
  const boardH = SHARE_H - M - hlH - 24 - y;
  const R = d.radius;
  // the Lab (test copy): any set of hexes; the classic board is the hexagon of radius R
  const coords = d.cells ? d.cells.map(parseKey) : allCoords(R);
  const px = coords.map((c) => Math.sqrt(3) * (c.q + c.r / 2));
  const py = coords.map((c) => 1.5 * c.r);
  const midX = (Math.min(...px) + Math.max(...px)) / 2;
  const midY = (Math.min(...py) + Math.max(...py)) / 2;
  const unitW = Math.max(...px) - Math.min(...px) + Math.sqrt(3);
  const unitH = Math.max(...py) - Math.min(...py) + 2;
  const hex = Math.floor(Math.min(W / unitW, boardH / unitH));
  const bw = Math.round(unitW * hex);
  const bh = Math.round(unitH * hex);
  const cx = Math.round(SHARE_W / 2);
  const cy = Math.round(y + boardH / 2);
  const cells = coords.map((c) => {
    const key = coordKey(c);
    const t = d.board[key];
    return { key, x: cx + hex * (Math.sqrt(3) * (c.q + c.r / 2) - midX), y: cy + hex * (1.5 * c.r - midY), owner: t ? t.owner : null, root: !!t?.root };
  });
  const board = { cx, cy, hex, cells, x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
  y += boardH + 24;
  for (const t of hl) line(t, 34, 400, 12);
  return { texts, score, board };
};
