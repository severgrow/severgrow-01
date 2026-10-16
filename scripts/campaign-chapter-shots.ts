// CAMPAIGN REVIEW SHOTS — the browser pass that shows a Chapter II and a Chapter III board at the two
// phone sizes the design review uses, so the step up in difficulty can be SEEN, not just measured.
//
//   CHANNEL=futa04 npm run web:build -- --outDir dist-campaign
//   npx tsx scripts/campaign-chapter-shots.ts
//
// It builds into `web/dist-campaign` and previews THAT, so it never touches (or races with) the
// `web/dist` the e2e suites drive. It seeds a campaign progress record — a player who has finished
// Chapters I and II — so levels 11-30 are unlocked, then opens each board and asserts the app is
// rendering that level's OWN terrain (its rocks and gold), not just its seed.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { CAMPAIGN_LEVELS } from '../src/campaign/index.js';
import { openMenuEntry } from '../web/e2e/helpers/menu-nav.js';

const PORT = Number(process.env.PORT ?? 4291);
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../docs/screens/campaign/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PREFIX = process.env.E2E_STORAGE_PREFIX ?? 'main2:';

const SHOTS = [
  { level: 3, key: 'chapter1-level3-smallmap' },
  { level: 10, key: 'chapter1-level10' },
  { level: 11, key: 'chapter2-level11' },
  { level: 20, key: 'chapter2-level20' },
  { level: 25, key: 'chapter3-level25' },
  { level: 30, key: 'chapter3-level30' },
] as const;

const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
] as const;

const server = await preview({
  configFile: 'web/vite.config.ts',
  // `preview` serves `build.outDir`; set it here so this driver never touches (or is disturbed by)
  // the `web/dist` another worker is building and running e2e against.
  build: { outDir: 'dist-campaign' },
  preview: { port: PORT, strictPort: true },
  logLevel: 'silent',
});
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const errors: string[] = [];
const click = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const stateOf = (page: Page) => page.evaluate(() => (window as any).__severgrow.state() as { seed: number } | null);

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
    page.on('pageerror', (e) => errors.push(`${vp.key}: ${e.message}`));
    await page.addInitScript((prefix: string) => {
      (window as any).__name = (f: unknown) => f;
      window.confirm = () => true;
      localStorage.setItem(`${prefix}severgrow.settings.v1`, JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: true, confirmPolicy: 'never' }));
      // The app's Storage wrapper adds the channel prefix itself, so the raw key carries it.
      const completed = Array.from({ length: 20 }, (_, i) => `c${i < 10 ? 1 : 2}-${String((i % 10) + 1).padStart(2, '0')}`);
      localStorage.setItem(`${prefix}severgrow.campaign.progress.v1`, JSON.stringify({ version: 1, unlocked: 30, completed, best: {} }));
    }, PREFIX);

    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
    await page.locator('#menu').waitFor({ state: 'visible' });
    await openMenuEntry(page, 'menu-campaign');
    await page.locator('#campaign-chapters .campaign-tile').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator('#campaign .campaign-tile').count(), CAMPAIGN_LEVELS.length, 'all 30 tiles');
    assert.equal(await page.locator('#campaign-progress').textContent(), '20 of 30 complete');
    assert.equal(await page.locator('#campaign .campaign-chapter').count(), 3, 'three chapters');
    await page.screenshot({ path: `${OUT}three-chapters-${vp.key}.png` });

    for (const shot of SHOTS) {
      const level = CAMPAIGN_LEVELS.find((l) => l.number === shot.level)!;
      await click(page, `#campaign .campaign-tile[data-level="${level.id}"]`);
      await page.waitForFunction((seed: number) => (window as any).__severgrow.state()?.seed === seed, level.seed, { timeout: 20000 });
      await page.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 20000 });
      const s = await stateOf(page);
      assert.equal(s!.seed, level.seed);
      const rocks = level.config.board!.rock.length;
      // The app must be RENDERING that level's authored terrain, not just opening its seed.
      const terrain = await page.evaluate(() => (window as any).__severgrow.state()?.terrain ?? {});
      const kinds = Object.values(terrain as Record<string, string>);
      assert.equal(kinds.filter((t) => t === 'rock').length, rocks, 'rocks on the board');
      assert.equal(kinds.filter((t) => t === 'rich').length, level.config.board!.gold.length, 'gold on the board');
      console.log(`${vp.key}: opened L${level.number} ${level.name} (AI ${level.botLevel}, ${rocks} rocks, ${level.config.board!.gold.length} gold)`);
      await page.screenshot({ path: `${OUT}${shot.key}-${vp.key}.png` });
      // Back to the list for the next level: a clean reload, then the same doorway.
      await page.reload();
      await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
      await page.locator('#menu').waitFor({ state: 'visible' });
      await openMenuEntry(page, 'menu-campaign');
      await page.locator('#campaign-chapters .campaign-tile').first().waitFor({ state: 'visible' });
    }
    await page.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`screenshots written to ${OUT}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
