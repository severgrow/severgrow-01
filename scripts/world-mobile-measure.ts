// Does the world-map screen fit on ONE screen, respect the notch/camera cutout, and put the wordmark
// exactly where the live game puts it - across several phone shapes?
//
//   npx tsx scripts/world-mobile-measure.ts
//
// Why this exists: on the owner's iPhone 15 Pro the last line was cut off and the wordmark sat too
// low. The cause was the safe-area inset being applied TWICE (once by the shared .screen rule, once
// by the world's own column), which pushed the column 59px down and its bottom 59px past the fold,
// where `overflow: hidden` silently cut it.
//
// Two things make this measure something real:
//  - safe-area insets are applied with CDP (Emulation.setSafeAreaInsetsOverride). Without it every
//    env(safe-area-inset-*) reads 0 and the whole exercise is meaningless.
//  - the world read is fulfilled from a captured fixture, because the live API only allows the
//    production origin and a localhost build would otherwise render an empty map.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:8901/';
const fixture = process.env.WORLD_FIXTURE ?? '/tmp/world-fixture.json';

type Device = { name: string; w: number; h: number; top: number; bottom: number; left: number; right: number };

/** Real-ish profiles: two notched iPhones, a home-button phone, a punch-hole Android, and landscape. */
const DEVICES: Device[] = [
  { name: 'iPhone 15 Pro', w: 393, h: 852, top: 59, bottom: 34, left: 0, right: 0 },
  { name: 'iPhone 15 Pro (landscape)', w: 852, h: 393, top: 0, bottom: 21, left: 59, right: 59 },
  { name: 'iPhone SE (no notch)', w: 375, h: 667, top: 20, bottom: 0, left: 0, right: 0 },
  { name: 'Pixel 8 (punch hole)', w: 412, h: 915, top: 24, bottom: 24, left: 0, right: 0 },
];

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const worldJson = readFileSync(fixture, 'utf8');
let failures = 0;

for (const d of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  let insetsApplied = false;
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send(
      'Emulation.setSafeAreaInsetsOverride' as never,
      { insets: { top: d.top, bottom: d.bottom, left: d.left, right: d.right } } as never,
    );
    insetsApplied = true;
  } catch {
    /* fall through: reported below */
  }

  // Serve the world read locally so the map renders with real cells and claims. A RegExp, not a
  // glob: the client appends a query (`?forceFunctionRegion=...`), and a glob of the bare path would
  // silently not match - which is exactly what happened first time round, leaving 0 hexes.
  // Against the real site the API works from its own origin, so NO_FIXTURE=1 skips this and measures
  // the genuine payload instead.
  if (!process.env.NO_FIXTURE) {
    await page.route(/\/v1\/world(\?|$)/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: worldJson }),
    );
  }

  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => { const el = document.getElementById('menu-play'); return !!el && !el.hidden; }, undefined, { timeout: 20000 });

  let opened = false;
  for (let attempt = 1; attempt <= 6 && !opened; attempt++) {
    await page.evaluate(() => (document.getElementById('menu-world') as HTMLButtonElement | null)?.click());
    await page.waitForTimeout(1000);
    opened = await page.evaluate(() => {
      const el = document.getElementById('online-world-screen') as HTMLElement | null;
      return !!el && !el.hidden && el.getBoundingClientRect().height > 1;
    });
  }
  if (!opened) {
    console.log(`\n  ${d.name}: COULD NOT OPEN THE WORLD MAP`);
    failures += 1;
    await context.close();
    continue;
  }
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    // No function assignments in here: tsx injects __name(...) for those and the page has no such
    // helper, which throws ReferenceError. Loops and plain values only.
    const out: Record<string, any> = {};
    for (const id of ['online-world-wallet', 'online-world-grid', 'online-world-selection', 'online-world-notice', 'online-brand']) {
      const el = document.getElementById(id) as HTMLElement | null;
      if (!el) { out[id] = null; continue; }
      const box = el.getBoundingClientRect();
      out[id] = { top: Math.round(box.top), bottom: Math.round(box.bottom), h: Math.round(box.height) };
    }
    const head = document.querySelector('#online-world-screen .online-head') as HTMLElement | null;
    out['head'] = head ? { top: Math.round(head.getBoundingClientRect().top) } : null;
    const inner = document.querySelector('#online-world-screen .online-inner') as HTMLElement | null;
    out['inner'] = inner ? { top: Math.round(inner.getBoundingClientRect().top), bottom: Math.round(inner.getBoundingClientRect().bottom), h: Math.round(inner.getBoundingClientRect().height) } : null;
    out['viewportH'] = window.innerHeight;
    out['hexes'] = document.querySelectorAll('.world-hex').length;
    return out;
  });

  const bottomLimit = r.viewportH - d.bottom;
  const last = r['online-world-notice']?.h > 0 ? r['online-world-notice'] : r['online-world-selection'];
  const brandTop = r['online-brand']?.top ?? -1;
  // The world's own rule: the header starts at max(12px, safe-area-top), and the wordmark adds the
  // game's 18px. On any phone with a cutout (inset >= 12) that is EXACTLY where the game's #hud-brand
  // sits - the case the owner is looking at. Where there is no cutout at all (notchless phone, or
  // landscape, where iOS removes the top inset) it keeps a 12px minimum instead of sitting flush
  // against the screen edge, which is deliberate and better than the game's 0 + 18.
  const expectedBrand = Math.max(12, d.top) + 18;
  const gameBrand = d.top + 18; // what #hud-brand would do here
  const checks: { label: string; ok: boolean; detail: string }[] = [
    { label: 'insets applied', ok: insetsApplied, detail: insetsApplied ? `top ${d.top} bottom ${d.bottom}` : 'NOT APPLIED - numbers below ignore the notch' },
    { label: 'header at the safe top', ok: Math.abs((r.head?.top ?? -1) - Math.max(12, d.top)) <= 1, detail: `head top ${r.head?.top} vs max(12, safe top ${d.top})` },
    { label: 'wordmark where the rule puts it', ok: Math.abs(brandTop - expectedBrand) <= 1, detail: `top ${brandTop} vs expected ${expectedBrand}` },
    { label: 'wordmark matches the live game', ok: d.top >= 12 ? Math.abs(brandTop - gameBrand) <= 1 : true, detail: d.top >= 12 ? `top ${brandTop} vs game ${gameBrand}` : `no cutout here (inset ${d.top}); game would use ${gameBrand}, we keep 12px of clearance` },
    { label: 'nothing below the fold', ok: !last || last.bottom <= bottomLimit + 1, detail: last ? `last line bottom ${last.bottom} vs limit ${bottomLimit}` : 'no bottom line found' },
    { label: 'content column fits its box', ok: !r.inner || r.inner.bottom <= r.viewportH + 1, detail: r.inner ? `inner bottom ${r.inner.bottom} vs viewport ${r.viewportH}` : 'no inner' },
    { label: 'map has hexes', ok: r.hexes > 100, detail: `${r.hexes} hexes` },
  ];
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) failures += bad.length;

  console.log(`\n  ${d.name}  (${d.w}x${d.h}, insets ${d.top}/${d.bottom}/${d.left}/${d.right})`);
  for (const c of checks) console.log(`    ${c.ok ? 'OK  ' : 'FAIL'}  ${c.label.padEnd(32)} ${c.detail}`);
  await page.screenshot({ path: `/tmp/world-${d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` });
  await context.close();
}

console.log(`\n  ${failures === 0 ? 'ALL DEVICES OK' : `${failures} CHECK(S) FAILED`}`);
console.log('  screenshots: /tmp/world-iphone-15-pro*.png, /tmp/world-iphone-se-*.png, /tmp/world-pixel-8-*.png');
await browser.close();
process.exit(failures === 0 ? 0 : 1);
