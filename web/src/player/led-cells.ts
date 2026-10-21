/** A tiny, fixed 5×7 alphabet for the cockpit sign. Drawn only when the message changes. */
import { LED_INK, LIGHT_CAPS, bloomProfile, lightTone } from './light.js';
import type { LightTone } from './light.js';

const GLYPHS: Record<string, string> = {
  A:'01110/10001/10001/11111/10001/10001/10001',
  B:'11110/10001/10001/11110/10001/10001/11110',
  C:'01111/10000/10000/10000/10000/10000/01111',
  D:'11110/10001/10001/10001/10001/10001/11110',
  E:'11111/10000/10000/11110/10000/10000/11111',
  F:'11111/10000/10000/11110/10000/10000/10000',
  G:'01111/10000/10000/10111/10001/10001/01111',
  H:'10001/10001/10001/11111/10001/10001/10001',
  I:'11111/00100/00100/00100/00100/00100/11111',
  J:'00111/00010/00010/00010/10010/10010/01100',
  K:'10001/10010/10100/11000/10100/10010/10001',
  L:'10000/10000/10000/10000/10000/10000/11111',
  M:'10001/11011/10101/10101/10001/10001/10001',
  N:'10001/11001/10101/10011/10001/10001/10001',
  O:'01110/10001/10001/10001/10001/10001/01110',
  P:'11110/10001/10001/11110/10000/10000/10000',
  Q:'01110/10001/10001/10001/10101/10010/01101',
  R:'11110/10001/10001/11110/10100/10010/10001',
  S:'01111/10000/10000/01110/00001/00001/11110',
  T:'11111/00100/00100/00100/00100/00100/00100',
  U:'10001/10001/10001/10001/10001/10001/01110',
  V:'10001/10001/10001/10001/10001/01010/00100',
  W:'10001/10001/10001/10101/10101/10101/01010',
  X:'10001/10001/01010/00100/01010/10001/10001',
  Y:'10001/10001/01010/00100/00100/00100/00100',
  Z:'11111/00001/00010/00100/01000/10000/11111',
  '0':'01110/10001/10011/10101/11001/10001/01110',
  '1':'00100/01100/00100/00100/00100/00100/01110',
  '2':'01110/10001/00001/00010/00100/01000/11111',
  '3':'11110/00001/00001/01110/00001/00001/11110',
  '4':'00010/00110/01010/10010/11111/00010/00010',
  '5':'11111/10000/10000/11110/00001/00001/11110',
  '6':'01111/10000/10000/11110/10001/10001/01110',
  '7':'11111/00001/00010/00100/01000/01000/01000',
  '8':'01110/10001/10001/01110/10001/10001/01110',
  '9':'01110/10001/10001/01111/00001/00001/11110',
  '!':'00100/00100/00100/00100/00100/00000/00100',
  '?':'01110/10001/00001/00010/00100/00000/00100',
  '.':'00000/00000/00000/00000/00000/00000/00100',
  ':':'00000/00100/00100/00000/00100/00100/00000',
  '-':'00000/00000/00000/11111/00000/00000/00000',
  '/':'00001/00001/00010/00100/01000/10000/10000',
  '+':'00000/00100/00100/11111/00100/00100/00000',
  '…':'00000/00000/00000/00000/00000/00000/10101',
  '•':'00000/00000/00100/01110/00100/00000/00000',
  '♥':'00000/01010/11111/11111/01110/00100/00000',
  '✦':'00100/00100/11111/01110/11111/00100/00100',
  '点':'00100/00100/01110/01010/01110/10101/01010',
};

export type LedTone = 'amber' | 'red' | 'green' | 'ivory' | 'pink' | 'cyan' | 'score';

/**
 * THE SCORE IS NEUTRAL (owner, 2026-10-20: "the owner does not like the green and red on the
 * points"). The resting face reads "12:8"; it used to paint your digits green and theirs red, so
 * the two numbers looked like good/bad or two colour-coded teams. Now both sides use ONE cream —
 * the palette's own ivory, the brightest quiet ink the display has — and the two numbers are told
 * apart by POSITION (either side of the separator) and the separator itself, never by hue.
 * Ownership colour is untouched everywhere it means something: tiles, territory, outcome tones.
 */
export const SCORE_INK: LightTone = 'ivory';
/** The separator keeps the warm amber punctuation it always had; it is not a player's colour. */
export const SCORE_SEPARATOR_INK: LightTone = 'amber';
/**
 * The two players' own inks (owner, 2026-10-21): the digits go back to green for you and red for the
 * opponent, as they read before the interim neutral pass. Position still says whose is whose, so the
 * colour reinforces rather than carries the meaning alone.
 */
export const SCORE_INK_YOU: LightTone = 'green';
export const SCORE_INK_OPP: LightTone = 'red';
export type LedMotif = 'stars' | 'heart' | 'shock' | 'scatter' | 'eyes';
export const ledMotifFrames = (motif: LedMotif): readonly string[] => ({
  stars:['• ✦ •','✦ • ✦','• ✦ •','✦ ✦','• ✦ •'],
  heart:['•','♥','♥','•'],
  shock:['•','• •','✦ • ✦','• •','•'],
  scatter:['•••','• •','•  •','• •','•••'],
  eyes:['• •','• •','••','• •'],
})[motif];
/* The glyph inks live in the LIGHT contract (player/light.ts) so the dots and the light
   they cast can never drift into two palettes. */
const INK = LED_INK;

export const LED_ADVANCE = 14.5;
const ADVANCE = LED_ADVANCE;
const DOT_X = 2.3;
const SEPARATOR = ' • ';
export const ledMessageWidth = (message: string) => Math.max(1, message.length * ADVANCE - 1);
export const ledMarqueeTravel = (message: string) => ledMessageWidth(`${message}${SEPARATOR}`);

/** Readable static shorthand for the physical window when motion is reduced. The full copy stays in the live region. */
export function ledStaticMessage(message: string) {
  if (/^\d+:\d+$/.test(message)) return message;
  if (message === 'YOU WIN') return 'WIN';
  if (message === 'OPP WINS') return 'LOSS';
  if (message === 'DRAW GAME') return 'DRAW';
  if (message === 'YOU LEAD') return 'LEAD';
  if (message === 'OPP LEADS') return 'OPP';
  if (/^OPP \+\d+$/.test(message)) return `O+${message.slice(5)}`;
  const score = /^YOU (\d+) • (\d+) OPP$/.exec(message);
  if (score) {
    const both = `${score[1]}:${score[2]}`;
    return ledMessageWidth(both) < 76 ? both : `Y${score[1]}`;
  }
  if (message === 'GROW OR SKIP' || message === 'GROW!') return 'GROW';
  if (message === 'THROW!') return 'THROW';
  if (message === 'DRAW!') return 'DRAW';
  if (message === 'SKIP?') return 'SKIP?';
  if (message === 'OPPONENT TURN') return 'OPP';
  if (message === 'BLOOM READY' || message === 'BLOOM!') return 'BLOOM';
  if (message.startsWith('BLOOM +')) return `B+${message.slice(7)}`;
  if (message.startsWith('YOU LEAD +')) return `Y+${message.slice(10)}`;
  if (message.startsWith('OPP LEADS +')) return `O+${message.slice(11)}`;
  if (message.startsWith('CUT -')) return `CUT-${message.slice(5)}`;
  if (message.startsWith('TURN +')) return `T+${message.slice(6)}`;
  if (message.startsWith('OPP +')) return `O+${message.slice(5)}`;
  if (message.startsWith('FINAL TURNS')) return 'FINALS';
  if (message.startsWith('FINAL TURN')) return 'FINAL';
  if (message.startsWith('LAST TURN')) return 'LAST';
  if (message === 'MEGA BOMB') return 'MEGA';
  if (/^[+-]\d+ TILES$/.test(message)) return message.split(' ')[0]!;
  if (message === 'UNDONE') return 'UNDO';
  if (message === 'FUTASAKU') return 'FUTA';
  if (message === 'CANCEL') return 'CANCEL';
  const cut = /^CUT-(\d+)$/.exec(message);
  if (cut) return cut[1]!.length < 2 ? `CUT-${cut[1]}` : `C-${cut[1]}`;
  if (message.length <= 5) return message;
  return message.split(' ')[0]!.slice(0,5);
}

/**
 * Short LED form for long, known game copy (captions, banners, warnings). Returns null when
 * the copy is not recognised, so unfamiliar text keeps its existing scroll/shorthand path.
 * The live region always keeps the full sentence; this only shapes the physical window.
 */
export function ledToken(message: string): string | null {
  const m = message.toUpperCase().replace(/\s+/g, ' ').trim();
  const num = (re: RegExp, index = 1): string | null => { const g = re.exec(m); return g ? g[index]! : null; };
  let n: string | null;
  if ((n = num(/^YOU CUT OFF (\d+) (?:OPPONENT )?TILES?!?$/))) return `CUT+${n}`;
  if ((n = num(/^YOUR OPPONENT CUT OFF (\d+) OF YOUR TILES$/))) return `CUT-${n}`;
  if ((n = num(/^YOU OVERGREW (\d+) (?:OPPONENT )?SPOTS?!?$/))) return `+${n}`;
  if ((n = num(/^YOUR OPPONENT OVERGREW (\d+) OF YOUR SPOTS?$/))) return `-${n}`;
  if ((n = num(/^YOUR OPPONENT GREW (\d+) TILES?$/))) return `OPP+${n}`;
  if (m === 'YOUR TREE IS SURROUNDED!' || m === "OPPONENT'S VOLCANO IS SURROUNDED!") return 'CAUGHT';
  if ((n = num(/^STRENGTHENED (\d+) . (\d+)$/, 2))) return `UP${n}`;
  if ((n = num(/^YOUR OPPONENT STRENGTHENED A (\d+) TO A (\d+)$/, 2))) return `UP${n}`;
  if (m.startsWith('FRUITED!') || m.startsWith('BOOM!')) return 'BOMB';
  if ((n = num(/^OPPONENT USED A (?:FRUIT CARD|BOMB) ON YOUR (\d+)$/))) return `-${n}`;
  if ((n = num(/^(?:MEGA BOMB|BLAST) CLEARED (\d+) TILES$/))) return `BOOM${n}`;
  if (m === 'PLAY IT IN YOUR GROW STEP.') return 'GROW';
  if (m === 'FRUIT IS BACK NEXT TURN' || m === 'BOMB IS BACK NEXT TURN') return 'NEXT';
  if (m === 'NO OPPONENT TILE BY YOURS') return 'NONE';
  if (m === 'HOME IN DANGER') return 'WARN';
  if (m === 'STRANGLED!') return 'ENDED';
  if (m === 'BIG GROW!') return 'GROW+';
  if ((n = num(/^CUT OFF (\d+)!$/))) return `CUT-${n}`;
  if ((n = num(/^LOST (\d+) TILES$/))) return `LOST${n}`;
  if ((n = num(/^LAST (\d+) TURNS$/))) return `LAST${n}`;
  if (m === 'LAST TURN' || m === 'DRAW PILE OUT: LAST TURN') return 'LAST';
  if (m === 'DRAW PILE RUNNING LOW') return 'LOW';
  if (m.startsWith('REPLAY:')) return 'REPLAY';
  return null;
}

export type LedDot = { x: number; y: number; r: number; tone: LightTone };
export type LedLayout = { width: number; height: number; scale: number; dots: LedDot[] };

/** The lit dots of a message, in CSS px. The ONE source for the cells and their light. */
export function ledLayout(message: string, repeat = false, mode: LedTone = 'amber', scale = 1): LedLayout {
  const s = Math.max(0.5, scale);
  const advance = ADVANCE * s;
  const dotX = DOT_X * s;
  const rowStep = 3.1 * s;
  const originY = 3.15 * s;
  const cellH = 26 * s;
  const shown = repeat ? `${message}${SEPARATOR}${message}${SEPARATOR}${message}` : message;
  const width = Math.max(1, shown.length * advance - s);
  const colon = mode === 'score' ? shown.indexOf(':') : -1;
  // In the score face the digits before the colon are YOUR score and the digits after are the
  // opponent's, so each side takes its own ink (green / red) while the colon stays amber.
  const dots: LedDot[] = [];
  for (let i = 0; i < shown.length; i++) {
    const rows = GLYPHS[shown[i]!] ?? (shown[i] === ' ' ? '' : GLYPHS['?']!);
    if (!rows) continue;
    const glyph = rows.split('/');
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
      if (glyph[y]?.[x] !== '1') continue;
      const tone: LightTone = mode === 'score'
        ? (i === colon ? SCORE_SEPARATOR_INK : i < colon ? SCORE_INK_YOU : SCORE_INK_OPP)
        : mode;
      dots.push({
        x: i * advance + x * dotX + 1.1 * s,
        y: y * rowStep + originY,
        r: (shown[i] === '•' ? 1.33 : 1) * s,
        tone,
      });
    }
  }
  return { width, height: cellH, scale: s, dots };
}

/** Full-size square LED cells. Longer copy repeats as one seamless marquee strip.
 *  `scale` grows the dots (tutorial titles use ~1.15 so they match the old 20px heading). */
export function drawLedCells(
  canvas: HTMLCanvasElement,
  message: string,
  repeat = false,
  mode: LedTone = 'amber',
  scale = 1,
) {
  const layout = ledLayout(message, repeat, mode, scale);
  const s = layout.scale;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(layout.width * dpr);
  canvas.height = Math.ceil(layout.height * dpr);
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return layout.width;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const dot of layout.dots) {
    const ink = INK[dot.tone];
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fillStyle = ink.fill;
    ctx.shadowColor = ink.glow; ctx.shadowBlur = (dot.tone === 'red' ? 4 : 3.4) * s;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  return layout.width;
}

/* --------------------------------------------------------------------------------------------
   The baked bloom. It is painted from the ACTUAL lit dots (the same `ledLayout` the cells use)
   into a small low-res offscreen canvas, soft on every side and padded so nothing is clipped.
   There is no readback and no live blur filter: one bake per message (or a small set per motif
   frame), then the compositor only moves/opacity-animates the finished sprite.
   ------------------------------------------------------------------------------------------ */

/** Bitmap pixels per CSS px. Half resolution on purpose: this is a blur, not an image. The canvas
 *  is upscaled by CSS, which both softens the falloff and quarters the pixels the compositor has
 *  to move — at 4x CPU throttle a full-resolution sprite of this size stalled a frame by ~200 ms. */
const BLOOM_RES = .5;
/** The soft stamp is an ellipse leaning along the tone's angle. */
const STAMP_STRETCH = 1.45;
const STAMP_FLATTEN = .9;
/* The falloff leans DOWN: the lower tail is stretched to reachDown and the upper side is trimmed
   to reachUp, so the light pools onto the keys under the display instead of haloing evenly. The
   shift keeps the stamp centred on the new, asymmetric extent, and the brightest point stays on
   the lit dots because the short upper side is still drawn through them. */
const DOWN_EXTRA = LIGHT_CAPS.reachDown - 1;
const UP_TRIM = 1 - LIGHT_CAPS.reachUp;
const STAMP_DOWN_SCALE = 1 + (DOWN_EXTRA - UP_TRIM) / 2;
const STAMP_DOWN_SHIFT = LIGHT_CAPS.reach * STAMP_FLATTEN * ((DOWN_EXTRA + UP_TRIM) / 2);
/** The stamp's reach above and below a lit dot, in CSS px (equal horizontally by construction). */
export const BLOOM_REACH_UP = LIGHT_CAPS.reach * STAMP_FLATTEN * LIGHT_CAPS.reachUp;
export const BLOOM_REACH_DOWN = LIGHT_CAPS.reach * STAMP_FLATTEN * LIGHT_CAPS.reachDown;
/** CSS px of empty paper kept around the dot strip inside the sprite. It must cover the LONGEST
 *  reach in any direction or the sprite would clip the falloff into a rectangle — and since the
 *  lower tail is now the longest, the pad follows it rather than the horizontal stretch. */
export const BLOOM_REACH = LIGHT_CAPS.reach * STAMP_STRETCH;
export const BLOOM_PAD = Math.ceil(Math.max(BLOOM_REACH, BLOOM_REACH_UP, BLOOM_REACH_DOWN)) + 2;
/** Alpha at the centre of one dot's stamp. Hundreds of stamps sum with 'lighter', so this is the
 *  slope of the gradient rather than its ceiling: too high and the sum saturates into a flat
 *  plateau (light stops reading as light); too low and it is invisible once the sprite's own cap
 *  and the CSS opacity are applied. */
const DOT_ALPHA = .05;
/**
 * Ceiling for the whole sprite: never an opaque wash over the dots it came from. Lowered from
 * .5 (owner, 2026-10-20: the display's light "can never" read as a panel wash). At the published
 * rest opacity (.286) the strongest bloom pixel is ~.10 of the ink — a halo on the bezel, not a
 * light source — and even a marquee's saturated strip stays a faint bloom.
 */
export const BLOOM_ALPHA_CAP = .34;
const stampCache = new Map<LightTone, HTMLCanvasElement>();

const bloomStamp = (tone: LightTone): HTMLCanvasElement | null => {
  const cached = stampCache.get(tone);
  if (cached) return cached;
  const r = LIGHT_CAPS.reach;
  const size = Math.ceil(r * 2 * BLOOM_RES) + 2;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return null;
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const centre = size / 2;
  const gradient = ctx.createRadialGradient(centre, centre, 0, centre, centre, r * BLOOM_RES);
  const spec = lightTone(tone);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    gradient.addColorStop(t, `rgba(${rgbOf(spec.core)},${(bloomProfile(t) * DOT_ALPHA).toFixed(4)})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  stampCache.set(tone, canvas);
  return canvas;
};

const rgbOf = (hex: string): string => {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

export type LedSprite = { canvas: HTMLCanvasElement; width: number; height: number };

/**
 * The soft bloom for a message: the actual lit dots, blown up in soft layers (a baked blur) into
 * a sprite whose dot strip sits `BLOOM_PAD` px inside every edge, so the light starts on the glyphs
 * and fades out on all sides with no edge. Returns null where there is no canvas (tests / no DOM).
 */
export function ledBloomSprite(
  message: string,
  repeat = false,
  mode: LedTone = 'amber',
  scale = 1,
): LedSprite | null {
  if (typeof document === 'undefined') return null;
  const layout = ledLayout(message, repeat, mode, scale);
  const width = layout.width + BLOOM_PAD * 2;
  const height = layout.height + BLOOM_PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * BLOOM_RES));
  canvas.height = Math.max(1, Math.ceil(height * BLOOM_RES));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(BLOOM_RES, 0, 0, BLOOM_RES, 0, 0);

  // The source is the ACTUAL lit dots, at their real positions: this is what guarantees the
  // brim of the light sits on the glyphs rather than between them.
  const dots = document.createElement('canvas');
  dots.width = Math.max(1, Math.ceil(layout.width));
  dots.height = Math.max(1, Math.ceil(layout.height));
  const dctx = dots.getContext('2d');
  if (!dctx) return null;
  for (const dot of layout.dots) {
    const ink = INK[dot.tone];
    dctx.beginPath();
    dctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    dctx.fillStyle = ink.fill;
    dctx.fill();
  }

  // A BLUR, baked. Two parts, and both matter:
  //  · a smooth radial field stamped at every lit dot (rotated along the tone's angle) gives the
  //    long, even falloff — it has no glyph-shaped holes in it;
  //  · the dots themselves, once, at full colour, pin the brightest point to a lit dot.
  // The field's alpha is deliberately low: hundreds of stamps sum with 'lighter', and a higher
  // value saturates into a flat plateau (which is how a "glow" stops looking like light).
  ctx.globalCompositeOperation = 'lighter';
  const stamps = new Map<LightTone, HTMLCanvasElement | null>();
  for (const dot of layout.dots) {
    let stamp = stamps.get(dot.tone);
    if (stamp === undefined) { stamp = bloomStamp(dot.tone); stamps.set(dot.tone, stamp); }
    if (!stamp) continue;
    const angle = (lightTone(dot.tone).angle * Math.PI) / 180;
    const reach = LIGHT_CAPS.reach;
    ctx.save();
    ctx.translate(BLOOM_PAD + dot.x, BLOOM_PAD + dot.y);
    // Straight DOWN in screen space, before the tone's lean: the tail is stretched on the way down
    // only, and the shift keeps the stamp's top edge exactly where it was.
    ctx.translate(0, STAMP_DOWN_SHIFT);
    ctx.rotate(angle);
    ctx.scale(STAMP_STRETCH, STAMP_FLATTEN * STAMP_DOWN_SCALE);
    ctx.drawImage(stamp, -reach, -reach, reach * 2, reach * 2);
    ctx.restore();
  }
  // The dots again, but softened: shrunk to half size and drawn back at the strip's own size, so
  // the peak still sits on a lit dot while the glyph edges themselves are interpolated (a sharp
  // copy here would put a 1-px hard rim inside the falloff).
  const coreSrc = document.createElement('canvas');
  coreSrc.width = Math.max(1, Math.round(layout.width / 2));
  coreSrc.height = Math.max(1, Math.round(layout.height / 2));
  const cctx = coreSrc.getContext('2d');
  if (cctx) {
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(dots, 0, 0, coreSrc.width, coreSrc.height);
    ctx.globalAlpha = .30;
    ctx.drawImage(coreSrc, BLOOM_PAD, BLOOM_PAD, layout.width, layout.height);
    ctx.globalAlpha = 1;
  }

  // No hole is cut at the dots. The halo has to start AT the lit dots, and the alpha cap
  // keeps the glyphs reading through it, so the strongest point of the glow is the dot itself.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = `rgba(0,0,0,${BLOOM_ALPHA_CAP})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return { canvas, width, height };
}

/** Paint a baked bloom into a visible canvas (one drawImage; no blur, no readback). */
export function drawLedBloom(
  canvas: HTMLCanvasElement,
  message: string,
  repeat = false,
  mode: LedTone = 'amber',
  scale = 1,
): number {
  const sprite = ledBloomSprite(message, repeat, mode, scale);
  if (!sprite) return 0;
  canvas.width = sprite.canvas.width;
  canvas.height = sprite.canvas.height;
  canvas.style.width = `${sprite.width}px`;
  canvas.style.height = `${sprite.height}px`;
  canvas.getContext('2d')?.drawImage(sprite.canvas, 0, 0);
  return sprite.width;
}

/**
 * The one-shot brightness layer for pulse / alarm: the same lit dots and the same footprint
 * as the cells, baked once. CSS animates ONLY its opacity (never a filter, never a repaint).
 */
export function ledHotSprite(
  message: string,
  repeat = false,
  mode: LedTone = 'amber',
  scale = 1,
): LedSprite | null {
  if (typeof document === 'undefined') return null;
  const layout = ledLayout(message, repeat, mode, scale);
  const canvas = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.ceil(layout.width * dpr));
  canvas.height = Math.max(1, Math.ceil(layout.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const dot of layout.dots) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r * 1.08, 0, Math.PI * 2);
    ctx.fillStyle = INK[dot.tone].fill;
    ctx.fill();
  }
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  return { canvas, width: layout.width, height: layout.height };
}

/** Paint a baked hot layer into a visible canvas. */
export function drawLedHot(
  canvas: HTMLCanvasElement,
  message: string,
  repeat = false,
  mode: LedTone = 'amber',
  scale = 1,
): number {
  const sprite = ledHotSprite(message, repeat, mode, scale);
  if (!sprite) return 0;
  canvas.width = sprite.canvas.width;
  canvas.height = sprite.canvas.height;
  canvas.style.width = `${sprite.width}px`;
  canvas.style.height = `${sprite.height}px`;
  canvas.getContext('2d')?.drawImage(sprite.canvas, 0, 0);
  return sprite.width;
}
