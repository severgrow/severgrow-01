// THE STRIKE (owner, 2026-10-31: "it's confusing when bomb is used since you don't know what
// happened — it should be clear on replay that bomb/blast was used"). A Bomb beat shows the Bomb
// card itself — the game's own card art — landing on the tile it hit; a warm burst goes off over the
// cells it covers, and only then do the struck tiles go. A Blast is two Bomb cards and a burst over
// the target and its six neighbours. No words: the card IS the explanation, in the game's own art.
//
// One timing curve (pure, tested) drives both the video painter here and the replay screen.
import bombArtUrl from '../assets/cards/bomb.webp?url';
import type { BoardLayout } from './board-canvas.js';
import type { Strike } from './timeline.js';

export const BOMB_ART_URL: string = bombArtUrl;

/** When, inside a strike beat (0 … 1 of its duration), each part happens. */
export const STRIKE_TIMING = Object.freeze({
  /** The card lands (scale and fade in, with a small overshoot). */
  landEnd: 0.16,
  /** The burst goes off; the struck tiles start to go at this moment. */
  burst: 0.36,
  /** The burst has faded. */
  burstEnd: 0.72,
  /** The card leaves. */
  cardOutStart: 0.42,
  cardOutEnd: 0.64,
});

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => 1 - (1 - clamp01(x)) ** 3;

export type StrikeLook = {
  /** The card(s): how solid, how big (1 = resting size) and how far above their place (in hex radii). */
  card: { alpha: number; scale: number; lift: number };
  /** The burst over the struck cells: 0 … 1. */
  burst: number;
};

/** The strike's look at a fraction `p` (0 … 1) of its beat. Pure. */
export const strikeLook = (p: number): StrikeLook => {
  const T = STRIKE_TIMING;
  const land = clamp01(p / T.landEnd);
  const out = clamp01((p - T.cardOutStart) / (T.cardOutEnd - T.cardOutStart));
  const cardAlpha = p < T.cardOutStart ? ease(land) : 1 - ease(out);
  // 0.72 → 1.06 → 1 on the way in, then a slight swell as it goes
  const inScale = land < 0.7 ? 0.72 + (1.06 - 0.72) * (land / 0.7) : 1.06 - 0.06 * ((land - 0.7) / 0.3);
  const scale = p < T.cardOutStart ? inScale : 1 + 0.12 * ease(out);
  const lift = (1 - ease(land)) * 0.5;
  const b = p < T.burst ? 0 : p < T.burst + 0.06 ? (p - T.burst) / 0.06 : 1 - clamp01((p - T.burst - 0.06) / (T.burstEnd - T.burst - 0.06));
  return { card: { alpha: clamp01(cardAlpha), scale, lift }, burst: clamp01(b) };
};

/** One hex outline at (x, y), radius r, in the board's own orientation (`corner` gives its points). */
type Corner = (x: number, y: number, r: number, i: number) => { x: number; y: number };

/**
 * Paint the strike over a painted board: the burst over the area's cells, then the card(s) at the
 * target. `art` is the decoded Bomb card (or null: the burst alone still says "it went off").
 */
export const paintStrike = (
  g: CanvasRenderingContext2D,
  L: BoardLayout,
  strike: Strike,
  p: number,
  art: CanvasImageSource | null,
  corner: Corner,
): void => {
  const look = strikeLook(p);
  const cells = new Map(L.cells.map((c) => [c.key, c]));
  const target = cells.get(strike.target);
  if (!target) return;
  const r = L.hex;
  if (look.burst > 0) {
    g.save();
    for (const key of strike.area) {
      const c = cells.get(key);
      if (!c) continue;
      const centre = key === strike.target;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const q = corner(c.x, c.y, r * 0.98, i);
        if (i === 0) g.moveTo(q.x, q.y);
        else g.lineTo(q.x, q.y);
      }
      g.closePath();
      const glow = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      glow.addColorStop(0, `rgba(255, 236, 196, ${(centre ? 0.9 : 0.6) * look.burst})`);
      glow.addColorStop(0.55, `rgba(255, 168, 82, ${(centre ? 0.62 : 0.4) * look.burst})`);
      glow.addColorStop(1, `rgba(222, 58, 40, ${0.28 * look.burst})`);
      g.fillStyle = glow;
      g.fill();
      g.strokeStyle = `rgba(255, 120, 72, ${0.85 * look.burst})`;
      g.lineWidth = Math.max(1.5, r * 0.06);
      g.stroke();
    }
    g.restore();
  }
  if (art && look.card.alpha > 0.01) {
    const h = r * 2.15 * look.card.scale;
    const w = h * (256 / 356);
    const y = target.y - look.card.lift * r;
    const draw = (dx: number, rot: number) => {
      g.save();
      g.globalAlpha = look.card.alpha;
      g.translate(target.x + dx, y);
      g.rotate(rot);
      g.shadowColor = 'rgba(0, 0, 0, .55)';
      g.shadowBlur = r * 0.35;
      g.shadowOffsetY = r * 0.12;
      g.drawImage(art, -w / 2, -h / 2, w, h);
      g.restore();
    };
    if (strike.cards === 2) {
      draw(-w * 0.28, (-9 * Math.PI) / 180);
      draw(w * 0.28, (9 * Math.PI) / 180);
    } else {
      draw(0, (-4 * Math.PI) / 180);
    }
  }
};
