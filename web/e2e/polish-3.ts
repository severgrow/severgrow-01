// FUTASAKU 0.6 — the last four polish items, measured on the built page.
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 npm run web:build
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     npx tsx web/e2e/polish-3.ts --dist=web/dist
//
// 1. Settings choices: every visible choice control is at least 44px. The sheet's own overflow is
//    printed with it (the 320 sheet was already far past one screen before this change — see the
//    report; raising a control cannot remove content).
// 2. Undo: the disabled label's contrast is read from RENDERED PIXELS (screenshot → canvas), not
//    from CSS arithmetic. It must stay legible (≥ 3:1) and be unmistakably below the live key.
// 4. Hand cards: every card at 320x568 and 360x640 is ≥ 44px wide, the draw pile and throw pile are
//    fully on screen and no card covers either.
// 5. Closing Settings returns to the surface that opened it (main menu | pause panel) and puts the
//    keyboard back on that surface's own key.
//
// Item 3 (the lobby double-submit guard) is proved without a browser in
// web/tests/lobby-action-guard.test.ts.
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { serveStaticDist } from './helpers/preview-port.js';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const { server, url: BASE } = await serveStaticDist(DIST);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const note = (line: string) => console.log(`  --  ${line}`);

const pageFor = async (w: number, h: number): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  // tsx wraps the suite's functions with a `__name` helper that only exists in Node.
  await page.addInitScript(() => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
  });
  return page;
};

const openMenu = async (page: Page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(400);
};

const openSettings = async (page: Page) => {
  await openMenu(page);
  await page.click('#menu-settings');
  await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(250);
};

/** A product offline match: PLAY → Practice match → a level tile. */
const startGame = async (page: Page) => {
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 15_000 });
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 15_000 });
  await page.waitForTimeout(300);
  await page.locator('#levels .level-tile, #levels .difficulty-tile').nth(1).click({ force: true });
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForTimeout(2200);
};

/**
 * WAIT FOR THE DOCK TO SETTLE, do not race it (2026-10-21, flake). The first run of this suite
 * measured the piles mid-settle: one run saw them at 58.3x112 and the next at 50x96, and that
 * transient was enough to report "a card covers the discard" once and never again. The pile boxes
 * are derived from a dock CSS variable the layout writes after the deal, so a fixed timeout is a
 * guess; three identical samples in a row is the honest signal that the layout has stopped moving.
 * This is a readiness gate, NOT a weaker assertion: everything below is unchanged.
 */
const settledDock = async (page: Page) => {
  const read = () => page.evaluate(() => {
    const box = (id: string) => {
      const r = document.getElementById(id)!.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(',');
    };
    return `${box('deck')}|${box('discard')}|${document.querySelectorAll('#hand [data-card]').length}|${getComputedStyle(document.documentElement).getPropertyValue('--cw').trim()}`;
  });
  let last = await read();
  let stable = 0;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(120);
    const now = await read();
    stable = now === last ? stable + 1 : 0;
    last = now;
    if (stable >= 3) return;
  }
};

/** WCAG contrast of the brightest label pixel against the control's own face. */
const pixelContrast = async (page: Page, selector: string) => {
  const shot = await page.locator(selector).screenshot({ animations: 'disabled' });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const lin = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum: number[] = [];
    // Only the central half of the key: the icon lives there, and the hardware frame's own
    // highlight at the edge must not be mistaken for the label's ink.
    for (let y = Math.floor(canvas.height * 0.25); y < Math.ceil(canvas.height * 0.75); y++) {
      for (let x = Math.floor(canvas.width * 0.25); x < Math.ceil(canvas.width * 0.75); x++) {
        const i = (y * canvas.width + x) * 4;
        lum.push(0.2126 * lin(data[i]!) + 0.7152 * lin(data[i + 1]!) + 0.0722 * lin(data[i + 2]!));
      }
    }
    lum.sort((a, b) => a - b);
    // The median is the key's face; the 99.5th percentile is the label's own ink (the glyph is a
    // thin stroke, so a single max pixel would reward antialiasing noise).
    const face = lum[Math.floor(lum.length * 0.5)]!;
    const ink = lum[Math.floor(lum.length * 0.995)]!;
    return { face: +face.toFixed(4), ink: +ink.toFixed(4), ratio: +((ink + 0.05) / (face + 0.05)).toFixed(2), w: img.width, h: img.height };
  }, shot.toString('base64'));
};

// ---- 1. Settings choices are 44px touch targets ------------------------------------------------
for (const [w, h] of [[320, 568], [360, 640]] as const) {
  for (const large of [false, true]) {
    const tag = `settings ${w}x${h}${large ? ' large text' : ''}`;
    const page = await pageFor(w, h);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await openSettings(page);
      if (large) await page.evaluate(() => document.documentElement.classList.add('large-text'));
      await page.waitForTimeout(250);
      const m = (await page.evaluate(() => {
        const sheet = document.getElementById('sheet-settings') as HTMLElement;
        const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;
        const h = (el: Element) => +el.getBoundingClientRect().height.toFixed(1);
        const choices = [...sheet.querySelectorAll('.seg-btn, .btn.small')].filter(visible);
        const rows = [...sheet.querySelectorAll('label.row, .row')].filter(visible);
        return {
          sheetClient: sheet.clientHeight,
          sheetScroll: sheet.scrollHeight,
          choiceHeights: choices.map(h),
          rowHeights: rows.map(h),
          segCount: [...sheet.querySelectorAll('.seg-btn')].filter(visible).length,
          smallButtonCount: [...sheet.querySelectorAll('.btn.small')].filter(visible).length,
        };
      })) as { sheetClient: number; sheetScroll: number; choiceHeights: number[]; rowHeights: number[]; segCount: number; smallButtonCount: number };
      const minChoice = Math.min(...m.choiceHeights);
      const minRow = Math.min(...m.rowHeights);
      const overflow = m.sheetScroll - m.sheetClient;
      check(`${tag}: every choice control is ≥ 44px (${m.segCount} segmented, ${m.smallButtonCount} small buttons; min ${minChoice}px)`, minChoice >= 44);
      // Switches and sliders are wrapped in a 48px row: the whole row is the target, not the 28px pill.
      check(`${tag}: switch/slider rows stay full-height targets (min ${minRow}px)`, minRow >= 44);
      note(`${tag}: panel ${m.sheetClient}px client / ${m.sheetScroll}px content (${overflow}px scroll); choices ${m.choiceHeights[0]}px`);
      check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    } finally {
      await page.close();
    }
  }
}

// ---- 2. Undo: the disabled label is unmistakably quieter, and still legible ---------------------
{
  const page = await pageFor(360, 640);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await openMenu(page);
    await startGame(page);
    const natural = await page.evaluate(() => {
      const u = document.getElementById('tool-undo') as HTMLButtonElement;
      return { disabled: u.disabled, ariaDisabled: u.getAttribute('aria-disabled') };
    });
    // Force the disabled state whether or not this opening position happens to offer a replay.
    // The page re-renders this slot (it is the same control Undo/Replay share), so hold it disabled
    // with an observer while the measurement runs; otherwise the screenshot can catch a re-render.
    await page.evaluate(() => {
      const u = document.getElementById('tool-undo') as HTMLButtonElement;
      u.disabled = true;
      const w = window as unknown as { __undoHold?: MutationObserver };
      w.__undoHold = new MutationObserver(() => {
        if (!u.disabled) u.disabled = true;
      });
      w.__undoHold.observe(u, { attributes: true, attributeFilter: ['disabled'] });
    });
    await page.waitForTimeout(250);
    const off = await pixelContrast(page, '#tool-undo');
    const semantics = await page.evaluate(() => {
      const u = document.getElementById('tool-undo') as HTMLButtonElement;
      return { disabled: u.disabled, attribute: u.hasAttribute('disabled') };
    });
    check('undo: the disabled control keeps its real disabled semantics', semantics.disabled && semantics.attribute);
    check(
      `undo: the disabled label is still legible at the non-text floor (${off.ratio}:1 ≥ 3:1)`,
      off.ratio >= 3.0,
      `face L=${off.face}, ink L=${off.ink}`,
    );
    // Now hold it ENABLED for the same measurement. The page's own re-render may want it disabled
    // at this opening position, so the observer goes the other way.
    await page.evaluate(() => {
      const u = document.getElementById('tool-undo') as HTMLButtonElement;
      const w = window as unknown as { __undoHold?: MutationObserver };
      w.__undoHold?.disconnect();
      u.disabled = false;
      w.__undoHold = new MutationObserver(() => {
        if (u.disabled) u.disabled = false;
      });
      w.__undoHold.observe(u, { attributes: true, attributeFilter: ['disabled'] });
    });
    await page.waitForTimeout(250);
    const on = await pixelContrast(page, '#tool-undo');
    check(`undo: the live label is clearly stronger (${on.ratio}:1)`, on.ratio >= 8);
    check(
      `undo: disabled vs live is unmistakable (${off.ratio}:1 vs ${on.ratio}:1, ×${(on.ratio / off.ratio).toFixed(1)})`,
      on.ratio / off.ratio >= 2.5,
    );
    note(`undo 360x640: disabled ${off.ratio}:1, enabled ${on.ratio}:1 (natural state was ${natural.disabled ? 'disabled' : 'enabled'}, aria-disabled ${natural.ariaDisabled ?? 'unset'}); captured ${off.w}x${off.h}px`);
    check('undo: no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await page.close();
  }
}

// ---- 4. Hand cards: 44px+ on the small phones, piles untouched ----------------------------------
for (const [w, h] of [[320, 568], [360, 640]] as const) {
  const tag = `hand ${w}x${h}`;
  const page = await pageFor(w, h);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await openMenu(page);
    await startGame(page);
    // The piles are sized from a dock variable the layout writes after the deal; measure once it
    // has stopped moving (see `settledDock`).
    await settledDock(page);
    const m = (await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>('#hand [data-card]')];
      const rect = (el: Element) => el.getBoundingClientRect();
      const piles = ['deck', 'discard'].map((id) => {
        const el = document.getElementById(id)!;
        const r = rect(el);
        const meta = el.querySelector<HTMLElement>('.pile-meta')!;
        // A 3x3 sample INSIDE the pile: elementFromPoint accounts for the cards' rotation and
        // clipping, unlike a bounding-box intersection (a tilted card's corner box is not its ink).
        let covered = 0;
        // With the hit points recorded: a failure must say WHERE it was hit and by which card,
        // otherwise the next reader cannot tell a real overlap from a measuring mistake.
        const hits: string[] = [];
        for (const fx of [0.15, 0.5, 0.85]) {
          for (const fy of [0.2, 0.5, 0.8]) {
            const top = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
            const card = top?.closest('#hand [data-card]');
            if (card) { covered++; hits.push(`${fx}/${fy}=${card.getAttribute('data-card') ?? 'card'}`); }
          }
        }
        return {
          id,
          box: { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
          onScreen: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
          covered,
          hits,
          labelClipped: meta.scrollWidth > meta.clientWidth + 1,
        };
      });
      const cardRects = cards.map((c) => {
        const r = rect(c);
        return { l: +r.left.toFixed(1), r: +r.right.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1) };
      });
      // The fan's own centre: --fx is the card's centre on the arc. A rotated card's bounding box
      // is not centred on that point, so measuring the DOM rects would report a false offset.
      const dockLeft = document.getElementById('dock')!.getBoundingClientRect().left;
      const centres = cards.map((c) => dockLeft + parseFloat(c.style.getPropertyValue('--fx')));
      const centre = centres.reduce((sum, x) => sum + x, 0) / centres.length;
      return {
        n: cards.length,
        widths: cards.map((c) => c.offsetWidth),
        rectWidths: cardRects.map((r) => r.w),
        cw: getComputedStyle(document.documentElement).getPropertyValue('--cw').trim(),
        piles,
        centreOffset: +(centre - innerWidth / 2).toFixed(1),
      };
    })) as {
      n: number;
      widths: number[];
      rectWidths: number[];
      cw: string;
      piles: { id: string; onScreen: boolean; covered: number; hits: string[]; labelClipped: boolean; box: { l: number; r: number; t: number; b: number; w: number; h: number } }[];
      centreOffset: number;
    };
    const minCard = Math.min(...m.widths);
    check(`${tag}: every one of ${m.n} cards is ≥ 44px (min ${minCard}px, --cw ${m.cw})`, minCard >= 44);
    check(`${tag}: the fan stays centred (${m.centreOffset}px off centre)`, Math.abs(m.centreOffset) <= 1);
    for (const p of m.piles) {
      check(`${tag}: ${p.id} is fully on screen and untruncated (${p.box.w}x${p.box.h} at ${p.box.l},${p.box.t})`, p.onScreen && !p.labelClipped);
      check(`${tag}: no card covers ${p.id}`, p.covered === 0, `${p.covered}/9 sample point(s) under a card${p.hits.length ? ` [${p.hits.join(' ')}]` : ''}`);
    }
    note(`${tag}: card widths ${m.widths.join('/')}px (transformed ${m.rectWidths.join('/')}px); piles ${m.piles.map((p) => `${p.id} ${p.box.w}x${p.box.h}`).join(', ')}`);
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await page.close();
  }
}

// ---- 5. Closing Settings returns to its opener, with focus --------------------------------------
{
  const tag = 'settings return';
  const page = await pageFor(360, 640);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    // (a) opened from the main menu → the main menu
    await openSettings(page);
    await page.click('#sheet-settings [data-close]');
    await page.waitForTimeout(250);
    const fromMenu = await page.evaluate(() => ({
      settingsHidden: document.getElementById('sheet-settings')!.hidden,
      menuVisible: !document.getElementById('menu')!.hidden,
      active: (document.activeElement as HTMLElement | null)?.id ?? null,
    }));
    check(`${tag}: from the main menu, close returns to the menu`, fromMenu.settingsHidden && fromMenu.menuVisible);
    check(`${tag}: from the main menu, focus returns to Settings (${fromMenu.active})`, fromMenu.active === 'menu-settings');

    // (b) opened from the pause panel → the pause panel, still paused
    await startGame(page);
    await page.click('#hud-menu');
    await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
    await page.click('#gm-settings');
    await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 6_000 });
    await page.click('#sheet-settings [data-close]');
    await page.waitForTimeout(250);
    const fromPause = await page.evaluate(() => ({
      settingsHidden: document.getElementById('sheet-settings')!.hidden,
      pauseVisible: !document.getElementById('sheet-menu')!.hidden,
      paused: document.body.classList.contains('paused'),
      active: (document.activeElement as HTMLElement | null)?.id ?? null,
    }));
    check(`${tag}: from pause, close returns to the pause panel`, fromPause.settingsHidden && fromPause.pauseVisible);
    check(`${tag}: from pause, the game stays paused`, fromPause.paused);
    check(`${tag}: from pause, focus returns to the pause Settings key (${fromPause.active})`, fromPause.active === 'gm-settings');

    // (c) the scrim is the second way out; it must take the same road back.
    await page.click('#gm-settings');
    await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 6_000 });
    await page.click('#scrim', { position: { x: 4, y: 4 }, force: true });
    await page.waitForTimeout(250);
    const fromScrim = await page.evaluate(() => ({
      pauseVisible: !document.getElementById('sheet-menu')!.hidden,
      active: (document.activeElement as HTMLElement | null)?.id ?? null,
    }));
    check(`${tag}: the scrim also returns to the pause panel`, fromScrim.pauseVisible);
    check(`${tag}: the scrim returns focus to the pause Settings key (${fromScrim.active})`, fromScrim.active === 'gm-settings');

    // And leaving the pause panel still goes back to the game, with focus on the menu key.
    await page.click('#gm-resume');
    await page.waitForTimeout(250);
    const resumed = await page.evaluate(() => ({
      gameVisible: !document.getElementById('game')!.hidden,
      // `hidden` is `boolean | 'until-found'` in the DOM types; either way the panel is hidden.
      pauseHidden: !!document.getElementById('sheet-menu')!.hidden,
      active: (document.activeElement as HTMLElement | null)?.id ?? null,
    }));
    check(`${tag}: closing the pause panel still returns to the game`, resumed.gameVisible && resumed.pauseHidden);
    check(`${tag}: the pause panel's own opener keeps its focus (${resumed.active})`, resumed.active === 'hud-menu');
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
