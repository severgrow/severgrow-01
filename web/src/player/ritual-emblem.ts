// THE EMBLEM LETS GO OF ITS MARK (owner, 2026-11-16: "when kanji logo pops up from the emblem, during
// the time when it 'grows' make the kanji from middle of the hex emblem disappear and ... rotate the hex
// from the emblem in a way that it perfectly fits the middle hex where it sits").
//
// The card back is ONE painted picture, so its parts cannot move on their own. For the length of the
// kanji's rise the top card wears a cover: the same back without its emblem (`back-frame.webp`, already
// shipped for the Art Lab) with the emblem redrawn on it as vector, split into three layers that move
// on their own — the hex ring, the tree and the kanji. The vector is placed on the painted emblem's own
// box and tinted to its paint, so the cover is not a visible swap (measured: 2.4% of pixels differ, all
// on anti-aliased edges, against 11% in the original cream).
//
// The ring is pointy-top; the board's tiles are flat-top, so a 30° turn makes it a board hex. Its
// scale is measured from the tile it sits on, so the ring lands on the tile's outline.
import emblemSvg from '../assets/brand/hex-emblem.svg?raw';

/** The painted emblem's box on the 256×356 card back, measured from `cards/back.webp`. */
export const EMBLEM_BOX = { left: 43 / 256, top: 82 / 356, width: 169 / 256, height: 192 / 356 } as const;
/** The hex ring's own bounds in the emblem's drawing, so the box above maps onto them exactly. */
export const EMBLEM_VIEWBOX = { x: 187, y: 124, w: 877, h: 997 } as const;
/** The paint of the emblem on the card back (sampled), not the brand cream of the vector file. */
export const EMBLEM_PAINT = '#D6CBAC';
/** Pointy-top to flat-top. */
export const RING_TURN_DEG = 30;
/**
 * THE KEY TURN (owner, 2026-11-17: the turn "is not very visible ... make it spin like 1 time before
 * landing in the tile position aligned with it perfectly", "like a key inside a lock to open the
 * game"). One full turn on top of the 30 degrees, a small wind-up against the turn, a slight overshoot
 * and the lock. Gold while it turns, the card's paint again when it locks.
 */
export const RING_SPIN_DEG = 360 + RING_TURN_DEG;
export const RING_WIND_DEG = -8;
export const RING_OVERSHOOT_DEG = 7;
export const RING_GLOW = '#f2c14e';

/** The ring's keyframes for a turn landing at `fit` scale: wind, spin with glow, overshoot, lock. */
export const ringTurnFrames = (fit: number): Keyframe[] => [
  { transform: 'rotate(0deg) scale(1)', color: EMBLEM_PAINT, easing: 'cubic-bezier(.4,0,.6,1)' },
  { transform: `rotate(${RING_WIND_DEG}deg) scale(1.03)`, color: EMBLEM_PAINT, offset: 0.12, easing: 'cubic-bezier(.5,0,.25,1)' },
  { transform: `rotate(${RING_SPIN_DEG + RING_OVERSHOOT_DEG}deg) scale(${(fit * 1.04).toFixed(4)})`, color: RING_GLOW, offset: 0.78, easing: 'cubic-bezier(.3,0,.2,1)' },
  { transform: `rotate(${RING_SPIN_DEG}deg) scale(${fit.toFixed(4)})`, color: EMBLEM_PAINT },
];

export type EmblemParts = { ring: string; tree: string; kanji: string };

const svg = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${EMBLEM_VIEWBOX.x} ${EMBLEM_VIEWBOX.y} ${EMBLEM_VIEWBOX.w} ${EMBLEM_VIEWBOX.h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${inner}</svg>`;

/** Split the emblem file into its ring, its tree (with the side leaves) and its kanji, as three SVGs. */
export const emblemParts = (source: string = emblemSvg): EmblemParts | null => {
  const main = /<path d="([^"]+)"/.exec(source);
  const leaves = /<g id="two-new-side-leaves"[^>]*>([\s\S]*?)<\/g>/.exec(source);
  const kanji = /<g id="approved-kanji[^"]*"\s+transform="([^"]+)"[^>]*>([\s\S]*?)<\/g>/.exec(source);
  if (!main || !leaves || !kanji) return null;
  // The first path is the ring (outer and inner outline, two subpaths) followed by the tree.
  const subpaths = main[1]!.trim().split(/(?=M )/).map((s) => s.trim()).filter(Boolean);
  if (subpaths.length < 3) return null;
  const paint = (d: string, fill = EMBLEM_PAINT) => `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`;
  const repaint = (inner: string) => inner.replace(/<path /g, `<path fill="${EMBLEM_PAINT}" `);
  return {
    // The ring is painted in its layer's colour, so the turn can light it gold (ringTurnFrames).
    ring: svg(paint(subpaths.slice(0, 2).join(' '), 'currentColor')),
    tree: svg(paint(subpaths.slice(2).join(' ')) + repaint(leaves[1]!)),
    kanji: svg(`<g transform="${kanji[1]}" fill-rule="evenodd">${repaint(kanji[2]!)}</g>`),
  };
};

/**
 * How much the turned ring must grow to sit on the tile's outline. After a 30° turn the ring's width is
 * its point-to-point height (997 drawing units), drawn at the emblem box's scale on a card `cardWidth`
 * wide; the flat-top tile's width is its own point-to-point. Bounded, so a missing or odd measurement
 * can never throw the ring across the board.
 */
export const ringFitScale = (cardWidth: number, tileWidth: number): number => {
  if (!(cardWidth > 1) || !(tileWidth > 1)) return 1;
  const turnedWidth = cardWidth * EMBLEM_BOX.width * (EMBLEM_VIEWBOX.h / EMBLEM_VIEWBOX.w);
  return Math.min(2.4, Math.max(0.6, tileWidth / turnedWidth));
};
