// THE SPEC SHEET: every slot with its exact size, format, transparency, safe area and where it
// appears (the same rules the uploads are checked against), plus templates to draw on.
import { BUDGET, CARD, CARD_SHEET, HEX_UNITS, SKIN_TIERS, SLOTS, WORLD_UNITS, defaults, targetSize } from './slots.js';
import type { Slot } from './slots.js';

const h = (tag: string, text?: string, cls?: string) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };

const safeArea = (s: Slot) => {
  switch (s.rule.shape) {
    case 'hex': return 'The hex touches the square\'s edges corner to corner; keep detail inside the hex. Number zone: the centre third stays calm.';
    case 'card': case 'card-sheet': return 'Keep the corner number zone (top-left 22%) and a 4% border clear; the game rounds the corners.';
    case 'strip': return 'Tiles left to right along a link; top and bottom 15% fade into the board.';
    case 'svg': return '24×24 viewBox, 2 px strokes, no fills that rely on colour (the game tints it).';
    default: return s.rule.seamless ? 'Seamless: the left edge continues the right, the top continues the bottom.' : s.rule.alpha === 'required' ? 'Centred on a see-through square; the drawn size is the square.' : '—';
  }
};

const hexPoints = (cx: number, cy: number, r: number, pointy: boolean) =>
  Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + (pointy ? Math.PI / 6 : 0); return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const; });

const svgHex = (px: number, pointy: boolean) => {
  const pts = hexPoints(px / 2, px / 2, px / 2, pointy).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const inner = hexPoints(px / 2, px / 2, px / 6, pointy).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"><polygon points="${pts}" fill="#fff"/><polygon points="${inner}" fill="none" stroke="#e05" stroke-width="2" stroke-dasharray="6 6"/><text x="${px / 2}" y="${px - 8}" font-family="sans-serif" font-size="${px / 24}" text-anchor="middle" fill="#999">${pointy ? 'pointy-top' : 'flat-top'} hex · ${px}px · red: number zone</text></svg>`;
};
const svgCard = () => {
  const { w, h: hh } = CARD;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><rect x="0.5" y="0.5" width="${w - 1}" height="${hh - 1}" rx="16" fill="#fff" stroke="#999"/><rect x="${w * 0.04}" y="${hh * 0.04}" width="${w * 0.92}" height="${hh * 0.92}" rx="12" fill="none" stroke="#e05" stroke-dasharray="6 6"/><rect x="${w * 0.04}" y="${hh * 0.04}" width="${w * 0.22}" height="${hh * 0.22}" fill="#e0558822" stroke="#e05"/><text x="${w / 2}" y="${hh - 10}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#999">card ${w}×${hh} · sheet of nine = ${CARD_SHEET.w}×${CARD_SHEET.h}</text></svg>`;
};
const svgHome = (px: number) => {
  const pts = hexPoints(px / 2, px / 2, px / 2, true).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const grid = Array.from({ length: 9 }, (_, i) => `<line x1="${(i + 1) * px / 10}" y1="0" x2="${(i + 1) * px / 10}" y2="${px}" stroke="#ddd"/><line x1="0" y1="${(i + 1) * px / 10}" x2="${px}" y2="${(i + 1) * px / 10}" stroke="#ddd"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${grid}<polygon points="${pts}" fill="none" stroke="#333" stroke-width="2"/><circle cx="${px / 2}" cy="${px / 2}" r="4" fill="#e05"/><text x="8" y="20" font-family="sans-serif" font-size="13" fill="#666">Home layers: base, then glow / smoke / fireflies on top. Same size, same centre. Grid = 1/10 hex.</text></svg>`;
};

const save = async (svg: string, name: string, png: boolean) => {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  let out: Blob = blob;
  if (png) {
    const img = new Image();
    const u = URL.createObjectURL(blob);
    img.src = u;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    URL.revokeObjectURL(u);
    out = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/png'));
  }
  const url = URL.createObjectURL(out);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const mountSpec = (pane: HTMLElement) => {
  pane.append(h('h2', 'Spec sheet'), h('p', `Every slot, exactly as the uploads are checked. Board art comes in two tiers made automatically from one upload: phones (a hex is ${SKIN_TIERS.lo.hexPx} px, a ground texture ${SKIN_TIERS.lo.texPx} px) and big screens (${SKIN_TIERS.hi.hexPx} px / ${SKIN_TIERS.hi.texPx} px). A hex is ${HEX_UNITS} board units corner to corner; a ground texture spans ${WORLD_UNITS} units (about four hexes). The whole pack should stay under ${BUDGET.warnKB} KB on phones.`, 'lead'));
  const tpl = h('div', undefined, 'templates');
  tpl.append(h('h3', 'Templates'));
  const btn = (label: string, run: () => void) => { const b = h('button', label, 'key'); b.addEventListener('click', run); tpl.append(b); };
  btn('Hex mask, pointy-top (PNG)', () => void save(svgHex(SKIN_TIERS.hi.hexPx, true), 'futasaku-hex-pointy-512.png', true));
  btn('Hex mask, flat-top (PNG)', () => void save(svgHex(SKIN_TIERS.hi.hexPx, false), 'futasaku-hex-flat-512.png', true));
  btn('Hex mask (SVG)', () => void save(svgHex(SKIN_TIERS.hi.hexPx, true), 'futasaku-hex-pointy.svg', false));
  btn('Card outline + safe area (PNG)', () => void save(svgCard(), 'futasaku-card-256x356.png', true));
  btn('Card outline (SVG)', () => void save(svgCard(), 'futasaku-card.svg', false));
  btn('Home layer guide (PNG)', () => void save(svgHome(SKIN_TIERS.hi.hexPx), 'futasaku-home-guide-512.png', true));
  pane.append(tpl);
  const wrap = h('div', undefined, 'table-wrap');
  const table = h('table');
  const head = h('tr');
  for (const c of ['#', 'Slot', 'Size (big screens / phones)', 'Format', 'Transparency', 'Safe area', 'Where it appears', 'Settings']) head.append(h('th', c));
  table.append(head);
  for (const s of SLOTS) {
    const tr = h('tr');
    const fs = defaults(s.fileSettings);
    const size = s.rule.shape === 'svg' ? '24×24 viewBox' : s.rule.tiered ? `${targetSize(s, 'hi', fs).join('×')} / ${targetSize(s, 'lo', fs).join('×')}` : targetSize(s, 'lo', fs).join('×');
    const count = s.count.max === 0 ? 'settings only' : s.count.max === 1 ? '1 file' : `${s.count.min}–${s.count.max} files`;
    const settings = [...s.settings, ...(s.fileSettings ?? [])].map((x) => x.label).join(', ') || '—';
    for (const c of [String(s.n), `${s.title} (${count}${s.optional ? ', optional' : ''})`, size, s.rule.shape === 'svg' ? 'SVG' : 'PNG / JPG / WebP in; WebP out',
      s.rule.alpha === 'required' ? 'Required' : s.rule.alpha === 'forbidden' ? 'None (solid)' : 'Allowed', safeArea(s), s.where, settings]) tr.append(h('td', c));
    table.append(tr);
  }
  wrap.append(table);
  pane.append(wrap);
};
