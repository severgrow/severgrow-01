import { chromium } from 'playwright-core';
import { servePreview, closePreview } from './helpers/preview-port.js';
import { positionSave } from './position.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { decodePng } from './helpers/png.js';
import { allCoords, coordKey, newGame } from '../../src/engine/index.js';
import type { Player, State, Tile } from '../../src/engine/index.js';

const served = await servePreview(0, { build: { outDir: 'dist' }, logLevel: 'silent' });
const base = newGame(4242);
const board: Record<string, Tile | null> = { ...base.board };
for (const c of allCoords(3)) {
  const key = coordKey(c);
  if (board[key]?.root) continue;
  board[key] = { owner: (c.q < 0 ? 0 : 1) as Player, strength: 1 };
}
const state: State = { ...base, phase: 'ACT', actor: 0, turnPlayer: 0, board };
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await page.addInitScript((save) => {
  localStorage.setItem('main2:severgrow.save.v7', save);
  localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ coach: false, sound: false, music: false, reduceMotion: true, speed: 'skip' }));
  localStorage.setItem('main2:severgrow.duel.identity.v1', JSON.stringify({ token: 'e', playerId: '1', displayName: 'RYK', kind: 'account' }));
  localStorage.setItem('main2:severgrow.board-skin.v1', JSON.stringify({ mine: 'forest', theirs: 'ash', background: 'slate', tileMine: 'nero', tileTheirs: 'nero' }));
}, positionSave({ state }));
await page.goto(served.url, { timeout: 120000, waitUntil: 'domcontentloaded' });
await resumeSavedGame(page);
await page.waitForFunction(() => document.querySelectorAll('#board .tile').length > 20, undefined, { timeout: 60000 });
await page.waitForTimeout(900);
const seams = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#board .l-tiles .tile')].map((c) => {
    const [q, r] = (c.getAttribute('data-key') ?? '0,0').split(',').map(Number) as [number, number];
    const hex = c.querySelector('path.fa-tile-base');
    const b = (hex ?? c).getBoundingClientRect();
    return { q, r, x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
  });
  const at = new Map(cells.map((c) => [`${c.q},${c.r}`, c]));
  const out: { x: number; y: number; w: number }[] = [];
  for (const c of cells.filter((c) => c.w > 10)) for (const [dq, dr] of [[1, 0], [0, 1]] as const) {
    const n = at.get(`${c.q + dq},${c.r + dr}`);
    if (n) out.push({ x: (c.x + n.x) / 2, y: (c.y + n.y) / 2, w: c.w });
  }
  return { seams: out, sample: cells.slice(0, 3) };
});
console.log('tile size css', seams.sample[0]?.w?.toFixed(1));
const png = await page.screenshot();
const bmp = decodePng(png);
console.log('png', bmp.width, bmp.height);
const scored = seams.seams.map((s) => {
  const cx = Math.round(s.x * 3), cy = Math.round(s.y * 3);
  let worst = 0;
  for (const d of [-1, 0, 1]) { const p = bmp.rgba(cx + d, cy); worst = Math.max(worst, 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]); }
  return { ...s, worst, cx, cy };
}).sort((a, b) => b.worst - a.worst);
console.log('worst seams', scored.slice(0, 4).map((s) => `${s.worst.toFixed(0)} @${s.cx},${s.cy}`).join(' | '));
for (const s of scored.slice(0, 2)) {
  let lines: string[] = [];
  for (let dy = -9; dy <= 9; dy += 3) {
    let line = '';
    for (let dx = -9; dx <= 9; dx += 3) {
      const p = bmp.rgba(s.cx + dx, s.cy + dy);
      const l = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
      line += l > 180 ? '.' : l > 90 ? '+' : '#';
    }
    lines.push(line);
  }
  console.log(`seam ${s.cx},${s.cy}`, lines.join(' '));
}
await browser.close();
await closePreview(served.server);
