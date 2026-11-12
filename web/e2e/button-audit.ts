// BUTTON AUDIT (owner, 2026-11-12: "all buttons ... consistent, no frame contour, dark glass").
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=http://127.0.0.1:9/functions/v1/duel \
//     VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/button-audit.ts
//
// Walks the screens a player meets (menu, PLAY, the pause panel, the finish card, RESULT) and reads
// every VISIBLE button's computed border, outline and box-shadow. A frame is any visible border, a
// non-focus outline, or a box-shadow that draws an edge (a spread or an inset ring). Prints one line
// per framed button and exits 1 if any is found. The focus ring of a focused key is not a frame, and
// the SUGGESTED key (`.suggest`, the current campaign tile) keeps its line with its glow by design.
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';

const PORT = 4318;
const CHROME = process.env.PW_CHROMIUM || undefined;

type Framed = { screen: string; id: string; label: string; border: string; outline: string; shadow: string; background: string };

const AUDIT_SRC = `(screen) => {
    const out = [];
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' && !!el.offsetParent;
    };
    const seen = (c) => !/rgba\\([^)]*,\\s*0\\)$/.test(c) && c !== 'transparent';
    for (const el of Array.from(document.querySelectorAll('button, .btn, [role="button"]'))) {
      if (!visible(el)) continue;
      // the one documented exception: the SUGGESTED key keeps its line with its glow (owner, 2026-11-11)
      if (el.matches('.suggest, .campaign-tile[data-state="current"]')) continue;
      const cs = getComputedStyle(el);
      const widths = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat);
      const colours = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
      const border = widths.some((w, i) => w > 0 && seen(colours[i]) && cs.borderTopStyle !== 'none');
      const focused = document.activeElement === el;
      const outline = !focused && parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none' && seen(cs.outlineColor);
      const shadow = cs.boxShadow !== 'none' && cs.boxShadow.split(/,(?![^(]*\\))/).some((s) => {
        const nums = (s.replace(/rgba?\\([^)]*\\)/g, '').match(/-?\\d+(\\.\\d+)?px/g) || []).map(parseFloat);
        const inset = /inset/.test(s);
        const x = nums[0] || 0, y = nums[1] || 0, spread = nums[3] || 0;
        return (inset && x === 0 && y === 0 && spread !== 0) || (!inset && spread > 0);
      });
      if (border || outline || shadow) out.push({
        screen,
        id: el.id || String(el.className || el.tagName).slice(0, 40),
        label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28),
        border: border ? cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor : '',
        outline: outline ? cs.outlineWidth + ' ' + cs.outlineColor : '',
        shadow: shadow ? cs.boxShadow : '',
        background: cs.backgroundColor,
      });
    }
    return out;
  }`;

const audit = async (page: Page, screen: string): Promise<Framed[]> =>
  (await page.evaluate(`(${AUDIT_SRC})(${JSON.stringify(screen)})`)) as Framed[];

const playToEnd = async (page: Page): Promise<boolean> => {
  const read = () => page.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
  for (let i = 0; i < 2000; i++) {
    await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 30_000 }).catch(() => undefined);
    const s = await read();
    if (!s) return false;
    if (s.phase === 'GAME_OVER') return true;
    if (s.actor !== 0) { await page.waitForTimeout(60); continue; }
    const legal = legalActions(viewFor(s, 0));
    const order = ['Bloom', 'Sprout', 'Draw', 'EndAct', 'Discard'];
    const candidates = [...legal].sort((a, b) => order.indexOf(a.t) - order.indexOf(b.t)) as Action[];
    for (const a of candidates) if (await page.evaluate(`Boolean(window.__severgrow.playFor(${JSON.stringify(a)}, 0))`)) break;
  }
  return false;
};

const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const found: Framed[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.addInitScript(`try { localStorage.setItem('severgrow.settings', JSON.stringify({ sound: false, music: false, speed: 'skip', reduceMotion: true })); localStorage.setItem('severgrow.seen', '1'); } catch (e) {}`);
  await page.goto(origin);
  await page.waitForTimeout(1500);
  found.push(...(await audit(page, 'menu')));
  if (await page.locator('#menu-play').isVisible().catch(() => false)) {
    await page.click('#menu-play');
    await page.waitForTimeout(600);
    found.push(...(await audit(page, 'play menu')));
  }
  await page.goto(`${origin}/?seed=219682080`);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state(); })()', undefined, { timeout: 40_000 });
  await page.waitForTimeout(1200);
  found.push(...(await audit(page, 'in game')));
  const pause = page.locator('#gm-open, #menu-button, .corner-tools [aria-label*="enu"]').first();
  if (await pause.isVisible().catch(() => false)) {
    await pause.click().catch(() => undefined);
    await page.waitForTimeout(600);
    found.push(...(await audit(page, 'pause panel')));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  if (await playToEnd(page)) {
    await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    await page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur()');
    found.push(...(await audit(page, 'finish card')));
    await page.screenshot({ path: 'docs/screens/finish/button-audit-finish-390x844.png' });
    if (await page.locator('#go-result').isVisible().catch(() => false)) {
      await page.click('#go-result');
      await page.waitForTimeout(800);
      found.push(...(await audit(page, 'RESULT')));
      await page.screenshot({ path: 'docs/screens/finish/button-audit-result-390x844.png' });
    }
  } else console.log('could not reach the finish card');
} finally {
  await browser.close();
  await server.close();
}
for (const f of found) console.log(`FRAMED  [${f.screen}] #${f.id} "${f.label}"  border=${f.border || '-'} outline=${f.outline || '-'} shadow=${f.shadow || '-'}`);
console.log(found.length ? `${found.length} framed button(s)` : 'no framed buttons');
process.exit(found.length ? 1 : 0);
