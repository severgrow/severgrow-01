// Is the analog film grain actually on top of EVERYTHING, on every screen?
//
// The owner's rule (2026-10-16): the grain is an analogue photo overlay and must sit above
// everything, always, including things added later. There are two grain layers in the codebase:
//   - #texture::before  (soil, opacity .16) - the BACKGROUND grain, z-index 0, behind the app
//   - #futa04-film-grain (atmosphere.ts, canvas noise, mix-blend-mode soft-light) - the top film,
//     z-index 2147483646, pinned as the last body child
// This probes LIVE for each screen: which grain is present, its real computed layer, and whether it
// is genuinely the topmost thing - because a film grain that is only mounted in-match would leave
// the menus, the world map and the settings sheets without it.
//
//   npx tsx scripts/live-grain-probe.ts
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
// The film is created by JS during boot (product channels only), so there is a window at startup
// where the app has no grain. Measure it: "always on top" is weakened if the grain is absent for the
// first seconds, and the background no longer paints its own copy.
const filmAt = await page
  .waitForFunction(() => !!document.getElementById('futa04-film-grain'), undefined, { timeout: 20000 })
  .then(() => Date.now() - t0)
  .catch(() => -1);
const menuAt = await page
  .waitForFunction(() => { const el = document.getElementById('menu-play'); return !!el && !el.hidden; }, undefined, { timeout: 20000 })
  .then(() => Date.now() - t0)
  .catch(() => -1);
console.log(`  film grain appears at ${filmAt}ms, menu usable at ${menuAt}ms`);
console.log(`  -> grain-less glimpse: ${filmAt > menuAt && menuAt > 0 ? `${filmAt - menuAt}ms` : 'none'}`);

await page.waitForFunction(() => {
  const el = document.getElementById('menu-play');
  return !!el && !el.hidden;
}, undefined, { timeout: 20000 }).catch(() => {});

/** Everything this probe needs to know about the grain on the CURRENT screen. */
const report = async (label: string) => {
  const r = await page.evaluate(() => {
    const film = document.getElementById('futa04-film-grain') as HTMLElement | null;
    const texture = document.getElementById('texture') as HTMLElement | null;
    const filmStyle = film ? getComputedStyle(film) : null;
    // What is actually the topmost element at the centre of the screen?
    const at = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) as HTMLElement | null;
    return {
      filmPresent: !!film,
      filmZ: filmStyle?.zIndex ?? '-',
      filmOpacity: filmStyle?.opacity ?? '-',
      filmBlend: filmStyle?.mixBlendMode ?? '-',
      filmPointer: filmStyle?.pointerEvents ?? '-',
      filmDisplay: filmStyle?.display ?? '-',
      filmIsLastBodyChild: !!film && document.body.lastElementChild === film,
      // The topmost *declared* z-index anywhere in the document (excluding the film itself).
      highestOtherZ: Math.max(
        0,
        ...[...document.querySelectorAll('*')]
          .filter((el) => el.id !== 'futa04-film-grain')
          .map((el) => {
            const z = getComputedStyle(el).zIndex;
            return z === 'auto' ? 0 : Number(z) || 0;
          }),
      ),
      textureZ: texture ? getComputedStyle(texture).zIndex : '-',
      centreTop: at ? `${at.tagName.toLowerCase()}${at.id ? '#' + at.id : ''}.${(at.className || '').toString().split(' ')[0]}` : 'none',
    };
  });
  console.log(`\n  --- ${label} ---`);
  console.log(`    film grain present : ${r.filmPresent}${r.filmPresent ? `  z=${r.filmZ} opacity=${r.filmOpacity} blend=${r.filmBlend} pointer=${r.filmPointer} display=${r.filmDisplay}` : ''}`);
  if (r.filmPresent) console.log(`    film is last child: ${r.filmIsLastBodyChild}`);
  console.log(`    highest other z    : ${r.highestOtherZ}`);
  console.log(`    #texture z         : ${r.textureZ}`);
  console.log(`    topmost at centre  : ${r.centreTop}`);
  return r;
};

const results: Record<string, Awaited<ReturnType<typeof report>>> = {};
results.menu = await report('MAIN MENU');
await page.screenshot({ path: '/tmp/grain-menu.png' });

// PLAY submenu
await page.evaluate(() => (document.getElementById('menu-play') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(500);
results.playMenu = await report('PLAY SUBMENU');

// World map
await page.evaluate(() => (document.getElementById('play-back') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(300);
await page.evaluate(() => (document.getElementById('menu-world') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(2500);
results.world = await report('WORLD MAP');
await page.screenshot({ path: '/tmp/grain-world.png' });

// Settings sheet
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => { const el = document.getElementById('menu-play'); return !!el && !el.hidden; }, undefined, { timeout: 20000 }).catch(() => {});
await page.evaluate(() => (document.getElementById('menu-settings') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(1200);
results.settings = await report('SETTINGS SHEET');

// In a game (where the film grain is supposedly meant to be)
await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('severgrow')) localStorage.removeItem(k); });
await page.reload({ waitUntil: 'load' });
await page.evaluate(() => { document.addEventListener('dialog', () => {}); });
page.on('dialog', (d) => void d.accept());
await page.waitForFunction(() => { const el = document.getElementById('menu-play'); return !!el && !el.hidden; }, undefined, { timeout: 20000 }).catch(() => {});
await page.evaluate(() => (document.getElementById('menu-play') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(400);
await page.evaluate(() => (document.getElementById('menu-new') as HTMLButtonElement | null)?.click());
await page.waitForSelector('#level-grid button', { state: 'visible', timeout: 10000 }).catch(() => {});
await page.evaluate(() => { (document.querySelector('#level-grid [data-difficulty="easy"]') as HTMLElement | null)?.click(); });
await page.waitForSelector('#board .hex-cell', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);
results.game = await report('IN GAME');
await page.screenshot({ path: '/tmp/grain-game.png' });

console.log('\n  SUMMARY');
for (const [k, v] of Object.entries(results)) {
  console.log(`    ${k.padEnd(9)} film=${v.filmPresent ? 'YES' : 'NO '}  lastChild=${v.filmPresent ? v.filmIsLastBodyChild : '-'}  highestOtherZ=${v.highestOtherZ}`);
}
console.log('\n  screenshots: /tmp/grain-{menu,world,game}.png');
await browser.close();
