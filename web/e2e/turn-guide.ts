// THE TURN GUIDE (owner, 2026-11-11): "?" lives in the context key for everyone, every turn. Pressed, it
// lights the rest of THAT turn one step at a time with the levels' glow — no window, no words — and
// switches itself off when the turn ends. When the key holds a move, "?" waits in the key's small menu.
// The bulb stays Match Intel.
// Run: node --import tsx web/e2e/turn-guide.ts   (serves web/dist: CHANNEL=futa04 build)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const out = process.env.SHOTS ?? '/tmp/turn-guide';
mkdirSync(out, { recursive: true });
const served = await servePreview(4192, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
  await page.goto(`${served.url}?seed=219682080`);
  await page.waitForFunction(() => { const h = (window as any).__severgrow; return !!h?.state() && h.state().actor === 0 && !h.busy(); }, undefined, { timeout: 30000 });
  await page.waitForFunction(() => { const r = document.getElementById('starter-lottery'); return !r || r.hidden || !r.getClientRects().length; }, undefined, { timeout: 30000 });
  await page.waitForTimeout(600);
  const ctx = page.locator('#smart-context');
  const lit = () => page.evaluate(() => {
    const f = document.getElementById('tutorial-focus');
    return { on: f?.dataset.on === '1', shapes: f ? f.querySelectorAll('.focus-glow').length : 0,
      window: (() => { const g = document.getElementById('futasaku-glass'); return !!g && !g.hidden && g.getClientRects().length > 0; })() };
  });

  // 1. Draw: the key itself is "?" (nothing else to do); nothing lit until it is pressed.
  await page.waitForFunction(() => document.getElementById('smart-context')?.dataset.action === 'guide', undefined, { timeout: 8000 });
  assert.equal(await ctx.getAttribute('aria-label'), 'How to play');
  assert.equal(await ctx.getAttribute('aria-pressed'), 'false');
  assert.equal((await lit()).on, false, 'nothing lit before "?"');
  await ctx.click();
  await page.waitForFunction(() => document.getElementById('smart-context')?.getAttribute('aria-pressed') === 'true', undefined, { timeout: 5000 });
  await page.waitForTimeout(400);
  const draw = await lit();
  console.log('draw', JSON.stringify(draw));
  assert(draw.on && draw.shapes >= 1, 'the piles are lit');
  assert.equal(draw.window, false, 'no window, no words');
  await page.screenshot({ path: `${out}/1-draw.png` });

  // 2. Draw → Grow: the light moves to the playable cards.
  await page.locator('#deck').evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT' && !(window as any).__severgrow.busy(), undefined, { timeout: 8000 });
  await page.waitForTimeout(500);
  const grow = await lit();
  const playable = await page.evaluate(() => new Set((window as any).__severgrow.legal().filter((a: any) => a.t === 'Sprout' || a.t === 'PlayFruit').map((a: any) => a.card)).size + ((window as any).__severgrow.legal().some((a: any) => a.t === 'Bloom') ? 1 : 0));
  console.log('grow', JSON.stringify(grow), 'expected shapes', playable);
  assert(grow.on && grow.shapes === playable, `every playable card (and Bloom) is lit (${grow.shapes} vs ${playable})`);
  await page.screenshot({ path: `${out}/2-grow.png` });
  // The key holds a move now (Skip): "?" waits in its small menu, still pressed; the move stays one tap away.
  assert.notEqual(await ctx.getAttribute('data-action'), 'guide', 'the key keeps the real move');
  await ctx.click();
  await page.waitForSelector('#smart-selector:not([hidden])', { timeout: 4000 });
  const menu = await page.evaluate(() => [...document.querySelectorAll('#smart-selector button')].map((b) => `${b.getAttribute('data-action')}|${b.getAttribute('aria-pressed') ?? ''}`));
  console.log('menu', JSON.stringify(menu));
  assert(menu.some((m) => m.startsWith('guide') && m.endsWith('|true')), '"?" is in the small menu, pressed');
  assert(menu.length >= 2, 'the move is in the menu too');
  await page.screenshot({ path: `${out}/2b-menu.png` });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#smart-selector', { state: 'hidden', timeout: 4000 });

  // 3. A card picked: exactly its legal tiles.
  const pick = await page.evaluate(() => { const a = (window as any).__severgrow.legal().find((x: any) => x.t === 'Sprout'); return { card: a.card, tiles: new Set((window as any).__severgrow.legal().filter((x: any) => x.t === 'Sprout' && x.card === a.card).map((x: any) => `${x.coord.q},${x.coord.r}`)).size }; });
  await page.locator(`#hand .card[data-card="${pick.card}"]`).evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(500);
  const tiles = await lit();
  console.log('picked', JSON.stringify(tiles), 'expected', pick.tiles);
  assert(tiles.on && tiles.shapes === pick.tiles, `the picked card's tiles are lit (${tiles.shapes} vs ${pick.tiles})`);
  await page.screenshot({ path: `${out}/3-tiles.png` });

  // 4. The bulb is Match Intel, always.
  const bulbName = await page.locator('#futa04-help-button').getAttribute('aria-label');
  assert.match(bulbName ?? '', /Match Intel/);

  // 5. Grow (through the hook), still on.
  await page.evaluate(async () => { const h = (window as any).__severgrow; const a = h.legal().find((x: any) => x.t === 'Sprout'); h.playFor(a, 0); });
  await page.waitForTimeout(700);

  // 6. The turn ends (Skip, then Throw): the guide switches itself off.
  await page.evaluate(async () => {
    const h = (window as any).__severgrow;
    const end = h.legal().find((x: any) => x.t === 'EndAct'); if (end) h.playFor(end, 0);
  });
  await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'DISCARD' && !(window as any).__severgrow.busy(), undefined, { timeout: 8000 });
  await page.waitForTimeout(500);
  const thr = await lit();
  const throwable = await page.evaluate(() => new Set((window as any).__severgrow.legal().filter((a: any) => a.t === 'Discard').map((a: any) => a.card)).size);
  console.log('throw', JSON.stringify(thr), 'expected', throwable);
  assert(thr.on && thr.shapes === throwable, 'Throw: the cards you may throw are lit');
  await page.evaluate(() => { const h = (window as any).__severgrow; h.playFor(h.legal().find((x: any) => x.t === 'Discard'), 0); });
  await page.waitForFunction(() => (window as any).__severgrow.state().actor === 1, undefined, { timeout: 8000 });
  await page.waitForTimeout(700);
  const after = await lit();
  console.log('their turn', JSON.stringify(after));
  assert.equal(after.on, false, 'the light is off when the turn ends');
  assert.notEqual(await ctx.getAttribute('aria-pressed'), 'true', '"?" is no longer pressed');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS turn guide');
} finally { await browser.close(); await served.server.close(); }
