// Settings sheet shots (2026-10-16): the owner asked for the Settings screen "stripped back to
// what's actually needed". This captures the sheet at the two phone sizes BEFORE and AFTER the
// reorganisation, into docs/screens/settings/, and asserts the layout rule so a shot cannot go
// stale: Reduce motion and Large text are accessibility and must sit OUTSIDE every collapsed group.
//
//   SETTINGS_SHOT_LABEL=before npx tsx web/e2e/settings-shots.ts
//   SETTINGS_SHOT_LABEL=after  npx tsx web/e2e/settings-shots.ts
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/settings-shots.ts
//
// It builds `web/<dist>` for CHANNEL=futa04 and serves it with the tiny static server (no vite
// preview). The duel API URL defaults to LOOPBACK, never the real project: this suite only drives
// the offline menu (the sheet's words and layout do not depend on that URL), and a hard-coded real
// host would make the file a real-capable entry point that server/tests/quota-guard.test.ts flags.
// Pass VITE_DUEL_API_URL to deliberately build against a real host. Labels: before / after /
// after-open (every group expanded).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import { CHROME } from './helpers/local-duel.js';
import { serveStaticDist } from './helpers/preview-port.js';

const OUT = new URL('../../docs/screens/settings/', import.meta.url).pathname;
const LABEL = process.env.SETTINGS_SHOT_LABEL ?? 'settings';
const DIST = process.env.SETTINGS_SHOT_DIST ?? 'dist-settings-shots';
const DUEL_API = process.env.VITE_DUEL_API_URL ?? 'http://127.0.0.1:9/duel';

const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
];

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---- build the product channel ----
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts', '--outDir', DIST], {
    env: { ...process.env, CHANNEL: 'futa04', VITE_DUEL_API_URL: DUEL_API },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});

mkdirSync(OUT, { recursive: true });
const { server: staticServer, origin } = await serveStaticDist(new URL(`../../web/${DIST}/`, import.meta.url).pathname);
const browser: Browser = await chromium.launch({ executablePath: CHROME });

const sheetFor = async (vp: { width: number; height: number }) => {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  // `npx tsx` wraps functions with a `__name` helper that only exists in Node; page.evaluate needs it.
  await page.addInitScript(() => {
    // @ts-expect-error test shim
    window.__name = (f: unknown) => f;
  });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 40_000 });
  // The Settings button's click is wired after the first async mount, so a click fired the moment
  // the menu appears can land before the sheet exists. Retry the click rather than fail a shot on
  // that race (it cost a run on 2026-10-16).
  let opened = false;
  for (let i = 0; i < 20 && !opened; i++) {
    await page.click('#menu-settings', { force: true }).catch(() => undefined);
    opened = await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 700 }).then(() => true).catch(() => false);
  }
  if (!opened) throw new Error('settings sheet did not open');
  await page.waitForTimeout(400);
  return { context, page };
};

const shot = async (page: import('playwright-core').Page, name: string) => {
  await page.screenshot({ path: `${OUT}${name}.png`, animations: 'disabled' });
  console.log(`   ${OUT.split('/').pop()}${name}.png`);
};

try {
  for (const vp of VIEWPORTS) {
    // ---- the sheet as it opens ----
    {
      const { context, page } = await sheetFor(vp);
      // The layout rule this screen must keep, stated so a regression fails here and not by eye.
      const rule = await page.evaluate(() => {
        const inside = (id: string) => !!document.querySelector(`#sheet-settings details [data-setting="${id}"]`);
        const visible = (id: string) => {
          const el = document.querySelector<HTMLElement>(`#sheet-settings [data-setting="${id}"]`);
          return !!el && el.offsetParent !== null;
        };
        return {
          reduceOutside: !inside('reduceMotion') && visible('reduceMotion'),
          largeOutside: !inside('largeText') && visible('largeText'),
          soundOutside: visible('sound') && visible('music') && visible('vibration'),
        };
      });
      check(`${vp.key}: Reduce motion stays visible, outside every group`, rule.reduceOutside);
      check(`${vp.key}: Large text stays visible, outside every group`, rule.largeOutside);
      check(`${vp.key}: Sound, Music and Vibration stay visible`, rule.soundOutside);
      await shot(page, `${LABEL}-${vp.key}`);
      await context.close();
    }

    // ---- every group expanded (the niche controls are still there, just folded) ----
    if (LABEL !== 'before') {
      const { context, page } = await sheetFor(vp);
      await page.evaluate(() => {
        for (const d of document.querySelectorAll<HTMLDetailsElement>('#sheet-settings details')) d.open = true;
        document.querySelector<HTMLElement>('#sheet-settings .sheet-body')!.scrollTop = 0;
      });
      await page.waitForTimeout(300);
      await shot(page, `${LABEL}-open-${vp.key}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  staticServer.close();
}

console.log(`\n${failed === 0 ? 'settings shots OK' : `${failed} FAILED`} — ${LABEL}`);
process.exit(failed === 0 ? 0 : 1);
