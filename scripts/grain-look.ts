// Screenshots the grain at the densities that matter, so the texture can be JUDGED rather than
// described. The chunkiness report was about appearance, and only a picture settles it.
//
//   npx tsx scripts/grain-look.ts
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:8903/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

// Retina desktop (like the owner's Mac) and a 3x phone: the two places the grain is actually seen.
const shots = [
  { name: 'desktop-1440x900-dpr2', w: 1440, h: 900, dpr: 2 },
  { name: 'phone-390x844-dpr3', w: 390, h: 844, dpr: 3 },
];

for (const s of shots) {
  const context = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: s.dpr,
    isMobile: s.w < 500,
    hasTouch: s.w < 500,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('futa04-film-grain'), undefined, { timeout: 20000 });
  await page.waitForTimeout(900);

  const info = await page.evaluate(() => {
    const film = document.getElementById('futa04-film-grain') as HTMLElement;
    const cs = getComputedStyle(film);
    return {
      size: cs.backgroundSize,
      opacity: cs.opacity,
      blend: cs.mixBlendMode,
      z: cs.zIndex,
      pointer: cs.pointerEvents,
      dpr: window.devicePixelRatio,
      hasZoom: cs.backgroundSize.replace('px', '').split(' ')[0],
    };
  });
  console.log(`  ${s.name}: dpr=${info.dpr} size=${info.size} opacity=${info.opacity} blend=${info.blend} pointer=${info.pointer}`);
  await page.screenshot({ path: `/tmp/grain-${s.name}.png` });
  // A 1:1 crop of the middle of the screen, so the grain can be looked at close up rather than judged
  // through a downscaled full-page image.
  await page.screenshot({ path: `/tmp/grain-${s.name}-crop.png`, clip: { x: Math.round(s.w / 2) - 120, y: Math.round(s.h / 2) - 80, width: 240, height: 160 } });
  await context.close();
}
console.log('\n  full screenshots: /tmp/grain-*.png   close crops: /tmp/grain-*-crop.png');
await browser.close();
