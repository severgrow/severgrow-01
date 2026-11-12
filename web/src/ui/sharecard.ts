// DRAWS THE SHARE CARD (owner redesign, 2026-11-12) on a 1080x1350 canvas and hands it to the
// phone's share sheet, or saves it as a picture. Nothing is uploaded anywhere.
//
// THE PICTURE IS THE PRODUCT'S OWN MATERIALS:
//   · the sky is the game's sky — `SphereRenderer.sky()`, the SAME shader the menu and the board
//     draw (deep space, two parallax star layers, the still grain), at 1:1 so nothing is resampled;
//   · the board is a small planet: matte tiles on a charcoal disc, cream outline detail around each
//     holding's silhouette, one soft sphere shade and a cream rim;
//   · the type is Besley (display) and Fragment Mono (ui), the product's two faces, in its cream;
//   · the words are the product's (`GAME_TITLE`, `REPLAY.mark`, `REPLAY.tagline`).
//
// The layout is pure (`logic/share.ts`): three compositions behind `SHARE_LAYOUT`. Everything here
// only paints what the layout says, so a change of pick is a one-line change and no geometry moves.
import { SHARE_H, SHARE_W, SHARE_LAYOUT, fittedSize, shareLayout } from '../logic/share.js';
import type { ShareData, ShareLayoutId, SharePlanet, ShareText } from '../logic/share.js';
import { SpaceRenderer } from '../sphere/space.js';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** The two sides' board colours, the ones the game itself paints (`--c-you`, `--c-bot`). */
const YOU = '#7fcf8d';
const BOT = '#ff6b4a';

/** The card's tones: one cream, four weights. Nothing else is coloured — the board carries colour. */
const TONE: Record<ShareText['tone'], string> = {
  bright: '#f2ead9',
  cream: 'rgba(232,221,197,.80)',
  muted: 'rgba(232,221,197,.52)',
  dim: 'rgba(232,221,197,.30)',
};

/** The shader's sky at `w` x `h`, 1:1. Falls back to a still field of the SAME stars if WebGL is off. */
const skyCanvas = (w: number, h: number): HTMLCanvasElement => {
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d')!;
  try {
    const space = new SpaceRenderer(document.createElement('canvas'));
    // Copy in the same task: the WebGL buffer is not preserved.
    g.drawImage(space.sky(w, h, [64, 24], 1), 0, 0, w, h);
    space.dispose();
    return out;
  } catch {
    // NO GL: the shader's own sky colours and star field, evaluated in 2D (the same hash, cell
    // sizes, densities and brightness curve as `SPACE_FRAGMENT`). A slower path to the same sky.
    const base = g.createRadialGradient(w * 0.5, h * 0.44, w * 0.12, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
    base.addColorStop(0, 'rgb(17.3,18.4,17.9)');
    base.addColorStop(1, 'rgb(14.0,15.1,16.1)');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    starField(g, w, h, 9 * 0.55, 0.965, 0.55, [22, 8]);
    starField(g, w, h, 17, 0.955, 1, [64, 24]);
    return out;
  }
};

const fract = (n: number) => n - Math.floor(n);
const hash2 = (x: number, y: number) => {
  const px = fract(x * 123.34), py = fract(y * 456.21);
  const dot = px * (px + 45.32) + py * (py + 45.32);
  return fract((px + dot) * (py + dot));
};
const starField = (g: CanvasRenderingContext2D, w: number, h: number, cell: number, density: number, gain: number, drift: readonly [number, number]) => {
  for (let cy = 0; cy <= Math.ceil(h / cell); cy++) {
    for (let cx = 0; cx <= Math.ceil(w / cell); cx++) {
      const hh = hash2(cx, cy);
      if (hh < density) continue;
      const at = { x: (hash2(cx + 7.1, cy + 7.1) * 0.7 + 0.15) * cell, y: (hash2(cx + 3.7, cy + 3.7) * 0.7 + 0.15) * cell };
      const size = 0.55 + 0.8 * hash2(cx + 1.9, cy + 1.9);
      const fade = 0.22 + 0.7 * ((hh - density) / (1 - density));
      const alpha = Math.min(1, gain * fade * 0.74);
      if (alpha < 0.02) continue;
      const x = cx * cell + at.x + drift[0], y = cy * cell + at.y + drift[1];
      const grad = g.createRadialGradient(x, y, 0, x, y, size * 1.4);
      grad.addColorStop(0, `rgba(219,214,199,${alpha.toFixed(3)})`);
      grad.addColorStop(1, 'rgba(219,214,199,0)');
      g.fillStyle = grad;
      g.fillRect(x - size * 1.4, y - size * 1.4, size * 2.8, size * 2.8);
    }
  }
};

const hexPath = (g: CanvasRenderingContext2D, x: number, y: number, s: number) => {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (Math.PI / 3) * i;
    const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
};

const corner = (x: number, y: number, s: number, i: number) => {
  const a = -Math.PI / 2 + (Math.PI / 3) * i;
  return { x: x + s * Math.cos(a), y: y + s * Math.sin(a) };
};
/** Edge i's neighbour, in the board's own axial ids (`q,r`): the six edges in drawing order. */
const EDGE_DIRS = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]] as const;

/**
 * THE BOARD AS A SMALL PLANET. Matte faces, a fine charcoal grout, and one cream line along the
 * OUTLINE of each holding (never a grid of lines): the detail that makes it read as hardware.
 */
const paintPlanet = (g: CanvasRenderingContext2D, p: SharePlanet, me: ShareData['me']) => {
  // the disc the land sits on
  const disc = g.createRadialGradient(p.cx - p.r * 0.45, p.cy - p.r * 0.5, p.r * 0.08, p.cx, p.cy, p.r);
  disc.addColorStop(0, '#151819');
  disc.addColorStop(1, '#0a0c0b');
  g.beginPath();
  g.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
  g.fillStyle = disc;
  g.fill();

  const ownerOf = new Map(p.cells.map((cell) => [cell.key, cell.owner]));
  g.save();
  g.beginPath();
  g.arc(p.cx, p.cy, p.r - 1.5, 0, Math.PI * 2);
  g.clip();
  for (const cell of p.cells) {
    hexPath(g, cell.x, cell.y, p.hex);
    g.fillStyle = cell.owner === null ? 'rgba(232,221,197,.035)' : cell.owner === me ? YOU : BOT;
    g.fill();
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(9,11,10,.9)';
    g.stroke();
  }
  // CREAM OUTLINE DETAIL: only the silhouette of a holding (a cell whose neighbour is different).
  for (const cell of p.cells) {
    const [q, r] = cell.key.split(',').map(Number) as [number, number];
    for (let i = 0; i < 6; i++) {
      const dir = EDGE_DIRS[i]!;
      const other = ownerOf.get(`${q + dir[0]},${r + dir[1]}`);
      if (other === cell.owner) continue;
      const a = corner(cell.x, cell.y, p.hex, i), b = corner(cell.x, cell.y, p.hex, i + 1);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.strokeStyle = cell.owner === null ? 'rgba(232,221,197,.14)' : 'rgba(232,221,197,.55)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }
  // the homes
  for (const cell of p.cells) {
    if (!cell.root) continue;
    g.beginPath();
    g.arc(cell.x, cell.y, Math.max(2, p.hex * 0.1), 0, Math.PI * 2);
    g.fillStyle = 'rgba(232,221,197,.92)';
    g.fill();
  }
  // one soft sphere: light from the top-left, a darker limb (matte, not glossy)
  const shade = g.createRadialGradient(p.cx - p.r * 0.42, p.cy - p.r * 0.48, p.r * 0.15, p.cx, p.cy, p.r * 1.02);
  shade.addColorStop(0, 'rgba(255,248,233,.055)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,.56)');
  g.fillStyle = shade;
  g.fillRect(p.cx - p.r, p.cy - p.r, p.r * 2, p.r * 2);
  g.restore();

  // the rim: one cream hairline, and a breath of atmosphere outside it
  g.beginPath();
  g.arc(p.cx, p.cy, p.r - 0.75, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(232,221,197,.55)';
  g.lineWidth = 1.5;
  g.stroke();
  g.beginPath();
  g.arc(p.cx, p.cy, p.r + 2.5, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(232,221,197,.08)';
  g.lineWidth = 5;
  g.stroke();
};

/** Paint one line of type, exactly inside its box (the box IS the promise the layout tests). */
const paintText = (g: CanvasRenderingContext2D, t: ShareText, fonts: { display: string; ui: string }) => {
  const family = t.family === 'display' ? fonts.display : fonts.ui;
  const size = fittedSize(t.text, t.w, t.size, t.min, t.family, t.tracking);
  g.save();
  g.font = `${t.weight} ${size}px ${family}`;
  g.fillStyle = TONE[t.tone];
  g.textBaseline = 'middle';
  g.textAlign = t.align === 'center' ? 'center' : t.align === 'right' ? 'right' : 'left';
  g.letterSpacing = `${(size * t.tracking).toFixed(2)}px`;
  const x = t.align === 'center' ? t.x + t.w / 2 : t.align === 'right' ? t.x + t.w : t.x;
  g.fillText(t.text, x, t.y + t.h / 2, t.w);
  g.restore();
};

/**
 * THE PICTURE. Drawn at the canvas's own 1080x1350 — vector tile edges and text at 1:1, never a
 * smaller bitmap scaled up — so every edge on the exported PNG is a native edge.
 */
export const drawShareCard = (d: ShareData, layout: ShareLayoutId = SHARE_LAYOUT): HTMLCanvasElement => {
  const L = shareLayout(d, layout);
  const c = document.createElement('canvas');
  c.width = SHARE_W;
  c.height = SHARE_H;
  const g = c.getContext('2d')!;
  const fonts = { display: css('--font-display', 'Georgia, serif'), ui: css('--font-ui', 'ui-monospace, monospace') };

  g.drawImage(skyCanvas(SHARE_W, SHARE_H), 0, 0);
  paintPlanet(g, L.planet, d.me);
  if (L.frame) {
    g.strokeStyle = 'rgba(232,221,197,.16)';
    g.lineWidth = 1;
    g.strokeRect(L.frame.x + 0.5, L.frame.y + 0.5, L.frame.w - 1, L.frame.h - 1);
  }
  for (const rule of L.rules) {
    g.fillStyle = 'rgba(232,221,197,.14)';
    g.fillRect(rule.x, rule.y, rule.w, rule.h);
  }
  for (const t of L.texts) paintText(g, t, fonts);
  return c;
};

/** Shares the card (Web Share with a file), or saves it when sharing files isn't possible. */
export const shareCard = async (d: ShareData): Promise<'shared' | 'saved' | 'cancelled'> => {
  const canvas = drawShareCard(d);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
  if (!blob) return 'cancelled';
  const name = `${d.game.toLowerCase()}-result.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: d.game });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
};
