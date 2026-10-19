// MENU AUDIT — measures every menu-like surface against the shared Futasaku column tokens and
// writes JSON + Markdown + screenshots so drift is provable, not eyeballed.
//
//   CHANNEL=futa05 npm run web:build && npx tsx web/e2e/menu-audit.ts [before|after]
//
// Serves the CURRENT `web/dist` via `vite preview`. For each viewport it walks the surfaces the
// player can actually reach (menu → difficulty → online hub/join/waiting, settings sheet, in-game
// pause menu, how-to sheet) and records, from `getComputedStyle` + `getBoundingClientRect`:
//   - the centred column: width, left/right margin, padding top/bottom, row gap, centre offset
//   - the heading: font-size, line-height, letter-spacing, weight
//   - each button: height, corner radius, border colour, background
//   - the main menu's wordmark→buttons distance and whether the column overflows
// Writes docs/screens/menus/<label>-<key>.png and docs/screens/menus/audit-<label>.{json,md}.
//
// LABEL defaults to `after`. META overrides the note written into the JSON.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { openMenuEntry } from './helpers/menu-nav.js';

const LABEL = process.argv[2] ?? 'after';
const OUT = new URL('../../docs/screens/menus/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4285);
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

export const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
  { key: '768x1024', width: 768, height: 1024 },
  { key: '1280x800', width: 1280, height: 800 },
] as const;

type SurfaceSpec = {
  name: string;
  /** The visible screen/sheet root (used for the "is it up" wait). */
  root: string;
  /** The centred column whose width/rhythm defines the surface. */
  column: string;
  /** The heading element to compare type scale on. */
  heading: string;
  /** Buttons of the surface: an id or a selector fragment inside `root`. */
  buttons: string[];
  /** The main-menu mark above the wordmark (only the menu has one). */
  logo?: string;
  /** The wordmark heading (the "logo" the owner means: FUTASAKU on the menu). */
  wordmark?: string;
  /** The buttons block whose top the wordmark must clear. */
  buttonsColumn?: string;
};

const MEASURE = `(() => {
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
  const px = (v) => (v == null || v === '' ? null : +Number.parseFloat(v).toFixed(2));
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) return null;
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), left: +b.left.toFixed(1), right: +b.right.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1) };
  };
  const vis = (el) => !!el && el.offsetParent !== null;
  return (spec) => {
    const q = (s) => document.querySelector(s);
    const root = q(spec.root);
    const column = q(spec.column);
    const heading = q(spec.heading);
    const logo = spec.logo ? q(spec.logo) : null;
    const wordmark = spec.wordmark ? q(spec.wordmark) : null;
    const colStyle = column ? getComputedStyle(column) : null;
    const col = box(column);
    const colPadTop = colStyle ? px(colStyle.paddingTop) : null;
    const colPadBottom = colStyle ? px(colStyle.paddingBottom) : null;
    const gap = colStyle ? px(colStyle.rowGap) : null;
    const buttonsColumn = spec.buttonsColumn ? q(spec.buttonsColumn) : null;
    let logoToButtons = null;
    let titleToButtons = null;
    if (buttonsColumn) {
      const bb = buttonsColumn.getBoundingClientRect();
      if (logo) {
        const lb = logo.getBoundingClientRect();
        if (lb.height && bb.height) logoToButtons = +(bb.top - lb.bottom).toFixed(1);
      }
      if (wordmark) {
        const wb = wordmark.getBoundingClientRect();
        if (wb.height && bb.height) titleToButtons = +(bb.top - wb.bottom).toFixed(1);
      }
    }
    const buttons = spec.buttons.map((sel) => {
      const el = sel.startsWith('#') || sel.startsWith('.') ? q(sel) : root ? root.querySelector(sel) : null;
      if (!el) return { sel, present: false };
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        sel,
        present: vis(el),
        h: +b.height.toFixed(1),
        radius: px(s.borderTopLeftRadius),
        border: s.borderTopWidth === '0px' ? null : s.borderTopColor,
        bg: s.backgroundColor,
        colour: s.color,
        fontSize: px(s.fontSize),
        minHeight: px(s.minHeight),
      };
    });
    const scrollOverflow = column ? Math.max(0, Math.round(column.scrollHeight - column.clientHeight)) : null;
    const rootOverflow = root ? Math.max(0, Math.round(root.scrollHeight - root.clientHeight)) : null;
    return {
      surface: spec.name,
      column: column
        ? {
            sel: spec.column,
            w: +col.w.toFixed(1),
            left: col.left,
            right: col.right,
            viewport: window.innerWidth,
            centreOffset: +((col.left + col.right) / 2 - window.innerWidth / 2).toFixed(2),
            padTop: colPadTop,
            padBottom: colPadBottom,
            gap,
          }
        : null,
      heading: heading
        ? {
            text: (heading.textContent ?? '').trim().slice(0, 40),
            fontSize: px(getComputedStyle(heading).fontSize),
            lineHeight: px(getComputedStyle(heading).lineHeight),
            letterSpacing: px(getComputedStyle(heading).letterSpacing),
            weight: getComputedStyle(heading).fontWeight,
          }
        : null,
      buttons,
      logoToButtons,
      titleToButtons,
      columnOverflow: scrollOverflow,
      rootOverflow,
    };
  };
})()`;

type Result = { viewport: string; surface: string; data: any };

const open = async (browser: any, vp: (typeof VIEWPORTS)[number]) => {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 800, isMobile: vp.width < 800 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'skip', eyeCandy: false }));
    localStorage.setItem('severgrow.seen', '1');
  });
  return page;
};

const ready = async (page: Page, selector: string) => {
  await page.waitForSelector(selector, { timeout: 30_000 });
  await page.waitForTimeout(500);
};

const shootClipped = async (page: Page, name: string, viewportKey: string) => page.screenshot({ path: `${OUT}${LABEL}-${name}-${viewportKey}.png` });

mkdirSync(OUT, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: CHROME });

const results: Result[] = [];
const notes: string[] = [];

for (const vp of VIEWPORTS) {
  const page = await open(browser, vp);
  const measure = (spec: SurfaceSpec) => page.evaluate(`(${MEASURE})(${JSON.stringify(spec)})`) as Promise<any>;
  const record = async (spec: SurfaceSpec) => {
    const data = await measure(spec);
    results.push({ viewport: vp.key, surface: spec.name, data });
    return data;
  };

  // ---- 1. Main menu ----
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await ready(page, '#menu:not([hidden])');
  await shootClipped(page, 'menu', vp.key);
  await record({
    name: 'main menu',
    root: '#menu',
    column: '#menu .menu-inner',
    heading: '#menu .title',
    buttons: ['#menu-login', '#menu-play', '#menu-continue', '#menu-world', '#menu-tutorial', '#menu-settings'],
    logo: '#logo',
    wordmark: '#menu .title',
    buttonsColumn: '#menu .menu-buttons',
  });

  // ---- 2. Difficulty pick (Practice match is behind the PLAY doorway on product channels) ----
  await openMenuEntry(page, 'menu-new');
  await ready(page, '#levels:not([hidden])');
  await shootClipped(page, 'levels', vp.key);
  const levels = await record({
    name: 'difficulty pick',
    root: '#levels',
    column: '#levels .levels-inner',
    heading: '#levels .levels-head h2',
    buttons: ['#levels .level-grid .difficulty-tile', '#levels .level-tile', '#levels-back'],
  });
  // the difficulty rows are the actual "level picker" button treatment
  const firstTile = await page.evaluate(`(() => { const t = document.querySelector('#levels .level-grid button, #levels .level-tile'); if (!t) return null; const s = getComputedStyle(t); const b = t.getBoundingClientRect(); return { h: +b.height.toFixed(1), radius: +Number.parseFloat(s.borderTopLeftRadius).toFixed(2), border: s.borderTopColor, bg: s.backgroundColor, minHeight: Number.parseFloat(s.minHeight) || null, fontSize: Number.parseFloat(s.fontSize) }; })()`);
  (levels as any).tile = firstTile;

  // ---- 3. Online hub ----
  await page.click('#levels-back').catch(() => undefined);
  await ready(page, '#menu:not([hidden])');
  const onlineVisible = await page.locator('#menu-online:not([hidden])').count();
  if (onlineVisible) {
    await openMenuEntry(page, 'menu-online');
    const hubUp = await page.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 }).then(() => true).catch(() => false);
    if (!hubUp) {
      await page.evaluate(() => { const el = document.getElementById('online-hub'); if (el) el.hidden = false; });
      notes.push(`${vp.key}: #online-hub did not open from the menu; revealed it to measure CSS`);
    }
    if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
    await page.waitForTimeout(400);
    await shootClipped(page, 'online-hub', vp.key);
    await record({
      name: 'online hub',
      root: '#online-hub',
      column: '#online-hub .online-inner',
      heading: '#online-hub .online-head h2',
      buttons: ['#online-create', '#online-find', '#online-join-open', '#online-back'],
    });
    // ---- 4. Online join ----
    await page.click('#online-join-open');
    const joinUp = await page.waitForSelector('#online-join:not([hidden])', { timeout: 8_000 }).then(() => true).catch(() => false);
    if (!joinUp) await page.evaluate(() => { const el = document.getElementById('online-join'); if (el) el.hidden = false; });
    await page.waitForTimeout(300);
    await shootClipped(page, 'online-join', vp.key);
    await record({
      name: 'online join',
      root: '#online-join',
      column: '#online-join .online-inner',
      heading: '#online-join .online-head h2',
      buttons: ['#online-join-submit', '#online-join-back'],
    });
    // ---- 5. Online waiting (parked/searching state) ----
    await page.click('#online-join-back').catch(() => undefined);
    await page.waitForTimeout(200);
    await page.click('#online-create').catch(() => undefined);
    const waitUp = await page.waitForSelector('#online-waiting:not([hidden])', { timeout: 10_000 }).then(() => true).catch(() => false);
    if (!waitUp) await page.evaluate(() => { const el = document.getElementById('online-waiting'); if (el) el.hidden = false; });
    if (!waitUp) notes.push(`${vp.key}: #online-waiting did not open (needs the server); revealed it to measure CSS`);
    await page.waitForTimeout(400);
    await shootClipped(page, 'online-waiting', vp.key);
    await record({
      name: 'online waiting / searching',
      root: '#online-waiting',
      column: '#online-waiting .online-inner',
      heading: '#online-waiting .online-head h2',
      buttons: ['#online-share', '#online-copy', '#online-cancel-match', '#online-waiting-back'],
    });
    await page.evaluate(() => { for (const id of ['online-hub', 'online-waiting', 'online-join']) { const el = document.getElementById(id); if (el) el.hidden = true; } });
    // ---- the "Opponent found" card (the matched state; static markup, safe to reveal) ----
    await page.evaluate(() => { const el = document.getElementById('online-matched'); if (el) el.hidden = false; });
    await page.waitForTimeout(250);
    await shootClipped(page, 'online-matched', vp.key);
    await record({
      name: 'online matched card',
      root: '#online-matched',
      column: '#online-matched .online-card',
      heading: '#online-matched h3',
      buttons: ['#online-matched-now', '#online-matched-later'],
    });
    await page.evaluate(() => { const el = document.getElementById('online-matched'); if (el) el.hidden = true; });
  } else {
    notes.push(`${vp.key}: #menu-online is hidden in this build`);
  }

  // ---- 6. Settings sheet ----
  await page.evaluate(() => {
    for (const id of ['online-hub', 'online-waiting', 'online-join']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    const menu = document.getElementById('menu'); if (menu) menu.hidden = false;
  });
  await page.click('#menu-settings', { force: true });
  await ready(page, '#sheet-settings:not([hidden])');
  await shootClipped(page, 'settings', vp.key);
  await record({
    name: 'settings sheet',
    root: '#sheet-settings',
    column: '#sheet-settings .sheet-body',
    heading: '#sheet-settings h2',
    buttons: ['#sheet-settings [data-setting="sound"]', '#sheet-settings [data-setting="reduceMotion"]', '#sheet-settings [data-setting="largeText"]'],
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---- 7. Pause menu + how-to (a real game) ----
  const menuUp = await page.locator('#menu:not([hidden])').count();
  if (menuUp) {
    await openMenuEntry(page, 'menu-new');
    await ready(page, '#levels:not([hidden])');
    const tile = page.locator('#levels .level-tile, #levels .difficulty-tile').nth(2);
    if (await tile.count()) await tile.click({ force: true });
    else await page.click('#levels-back', { force: true });
    const gameUp = await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 }).then(() => true).catch(() => false);
    if (gameUp) {
      await page.waitForTimeout(2600);
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.click('#hud-menu', { force: true }).catch(() => undefined);
        const up = await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 4_000 }).then(() => true).catch(() => false);
        if (up) break;
      }
      const pauseUp = await page.locator('#sheet-menu:not([hidden])').count() > 0;
      if (pauseUp) {
        await shootClipped(page, 'pause', vp.key);
        await record({
          name: 'pause menu',
          root: '#sheet-menu',
          column: '#sheet-menu .sheet-body',
          heading: '#sheet-menu h2',
          buttons: ['#gm-resume', '#gm-new', '#gm-howto', '#gm-settings', '#gm-main'],
        });
        // "How to play" from the pause menu opens the moves reference: the Match Intel glass panel
        // (its own surface), or the plain sheet when the intel route is off.
        await page.click('#gm-howto', { force: true });
        const glassUp = await page.waitForSelector('#futasaku-glass[data-mode="intel"]:not([hidden])', { timeout: 6_000 }).then(() => true).catch(() => false);
        const sheetUp = glassUp ? false : await page.waitForSelector('#sheet-howto:not([hidden])', { timeout: 4_000 }).then(() => true).catch(() => false);
        if (sheetUp) {
          await shootClipped(page, 'howto', vp.key);
          await record({ name: 'how to play sheet', root: '#sheet-howto', column: '#sheet-howto .sheet-body', heading: '#sheet-howto h2', buttons: [] });
        } else if (glassUp) {
          await shootClipped(page, 'howto-intel', vp.key);
          await record({ name: 'how to play (Match Intel glass)', root: '#futasaku-glass[data-mode="intel"]', column: '#futasaku-glass[data-mode="intel"] .glass-panel, #futasaku-glass[data-mode="intel"]', heading: '#futasaku-glass[data-mode="intel"] h2', buttons: [] });
        } else notes.push(`${vp.key}: the moves reference did not open`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      } else notes.push(`${vp.key}: pause menu did not open`);
      // The live-duel HUD strip (static markup). The challenge pop-up / Go-live pill / end window
      // are injected by the live layer only with a server session, so they are audited in source
      // (docs/screens/menus/audit-*.md notes) rather than rendered here.
      await page.evaluate(() => {
        const el = document.getElementById('duel-hud');
        if (el) el.hidden = false;
        document.querySelectorAll('#duel-hud [data-duel-presence]').forEach((n) => n.setAttribute('data-presence', 'online'));
      });
      await page.waitForTimeout(250);
      await shootClipped(page, 'duel-hud', vp.key);
      await record({
        name: 'live duel HUD strip',
        root: '#duel-hud',
        column: '#duel-hud',
        heading: '#duel-hud [data-duel-turn]',
        buttons: [],
      });
    } else notes.push(`${vp.key}: offline game did not start`);
  }

  // ---- 8. Install invitation (the only install surface — the menu has no install row any more) ----
  await page.evaluate(() => {
    for (const id of ['game', 'levels', 'online-hub', 'online-waiting', 'online-join']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    const menu = document.getElementById('menu'); if (menu) menu.hidden = false;
    (window as unknown as { __severgrow?: { showInstall?: () => void } }).__severgrow?.showInstall?.();
  });
  const installUp = await page.waitForSelector('#install-prompt:not([hidden])', { timeout: 6_000 }).then(() => true).catch(() => false);
  if (installUp) {
    await shootClipped(page, 'install', vp.key);
    await record({
      name: 'install invitation sheet',
      root: '#install-prompt .install-sheet',
      column: '#install-prompt .sheet-body',
      heading: '#install-prompt h2',
      buttons: ['#install-accept', '#install-later', '#install-never'],
    });
    await page.keyboard.press('Escape');
  } else notes.push(`${vp.key}: install invitation did not open`);

  await page.close();
}

await browser.close();
await server.close();

notes.unshift(
  'General: the live-duel challenge pop-up, the "Real time" pill and the end window are injected only when a live server session exists, so they are not rendered here; their tokens are audited from source (web/src/online/live/ui.ts, web/src/online/online-css.ts) in the report.',
);
writeFileSync(`${OUT}audit-${LABEL}.json`, JSON.stringify({ label: LABEL, notes, results }, null, 2));

// ---- Markdown table, one row per (surface, viewport) ----
const r1 = (n: number | null | undefined) => (n == null ? '–' : `${n}`);
const rows: string[] = [];
for (const r of results) {
  const d = r.data;
  const c = d.column ?? {};
  const hs = d.heading ?? {};
  const btns = (d.buttons ?? [])
    .filter((b: any) => b.present)
    .map((b: any) => `${b.sel.replace(/^#/, '').replace(/^#online-/, '')}:${r1(b.h)}${b.radius != null ? `r${r1(b.radius)}` : ''}`)
    .join(' ');
  const head = hs.fontSize ? `${hs.fontSize}/${r1(hs.lineHeight)}/${r1(hs.letterSpacing)} ${hs.weight ?? ''} ${hs.text ? `"${hs.text}"` : ''}` : '–';
  rows.push(
    `| ${r.surface} | ${r.viewport} | ${r1(c.w)} | ${r1(c.padTop)} / ${r1(c.padBottom)} | ${r1(c.gap)} | ${c.centreOffset != null ? (c.centreOffset > 0 ? '+' : '') + c.centreOffset : '–'} | ${head} | ${d.titleToButtons ?? '–'} | ${btns} | ${d.columnOverflow ?? '–'} |`,
  );
}
const md = `# Menu audit (${LABEL})

Every value is measured from \`getComputedStyle\` / \`getBoundingClientRect\` on the built \`web/dist\`
(CHANNEL=futa05), not read off the CSS source. Column width is in px; padding and gap are the
column's own; centre offset is the column centre minus the viewport centre (0 = centred); heading
is font-size/line-height/letter-spacing (+ weight and text) in px; \`wordmark→buttons\` is the
main-menu wordmark's bottom to the buttons block's top; buttons list \`height\` (+ radius \`r\`) for
each visible control; overflow is column scrollHeight − clientHeight (0 = nothing to scroll).

| surface | viewport | column w | pad T/B | gap | centre | heading fs/lh/ls weight "text" | wordmark→buttons | buttons (h/r) | overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

${notes.length ? `## Notes\n\n${notes.map((n) => `- ${n}`).join('\n')}\n` : ''}`;
writeFileSync(`${OUT}audit-${LABEL}.md`, md);
console.log(md);
console.log(`\nmenu audit (${LABEL}) written: ${results.length} surface/viewport rows, ${VIEWPORTS.length} screenshots`);
