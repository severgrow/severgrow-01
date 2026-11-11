/**
 * THE ART LAB, walked as a designer would (futasaku.com/art): it opens with today's art inside the
 * real game at phone size; an upload is checked (a good texture lands, a bad file shows its error in
 * its slot, a hard seam is flagged); the board shows it; the animations play; the real hand plays a
 * card; Cards / Planet / Spec sheet open; the pack exports, reopens, and survives a reload.
 *
 *   node --import tsx web/e2e/art-lab.ts [screenshot-dir]     (PW_ENGINE=webkit for the iPhone engine)
 *
 * Builds the live game's channel with the lab (into web/dist) when that build is not there.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import type { Page } from 'playwright-core';

const shots = process.argv[2] ?? '/tmp/futasaku-art-lab';
mkdirSync(shots, { recursive: true });
const dist = resolve('web/dist');
if (!existsSync(join(dist, 'art/index.html')) || !readFileSync(join(dist, 'index.html'), 'utf8').includes(' v075')) {
  execFileSync('npm', ['run', 'web:build'], { stdio: 'inherit', env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: 'http://127.0.0.1:9', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key' } });
}
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let file = join(dist, decodeURIComponent((req.url ?? '/').split('?')[0]!));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const engine = process.env.PW_ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] } : {});
let checks = 0;
const check = (ok: unknown, what: string) => { assert.ok(ok, what); checks++; };

/** Pictures made in the browser (no files in the repo): a seamless texture, a hard seam, a too-small one. */
const picture = async (page: Page, kind: 'seamless' | 'seam' | 'small'): Promise<Buffer> => Buffer.from(await page.evaluate((k) => {
  const size = k === 'small' ? 100 : 1024;
  const c = document.createElement('canvas'); c.width = size; c.height = k === 'small' ? 80 : size;
  const g = c.getContext('2d')!;
  for (let x = 0; x < size; x += 4) for (let y = 0; y < size; y += 4) {
    const v = k === 'seam' ? x / size : 0.5 + 0.25 * Math.sin((2 * Math.PI * x) / 256) + 0.25 * Math.cos((2 * Math.PI * y) / 128);
    g.fillStyle = `rgb(${Math.round(110 + 90 * v)},${Math.round(90 + 60 * v)},${Math.round(60 + 30 * v)})`;
    g.fillRect(x, y, 4, 4);
  }
  return c.toDataURL('image/png').split(',')[1]!;
}, kind), 'base64');

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${origin}/art/#seed=4821&move=12`);
  await page.waitForSelector('#slot-ground', { timeout: 60_000 });
  const frame = async () => page.frames().find((f) => f.url().includes('artlab=1'))!;
  await page.waitForFunction(() => {
    const f = [...document.querySelectorAll('iframe')][0]?.contentDocument;
    return !!f?.querySelector('#board.skin-board image') && !!f.getElementById('board-game');
  }, undefined, { timeout: 60_000 });
  check((await page.locator('#slot-ground .chip').innerText()) === "Today's art", "starts with today's ground");
  check((await page.locator('.checklist .chip.missing').innerText()).startsWith('0 '), 'no required slot is missing at the start');
  check((await page.locator('.position').innerText()).includes('Seed 4821 · move 12'), 'opens the shared position (seed 4821, move 12)');
  check(await (await frame()).evaluate(() => getComputedStyle(document.getElementById('board-game')!).opacity === '0'), "the game's own board is hidden under the skinned one");
  // every player tile wears its painted art, even when the art arrived after the tile was drawn
  await page.waitForFunction(() => {
    const d = [...document.querySelectorAll('iframe')][0]?.contentDocument;
    const tiles = [...(d?.querySelectorAll('#board .skin-tile:not(.root)') ?? [])];
    return tiles.length > 0 && tiles.every((t) => t.querySelector('.skin-tile-art'));
  }, undefined, { timeout: 20_000 });
  check(true, "today's painted tiles are on every player tile");
  await page.screenshot({ path: `${shots}/1-board-today.png` });

  // a good, seamless ground
  await page.locator('#slot-ground input[type=file]').setInputFiles({ name: 'sand.png', mimeType: 'image/png', buffer: await picture(page, 'seamless') });
  await page.waitForFunction(() => document.querySelector('#slot-ground')?.getAttribute('data-status') === 'done', undefined, { timeout: 30_000 });
  check(!(await page.locator('#slot-ground .error').count()), 'a good texture has no error');
  check((await page.locator('#slot-ground .warn').innerText()).includes('Best: 2048×2048'), 'a 1024 texture is accepted with the big-screen note');
  // a too-small rock: the error stays in its slot, nothing else breaks
  await page.locator('#slot-rock input[type=file]').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: await picture(page, 'small') });
  await page.waitForSelector('#slot-rock .error', { timeout: 15_000 });
  check((await page.locator('#slot-rock .error').first().innerText()).includes('This must be'), 'a bad file says what is wrong in plain English');
  check((await page.locator('#slot-rock').getAttribute('data-status')) === 'current', "a refused file keeps today's rock");
  // a texture with a hard seam is flagged
  await page.locator('#slot-p2-base input[type=file]').setInputFiles({ name: 'seam.png', mimeType: 'image/png', buffer: await picture(page, 'seam') });
  await page.waitForSelector('#slot-p2-base .warn', { timeout: 15_000 });
  check((await page.locator('#slot-p2-base').innerText()).includes('Hard edges where it repeats'), 'the seam check flags hard edges');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/2-board-uploads.png` });

  // animations on the position, and the real hand playing a card
  for (const name of ['Grow', 'Bomb', 'Cut']) { await page.getByRole('button', { name, exact: true }).click(); await page.waitForTimeout(900); }
  const before = await (await frame()).evaluate(() => JSON.stringify((window as never as { __severgrow: { state(): unknown } }).__severgrow.state()));
  await page.getByRole('button', { name: 'Card play', exact: true }).click();
  await page.waitForTimeout(1500);
  const after = await (await frame()).evaluate(() => JSON.stringify((window as never as { __severgrow: { state(): unknown } }).__severgrow.state()));
  check(before !== after, 'Card play moves the real game (deal, play or throw)');
  await page.screenshot({ path: `${shots}/3-cards.png` });

  await page.getByRole('tab', { name: 'Planet' }).click();
  await page.waitForTimeout(1500);
  check(await page.locator('.planet-canvas').isVisible(), 'the planet tab shows the planet');
  await page.screenshot({ path: `${shots}/4-planet.png` });
  await page.getByRole('tab', { name: 'Spec sheet' }).click();
  check((await page.locator('#pane-spec tr').count()) > 30, 'the spec sheet lists every slot');
  await page.screenshot({ path: `${shots}/5-spec.png` });

  // export → import round trip
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export art pack' }).click();
  const zipPath = await (await dl).path();
  check(!!zipPath && statSync(zipPath).size > 100_000, 'the pack downloads');
  const zip = readFileSync(zipPath!);
  for (const name of ['skin.json', 'manifest.json', 'README.md', 'pack.json', 'lo/textures/empty_ground_01', 'hi/masks/flat/coverage_09.png', 'cards/moss']) check(zip.includes(Buffer.from(name)), `the pack has ${name}`);
  await page.locator('#import').setInputFiles({ name: 'pack.zip', mimeType: 'application/zip', buffer: zip });
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent?.startsWith('Opened'), undefined, { timeout: 15_000 });
  check((await page.locator('#slot-ground').getAttribute('data-status')) === 'done', 'the reopened pack has the uploaded ground');
  // the reopened pack drawn by the game's own SkinBoardView: every file it asked for was there
  await page.getByRole('tab', { name: 'Board' }).click();
  await page.waitForTimeout(2500);
  const missing = await page.evaluate(() => {
    const v = (window as never as { __artLab: { overlay: { view: { assets: { bad: Set<string>; tier: string | null } } | null } } }).__artLab.overlay.view;
    return v ? { bad: [...v.assets.bad], tier: v.assets.tier } : null;
  });
  check(missing && missing.tier && missing.bad.length === 0, `the exported pack draws a game with no missing files (${JSON.stringify(missing)})`);

  // everything stays on the device: a reload keeps the work
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForSelector('#slot-ground[data-status="done"]', { timeout: 60_000 });
  check(true, 'a reload keeps the uploads');

  // phones first: the lab itself on a phone
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: engine === chromium, hasTouch: true });
  await phone.goto(`${origin}/art/`);
  await phone.waitForSelector('#slot-ground', { timeout: 60_000 });
  await phone.waitForTimeout(4000);
  check(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll on a phone');
  await phone.screenshot({ path: `${shots}/6-lab-on-phone.png`, fullPage: false });
  check(errors.length === 0, `no page errors: ${errors.join(' | ')}`);
  console.log(`art-lab: ${checks} checks passed (${process.env.PW_ENGINE ?? 'chromium'}); screenshots: ${shots}`);
} finally {
  await browser.close();
  server.close();
}
