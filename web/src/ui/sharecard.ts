// Draws the share card (UI overhaul item 20) on a canvas and hands it to the phone's share
// sheet, or saves it as a picture. Made in the browser; nothing is uploaded anywhere.
import { SHARE_H, SHARE_W, shareLayout } from '../logic/share.js';
import type { ShareData, TextBox } from '../logic/share.js';

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export const drawShareCard = (d: ShareData): HTMLCanvasElement => {
  const L = shareLayout(d);
  const c = document.createElement('canvas');
  c.width = SHARE_W;
  c.height = SHARE_H;
  const g = c.getContext('2d')!;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const col = { bg: css('--c-bg', '#18191a'), text: css('--c-text', '#efe7d6'), muted: css('--c-muted', '#a39d90'), you: css('--c-you', '#4df0b4'), bot: css('--c-bot', '#ff6b4a'), line: css('--c-line', '#3a3a3a') };
  // background: the page colour with the one top-left light
  g.fillStyle = col.bg;
  g.fillRect(0, 0, SHARE_W, SHARE_H);
  const light = g.createRadialGradient(SHARE_W * 0.2, SHARE_H * 0.1, 40, SHARE_W * 0.2, SHARE_H * 0.1, SHARE_W * 1.1);
  light.addColorStop(0, 'rgba(255,255,255,0.08)');
  light.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = light;
  g.fillRect(0, 0, SHARE_W, SHARE_H);
  const text = (t: TextBox, color: string) => {
    g.font = `${t.weight} ${t.size}px ${font}`;
    g.fillStyle = color;
    g.textAlign = t.align;
    g.textBaseline = 'middle';
    g.fillText(t.text, t.align === 'center' ? t.x + t.w / 2 : t.x, t.y + t.h / 2, t.w);
  };
  L.texts.forEach((t, i) => text(t, i === 0 ? col.muted : i === 1 ? col.text : col.muted));
  text(L.score.you, col.you);
  text(L.score.dash, col.muted);
  text(L.score.opp, col.bot);
  // the final board, flat and clear
  const B = L.board;
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
  for (const cell of B.cells) {
    hexAt(cell.x, cell.y, B.hex - 2);
    g.fillStyle = cell.owner === null ? 'rgba(255,255,255,0.05)' : cell.owner === d.me ? col.you : col.bot;
    g.globalAlpha = cell.owner === null ? 1 : cell.root ? 1 : 0.82;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = col.line;
    g.lineWidth = 2;
    g.stroke();
    if (cell.root) {
      g.beginPath();
      g.arc(cell.x, cell.y, B.hex * 0.3, 0, Math.PI * 2);
      g.fillStyle = col.bg;
      g.fill();
    }
  }
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
