// "Before" screenshots for UI polish pass 3, taken from the version before the pass.
//   npx tsx web/e2e/polish3-before.ts --dir=docs/screens/polish3
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { fruitNotYet, fruitOnTop, lineChoice } from './polish3-positions.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/polish3';
mkdirSync(dir, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4179/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };
const errors: string[] = [];
const VPS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } } as const;

const open = async (vp: { width: number; height: number }, state: unknown) => {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved]) => {
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', saved as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true }));
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip' }), JSON.stringify({ state, coach: doneCoach })],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.mouse.move(1, 1);
  await page.waitForFunction(() => document.querySelector('.world-fill') !== null, undefined, { timeout: 30000 }).catch(() => errors.push('no world layer'));
  await page.waitForTimeout(500);
  return page;
};
const tapHex = async (page: Page, key: string) => {
  const b = (await page.locator(`.hex-cell[data-key="${key}"]`).boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
};
const shot = (page: Page, name: string) => page.screenshot({ path: `${dir}/before-${name}.jpg`, quality: 80 });

for (const [vpName, vp] of Object.entries(VPS)) {
  const top = fruitOnTop();
  let page = await open(vp, top.state);
  await shot(page, `${vpName}-top-rank-and-action-row`);
  await tapHex(page, top.target);
  await shot(page, `${vpName}-tile-card-opponent-9`);
  await page.close();

  const ny = fruitNotYet();
  page = await open(vp, ny.state);
  await tapHex(page, ny.target);
  await shot(page, `${vpName}-tile-card-no-fruit-yet`);
  await page.close();

  const line = lineChoice();
  page = await open(vp, line.state);
  const kind = page.locator('#moves [data-kind="line-3"]');
  if (await kind.count()) {
    await kind.click();
    await page.locator('#hand .card.playable').first().click();
    await page.waitForTimeout(300);
    const t = await page.locator('path.target').first().getAttribute('data-key');
    if (t) await tapHex(page, t);
  } else errors.push('no line-3 button');
  await shot(page, `${vpName}-line-other-way`);
  await page.close();
}
await browser.close();
await server.close();
console.log(errors.length ? `errors: ${errors.join(' | ')}` : `saved to ${dir}`);
