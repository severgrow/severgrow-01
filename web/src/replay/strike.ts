// THE STRIKE (owner, 2026-10-31: "it's confusing when bomb is used since you don't know what
// happened — it should be clear on replay that bomb/blast was used"). A Bomb beat shows the Bomb
// card itself — the game's own card art — landing on the tile it hit; a warm burst goes off over the
// cells it covers, and only then do the struck tiles go. A Blast is two Bomb cards and a burst over
// the target and its six neighbours. No words: the card IS the explanation, in the game's own art.
//
// One timing curve (pure, tested) drives both the video painter here and the replay screen — and,
// since the owner asked for the replay's Bomb in the live game (2026-11-20), the live landing too.
// The curve itself lives in `logic/strike.ts` and is RE-EXPORTED here, so the replay's public
// surface is unchanged and both sides read one set of numbers.
import { STRIKE_ART_ASPECT, STRIKE_CARD_HEIGHT, STRIKE_TIMING, strikeLook } from '../logic/strike.js';
import type { StrikeLook } from '../logic/strike.js';
import { BOMB_FACE, cardArtUrl } from '../ui/card-art.js';
import type { BoardLayout } from './board-canvas.js';
import type { Strike } from './timeline.js';

export { STRIKE_TIMING, strikeLook };
export type { StrikeLook };

/**
 * The Bomb card's art, as the strike draws it. Derived from `ui/card-art.ts` — the same table the
 * hand's faces and the piles read — rather than a second direct import of the asset, so a card skin
 * can never move one and leave the other behind. The painters ask `cardArtUrl(BOMB_FACE)` at draw
 * time (so a skin swap reaches them); this constant stays exported for callers that name one URL.
 */
export const BOMB_ART_URL: string = cardArtUrl(BOMB_FACE);

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
    const h = r * STRIKE_CARD_HEIGHT * look.card.scale;
    const w = h * STRIKE_ART_ASPECT;
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
