// Phase 4 — menu/lobby smoke (no API URL → Play online stays hidden; offline path intact).
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/online-lobby-check.ts
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { MENU, ONLINE } from '../../src/strings.js';
import { openMenuEntry } from './helpers/menu-nav.js';

// A FREE port (helpers/preview-port.ts): two concurrent runs can never collide.
const { server, url: BASE } = await servePreview(4201, { logLevel: 'silent' });
const browser = await chromium.launch(
  process.env.PW_CHROMIUM
    ? { executablePath: process.env.PW_CHROMIUM }
    : {
        executablePath:
          '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      },
);

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      'main2:severgrow.settings.v1',
      JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true }),
    );
  });
  await page.goto(BASE);
  await page.waitForSelector('#menu:not([hidden])');
  // The owner removed the menu tagline on 2026-10-14 (it read as clutter under the wordmark). The
  // words are deliberately KEPT and the element is rebuilt on demand, so this asserts every half of
  // that decision: the string is still available, the menu carries NO tagline element (removed, not
  // a hidden placeholder), nothing sits in its old slot, and its removal left no empty gap. (This
  // replaced the old `check('tagline is GROW · CONNECT · CONQUER', ...)` which only asserted the
  // text was present.)
  check('the tagline string is still available to re-enable', ONLINE.tagline === 'GROW · CONNECT · CONQUER', ONLINE.tagline);
  // The DELETED tagline must leave no trace (no hidden placeholder, no leftovers). The deliberate
  // beta line reuses the `tagline` class (`web/src/feedback/mount.ts`), so it is excluded by
  // id: this check still fails on an unremoved or half-removed `#menu-tagline`.
  check('the removed tagline element is gone (not a hidden placeholder)',
    (await page.locator('#menu .tagline:not(#menu-beta), #menu-tagline').count()) === 0);
  // The beta line is added by a late dynamic import (`web/src/feedback/mount.ts`, mounted
  // unconditionally from main.ts). Wait for the menu to settle before measuring the slot, so this
  // reads the finished menu rather than a boot transient (the accounts suites wait the same way).
  await page.waitForSelector('#menu-beta', { timeout: 10_000 }).catch(() => undefined);
  const menuColumn = await page.evaluate(() => {
    // No named inner functions here on purpose: tsx/esbuild rewrites them with a `__name` helper
    // that does not exist in the page.
    const inner = document.querySelector('#menu .menu-inner')!;
    const title = document.querySelector('#menu .title') as HTMLElement;
    const buttons = document.querySelector('#menu .menu-buttons') as HTMLElement;
    const kids = [...inner.children];
    const slot = kids.slice(kids.indexOf(title) + 1, kids.indexOf(buttons)).map((k) => {
      const rect = k.getBoundingClientRect();
      const style = getComputedStyle(k);
      return {
        id: k.id || String(k.className),
        h: +rect.height.toFixed(1),
        mt: Number.parseFloat(style.marginTop) || 0,
        mb: Number.parseFloat(style.marginBottom) || 0,
        // A real element: painted AND carrying words. A hidden or empty leftover is not.
        visible: rect.width > 1 && rect.height > 1 && !k.closest('[hidden]'),
        text: (k.textContent ?? '').replace(/\s+/g, ' ').trim(),
      };
    });
    const rowGap = Number.parseFloat(getComputedStyle(inner).rowGap) || 0;
    const buttonsMarginTop = Number.parseFloat(getComputedStyle(buttons).marginTop) || 0;
    return {
      slot,
      rowGap,
      span: +(buttons.getBoundingClientRect().top - title.getBoundingClientRect().bottom).toFixed(1),
      // Every pixel of the span, accounted for: the column's own gap between each pair, the
      // slotted elements' margin boxes, and the sibling margin the buttons carry when the slot
      // is empty (the `2 × rhythm` head gap the removed tagline was meant to leave behind).
      expected: +(
        rowGap * (slot.length + 1) +
        slot.reduce((n, s) => n + s.mt + s.h + s.mb, 0) +
        buttonsMarginTop
      ).toFixed(1),
    };
  });
  // The owner removed the tagline on 2026-10-14 and ruled on 2026-10-15 that the beta line
  // KEEPS its place between the wordmark and the buttons. So the rule is not "nothing may sit
  // there": it is "nothing DEAD sits there, and no pixel is unexplained". This still fails on an
  // unremoved tagline, a hidden placeholder or a leftover empty row.
  const dead = menuColumn.slot.filter((s) => !s.visible || s.text.length === 0);
  check('anything between the wordmark and the buttons is a real, visible, non-empty element',
    dead.length === 0, menuColumn.slot.map((s) => `${s.id} ${s.visible ? 'visible' : 'HIDDEN'} "${s.text.slice(0, 30)}"`).join(' | ') || 'slot empty');
  // The deliberate beta line is a real feature, not a leftover: assert it is the thing in the slot.
  check('the deliberate beta line is the element in that slot',
    menuColumn.slot.some((s) => s.id === 'menu-beta' && s.visible && s.text.length > 0),
    menuColumn.slot.map((s) => s.id).join(' | ') || 'slot empty');
  // No void: the wordmark stands the column rhythm from whatever sits in the slot, and the span
  // is exactly the slot's own height + margins — nothing more. (With an empty slot this reduces to
  // the 2 × rhythm head gap, 28px.)
  check('the wordmark → buttons span holds no unexplained gap (no void where the tagline was)',
    Math.abs(menuColumn.span - menuColumn.expected) <= 1,
    `span ${menuColumn.span}px vs explained ${menuColumn.expected}px [rhythm ${menuColumn.rowGap}px, slot ${menuColumn.slot.map((s) => `${s.id} h${s.h}`).join(', ') || 'empty'}]`);
  check('title is FUTASAKU', ((await page.locator('#menu .title').textContent()) ?? '').toUpperCase().includes('FUTASAKU'));
  // `#menu-online` carries the `hidden` attribute when the build has no duel endpoint (main.ts).
  // Read the attribute, not isHidden(): the entry also sits inside the (hidden) PLAY submenu now,
  // so a plain isHidden() would be true on every build and the check would be hollow.
  check('Play online hidden without API URL', (await page.locator('#menu-online').getAttribute('hidden')) !== null);
  // The offline entry now lives behind the PLAY doorway and reads "Practice match" on the product menu
  // (main.ts sets MENU.training); reach it the way a player does, and keep proving the path works.
  check('the offline entry keeps the product word', ((await page.locator('#menu-new').textContent()) ?? '').trim() === MENU.training);
  await openMenuEntry(page, 'menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 8000 });
  check('the offline entry opens the difficulty picker', true);
  await page.click('#levels-back');
  await page.waitForSelector('#menu:not([hidden])');
  check('back to menu', true);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
if (failed) {
  console.error(`${failed} lobby checks failed`);
  process.exit(1);
}
console.log('online lobby checks passed');
