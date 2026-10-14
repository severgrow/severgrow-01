// Phase 4 — menu/lobby smoke (no API URL → Play online stays hidden; offline path intact).
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/online-lobby-check.ts
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { ONLINE } from '../../src/strings.js';

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
  // The owner removed the menu tagline on 2026-10-14 (it read as clutter under the wordmark). The
  // words are deliberately KEPT and the element is rebuilt on demand, so this asserts every half of
  // that decision: the string is still available, the menu carries NO tagline element (removed, not
  // a hidden placeholder), nothing sits in its old slot, and its removal left no empty gap. (This
  // replaced the old `check('tagline is GROW · CONNECT · CONQUER', ...)` which only asserted the
  // text was present.)
  check('the tagline string is still available to re-enable', ONLINE.tagline === 'GROW · CONNECT · CONQUER', ONLINE.tagline);
  check('the menu has no tagline element (removed, not hidden)', (await page.locator('#menu .tagline, #menu-tagline').count()) === 0);
  const menuColumn = await page.evaluate(() => {
    const inner = document.querySelector('#menu .menu-inner')!;
    const kids = [...inner.children];
    const between = kids
      .slice(
        kids.findIndex((k) => k.classList.contains('title')) + 1,
        kids.findIndex((k) => k.classList.contains('menu-buttons')),
      )
      .map((k) => k.id || k.className);
    const title = document.querySelector('#menu .title')!;
    const buttons = document.querySelector('#menu .menu-buttons')!;
    return {
      between,
      gap: Math.round(buttons.getBoundingClientRect().top - title.getBoundingClientRect().bottom),
      columnGap: Math.round(Number.parseFloat(getComputedStyle(inner).rowGap)),
    };
  });
  check('nothing sits between the wordmark and the buttons (no tagline, no empty row)', menuColumn.between.length === 0, JSON.stringify(menuColumn.between));
  check('no empty gap where the tagline was (wordmark→buttons = the column gap)', menuColumn.gap === menuColumn.columnGap, `gap ${menuColumn.gap}px vs column ${menuColumn.columnGap}px`);
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
