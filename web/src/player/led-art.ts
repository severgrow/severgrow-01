// THE SIGN'S PICTURES (owner, 2026-11-11): "Create a few animations of the display. When big blast on
// board, sometimes display shows explosion. Maybe even with colour. When cut of 6 tiles or so, some
// snake biting, think of 6 ... like once per 2 games. Find the kanji which was a name for the display,
// draw this kanji in the display and also show it once in a while after his big big move or his win."
//
// Three short pictures drawn on the glass's own dot grid (7 rows, ART_COLS columns), each dot with
// its own colour. Every frame is built here once, at import, from plain arithmetic: nothing random,
// nothing timed. They play once at the motif rate (88 ms a frame) and stop on their last frame; the
// machine (display-machine.ts) decides when, ArtDeck below decides how rarely.
import { ART_MARK, registerArtMotif } from './led-cells.js';
import type { LedMotif } from './led-cells.js';

export type LedArt = Extract<LedMotif, 'blast' | 'snake' | 'kanji'>;
export const ART_COLS = 27;
const ROWS = 7;
const MID = (ART_COLS - 1) / 2;

type Grid = string[][];
const blank = (): Grid => Array.from({ length: ROWS }, () => Array<string>(ART_COLS).fill('.'));
const put = (g: Grid, x: number, y: number, tone: string) => {
  const cx = Math.round(x), cy = Math.round(y);
  if (cy >= 0 && cy < ROWS && cx >= 0 && cx < ART_COLS) g[cy]![cx] = tone;
};
const frame = (g: Grid) => ART_MARK + g.map(row => row.join('')).join('/');
/** A tiny deterministic hash, for the debris pattern only. */
const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; return (h * 2246822519 >>> 0) / 4294967296; };

// ---- BLAST: a white flash, an amber fireball, a red shock ring, embers that fall and die. -------
// Rows are 3.1 px apart and columns 2.3, so distances are measured in real px (a round blast).
const px = (x: number, y: number) => Math.hypot((x - MID) * 2.3, (y - 3) * 3.1);
function blastFrames(): string[] {
  const out: string[] = [];
  const steps = 11;
  for (let t = 0; t < steps; t++) {
    const g = blank();
    const ring = 3 + t * 3.4;        // the shock front, in px
    const core = t < 5 ? 9 - t * 1.1 : 0; // the fireball, shrinking as it burns out
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < ART_COLS; x++) {
      const d = px(x, y);
      if (t === 0) { if (d < 4) put(g, x, y, 'i'); continue; }
      if (d < core * 0.45) put(g, x, y, 'i');
      else if (d < core) put(g, x, y, t < 3 ? 'i' : 'a');
      else if (Math.abs(d - ring) < 1.7 && t < 8) put(g, x, y, t < 3 ? 'a' : 'r');
    }
    // Eight rays on the first beats.
    if (t >= 1 && t <= 3) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (let r = core; r < ring + 2; r += 1.6) put(g, MID + Math.cos(a) * r / 2.3, 3 + Math.sin(a) * r / 3.1, t === 1 ? 'i' : 'a');
    }
    // Embers: thrown outward, then they fall a row and fade from amber to red to nothing.
    if (t >= 4) for (let k = 0; k < 14; k++) {
      if (hash(k * 7 + t) < (t - 4) / 8) continue;
      const a = hash(k) * Math.PI * 2;
      const r = ring * (0.55 + hash(k + 40) * 0.4);
      put(g, MID + Math.cos(a) * r / 2.3, 3 + Math.sin(a) * r / 3.1 + (t - 4) * 0.45, t < 7 ? 'a' : 'r');
    }
    out.push(frame(g));
  }
  out.push(frame(blank()));
  return out;
}

// ---- SNAKE: a green snake slithers in, opens its jaw, bites the 6 and slinks off with the bite. -
const SIX = ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'];
const SIX_X = 20;
function snakeFrames(): string[] {
  const out: string[] = [];
  const bitten = new Set<string>();
  const draw = (head: number, jaw: 0 | 1, tongue: boolean, sixTone: string) => {
    const g = blank();
    SIX.forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#' && !bitten.has(`${x},${y}`)) put(g, SIX_X + x, y, sixTone); });
    // The body trails the head as a sine wave, 11 dots long.
    for (let i = 1; i <= 11; i++) {
      const x = head - 1 - i;
      put(g, x, 3 + Math.round(Math.sin(i * 0.62 - head * 0.8) * Math.min(1.6, i * 0.34)), 'g');
    }
    // The head: a 2x3 block with a dark eye in its top front corner.
    for (let y = 2; y <= 4; y++) { put(g, head - 1, y, 'g'); put(g, head, y, 'g'); }
    put(g, head, 2, '.');
    if (jaw) { put(g, head, 1, 'g'); put(g, head + 1, 1, 'g'); put(g, head, 3, '.'); put(g, head, 5, 'g'); put(g, head + 1, 5, 'g'); }
    if (tongue && !jaw) { put(g, head + 1, 3, 'r'); put(g, head + 2, 3, 'r'); put(g, head + 3, 2, 'r'); put(g, head + 3, 4, 'r'); }
    out.push(frame(g));
  };
  // Slither in from the left edge.
  for (let head = 1, k = 0; head <= 16; head += 1.5, k++) draw(head, 0, k % 3 === 1, 'a');
  draw(17, 0, true, 'a');
  draw(17, 1, false, 'a');
  draw(18, 1, false, 'a');
  // CHOMP: the left half of the 6 is gone; it flashes red.
  for (let y = 1; y <= 5; y++) { bitten.add(`0,${y}`); }
  bitten.add('1,0'); bitten.add('1,3'); bitten.add('1,6');
  draw(19, 0, false, 'r');
  draw(19, 0, false, 'i');
  draw(19, 0, false, 'r');
  // Chew, then back off.
  draw(18, 1, false, 'a'); draw(18, 0, false, 'a'); draw(17, 1, false, 'a'); draw(16, 0, true, 'a');
  for (let head = 14.5; head >= 2; head -= 2.5) draw(head, 0, false, 'a');
  // The bitten 6 is left on its own for a beat.
  const g = blank();
  SIX.forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#' && !bitten.has(`${x},${y}`)) put(g, SIX_X + x, y, 'a'); });
  for (let k = 0; k < 4; k++) out.push(frame(g));
  return out;
}

// ---- 点 (ten, "the dot"): the sign's own name, written stroke by stroke, then lit. --------------
// 7 rows: the 卜 on top (two rows), the 口 (three rows), the four dots of 灬 (two rows).
const KANJI_STROKES: readonly (readonly [number, number][])[] = [
  [[0, 0], [0, 1]],                                    // 1  卜 down
  [[1, 1], [2, 1], [3, 1]],                            // 2  卜 right
  [[-3, 2], [-3, 3], [-3, 4]],                         // 3  口 left
  [[-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [3, 2], [3, 3], [3, 4]], // 4  口 top and right
  [[-2, 4], [-1, 4], [0, 4], [1, 4], [2, 4]],          // 5  口 bottom
  [[-4, 5], [-5, 6]],                                  // 6  灬 dot, leaning left
  [[-1, 5], [-1, 6]],                                  // 7
  [[2, 5], [2, 6]],                                    // 8
  [[4, 5], [5, 6]],                                    // 9  last dot, leaning right
];
export const KANJI_DOTS = KANJI_STROKES.flat();
function kanjiFrames(): string[] {
  const out: string[] = [];
  const cx = Math.round(MID);
  const paint = (strokes: number, tone: (i: number) => string, extra?: (g: Grid) => void) => {
    const g = blank();
    KANJI_STROKES.slice(0, strokes).forEach((stroke, i) => stroke.forEach(([x, y]) => put(g, cx + x, y, tone(i))));
    extra?.(g);
    out.push(frame(g));
  };
  // Each stroke lands white-hot and cools to amber as the next one is written.
  for (let s = 1; s <= KANJI_STROKES.length; s++) { paint(s, i => (i === s - 1 ? 'i' : 'a')); paint(s, i => (i === s - 1 ? 'i' : 'a')); }
  // Lit: one ivory breath, two red seal marks either side, then it holds.
  paint(9, () => 'i');
  const seal = (g: Grid) => { for (const side of [-1, 1]) for (let y = 1; y <= 5; y++) { put(g, cx + side * 10, y, 'r'); if (y === 1 || y === 5) put(g, cx + side * 9, y, 'r'); } };
  for (let k = 0; k < 10; k++) paint(9, () => 'a', seal);
  return out;
}

export const ART_FRAMES: Record<LedArt, readonly string[]> = { blast: blastFrames(), snake: snakeFrames(), kanji: kanjiFrames() };
for (const [motif, frames] of Object.entries(ART_FRAMES)) registerArtMotif(motif as LedArt, frames);
/** How long a picture is on the glass, in ms (the motif rate is 88 ms a frame). */
export const artDuration = (art: LedArt) => ART_FRAMES[art].length * 88 + 260;

// ---- HOW RARELY --------------------------------------------------------------------------------
const fnv = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** The sign "opens up" as the player plays more games: from this many finished games the 点 may appear. */
export const KANJI_FROM_GAMES = 5;
/**
 * Per game: an explosion on about half the Blasts (two at most), the snake on about one game in two
 * that has a cut of 6 or more (once), and the 点 once in a while after the opponent's big move or win
 * (once, and only after KANJI_FROM_GAMES games). All choices hash the moment's own key.
 */
export class ArtDeck {
  private shown = new Map<LedArt, number>();
  private snakeDecided: boolean | null = null;
  private games = 0;
  setGames(games: number) { this.games = Math.max(0, Math.floor(games)); }
  reset() { this.shown.clear(); this.snakeDecided = null; }
  take(art: LedArt, key: string): boolean {
    const count = this.shown.get(art) ?? 0;
    let ok: boolean;
    if (art === 'blast') ok = count < 2 && fnv(`blast:${key}`) % 100 < 55;
    else if (art === 'snake') {
      if (this.snakeDecided === null) this.snakeDecided = fnv(`snake:${key}`) % 2 === 0;
      ok = this.snakeDecided && count < 1;
    } else ok = this.games >= KANJI_FROM_GAMES && count < 1 && fnv(`kanji:${key}`) % 100 < 40;
    if (ok) this.shown.set(art, count + 1);
    return ok;
  }
}
