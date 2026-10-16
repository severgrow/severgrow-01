// Verifies the SETTINGS screen on the LIVE site: that every label actually renders (the labels were
// moved from hardcoded HTML into data-copy string bindings, so a binding nothing fills would leave
// BLANK labels - which looks fine in code and broken on screen) and that the accessible controls
// stayed visible.
//
//   npx tsx scripts/live-settings-check.ts
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));

await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => { const el = document.getElementById('menu-play'); return !!el && !el.hidden; }, undefined, { timeout: 20000 });
await page.evaluate(() => (document.getElementById('menu-settings') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(1200);

/** Every row in the settings sheet: its label text (or BLANK), its setting name, and visibility. */
const rows = await page.evaluate(() => {
  const sheet = document.getElementById('sheet-settings');
  if (!sheet || sheet.hidden) return null;
  return [...sheet.querySelectorAll('input[data-setting]')].map((input) => {
    const el = input as HTMLInputElement;
    const label = el.closest('label');
    const span = label?.querySelector('span');
    const box = label ? label.getBoundingClientRect() : null;
    return {
      setting: el.dataset.setting ?? '?',
      text: (span?.textContent ?? '').trim(),
      // A label inside a collapsed <details> has no layout box - reachable, just tucked away.
      visible: !!box && box.height > 0,
    };
  });
});

if (rows === null) {
  console.log('  COULD NOT OPEN SETTINGS');
  console.log('  page errors:', errors.length ? errors.slice(0, 3) : 'none');
  await browser.close();
  process.exit(1);
}

const blank = rows.filter((r) => r.text.length === 0);
const visible = rows.filter((r) => r.visible);
const tucked = rows.filter((r) => !r.visible);

console.log(`\nsettings on live (${BASE})  — ${rows.length} controls\n`);
for (const r of rows) console.log(`  ${r.visible ? 'shown ' : 'tucked'}  ${r.setting.padEnd(16)} "${r.text}"`);
console.log(`\n  visible: ${visible.length}   tucked behind a group: ${tucked.length}`);
console.log(`  BLANK labels (a binding nothing filled): ${blank.length}${blank.length ? ' -> ' + blank.map((b) => b.setting).join(', ') : ''}`);

// The owner's constraint: accessibility must stay VISIBLE, not buried.
const mustBeVisible = ['reduceMotion', 'largeText', 'sound', 'music', 'vibration'];
const hidden = mustBeVisible.filter((s) => !rows.find((r) => r.setting === s)?.visible);
console.log(`  accessibility + basics still visible: ${hidden.length === 0 ? 'YES' : 'NO -> ' + hidden.join(', ')}`);
console.log(`  page errors: ${errors.length}`);
await page.screenshot({ path: '/tmp/live-settings.png' });
await browser.close();
process.exit(blank.length === 0 && hidden.length === 0 ? 0 : 1);
