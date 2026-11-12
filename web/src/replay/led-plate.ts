// THE SCORE PLATE (owner, 2026-10-31: "the top doesn't feel like Futasaku … I don't like the font of
// the top score row"). The match's own instrument is the cockpit's dot-matrix display — the supplied
// hardware frame, a dark window, a faint grid of unlit cells and the lit digits in your green, the
// separator's amber and the opponent's red. The replay's video and poster paint THAT display, from
// the same 5×7 alphabet and the same inks (`player/led-cells.ts`, `player/light.ts`), so the score
// reads exactly as it does in the game. Pure geometry + one canvas painter; no new art.
import { LED_INK } from '../player/light.js';
import { ledLayout } from '../player/led-cells.js';

/** The supplied frame (184×80) and its transparent window, in its own pixels. */
const FRAME_W = 184;
const FRAME_H = 80;
const WINDOW = { x: 13, y: 12, w: 158, h: 55 };
/** The in-game window's unlit-cell grid (smart-cockpit.ts): 2.3 × 3.1 px, a .65 px warm dot. */
const CELL_PITCH = { x: 2.3, y: 3.1, r: 0.65 };
const UNLIT = 'rgba(166,128,78,.20)';

/** The frame's URL: the same file the cockpit's display uses (web/public/hardware). */
export const ledFrameUrl = (): string =>
  typeof document === 'undefined' ? 'hardware/display-frame-supplied.webp' : new URL('hardware/display-frame-supplied.webp', document.baseURI).href;

export type LedPlateLayout = {
  /** The plate's box (the frame's outer edge), in canvas pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The glass inside the frame. */
  window: { x: number; y: number; w: number; h: number };
  /** One unit of the game's display, in canvas pixels (its dots are laid out in these units). */
  unit: number;
};

/** The plate for a given height, centred on (cx, cy). The frame keeps its own proportions. */
export const ledPlateLayout = (cx: number, cy: number, height: number): LedPlateLayout => {
  const k = height / FRAME_H;
  const w = FRAME_W * k;
  const x = cx - w / 2;
  const y = cy - height / 2;
  // The game's display window is 26 units tall for its 5×7 digits; the lit rows fill ~72% of the glass.
  const glassH = WINDOW.h * k;
  return {
    x,
    y,
    w,
    h: height,
    window: { x: x + WINDOW.x * k, y: y + WINDOW.y * k, w: WINDOW.w * k, h: glassH },
    unit: (glassH * 0.72) / 21.7,
  };
};

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

/**
 * Paint the score display: "12:8" with your digits green, the colon amber and theirs red — the
 * cockpit's own score face. `frame` is the decoded hardware frame (or null: a plain dark plate).
 */
export const paintLedScore = (
  g: CanvasRenderingContext2D,
  L: LedPlateLayout,
  score: readonly [number, number],
  frame: CanvasImageSource | null,
): void => {
  const u = L.unit;
  const glass = L.window;
  g.save();
  // the plate under the frame, then the glass
  roundRect(g, L.x + 2, L.y + 2, L.w - 4, L.h - 4, L.h * 0.18);
  g.fillStyle = '#111312';
  g.fill();
  roundRect(g, glass.x, glass.y, glass.w, glass.h, (6 / 26) * glass.h * 0.5);
  g.fillStyle = '#090c0b';
  g.fill();
  g.clip();
  // the unlit cells across the whole glass
  g.fillStyle = UNLIT;
  const px = CELL_PITCH.x * u;
  const py = CELL_PITCH.y * u;
  for (let y = glass.y + (2.6 * u) % py; y < glass.y + glass.h; y += py) {
    for (let x = glass.x + px / 2; x < glass.x + glass.w; x += px) {
      g.beginPath();
      g.arc(x, y, CELL_PITCH.r * u, 0, Math.PI * 2);
      g.fill();
    }
  }
  // the lit digits, centred in the glass
  const msg = `${score[0]}:${score[1]}`;
  const layout = ledLayout(msg, false, 'score', u);
  const ox = glass.x + (glass.w - layout.width) / 2;
  // the lit rows run 3.15u … 21.75u (± a dot): centre THAT span, not the 26u cell
  const oy = glass.y + glass.h / 2 - 12.45 * u;
  for (const dot of layout.dots) {
    const ink = LED_INK[dot.tone];
    g.beginPath();
    g.arc(ox + dot.x, oy + dot.y, dot.r, 0, Math.PI * 2);
    g.fillStyle = ink.fill;
    g.shadowColor = ink.glow;
    g.shadowBlur = (dot.tone === 'red' ? 4 : 3.4) * u;
    g.fill();
  }
  g.restore();
  if (frame) g.drawImage(frame, L.x, L.y, L.w, L.h);
};
