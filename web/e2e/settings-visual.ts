// The essentials sheet stays legible over a lit menu, including Large text and landscape phones.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { seedSeen, seedSettings } from './helpers/settings-seed.js';

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    // VITE_ACCOUNTS forces the real Account group on this local build (mount.ts's own test door).
    // The group is what makes the Settings plate taller than a 320x568 screen in production, so the
    // suite must photograph the same sheet the player gets — not a shorter test-only one.
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: 'http://127.0.0.1:9',
      VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-visual-check', VITE_ACCOUNTS: 'on' },
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
    // The account group is the reason the 320px sheet scrolls in production. Google is switched on
    // in the real project; this device remembers that, so no network is needed to paint the group.
    await page.addInitScript(() => { try { localStorage.setItem('futa05:futasaku.auth.google-on.v1', '1'); } catch { /* storage blocked */ } });
    await seedSeen(page); await seedSettings(page, { largeText, sound: false, music: false });
    await page.goto('http://127.0.0.1:4258/');
    await page.locator('#menu-settings').click();
    await page.waitForTimeout(450);
    const geometry = await page.evaluate(() => {
      const panel = document.getElementById('sheet-settings')!;
      const bounds = panel.getBoundingClientRect();
      const controls = [...panel.querySelectorAll<HTMLElement>('button,input')].filter((e) => e.offsetParent && !e.closest('[hidden]'));
      const fade = panel.querySelector<HTMLElement>('.sheet-fade');
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, panel: bounds.toJSON(),
        alpha: Number(getComputedStyle(panel).backgroundColor.match(/[\d.]+/g)?.[3] ?? 1),
        controls: controls.map((e) => ({ id: e.id || e.getAttribute('data-setting') || e.textContent,
          box: e.getBoundingClientRect().toJSON() })),
        hand: document.getElementById('hand-side-seg')!.getBoundingClientRect().toJSON(),
        scroll: { scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, scrollTop: panel.scrollTop },
        scrollState: panel.dataset.scroll ?? '',
        fade: fade ? { opacity: Number(getComputedStyle(fade).opacity), box: fade.getBoundingClientRect().toJSON() } : null,
        account: !!document.getElementById('acct-settings') };
    });
    assert(geometry.scrollWidth <= width, 'no horizontal page overflow');
    assert(geometry.alpha >= 0.85, 'lit keys behind Settings do not wash through the controls');
    assert(geometry.panel.top >= 0 && geometry.panel.bottom <= height, 'the sheet fits the viewport');
    assert(geometry.hand.bottom <= geometry.panel.bottom - 4, `Hand side is visible without discovering a hidden scroll area: ${JSON.stringify(geometry)}`);
    const overflows = geometry.scroll.scrollHeight - geometry.scroll.clientHeight > 2;
    if (width === 320) {
      // THE REAL 320x568 CASE (owner, 2026-10-26): with the Account group on the sheet, content
      // goes past the plate's bottom. The last visible row must never look like the whole row: a
      // fade sits at the edge and the sheet says it has more.
      assert(geometry.account, 'the Account group is on the 320px sheet (the case the sweep caught)');
      assert(overflows, 'the 320px sheet really has more below the fold');
      assert(geometry.scrollState === '1', 'the 320px sheet signals that it continues');
      assert(geometry.fade && geometry.fade.opacity > 0.5, 'a cut row fades into the bottom edge');
      assert(geometry.fade.box.bottom >= geometry.panel.bottom - 25, 'the fade reaches the plate edge');
    } else if (overflows) {
      assert(geometry.scrollState === '1', 'a plate with more below says so');
      assert(geometry.fade && geometry.fade.opacity > 0.5, 'a cut row fades into the bottom edge');
    } else {
      assert(geometry.scrollState === '0' && (!geometry.fade || geometry.fade.opacity < 0.1), 'a sheet that fits shows no false scroll cue');
    }
    for (const { id, box } of geometry.controls) {
      assert(box.left >= geometry.panel.left && box.right <= geometry.panel.right, `${id}: fits sheet width`);
      assert(box.height >= 44 || id === 'sound' || id === 'vibration' || id === 'reduceMotion' || id === 'largeText', `${id}: 44px button target`);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/settings-${width}x${height}${largeText ? '-large' : ''}.png` });
    // When extra account controls make the sheet scroll, its title and close key must stay above rows.
    await page.evaluate(() => { document.getElementById('sheet-settings')!.scrollTop = 1000; });
    await page.waitForTimeout(80); // the scroll event paints the fade on the next frame
    const sticky = await page.evaluate(() => {
      const title = document.querySelector('#sheet-settings .sheet-head')!;
      const panel = document.getElementById('sheet-settings')!;
      return { title: title.getBoundingClientRect().toJSON(), panel: panel.getBoundingClientRect().toJSON(), z: getComputedStyle(title).zIndex,
        scrollState: panel.dataset.scroll ?? '', scrollTop: panel.scrollTop, maxScroll: panel.scrollHeight - panel.clientHeight };
    });
    assert(sticky.title.top >= sticky.panel.top && Number(sticky.z) > 0, 'scrolling controls cannot paint over the sticky title');
    if (sticky.maxScroll > 2) assert(sticky.scrollState === '0', 'at the true end the scroll cue stands down');
    console.log(`PASS Settings ${width}x${height}${largeText ? ' Large text' : ''}: readable glass, visible Hand side, stable title`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
