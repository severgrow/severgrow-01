// THE TERRITORY TILE BAR AS ICON KEYS, AND A RIVAL'S PROFILE (owner, 2026-11-01):
//   "grow a tile/challenge/sell a tile/see profile etc in territory should be all icons in buttons
//    rather than text buttons. use profile section we have and allow to look up other peoples
//    profile on territory. make it really well and polished and excelent deisgned"
//
// A real economy (memory) behind the real HTTP app, and a signed-in identity, so the profile read
// is the SAME allow-listed endpoint the product uses. Two phone widths are measured, because the
// bar can carry TWO keys on a rival's tile (challenge + profile) and must never overflow at 320.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx tsx web/e2e/territory-icons.ts
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { ONLINE, PROFILE } from '../../src/strings.js';
import { playerTag } from '../../src/player-tag.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { chainRouters } from '../../server/src/feedback/feedback.js';
import { createHttpServer } from '../../server/src/http.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? '/tmp';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---- the world: me at -2,-4, a rival BESIDE me (so its tile offers challenge + profile) ---------
const storage = new MemoryStorage();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const store = new MemoryWorldEconomyStore(storage);
const economy = new WorldEconomyService(store, storage);
const service = new MatchService({ storage, config, economy });
const api = createHttpServer({
  service,
  config,
  live: chainRouters(createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) })),
});
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

const guestOf = async () => (await (await fetch(`${apiBase}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()) as { token: string; player: { id: string; displayName: string | null; kind: string } };
const fund = (playerId: string, n: number) => store.adminAdjustSeeds({ playerId, delta: n * 100, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${n}`, now: Date.now() });

const rival = await guestOf();
await fund(rival.player.id, 2);
// -1,-4 shares a side with my own -2,-4: challenge is offered there. 3,-6 is another of theirs.
await store.claim(rival.player.id, '-1,-4', 'rival-adjacent', Date.now() - 60_000);
await store.claim(rival.player.id, '3,-6', 'rival-far', Date.now() - 30_000);
// Their public profile has a level and a chosen colour, so the visitor view has real facts to show.
store.receipts.set('campaign:c1-7', {
  input: { playerId: rival.player.id, sourceKey: 'campaign:c1-7', mode: 'campaign', outcome: 'win', opponentId: null, now: Date.now() - 1 },
  awarded: 50,
  reason: null,
});
store.colours.set(rival.player.id, 4);
const rivalTag = playerTag(rival.player.id);

const me = await guestOf();
await fund(me.player.id, 3);
await store.claim(me.player.id, '-2,-4', 'icons-owned', Date.now());
await store.acknowledgeInvitation(me.player.id);
const identity = JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: 'account' });
const account = JSON.stringify({ provider: 'email', email: null, playerId: me.player.id });

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env, CHANNEL: 'futa04', VITE_DUEL_API_URL: apiBase,
      VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key', VITE_ACCOUNTS: 'on',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += String(d)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err}`))));
});
const web = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';

const keys = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('#online-world-selection .world-claim-button')].map((key) => {
  const r = key.getBoundingClientRect();
  return {
    label: key.getAttribute('aria-label'), title: key.title, action: key.dataset.action ?? '',
    text: (key.textContent ?? '').trim(), icon: !!key.querySelector('svg.world-key-icon'),
    w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: Math.round(r.top),
  };
}));
const barBox = (p: Page) => p.evaluate(() => {
  const bar = document.getElementById('online-world-selection')!;
  const r = bar.getBoundingClientRect();
  return {
    hidden: bar.hidden, scrollW: bar.scrollWidth, clientW: bar.clientWidth,
    left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
    vw: innerWidth, vh: innerHeight,
  };
});
const select = async (p: Page, cellId: string) => {
  await p.focus(`.world-hex[data-cell-id="${cellId}"]`);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
};
const sheetState = (p: Page) => p.evaluate(() => {
  const sheet = document.getElementById('sheet-profile')!;
  // No helper functions here on purpose: the e2e runner's transform names assigned arrows with a
  // `__name` helper that does not exist inside the page, so each row is read inline.
  const seeds = document.getElementById('profile-seeds')?.closest('.sp-row, .sp-play-row') as HTMLElement | null;
  const wins = document.getElementById('profile-wins')?.closest('.sp-row, .sp-play-row') as HTMLElement | null;
  const offline = document.getElementById('profile-play-offline')?.closest('.sp-row, .sp-play-row') as HTMLElement | null;
  const online = document.getElementById('profile-play-online')?.closest('.sp-row, .sp-play-row') as HTMLElement | null;
  return {
    hidden: sheet.hidden, mode: sheet.dataset.mode ?? '',
    name: document.getElementById('profile-name')?.textContent ?? '',
    level: document.getElementById('profile-level')?.textContent ?? '',
    levelHidden: document.getElementById('profile-level')?.hidden ?? true,
    hex: document.getElementById('profile-colour-hex')?.textContent ?? '',
    hexHidden: document.getElementById('profile-colour-hex')?.hidden ?? true,
    tiles: document.getElementById('profile-tiles')?.textContent ?? '',
    seedsShown: seeds ? getComputedStyle(seeds).display !== 'none' : false,
    winsShown: wins ? getComputedStyle(wins).display !== 'none' : false,
    offlineShown: offline ? getComputedStyle(offline).display !== 'none' : false,
    onlineShown: online ? getComputedStyle(online).display !== 'none' : false,
    visitorCaption: document.getElementById('profile-visitor') !== null,
    playTitle: document.getElementById('profile-play-title')?.textContent ?? '',
    onlineValues: [...(document.getElementById('profile-play-online')?.querySelectorAll('dd') ?? [])].map((dd) => dd.textContent ?? ''),
  };
});

const pageErrors: string[] = [];
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.addInitScript((seed) => {
    for (const prefix of ['', 'main2:', 'futa04:']) {
      localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, seed.identity);
      localStorage.setItem(`${prefix}futasaku.account.v1`, seed.account);
    }
  }, { identity, account });
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  // The accounts module installs the profile sheet asynchronously; its hub card proves it mounted.
  // Attached, not visible: a signed-in player's hub card is hidden, but its presence proves the
  // accounts module (which owns the profile sheet) has mounted.
  await page.waitForSelector('#acct-hub', { state: 'attached', timeout: 20_000 });
  await page.click('#menu-world');
  await page.waitForSelector('#online-world-screen', { state: 'visible', timeout: 20_000 });
  await page.waitForSelector('.world-hex', { state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(900);
  const mapState = await page.evaluate(() => ({
    hexes: document.querySelectorAll('.world-hex').length,
    available: document.querySelectorAll('.world-hex.available').length,
    mine: document.querySelectorAll('.world-hex.mine').length,
    held: document.querySelectorAll('.world-hex.held').length,
    pressed: document.querySelectorAll('.world-hex.pressed').length,
    wallet: document.getElementById('online-world-wallet')?.textContent ?? '',
    notice: document.getElementById('online-world-notice')?.textContent ?? '',
  }));
  console.log('map state', JSON.stringify(mapState), 'errors', JSON.stringify(pageErrors));

  // ---- 390 x 844: a rival's tile offers two ICON keys ----------------------------------------
  await select(page, '-1,-4');
  const rivalKeys = await keys(page);
  check('a rival tile offers exactly two keys: challenge + profile', rivalKeys.length === 2, JSON.stringify(rivalKeys.map((k) => k.action)));
  check('every key is ICON ONLY (no text node), and wears the MENU key icon',
    rivalKeys.every((k) => k.text === '' && k.icon === true), JSON.stringify(rivalKeys));
  check('every key keeps a SPOKEN label and a title', rivalKeys.every((k) => !!k.label && k.title === k.label), JSON.stringify(rivalKeys));
  check('the two labels are the challenge action and See profile',
    rivalKeys[0]!.label === 'CHALLENGE' && rivalKeys[1]!.label === ONLINE.worldSeeProfile,
    JSON.stringify(rivalKeys.map((k) => k.label)));
  check('every key is at least 44 x 44 at 390', rivalKeys.every((k) => k.w >= 44 && k.h >= 44),
    rivalKeys.map((k) => `${k.w}x${k.h}`).join(','));
  check('the two keys sit on one row', new Set(rivalKeys.map((k) => k.top)).size === 1);
  const bar390 = await barBox(page);
  check('the bar does not overflow at 390', !bar390.hidden && bar390.scrollW <= bar390.clientW && bar390.left >= 0 && bar390.right <= bar390.vw, JSON.stringify(bar390));
  await page.screenshot({ path: `${SHOTS}/territory-icons-rival-390.png` });

  // ---- opening THEIR profile: the same sheet, visitor mode ----------------------------------
  await page.click('#online-world-selection .world-claim-button[data-action="profile"]');
  await page.waitForFunction(() => (document.getElementById('sheet-profile') as HTMLElement | null)?.hidden === false);
  await page.waitForTimeout(250);
  const visitor = await sheetState(page);
  check('the visitor sheet is the SAME sheet in its visitor mode', visitor.mode === 'visitor' && !visitor.hidden, JSON.stringify(visitor));
  check('it names the other player with their #tag', visitor.name === `${rival.player.displayName} #${rivalTag}`, visitor.name);
  // OWNER, 2026-11-02: the "viewing another player" caption was removed as clutter — the sheet is
  // identified by the mode, the name and the rows a visitor does not get.
  check('it carries no "viewing another player" caption node', visitor.visitorCaption === false, String(visitor.visitorCaption));
  check('it shows their level, tiles and colour', visitor.level === 'Level 7' && !visitor.levelHidden && visitor.tiles === '2', `${visitor.level} / ${visitor.tiles}`);
  check('it names their colour in hex beside the swatch', !visitor.hexHidden && visitor.hex === '#ded4c4', `${visitor.hex} / hidden=${visitor.hexHidden}`);
  check('it shows the ONLINE record only', visitor.playTitle === PROFILE.theirGames && visitor.onlineShown && visitor.onlineValues[0] === '0', JSON.stringify(visitor.onlineValues));
  check('it renders NO Seeds row and NO offline row',
    !visitor.seedsShown && !visitor.offlineShown && !visitor.winsShown, JSON.stringify(visitor));
  check('no invented numbers, then: the online record is em dashes where there are no games',
    visitor.onlineValues.slice(1).every((value) => value === PROFILE.unknown), JSON.stringify(visitor.onlineValues));
  await page.screenshot({ path: `${SHOTS}/territory-profile-visitor-390.png` });

  // Escape closes, and focus goes back to the key that opened it.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.getElementById('sheet-profile') as HTMLElement | null)?.hidden === true, undefined, { timeout: 5_000 });
  const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  check('Escape closes and returns focus to the profile key', back === ONLINE.worldSeeProfile, back);

  // ---- 320 x 568: the tightest phone, two keys, no overflow --------------------------------
  // A second Escape clears the still-selected rival tile (the first closed the profile), so the
  // narrower pass starts from no selection and a tap SELECTS rather than toggling off.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  await select(page, '-1,-4');
  const narrowKeys = await keys(page);
  check('at 320 the rival tile still shows two keys', narrowKeys.length === 2, JSON.stringify(narrowKeys.map((k) => k.action)));
  check('at 320 every key is still at least 44 x 44', narrowKeys.every((k) => k.w >= 44 && k.h >= 44),
    narrowKeys.map((k) => `${k.w}x${k.h}`).join(','));
  check('at 320 the keys stay on one row (no wrap)', new Set(narrowKeys.map((k) => k.top)).size === 1);
  const bar320 = await barBox(page);
  check('at 320 the bar does not overflow and stays inside the viewport',
    !bar320.hidden && bar320.scrollW <= bar320.clientW && bar320.left >= 0 && bar320.right <= bar320.vw,
    JSON.stringify(bar320));
  await page.screenshot({ path: `${SHOTS}/territory-icons-rival-320.png` });

  // My own ground: ONE sell key (no profile key for your own tile).
  await select(page, '-2,-4');
  const ownKeys = await keys(page);
  check('my own tile offers only the sell key (no profile key for myself)',
    ownKeys.length === 1 && ownKeys[0]!.action === 'sell' && (ownKeys[0]!.label ?? '').includes('Sell'), JSON.stringify(ownKeys));
  check('the sell key is icon-only with a label', ownKeys[0]!.text === '' && !!ownKeys[0]!.label && ownKeys[0]!.icon);

  // A free tile: ONE grow key, and the first press arms it (the icon becomes a tick).
  const free = await page.evaluate(() => {
    const el = [...document.querySelectorAll<SVGPathElement>('.world-hex.available')]
      .find((node) => node.getBoundingClientRect().width > 0);
    return el?.getAttribute('data-cell-id') ?? null;
  });
  if (free) {
    await select(page, free);
    const growKeys = await keys(page);
    check('a free tile offers one grow key', growKeys.length === 1 && growKeys[0]!.action === 'grow' && growKeys[0]!.label === ONLINE.worldGrowKey, JSON.stringify(growKeys));
    await page.click('#online-world-selection .world-claim-button');
    await page.waitForTimeout(200);
    const armed = await keys(page);
    check('the second press is armed: the label changes and the glyph becomes a tick',
      armed[0]!.label === ONLINE.worldGrowConfirm && armed[0]!.action === 'grow' && armed[0]!.icon, JSON.stringify(armed));
  } else {
    check('a free tile was available to test the grow key', false);
  }

  // One more profile open at 320 to prove the sheet fits the smallest phone.
  await select(page, '-1,-4');
  await page.click('#online-world-selection .world-claim-button[data-action="profile"]');
  await page.waitForFunction(() => (document.getElementById('sheet-profile') as HTMLElement | null)?.hidden === false);
  await page.waitForTimeout(250);
  const small = await page.evaluate(() => {
    const sheet = document.getElementById('sheet-profile')!;
    const r = sheet.getBoundingClientRect();
    return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, mode: sheet.dataset.mode ?? '' };
  });
  check('at 320 the visitor sheet fits the viewport', small.mode === 'visitor' && small.left >= 0 && small.right <= small.vw, JSON.stringify(small));
  await page.screenshot({ path: `${SHOTS}/territory-profile-visitor-320.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  check('no page errors in the whole walk', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
  failed++;
  console.error('SUITE ERROR', error);
  console.error('page errors', pageErrors);
} finally {
  await browser.close();
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
