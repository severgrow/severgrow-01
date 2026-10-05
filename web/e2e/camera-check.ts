// Test copy, lite: the smart camera. 390x844 (phone, thumb layout) on Classic, Big hex, Huge hex,
// Rhombus 7x7 and Tall rectangle, at turn 1 and after about 6 opponent turns: all my tiles on
// screen, the tile size never under DEFAULT_TILE, edge arrows only when tiles are off screen, no
// console errors. Screenshots in docs/screens/camera/.
//   CHANNEL=test npm run web:build && npx tsx web/e2e/camera-check.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';
import { CLASSIC, PRESETS, encodeSetup } from '../src/lab-mode/setup.js';

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4188, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
type Hook = { state: () => State | null; busy: () => boolean; playFor: (a: Action, w: number) => boolean };

const measure = (page: Page) =>
  page.evaluate(() => {
    const svg = document.getElementById('board') as unknown as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const S = 30;
    const flat = document.documentElement.dataset.orient === 'flat';
    const halfLong = Math.sqrt(3) * S * 3 + (Math.sqrt(3) / 2) * S + 2;
    const halfShort = 1.5 * S * 3 + S + 2;
    const def = Math.sqrt(3) * S * Math.min(r.width / (2 * (flat ? halfShort : halfLong)), r.height / (2 * (flat ? halfLong : halfShort)));
    const ctm = svg.getScreenCTM()!;
    const tile = Math.sqrt(3) * S * Math.hypot(ctm.a, ctm.b);
    const inView = (g: Element) => {
      const b = g.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      return b.width > 0 && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    };
    const mine = [...document.querySelectorAll('#board g.tile.you')];
    const theirs = [...document.querySelectorAll('#board g.tile.bot')];
    const offTiles = [...mine, ...theirs].filter((g) => !inView(g)).length;
    return { def, tile, mineAll: mine.length, mineSeen: mine.filter(inView).length, offTiles, arrows: document.querySelectorAll('.cam-arrow').length, whole: !(document.querySelector('.cam-whole') as HTMLElement).hidden };
  });

for (const name of ['Classic', 'Big hex', 'Huge hex', 'Rhombus 7x7', 'Tall rectangle 6x10']) {
  const map = name === 'Classic' ? CLASSIC : PRESETS.find((p) => p.name === name)!;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
  });
  await page.addInitScript(
    (a) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('test:severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'fast' }));
      if (a) localStorage.setItem('test:severgrow-lab-active', a);
    },
    name === 'Classic' ? null : encodeSetup(map),
  );
  await page.goto('http://localhost:4188/');
  await page.waitForTimeout(500);
  await page.click('#menu-new');
  await page.click('#level-grid [data-level="7"]');
  await page.waitForTimeout(1800);
  const slug = name.split(' ').slice(0, 2).join('-').toLowerCase();
  const report = async (when: string) => {
    await page.waitForTimeout(700);
    const m = await measure(page);
    const label = `${name}, ${when}`;
    check(`${label}: all my tiles on screen`, m.mineSeen === m.mineAll, `${m.mineSeen}/${m.mineAll}`);
    check(`${label}: tile never under DEFAULT_TILE`, m.tile >= m.def - 0.6, `tile ${m.tile.toFixed(1)}px, DEFAULT_TILE ${m.def.toFixed(1)}px${m.whole ? ', "Whole map" pill shown' : ''}`);
    check(`${label}: edge arrows only when tiles are off screen`, (m.arrows > 0) === (m.offTiles > 0), `${m.offTiles} tiles off screen, ${m.arrows} arrows`);
    await page.screenshot({ path: `docs/screens/camera/${slug}-${when.replace(/\s+/g, '-')}.png` });
  };
  await report('turn 1');
  // about 6 opponent turns (my moves by a level-5 player, played as if tapped)
  let moves = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    await page.waitForFunction(() => {
      const h = (window as unknown as { __severgrow: Hook }).__severgrow;
      const st = h.state();
      return !h.busy() && (!st || st.actor === 0 || st.phase === 'GAME_OVER');
    }, undefined, { timeout: 60000 });
    const s = await page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
    if (!s || s.phase === 'GAME_OVER' || s.turnNumber >= 13) break;
    await page.evaluate((x) => (window as unknown as { __severgrow: Hook }).__severgrow.playFor(x, 0), chooseLevelAction(viewFor(s, 0), 5, moves++));
  }
  await report('after 6 turns');
  check(`${name}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}
await browser.close();
server.httpServer.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
