// The lesson names in Settings → Tutorial (owner, 2026-11-01: "in tutorial in settings in level 1-9
// give each lesson a short name").
//
// The unit test (web/tests/lesson-names.test.ts) pins the copy and the wiring. This suite proves the
// thing the copy cannot: each name is VISIBLE beside its number, on ONE line, inside the tile's
// existing 56px plate, with no overlap and no horizontal overflow — at 320×568, at 390×844, and at
// 320×568 with Large text (the sheet grows text, the tile must still hold it).
//
// Run it on its own:
//   npx tsx web/e2e/tutorial-names.ts
// It builds its own CHANNEL=futa04 copy into web/dist-tutorial-names (ignored), so it never fights a
// running preview or another suite, and it needs no prior `web:build`.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { CHROME } from './helpers/local-duel.js';
import { serveStaticDist } from './helpers/preview-port.js';
import { seedSeen, seedSettings } from './helpers/settings-seed.js';
import { LESSON } from '../../src/strings.js';

const DIST = 'dist-tutorial-names';
const SHOTS = process.env.SHOTS ?? '/tmp/sg-lessons-shots';
const DUEL_API = process.env.VITE_DUEL_API_URL ?? 'http://127.0.0.1:9/duel';

const CASES = [
  { key: '320x568', width: 320, height: 568, largeText: false },
  { key: '390x844', width: 390, height: 844, largeText: false },
  // The same narrow phone with the accessibility setting on: the name must still hold its line.
  { key: '320x568-large-text', width: 320, height: 568, largeText: true },
] as const;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---- build the product channel into its own folder ----
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts', '--outDir', DIST], {
    env: { ...process.env, CHANNEL: 'futa04', VITE_DUEL_API_URL: DUEL_API },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});

mkdirSync(SHOTS, { recursive: true });
const { server, origin } = await serveStaticDist(new URL(`../../web/${DIST}/`, import.meta.url).pathname);
const browser = await chromium.launch({ executablePath: CHROME });

type Rect = { x: number; y: number; w: number; h: number; bottom: number; right: number };
const overlap = (a: Rect, b: Rect): boolean => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;

try {
  for (const testCase of CASES) {
    const context = await browser.newContext({
      viewport: { width: testCase.width, height: testCase.height },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    // `npx tsx` wraps functions with a `__name` helper that only exists in Node.
    await page.addInitScript(() => {
      // @ts-expect-error test shim
      window.__name = (f: unknown) => f;
    });
    await seedSeen(page);
    await seedSettings(page, { largeText: testCase.largeText, sound: false, music: false });
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#menu:not([hidden])', { timeout: 40_000 });

    // Settings (its click is wired after the first async mount, so retry the race, as settings-shots does).
    let opened = false;
    for (let i = 0; i < 20 && !opened; i++) {
      await page.click('#menu-settings', { force: true }).catch(() => undefined);
      opened = await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 700 }).then(() => true).catch(() => false);
    }
    if (!opened) throw new Error(`${testCase.key}: Settings did not open`);

    // The Tutorial row may be below the fold; Playwright scrolls the sheet's scroller for the click.
    await page.locator('#settings-tutorial').scrollIntoViewIfNeeded();
    await page.click('#settings-tutorial');
    await page.waitForSelector('#sheet-tutorial:not([hidden])', { timeout: 5000 });
    await page.waitForTimeout(250);

    const measured = await page.evaluate(() => {
      const rect = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
      };
      const lines = (el: Element): number => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      };
      const panel = document.getElementById('sheet-tutorial')!;
      const tiles = [...document.querySelectorAll<HTMLElement>('#tutorial-levels .campaign-tile')];
      return {
        docWidth: document.documentElement.scrollWidth,
        viewport: { w: innerWidth, h: innerHeight },
        sheet: rect(panel),
        sheetScroll: { h: panel.scrollHeight, client: panel.clientHeight },
        tiles: tiles.map((tile) => {
          const name = tile.querySelector<HTMLElement>('.ct-name');
          const num = tile.querySelector<HTMLElement>('.ct-num');
          return {
            id: tile.dataset.level ?? '',
            text: name?.textContent ?? null,
            aria: tile.getAttribute('aria-label') ?? '',
            tile: rect(tile),
            name: name ? rect(name) : null,
            num: num ? rect(num) : null,
            nameLines: name ? lines(name) : 0,
            nameOverflow: name ? name.scrollWidth - name.clientWidth : 0,
            tileOverflow: tile.scrollWidth - tile.clientWidth,
            nameFont: name ? getComputedStyle(name).fontSize : '',
            tileHeight: tile.getBoundingClientRect().height,
          };
        }),
      };
    });

    const label = testCase.key;
    check(`${label}: the sheet is on screen`, measured.sheet.y >= 0 && measured.sheet.bottom <= measured.viewport.h + 1);
    check(`${label}: no horizontal page overflow`, measured.docWidth <= measured.viewport.w, `${measured.docWidth} > ${measured.viewport.w}`);
    check(`${label}: nine lesson tiles, no level 10`, measured.tiles.length === 9 && !measured.tiles.some((t) => t.id.endsWith('c1-10')), `${measured.tiles.length} tiles`);

    for (const tile of measured.tiles) {
      const number = Number(tile.id.slice(-2));
      const expected = LESSON.names[number];
      const where = `${label} level ${number}`;
      check(`${where}: shows "${expected}"`, expected !== undefined && tile.text === expected, String(tile.text));
      check(`${where}: spoken label carries the name`, !!expected && tile.aria.includes(expected), tile.aria);
      check(`${where}: name visible beside the number`, !!tile.name && tile.name.h > 0 && !!tile.num && tile.num.h > 0);
      check(`${where}: the plate keeps a 44px target`, tile.tileHeight >= 44, `${tile.tileHeight.toFixed(1)}px`);
      check(`${where}: the plate does not grow past 56px`, tile.tileHeight <= 57, `${tile.tileHeight.toFixed(1)}px`);
      check(`${where}: the name stays on one line`, tile.nameLines === 1, `${tile.nameLines} line(s) at ${tile.nameFont}`);
      check(`${where}: no text overflows the plate`, tile.tileOverflow <= 1 && tile.nameOverflow <= 1, `tile ${tile.tileOverflow}, name ${tile.nameOverflow}`);
      check(`${where}: the name sits inside the plate`, !!tile.name && !!tile.num
        && tile.name.x >= tile.tile.x - 0.5 && tile.name.right <= tile.tile.right + 0.5
        && tile.name.y >= tile.tile.y - 0.5 && tile.name.bottom <= tile.tile.bottom + 0.5);
      check(`${where}: the name sits under the number`, !!tile.name && !!tile.num && tile.name.y >= tile.num.bottom - 0.5);
    }

    // Nothing overlaps anything else: name against its own number, and every plate against every other.
    for (let i = 0; i < measured.tiles.length; i++) {
      const a = measured.tiles[i]!;
      if (a.name && a.num) check(`${label} level ${a.id}: name and number do not overlap`, !overlap(a.name, a.num));
      for (let j = i + 1; j < measured.tiles.length; j++) {
        const b = measured.tiles[j]!;
        check(`${label}: ${a.id} and ${b.id} do not overlap`, !overlap(a.tile, b.tile));
      }
    }

    const shot = `${SHOTS}/tutorial-names-${label}.png`;
    await page.locator('#sheet-tutorial').screenshot({ path: shot, animations: 'disabled' });
    console.log(`   shot: ${shot}`);

    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${failed === 0 ? 'tutorial names OK' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
