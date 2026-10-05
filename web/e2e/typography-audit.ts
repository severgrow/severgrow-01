// Test copy: typography v2 (Besley + Commissioner) audit. Every primary screen at 360x640,
// 390x844, 430x932, 768x1024 (touch), 1280x800, 1600x980, 1920x1080: screenshots in
// docs/screens/typography/, plus automatic checks: text clipped or off screen, unwanted wrapping
// of key words, the fonts in use, the tile numbers' optical centre (digits 1-9), no console errors.
//   CHANNEL=test npm run web:build && npx tsx web/e2e/typography-audit.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';

const OUT = 'docs/screens/typography';
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4194, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
type Hook = { state: () => State | null; busy: () => boolean; playFor: (a: Action, w: number) => boolean };
const SIZES = { touch: [[360, 640], [390, 844], [430, 932], [768, 1024]], desk: [[1280, 800], [1600, 980], [1920, 1080]] } as const;
const KEY_WORDS = ['Draw a card', 'Play or skip', 'Throw one card', 'Opponent', 'Throw pile', 'Continue', 'New game', 'Tutorial game', 'How to play', 'Skip sprout', 'Bloom', 'Strengthen', 'Show me where', 'Settings', 'Try again', 'Play again', 'Back to the game', 'Main menu'];

/** Visible text elements that are clipped, run off screen, or (key words) wrap. */
const audit = (page: Page, words: string[]) =>
  page.evaluate((words) => {
    const out: string[] = [];
    const vis = (e: Element) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      let op = 1;
      for (let a: Element | null = e; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !(e as HTMLElement).closest('[hidden]') && op > 0.05;
    };
    const els = [...document.querySelectorAll<HTMLElement>('button, .btn, h1, h2, h3, .title, .tagline, .pile-label, .pile-count, .c-num, .lt-name, .lt-num, .cue-text, .cue-kicker, .go-title, .go-score, .seg-btn, .gm-turn b, .gm-scores b, label, .row > span')].filter(vis);
    for (const e of els) {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const t = (e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28);
      if (!t) continue;
      if ((cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 1) out.push(`clipped: "${t}"`);
      if (r.right > innerWidth + 1 || r.left < -1) out.push(`off screen: "${t}"`);
      // key words on one line: a single line box
      const own = [...e.childNodes].filter((n) => n.nodeType === 3 && (n.textContent ?? '').trim()).map((n) => (n.textContent ?? '').trim()).join(' ');
      if (own && words.some((w) => own === w || own.startsWith(w + ' '))) {
        const range = document.createRange();
        const tn = [...e.childNodes].find((n) => n.nodeType === 3 && (n.textContent ?? '').trim())!;
        range.selectNodeContents(tn);
        const lines = new Set([...range.getClientRects()].map((q) => Math.round(q.top)));
        if (lines.size > 1) out.push(`wraps: "${own}"`);
      }
    }
    return [...new Set(out)];
  }, words);

const fontsInUse = (page: Page) =>
  page.evaluate(() => {
    const ff = (sel: string) => {
      const e = document.querySelector(sel);
      return e ? getComputedStyle(e).fontFamily.split(',')[0]!.replace(/"/g, '') : '-';
    };
    return { cls: document.documentElement.classList.contains('test-typography-v2'), body: ff('body'), title: ff('.title'), btn: ff('.btn'), num: ff('.num'), loaded: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))] };
  });

const shot = async (page: Page, name: string, w: number, h: number) => {
  const words = KEY_WORDS;
  const a = await audit(page, words);
  check(`${w}x${h} ${name}: no clipped, off-screen or wrapped key text`, a.length === 0, a.slice(0, 4).join(' | '));
  await page.screenshot({ path: `${OUT}/${w}x${h}-${name}.png` });
};

const waitMine = (page: Page) =>
  page.waitForFunction(() => {
    const h = (window as unknown as { __severgrow: Hook }).__severgrow;
    const st = h.state();
    return !h.busy() && (!st || st.actor === 0 || st.phase === 'GAME_OVER');
  }, undefined, { timeout: 60000 });

for (const kind of ['touch', 'desk'] as const) {
  const sizes = SIZES[kind];
  const [w0, h0] = sizes[0]!;
  const page = await browser.newPage({ viewport: { width: w0, height: h0 }, ...(kind === 'touch' ? { hasTouch: true, isMobile: true } : {}), deviceScaleFactor: kind === 'touch' ? 2 : 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('test:severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'fast' }));
  });
  await page.goto('http://localhost:4194/');
  await page.waitForTimeout(900);
  const f = await fontsInUse(page);
  check(`${kind}: Besley + Commissioner in use`, f.cls && f.body === 'Commissioner' && f.title === 'Besley' && f.btn === 'Commissioner' && f.num === 'Severor Numerals' && ['Besley', 'Commissioner', 'Severor Numerals'].every((x) => f.loaded.includes(x)), JSON.stringify(f));
  const each = async (name: string, prep?: () => Promise<void>) => {
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(350);
      if (prep) await prep();
      await shot(page, name, w, h);
    }
  };
  await each('menu');
  await page.click('#menu-new');
  await page.waitForTimeout(300);
  await each('levels');
  await page.click('#level-grid [data-level="7"]');
  await waitMine(page);
  await page.waitForTimeout(500);
  // the tile numbers' optical centre: ink centre vs the plate centre, digits 1-9 (this font and Alegreya)
  const centre = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d')!;
    const res: Record<string, number[]> = {};
    for (const fam of ['Severor Numerals', 'Alegreya Sans']) {
      c.font = `700 100px "${fam}"`;
      c.textBaseline = 'middle';
      res[fam] = [...'123456789'].map((d) => {
        const m = c.measureText(d);
        return Math.round(((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2) * 10) / 10; // ink centre above the middle (per 100px)
      });
    }
    return res;
  });
  console.log(`tile digits, ink centre above the em middle (per 100px): numerals ${centre['Severor Numerals']!.join(' ')} | Alegreya ${centre['Alegreya Sans']!.join(' ')}`);
  await each('draw');
  // play into Grow (draw), then Throw, opponent: one screen each
  let step = 0;
  const playOne = async () => {
    const s = await page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
    await page.evaluate((x) => (window as unknown as { __severgrow: Hook }).__severgrow.playFor(x, 0), chooseLevelAction(viewFor(s!, 0), 5, step++));
    await page.waitForTimeout(600);
  };
  await playOne();
  await waitMine(page);
  await each('grow');
  for (let i = 0; i < 6; i++) {
    const s = await page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
    if (s?.phase === 'DISCARD') break;
    await playOne();
    await waitMine(page);
  }
  await each('throw');
  for (const [sheet, name] of [['sheet-settings', 'settings'], ['sheet-howto', 'howto'], ['sheet-menu', 'pause']] as const) {
    await page.evaluate((id) => {
      const b = id === 'sheet-menu' ? document.getElementById('hud-menu') : null;
      if (b) b.click();
      else {
        document.getElementById('hud-menu')!.click();
        document.getElementById(id === 'sheet-settings' ? 'gm-settings' : 'gm-howto')!.click();
      }
    }, sheet);
    await page.waitForTimeout(400);
    await each(name);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector<HTMLElement>('.sheet:not([hidden]) [data-close]')?.click());
    await page.waitForTimeout(300);
  }
  // the Lab sheet
  await page.evaluate(() => {
    document.getElementById('hud-menu')!.click();
    document.getElementById('gm-main')!.click();
  });
  await page.waitForTimeout(400);
  const lab = await page.$('#menu-lab, .menu-lab, [data-open-lab]');
  if (lab) {
    await lab.click();
    await page.waitForTimeout(400);
    await each('lab');
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-lab="close"], .sheet:not([hidden]) [data-close]')?.click());
  }
  // a whole game to the end (level 1 opponent, my moves by level 5)
  await page.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
  await page.waitForTimeout(400);
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    await waitMine(page);
    const s = await page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
    if (!s || s.phase === 'GAME_OVER') break;
    await page.evaluate((x) => (window as unknown as { __severgrow: Hook }).__severgrow.playFor(x, 0), chooseLevelAction(viewFor(s, 0), 5, step++));
  }
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  await each('gameover');
  check(`${kind}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}
await browser.close();
server.httpServer.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
