// Step 10: the social link-preview image (1200x630), drawn in code (SVG, no external requests)
// and rendered once to web/public/og.png, which is committed.
//   npx tsx web/e2e/og-image.ts
import { chromium } from 'playwright-core';
import { GAME_TITLE } from '../../src/strings.js';

const hex = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
const R = 40;
const CX = 940;
const CY = 315;
const W = Math.sqrt(3) * R;
const cells: string[] = [];
for (let q = -3; q <= 3; q++)
  for (let r = -3; r <= 3; r++) {
    if (Math.abs(q + r) > 3) continue;
    const x = CX + W * (q + r / 2);
    const y = CY + 1.5 * R * r;
    const mine = (q + r <= -1 && r >= 0) || (q === -2 && r === 2);
    const theirs = q >= 2 && r <= -1;
    const fill = mine ? '#3f8f4f' : theirs ? '#b8452c' : '#23252b';
    cells.push(`<polygon points="${hex(x, y, R - 3)}" fill="${fill}" stroke="#34373f" stroke-width="2"/>`);
  }
const at = (q: number, r: number) => `${(CX + W * (q + r / 2)).toFixed(1)},${(CY + 1.5 * R * r).toFixed(1)}`;
const html = `<!doctype html><html><body style="margin:0;background:#0d0e11">
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#121318"/>
  ${cells.join('')}
  <g transform="translate(${at(-2, 2)})"><ellipse cx="0" cy="-18" rx="30" ry="24" fill="#5cbf6a"/><rect x="-6" y="-4" width="12" height="26" rx="4" fill="#5b4334"/><circle cx="0" cy="8" r="4" fill="#4df0b4"/></g>
  <g transform="translate(${at(2, -2)})"><path d="M-30,22 L-12,-24 L12,-24 L30,22 Z" fill="#2b2522"/><path d="M0,-34 L12,-24 L0,-15 L-12,-24 Z" fill="#ff5a2a"/></g>
  <text x="90" y="300" font-family="Georgia, 'DejaVu Serif', serif" font-weight="700" font-size="104" fill="#f2efe6">${GAME_TITLE}</text>
  <text x="94" y="366" font-family="'DejaVu Sans', Arial, sans-serif" font-size="28" fill="#b9b6ad">Grow your network.</text>
  <text x="94" y="406" font-family="'DejaVu Sans', Arial, sans-serif" font-size="28" fill="#b9b6ad">Keep it joined to your home.</text>
  <text x="94" y="446" font-family="'DejaVu Sans', Arial, sans-serif" font-size="28" fill="#b9b6ad">Cut your opponent's links.</text>
</svg></body></html>`;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: 'web/public/og.png' });
await browser.close();
console.log('wrote web/public/og.png');
