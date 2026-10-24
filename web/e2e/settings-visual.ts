// The essentials sheet stays legible over a lit menu, including Large text and landscape phones.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { seedSeen, seedSettings } from './helpers/settings-seed.js';

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: 'http://127.0.0.1:9',
      VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-visual-check' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Build failed: ${code}`)));
});
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 4258, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
if (process.env.SHOTS) mkdirSync(process.env.SHOTS, { recursive: true });
try {
  for (const [width, height, largeText] of [[320, 568, false], [320, 568, true], [360, 640, false], [844, 390, false], [844, 390, true], [1280, 800, false]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900 });
    await seedSeen(page); await seedSettings(page, { largeText, sound: false, music: false });
    await page.goto('http://127.0.0.1:4258/');
    await page.locator('#menu-settings').click();
    await page.waitForTimeout(450);
    const geometry = await page.evaluate(() => {
      const panel = document.getElementById('sheet-settings')!;
      const bounds = panel.getBoundingClientRect();
      const controls = [...panel.querySelectorAll<HTMLElement>('button,input')].filter((e) => e.offsetParent && !e.closest('[hidden]'));
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, panel: bounds.toJSON(),
        alpha: Number(getComputedStyle(panel).backgroundColor.match(/[\d.]+/g)?.[3] ?? 1),
        controls: controls.map((e) => ({ id: e.id || e.getAttribute('data-setting') || e.textContent,
          box: e.getBoundingClientRect().toJSON() })),
        hand: document.getElementById('hand-side-seg')!.getBoundingClientRect().toJSON() };
    });
    assert(geometry.scrollWidth <= width, 'no horizontal page overflow');
    assert(geometry.alpha >= 0.85, 'lit keys behind Settings do not wash through the controls');
    assert(geometry.panel.top >= 0 && geometry.panel.bottom <= height, 'the sheet fits the viewport');
    assert(geometry.hand.bottom <= geometry.panel.bottom - 4, `Hand side is visible without discovering a hidden scroll area: ${JSON.stringify(geometry)}`);
    for (const { id, box } of geometry.controls) {
      assert(box.left >= geometry.panel.left && box.right <= geometry.panel.right, `${id}: fits sheet width`);
      assert(box.height >= 44 || id === 'sound' || id === 'vibration' || id === 'reduceMotion' || id === 'largeText', `${id}: 44px button target`);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/settings-${width}x${height}${largeText ? '-large' : ''}.png` });
    // When extra account controls make the sheet scroll, its title and close key must stay above rows.
    await page.evaluate(() => { document.getElementById('sheet-settings')!.scrollTop = 1000; });
    const sticky = await page.evaluate(() => {
      const title = document.querySelector('#sheet-settings .sheet-head')!;
      return { title: title.getBoundingClientRect().toJSON(), panel: document.getElementById('sheet-settings')!.getBoundingClientRect().toJSON(), z: getComputedStyle(title).zIndex };
    });
    assert(sticky.title.top >= sticky.panel.top && Number(sticky.z) > 0, 'scrolling controls cannot paint over the sticky title');
    console.log(`PASS Settings ${width}x${height}${largeText ? ' Large text' : ''}: readable glass, visible Hand side, stable title`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
