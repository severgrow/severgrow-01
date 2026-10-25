// THE CONSISTENCY SWEEP (owner brief, 2026-10-25): one run that photographs every product surface
// at the five release viewports and reports the drift an eye would catch — a plate that is not the
// dark glass, a typeface that is not the game's, a tap target under 44px, a horizontal overflow, a
// second brand mark, a loop that never stops.
//
//   npx tsx web/e2e/consistency-surfaces.ts
//   SHOTS=/tmp/sweep/after npx tsx web/e2e/consistency-surfaces.ts
//
// It builds its OWN futa05 dist (`web/dist-sweep`) against a local in-memory API, so the online
// surfaces (hub, invite code, your matches, territory) are real, and it never writes `web/dist`.
// Every surface is shot in its OWN browser context, so no screen can inherit another's leftovers.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { memoryChatStore } from '../../server/src/chat/memory.js';
import { createChatRouter } from '../../server/src/chat/router.js';
import { MemoryFeedbackStore } from '../../server/src/feedback/feedback.js';

const out = process.env.SHOTS ?? '/tmp/sweep/shots';
mkdirSync(out, { recursive: true });
const DIST = 'dist-sweep';

const storage = new MemoryStorage();
const chat = memoryChatStore(storage as never, new MemoryFeedbackStore());
const service = new MatchService({
  storage,
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] },
  now: () => Date.now(),
});
const server = createHttpServer({
  service,
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] },
  live: createChatRouter({ store: chat, service, storage, notifier: { publish: async () => {} } }),
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

await new Promise<void>((resolve, reject) => {
  const p = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts', '--outDir', DIST],
    {
      env: {
        ...process.env,
        CHANNEL: 'futa05',
        VITE_DUEL_API_URL: api,
        VITE_SUPABASE_URL: api,
        VITE_SUPABASE_ANON_KEY: 'local-test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  p.stdout.on('data', (b) => (log += b));
  p.stderr.on('data', (b) => (log += b));
  p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(log))));
});
const preview = await servePreview(0, { logLevel: 'error', build: { outDir: DIST } });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
});
const errors: string[] = [];

const VIEWS = [
  { w: 320, h: 568, tag: '320x568' },
  { w: 360, h: 640, tag: '360x640' },
  { w: 390, h: 844, tag: '390x844' },
  { w: 844, h: 390, tag: '844x390' },
  { w: 1280, h: 800, tag: '1280x800' },
];

type Report = Record<string, unknown>;
const reports: { surface: string; view: string; report: Report }[] = [];

const AUDIT = `(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0;
  };
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
  const small = [], fonts = {}, owners = {}, radii = {}, fills = {}, marks = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!seen(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (el.matches('button, a[href], summary, [role="button"], input:not([type=hidden]), select, [tabindex]:not([tabindex="-1"])')) {
      if (r.width < 44 || r.height < 44)
        small.push({ what: label(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 28) });
    }
    const text = el.childElementCount === 0 ? (el.textContent || '').trim() : '';
    if (text) {
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '');
      const key = fam + ' ' + cs.fontSize + ' ' + cs.fontWeight;
      fonts[key] = (fonts[key] || 0) + 1;
      (owners[fam] ||= []).includes(label(el)) || owners[fam].push(label(el));
    }
    const paints = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backdropFilter !== 'none';
    if (paints && r.width > 80 && r.height > 40) {
      const key = cs.backgroundColor + ' | blur:' + (cs.backdropFilter === 'none' ? 'no' : 'yes');
      (fills[key] ||= []).push(label(el));
      if (cs.borderRadius !== '0px') radii[cs.borderRadius] = (radii[cs.borderRadius] || 0) + 1;
    }
    if (el.id === 'hud-brand' || el.id === 'logo' || el.id === 'online-brand' || el.id === 'go-brand' ||
        el.classList.contains('rp-brand') || el.classList.contains('menu-mark') || el.classList.contains('brand-mark')) marks.push(label(el));
  }
  const doc = document.scrollingElement || document.documentElement;
  return {
    overflowX: doc.scrollWidth - doc.clientWidth,
    pageScroll: doc.scrollHeight - doc.clientHeight,
    small, fonts, owners, radii, fills, marks,
    animating: document.getAnimations().filter((a) => a.playState === 'running').map((a) => {
      const t = a.effect && a.effect.target;
      return t ? (t.id || t.className || t.tagName) : '?';
    }),
  };
})()`;

const audit = async (page: Page, surface: string, view: string) => {
  await page.screenshot({ path: `${out}/${surface}-${view}.png` });
  const report = (await page.evaluate(AUDIT)) as Report;
  reports.push({ surface, view, report });
  return report;
};

const settle = (page: Page, ms = 320) => page.waitForTimeout(ms);

const idle = (page: Page) =>
  page.waitForFunction(() => {
    const h = (window as unknown as { __severgrow?: { state: () => unknown; busy: () => boolean } }).__severgrow;
    return !!h?.state() && !h.busy();
  }, undefined, { timeout: 40_000 });

type Run = (page: Page) => Promise<void>;

const fresh = async (v: { w: number; h: number; tag: string }, run: Run) => {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, isMobile: v.w < 800, hasTouch: v.w < 800 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${v.tag}: ${e.message}`));
  await page.addInitScript(() => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    for (const prefix of ['futa05:', 'futa04:', 'main2:', 'futa-test:', 'test:']) {
      localStorage.setItem(prefix + 'severgrow.settings.v1', JSON.stringify({
        sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false, palette: 'soil',
      }));
      localStorage.setItem(prefix + 'severgrow.seen.v1', '1');
    }
  });
  try {
    await page.goto(preview.url);
    await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
    await settle(page, 420);
    await run(page);
  } catch (error) {
    errors.push(`${v.tag}: ${(error as Error).message.split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
};

/* ---------------- the surfaces ---------------- */
const toPlay = async (page: Page) => {
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])');
  await settle(page);
};
const toLevels = async (page: Page) => {
  await toPlay(page);
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])');
  await settle(page);
};
const toGame = async (page: Page) => {
  await toPlay(page);
  await page.click('#menu-campaign');
  await page.waitForFunction(() => {
    const game = document.getElementById('game');
    const levels = document.getElementById('levels');
    return !!game && !game.hidden && (!levels || levels.hidden);
  }, undefined, { timeout: 40_000 });
  await idle(page);
  await settle(page, 900);
};
const toPause = async (page: Page) => {
  await toGame(page);
  for (let i = 0; i < 10 && !(await page.locator('#sheet-menu:not([hidden])').count()); i++) {
    await page.locator('#hud-menu').click({ timeout: 4000 }).catch(() => undefined);
    await settle(page, 380);
  }
  await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 8000 });
  await settle(page, 420);
};
const toOnline = async (page: Page) => {
  await toPlay(page);
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])');
  await settle(page, 500);
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) {
    await page.click('#online-first-ok');
    await settle(page, 320);
  }
};

const SURFACES: { name: string; run: Run }[] = [
  { name: 'menu', run: async () => undefined },
  { name: 'play', run: toPlay },
  { name: 'levels', run: toLevels },
  {
    name: 'settings',
    run: async (page) => {
      await page.click('#menu-settings');
      await page.waitForSelector('#sheet-settings:not([hidden])');
      await settle(page, 500);
    },
  },
  {
    name: 'tutorial-list',
    run: async (page) => {
      await page.click('#menu-settings');
      await page.waitForSelector('#sheet-settings:not([hidden])');
      await settle(page, 400);
      await page.click('#settings-tutorial');
      await page.waitForSelector('#sheet-tutorial:not([hidden])');
      await settle(page, 450);
    },
  },
  {
    name: 'lesson-1',
    run: async (page) => {
      await page.click('#menu-settings');
      await page.waitForSelector('#sheet-settings:not([hidden])');
      await settle(page, 400);
      await page.click('#settings-tutorial');
      await page.waitForSelector('#sheet-tutorial:not([hidden])');
      await settle(page, 400);
      await page.locator('#tutorial-levels .level-tile, #tutorial-levels .tutorial-tile, #tutorial-levels button').first().click();
      await page.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
      await settle(page, 1800);
    },
  },
  { name: 'campaign', run: toGame },
  { name: 'pause', run: toPause },
  {
    name: 'howto',
    run: async (page) => {
      await toPause(page);
      // On a product channel the in-match help opens the shared GLASS SURFACE rather than the
      // `#sheet-howto` dialog (main.ts:5813), so this step screenshots whatever the real control
      // produces instead of waiting for one particular id.
      await page.click('#gm-howto').catch(() => undefined);
      await settle(page, 900);
    },
  },
  {
    name: 'profile',
    run: async (page) => {
      // The account key lives in the menu foot; on the product channel it is the sheet's only door.
      await page.locator('#menu-login').click({ timeout: 4000 }).catch(() => undefined);
      await settle(page, 900);
    },
  },
  { name: 'online-hub', run: toOnline },
  {
    name: 'online-matches',
    run: async (page) => {
      await toOnline(page);
      await page.click('#online-matches-toggle');
      await settle(page, 450);
    },
  },
  {
    name: 'online-find',
    run: async (page) => {
      await toOnline(page);
      const find = page.locator('#online-find');
      if (await find.isVisible().catch(() => false)) await find.click();
      else await page.click('#online-create');
      await settle(page, 1100);
    },
  },
  {
    name: 'territory',
    run: async (page) => {
      await toOnline(page);
      await page.click('#online-world');
      await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 12_000 });
      await settle(page, 1600);
    },
  },
];

try {
  for (const v of VIEWS) {
    for (const surface of SURFACES) {
      await fresh(v, async (page) => {
        await surface.run(page);
        await audit(page, surface.name, v.tag);
      });
    }
  }
} finally {
  await browser.close();
  await new Promise<void>((r) => preview.server.httpServer.close(() => r()));
  await new Promise<void>((r) => server.close(() => r()));
}

writeFileSync(`${out}/report.json`, JSON.stringify({ errors, reports }, null, 1));
console.log(`sweep: ${reports.length} surfaces, ${errors.length} problems → ${out}`);

const rows: string[] = [];
for (const r of reports) {
  const m = r.report as {
    overflowX: number; small: { what: string; w: number; h: number; text: string }[];
    marks: string[]; animating: string[]; owners: Record<string, string[]>;
  };
  const issues: string[] = [];
  if (m.overflowX > 0) issues.push(`overflowX ${m.overflowX}`);
  if (m.small.length) issues.push(`<44px: ${m.small.map((s) => `${s.what}(${s.w}x${s.h})`).join(' ')}`);
  if (m.marks.length !== 1) issues.push(`marks ${m.marks.length}`);
  if (m.animating.length) issues.push(`animating ${m.animating.join(',')}`);
  const stray = Object.keys(m.owners).filter((f) => !['Besley', 'Fragment Mono', 'Futasaku Numerals'].includes(f));
  if (stray.length) issues.push(`STRAY FACE ${stray.map((f) => `${f}@${(m.owners[f] ?? []).slice(0, 2).join('/')}`).join(' ')}`);
  rows.push(`${r.surface.padEnd(15)} ${r.view.padEnd(9)} ${issues.join(' | ') || 'clean'}`);
}
console.log(rows.join('\n'));
