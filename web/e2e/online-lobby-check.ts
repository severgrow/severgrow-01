// Phase 4 — menu/lobby smoke (no API URL → Play online stays hidden; offline path intact).
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/online-lobby-check.ts
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const server = await preview({
  configFile: 'web/vite.config.ts',
  preview: { port: 4201, strictPort: true },
  logLevel: 'silent',
});
const browser = await chromium.launch(
  process.env.PW_CHROMIUM
    ? { executablePath: process.env.PW_CHROMIUM }
    : {
        executablePath:
          '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      },
);

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      'main2:severgrow.settings.v1',
      JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true }),
    );
  });
  await page.goto('http://localhost:4201/');
  await page.waitForSelector('#menu:not([hidden])');
  const tagline = await page.locator('#menu-tagline').textContent();
  check('tagline is GROW · CONNECT · CONQUER', (tagline ?? '').includes('GROW') && (tagline ?? '').includes('CONQUER'));
  check('title is FUTASAKU', ((await page.locator('#menu .title').textContent()) ?? '').toUpperCase().includes('FUTASAKU'));
  check('Play online hidden without API URL', await page.locator('#menu-online').isHidden());
  check('Play offline still present', await page.locator('#menu-new').isVisible());
  const offlineLabel = ((await page.locator('#menu-new').textContent()) ?? '').toLowerCase();
  check('Play offline label', offlineLabel.includes('offline') || offlineLabel.includes('new'));
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 8000 });
  check('Play offline opens difficulty', true);
  await page.click('#levels-back');
  await page.waitForSelector('#menu:not([hidden])');
  check('back to menu', true);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
if (failed) {
  console.error(`${failed} lobby checks failed`);
  process.exit(1);
}
console.log('online lobby checks passed');
