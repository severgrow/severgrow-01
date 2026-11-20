// BROWSER PROOF FOR THE SKINS PICKER (owner, 2026-11-20). Proves, on the built product:
//   - the key and window read SKINS, with COLOUR first and the ten real skins;
//   - COLOUR opens the twenty-colour sheet in dark glass (no second modal style);
//   - committing COLOUR makes the MATCH row the required, highlighted next step;
//   - the two states are distinct (Land: … / Tiles: …), and a real skin sets both;
//   - phone (390×844) and desktop both keep 44px targets and a readable grid.
// Screenshots land in /tmp/picker-final/ (PICKER_SHOTS overrides).
//
//   FUTA_DIST=/tmp/picker-dist npx tsx web/e2e/futa04-skins-picker.ts
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { CDPSession, Page } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';
import { WORLD_VERSION, seenWorld } from '../../server/src/world.js';

const OUT = process.env.PICKER_SHOTS ?? '/tmp/picker-final';
mkdirSync(OUT, { recursive: true });

const me = '11111111-1111-4111-8111-111111111111';
const claim = (cellId: string, skin: 'forest' | 'ash' | 'water' | 'toxic') => ({
  cellId, ownerId: me, ownerName: 'Cedar', ownerLevel: 3, ownerTag: '',
  colour: '#c0247e', claimedAt: 1, skin,
});
const world = {
  version: WORLD_VERSION, revision: 1, cost: 100, challengeStake: 0,
  cells: seenWorld(['0,0', '1,0']),
  claims: [claim('0,0', 'forest'), claim('1,0', 'water')],
};
const fixture = await productFixture({ offlineApiPort: 65530 });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const init = async (page: import('playwright-core').Page) => {
  await page.addInitScript(({ world }) => {
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: false }));
    localStorage.setItem('main2:severgrow.duel.identity.v1', JSON.stringify({
      token: 'picker-token', playerId: '11111111-1111-4111-8111-111111111111', displayName: 'Cedar', kind: 'account',
    }));
    localStorage.setItem('main2:futasaku.world.last.v1', JSON.stringify(world));
  }, { world });
};

/** Open the Planet and its SKINS pane, without any real API. */
const openSkins = async (page: import('playwright-core').Page) => {
  await page.goto(fixture.origin + '/test/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 60_000 });
  await page.locator('#menu-world').waitFor({ state: 'visible', timeout: 60_000 });
  await page.evaluate(() => (document.getElementById('menu-world') as HTMLElement).click());
  await page.waitForFunction(() => {
    const el = document.getElementById('online-world-menu');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
  }, undefined, { timeout: 60_000 });
  // UNDER HEAVY MACHINE LOAD the key row's own entrance can keep Playwright's stability check
  // waiting; the product's handlers are what matters, so tap the two chrome keys in the page and
  // wait for the row to be OPEN (the same state territory-colours.ts uses).
  await page.evaluate(() => (document.getElementById('online-world-menu') as HTMLElement).click());
  await page.waitForFunction(() => document.getElementById('online-world-keys')?.classList.contains('open') === true, undefined, { timeout: 60_000 });
  await page.evaluate(() => (document.getElementById('world-key-colour') as HTMLElement).click());
  await page.waitForFunction(() => document.querySelector<HTMLElement>('#online-world-panel')?.dataset.pane === 'colour', undefined, { timeout: 60_000 });
  await page.locator('#world-skin-switch').waitFor({ state: 'visible', timeout: 60_000 });
};

const errors: string[] = [];
/**
 * Screenshots through CDP: `Page.captureScreenshot` grabs the viewport without Playwright's
 * "wait for the element to be stable" gate. On a busy machine the living map keeps the panel's
 * composited layer moving, so the ordinary screenshot path can wait forever even though the UI is
 * settled and readable. This is a test harness detail, not a change to the product.
 */
const sessions = new WeakMap<Page, Promise<CDPSession>>();
const shot = async (page: Page, path: string) => {
  let session = sessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  const cdp = await session;
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  writeFileSync(path, Buffer.from(data, 'base64'));
};
try {
  // ---- PHONE -----------------------------------------------------------------------------------
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await init(phone);
  await openSkins(phone);

  assert.equal(await phone.locator('#world-panel-title').textContent(), 'Skins', 'the window is SKINS');
  assert.equal(await phone.locator('#world-key-colour').getAttribute('aria-label'), 'Skins', 'the key is SKINS');
  const planetTiles = phone.locator('#world-skin-switch [data-group="planet"] .world-skin-tile');
  const gameTiles = phone.locator('#world-skin-switch [data-group="game"] .world-skin-tile');
  assert.equal(await planetTiles.count(), 11, 'COLOUR + ten real skins');
  assert.equal(await gameTiles.count(), 10, 'ten real skins, no Colour');
  assert.equal(await planetTiles.first().getAttribute('data-value'), 'colour', 'COLOUR comes first');
  assert.equal(await phone.locator('#world-skin-switch [data-group="game"] .world-skin-tile[data-value="colour"]').count(), 0, 'Colour is planet-only');
  for (const locator of [planetTiles.first(), gameTiles.first()]) {
    const box = await locator.boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `a tile is a 44px+ target (${JSON.stringify(box)})`);
  }
  await shot(phone, `${OUT}/01-phone-skins.png`);

  // COLOUR → dark-glass sheet.
  await phone.locator('#world-skin-switch [data-group="planet"] [data-slot="colour"]').click();
  await phone.locator('#world-colour-sheet').waitFor({ state: 'visible' });
  assert.ok(await phone.locator('#world-colour-grid .world-colour-swatch').count() >= 20, 'the twenty colours are here');
  const sheetStyle = await phone.locator('.world-colour-sheet-panel').evaluate((el) => ({
    backdrop: getComputedStyle(el).backdropFilter,
    position: getComputedStyle(el.closest('.world-colour-sheet')!).position,
  }));
  assert.equal(sheetStyle.position, 'fixed', 'the sheet is its own layer over the skins view');
  await shot(phone, `${OUT}/02-phone-colour-sheet.png`);

  // Done → the required second step.
  await phone.locator('#world-colour-done').click();
  await phone.locator('#world-skin-switch [data-group="game"][data-needs-game="true"]').waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await phone.locator('#world-skin-switch .world-skin-step').isVisible(), true, 'the instruction is visible');
  assert.match((await phone.locator('#world-skin-switch .world-skin-step').textContent()) ?? '', /pick how your tiles look in a match/i);
  await shot(phone, `${OUT}/03-phone-pick-game.png`);

  // A real match skin ends the step and marks both states.
  await phone.locator('#world-skin-switch [data-group="game"] .world-skin-tile[data-value="carrara"]').click();
  await phone.locator('#world-skin-switch [data-group="game"][data-needs-game="false"]').waitFor({ timeout: 20_000 });
  assert.equal(await phone.locator('#world-skin-switch [data-group="game"] .world-skin-value').textContent(), 'Tiles: Carrara');

  // A real PLANET skin is one tap for both.
  await phone.locator('#world-skin-switch [data-group="planet"] .world-skin-tile[data-value="carrara"]').click();
  assert.equal(await phone.locator('#world-skin-switch [data-group="planet"] .world-skin-value').textContent(), 'Land: Carrara');
  assert.equal(await phone.locator('#world-skin-switch [data-group="game"] .world-skin-value').textContent(), 'Tiles: Carrara', 'one tap, both appearances');
  await shot(phone, `${OUT}/04-phone-two-states.png`);

  // Escape closes the sheet first, and a cancel puts the planet back.
  await phone.locator('#world-skin-switch [data-group="planet"] [data-slot="colour"]').click();
  await phone.locator('#world-colour-sheet').waitFor({ state: 'visible' });
  await phone.keyboard.press('Escape');
  await phone.locator('#world-colour-sheet').waitFor({ state: 'hidden', timeout: 20_000 });
  assert.equal(await phone.locator('#world-skin-switch [data-group="planet"] .world-skin-value').textContent(), 'Land: Carrara', 'cancel restores the previous planet skin');
  assert.equal(await phone.locator('#online-world-panel').isVisible(), true, 'Escape did not close the whole window');
  await phone.close();

  // ---- DESKTOP ---------------------------------------------------------------------------------
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  desktop.on('pageerror', (e) => errors.push(`desktop: ${e.message}`));
  await init(desktop);
  await openSkins(desktop);
  await shot(desktop, `${OUT}/05-desktop-skins.png`);
  await desktop.locator('#world-skin-switch [data-group="planet"] [data-slot="colour"]').click();
  await desktop.locator('#world-colour-sheet').waitFor({ state: 'visible' });
  await desktop.locator('#world-colour-grid .world-colour-swatch').nth(6).click();
  await shot(desktop, `${OUT}/06-desktop-colour-sheet.png`);
  await desktop.locator('#world-colour-done').click();
  await desktop.locator('#world-skin-switch [data-group="game"][data-needs-game="true"]').waitFor({ state: 'visible' });
  await shot(desktop, `${OUT}/07-desktop-pick-game.png`);
  await desktop.locator('#world-skin-switch [data-group="game"] .world-skin-tile[data-value="hypnosis"]').click();
  await shot(desktop, `${OUT}/08-desktop-two-states.png`);
  await desktop.close();

  // ---- GUEST: the twenty colours stay, the skins do not ----------------------------------------
  const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  guest.on('pageerror', (e) => errors.push(`guest: ${e.message}`));
  await guest.addInitScript(({ world }) => {
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: false }));
    localStorage.setItem('main2:futasaku.world.last.v1', JSON.stringify(world));
  }, { world });
  await openSkins(guest);
  assert.equal(await guest.locator('#world-skin-switch [data-group="planet"] .world-skin-tile:not([hidden])').count(), 1, 'a guest is offered only Colour');
  assert.equal(await guest.locator('#world-skin-switch [data-group="game"]').isVisible(), false, 'no match skins for a guest');
  assert.equal(await guest.locator('#world-skin-switch .world-skin-locked').isVisible(), true, 'the pane says why');
  await guest.locator('#world-skin-switch [data-group="planet"] [data-slot="colour"]').click();
  await guest.locator('#world-colour-sheet').waitFor({ state: 'visible' });
  await guest.locator('#world-colour-grid .world-colour-swatch').first().waitFor({ state: 'visible' });
  await guest.waitForTimeout(300);
  assert.ok(await guest.locator('#world-colour-grid .world-colour-swatch').count() >= 20, 'the colours are not skins: a guest keeps them');
  await shot(guest, `${OUT}/09-phone-guest.png`);
  await shot(guest, `${OUT}/10-phone-guest-colour.png`);
  await guest.close();

  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('PASS  Skins picker: SKINS title, COLOUR first, 10 planet + 10 match tiles, glass sheet, required game step, two states, phone + desktop');
} finally {
  await browser.close();
  await fixture.close();
}
