// THE PROFILE SHEET'S NETWORK COST (owner, 2026-11-20: "make it load up quickly cheaply ... at the
// moment profiles of players when clicked on map load a bit too long already --- so add to this pass
// how to speed up").
//
// WHAT THIS MEASURES, in a real Chromium at 390x844 against the built page:
//   * the NUMBER of `/v1/players/*` requests a profile open makes, counted in the browser's own
//     network layer (`page.on('request')`), and the time to the last fact appearing;
//   * the OLD sequence, measured the same way by making the new combined route answer 404 — that is
//     exactly what a server deployed before this change does, so the fallback IS the before;
//   * a REOPEN, which must make ZERO requests and must never flash an em dash (owner: "once profiles
//     load - they shouldnt reload when going back to it").
//
// Every stub answer is delayed by a fixed 120 ms, so the difference one round trip makes is visible
// in the timings as well as in the counts. Run:
//   PW_CHROMIUM="/…/Google Chrome for Testing" npx tsx web/e2e/profile-card.ts
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import type { Page, Route } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const LATENCY_MS = 120;
const SUPA = 'http://127.0.0.1:9';
const API = `${SUPA}/functions/v1/duel`;
const RIVAL = '44444444-4444-4444-8444-444444444444';
const ME = '55555555-5555-4555-8555-555555555555';

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

/** One answer, delayed so a round trip is visible in the wall clock. */
type Stub = { path: string; body: unknown; status?: number };
const profileStubs = (withCard: boolean): Stub[] => [
  { path: `/v1/players/${RIVAL}/card`, status: withCard ? 200 : 404, body: withCard ? {
    ok: true,
    profile: {
      displayName: 'BloomHeron', tag: 'ABCD', level: 7, tiles: 14, connectedTiles: 9, colourId: 3,
      online: { games: 40, wins: 26, longestStreak: 6 },
      offline: { games: 60, hardStreak: 12, blitzStreak: 3 },
      country: 'PL',
    },
    achievements: { done: 12, total: 35 },
    onlineBlitzBest: 7,
    headToHead: { games: 4, youWins: 2, themWins: 1, draws: 1 },
  } : { ok: false, code: 'NOT_FOUND', message: 'No such player.' } },
  { path: `/v1/players/${RIVAL}/profile`, body: { ok: true, profile: {
    displayName: 'BloomHeron', tag: 'ABCD', level: 7, tiles: 14, connectedTiles: 9, colourId: 3,
    online: { games: 40, wins: 26, longestStreak: 6 },
    // The old shape: no offline row, no country. The fallback path must still land every fact it can.
  } } },
  { path: `/v1/players/${RIVAL}/record`, body: { ok: true, onlineBlitzBest: 7, achievements: { done: 12, total: 35 } } },
  { path: `/v1/players/${ME}/card`, status: withCard ? 200 : 404, body: withCard ? { ok: true, profile: {
    displayName: 'RYK', tag: 'EFGH', level: 23, tiles: 3, connectedTiles: 2, colourId: 3,
    online: { games: 9, wins: 4, longestStreak: 3 },
    offline: { games: 24, hardStreak: 5, blitzStreak: 2 },
    country: 'PL',
  }, achievements: { done: 12, total: 35 }, onlineBlitzBest: 7,
    // YOUR OWN card also carries the account's classic offline totals, so the sheet needs no
    // second read (`/v1/players/me/offline`).
    ownOffline: { games: 24, wins: 14, draws: 0, longestStreak: 5 },
  } : { ok: false, code: 'NOT_FOUND', message: 'No such player.' } },
  { path: `/v1/players/${ME}/profile`, body: { ok: true, profile: {
    displayName: 'RYK', tag: 'EFGH', level: 23, tiles: 3, connectedTiles: 2, colourId: 3,
    online: { games: 9, wins: 4, longestStreak: 3 },
  } } },
  { path: `/v1/players/${ME}/record`, body: { ok: true, onlineBlitzBest: 7, achievements: { done: 12, total: 35 } } },
  { path: `/v1/players/me/offline`, body: { ok: true, offline: { games: 24, wins: 14, draws: 0, longestStreak: 5 } } },
  { path: '/v1/players/me/streaks', body: { ok: true, practice: {}, onlineBlitz: { current: 1, best: 7 }, completed: 24 } },
  { path: '/v1/seeds/achievements', body: { ok: true, achievements: Array.from({ length: 35 }, (_, i) => ({ done: i < 12 })) } },
  { path: '/v1/seeds/wallet', body: { ok: true, wallet: { balance: 128, lifetimeEarned: 128, lifetimeSpent: 0, worldInvitationSeen: true } } },
  { path: '/v1/auth/methods', body: { ok: true, email: false } },
  { path: '/v1/health', body: { ok: true, rulesVersion: 'x', serverNow: Date.now(), features: [] } },
];

const build = async () => new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: API, VITE_SUPABASE_URL: SUPA,
      VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key', VITE_ACCOUNTS: 'on' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += String(d)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err}`))));
});

const fixture = await productFixture();
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  // The page must be built from THIS tree with the e2e's own API base. Set SKIP_BUILD=1 to reuse
  // the last build while iterating on the measuring script itself.
  if (process.env.SKIP_BUILD !== '1') await build();
} catch (error) {
  console.error(String(error));
  await fixture.close();
  await browser.close();
  process.exit(1);
}

/** Requests seen since the last `reset`, as path + how long into the phase they started. */
type Seen = { path: string; at: number };
const seen: Seen[] = [];
let t0 = 0;
const reset = () => { seen.length = 0; t0 = Date.now(); };
// The SHEET'S OWN reads count, and nothing else: the card (or, on an old server, the profile + the
// record), this device's offline publish and the Seeds wallet. Periodic lobby traffic (presence,
// challenges, the world, the match list) is the page's background and is excluded, so the number
// reported is what OPENING THE SHEET costs.
const SHEET_READS = [/\/card$/, /\/profile$/, /\/record$/, /^\/v1\/players\/me\/offline$/,
  /^\/v1\/players\/me\/streaks$/, /^\/v1\/seeds\/wallet$/];
const playerReads = () => seen.filter((r) => SHEET_READS.some((re) => re.test(r.path)));
const summary = () => playerReads().map((r) => r.path.replace(/^\/v1\//, '')).join(' + ') || '(none)';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
  'access-control-allow-headers': 'apikey,authorization,content-type,x-futasaku-client-version,x-futasaku-rules-version',
};
const install = async (page: Page, withCard: boolean) => {
  await page.route('**/auth/v1/settings*', (route) => route.fulfill({ status: 200, contentType: 'application/json',
    headers: CORS, body: JSON.stringify({ external: { email: false, google: false } }) }));
  await page.route('**/v1/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(route.request().url()).pathname.replace(/^.*\/duel/, '').split('?')[0]!;
    const stub = path === '/v1/players/me' ? { path, body: { ok: true, player: { id: ME, kind: 'account', displayName: 'RYK' } } }
      : profileStubs(withCard).find((s) => s.path === path) ?? { path, body: { ok: true } };
    seen.push({ path, at: Date.now() - t0 });
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    await route.fulfill({ status: stub.status ?? 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(stub.body) });
  });
};

const seed = async (page: Page) => {
  await page.addInitScript(({ me }) => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: true, speed: 'skip', eyeCandy: false }));
    localStorage.setItem('futa05-test:severgrow.duel.identity.v1', JSON.stringify({ token: 'local-token', playerId: me, displayName: 'RYK', kind: 'account' }));
    localStorage.setItem('futa05-test:futasaku.account.v1', JSON.stringify({ provider: 'email', email: 'ryk@example.invalid', playerId: me }));
  }, { me: ME });
};

const openVisitor = (page: Page) => page.evaluate((playerId) => {
  (window as unknown as { __profileT0: number }).__profileT0 = performance.now();
  window.dispatchEvent(new CustomEvent('futasaku:player-profile', {
    detail: { playerId, trigger: null, seed: { name: 'BloomHeron', level: 7, colourCss: 'hsl(341 42% 53%)' } },
  }));
}, RIVAL);

const visitorPainted = (page: Page, withCard: boolean) => page.waitForFunction((card) => {
  const values = [...(document.getElementById('profile-play-offline')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent);
  const account = document.getElementById('profile-achievements')?.textContent === '12/35';
  const done = card
    ? account && values[0] === '60' && values[1] === '12' && values[2] === '3'
    // The old shape has no offline row: every fact it CAN carry must still land.
    : account && document.getElementById('profile-name')?.textContent === 'BloomHeron';
  // Stamped IN THE PAGE, so the number is DOM-latency and not Playwright round-trip overhead.
  if (done) (window as unknown as { __profileT1: number }).__profileT1 = performance.now();
  return done;
}, withCard, { timeout: 15_000 });

const elapsed = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __profileT0: number; __profileT1?: number };
  return Math.round((w.__profileT1 ?? performance.now()) - w.__profileT0);
});

const closeSheet = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.getElementById('sheet-profile') as HTMLElement | null)?.hidden === true);
};

async function phase(label: string, withCard: boolean, measure: (page: Page, withCard: boolean) => Promise<{ reads: number; ms: number; log: string }>) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('    pageerror:', String(error)));
  page.on('console', (message) => { if (message.type() === 'error') console.log('    console:', message.text()); });
  await install(page, withCard);
  await seed(page);
  await page.goto(fixture.origin + '/test/');
  await page.waitForFunction("(() => !!window.__severgrow?.ready?.())()", undefined, { timeout: 30_000 });
  await page.waitForFunction("(() => { const k = document.getElementById('menu-login'); return !!k && !k.hidden; })()", undefined, { timeout: 20_000 });
  // The accounts module owns the profile sheet; its hub card is ATTACHED once it has mounted.
  await page.waitForSelector('#acct-hub', { state: 'attached', timeout: 20_000 });
  // Let the boot render settle: the sheet's cost is measured on a page the player is looking at,
  // not while the planet and the menu are still painting their first frame.
  await page.waitForTimeout(3_000);
  let result: { reads: number; ms: number; log: string };
  try {
    result = await measure(page, withCard);
  } catch (error) {
    console.log('    FAILED phase; requests seen:', JSON.stringify(seen));
    console.log('    sheet:', await page.evaluate(() => ({
      exists: !!document.getElementById('sheet-profile'),
      hidden: (document.getElementById('sheet-profile') as HTMLElement | null)?.hidden,
      mode: (document.getElementById('sheet-profile') as HTMLElement | null)?.dataset.mode,
      name: document.getElementById('profile-name')?.textContent,
      values: [...(document.getElementById('profile-play-offline')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent),
      achievements: document.getElementById('profile-achievements')?.textContent,
    })));
    await context.close();
    throw error;
  }
  await context.close();
  console.log(`    ${label}: ${result.reads} sheet request(s) [${result.log}], ${result.ms} ms to every fact`);
  return result;
}

/** The owner's actual gesture: open a rival's sheet from the map, then go back to it. */
const visitorMeasure = async (page: Page, withCard: boolean) => {
  reset();
  await openVisitor(page);
  await visitorPainted(page, withCard);
  const ms = await elapsed(page);
  const reads = playerReads().length;
  const log = summary();
  const rows = await page.evaluate(() => ({
    offline: [...(document.getElementById('profile-play-offline')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent),
    labels: [...(document.getElementById('profile-play-offline')?.querySelectorAll('dt') ?? [])].map((d) => d.textContent),
    flag: document.getElementById('profile-flag')?.textContent ?? '',
    country: document.getElementById('profile-flag')?.getAttribute('aria-label') ?? '',
  }));
  check(`${withCard ? 'card' : 'old server'}: the offline row is games / hard streak / blitz streak`,
    JSON.stringify(rows.labels) === JSON.stringify(['Games', 'Hard streak', 'Blitz streak']), rows.labels.join(' | '));
  if (withCard) {
    check('card: the offline counts, the online Blitz streak and achievements are all painted',
      JSON.stringify(rows.offline) === JSON.stringify(['60', '12', '3']));
    check('card: the stored country renders as a flag', rows.flag === '🇵🇱' && rows.country === 'Poland', `${rows.flag} ${rows.country}`);
  } else {
    check('old server: missing offline counts stay honest em dashes',
      JSON.stringify(rows.offline) === JSON.stringify(['—', '—', '—']), JSON.stringify(rows.offline));
    check('old server: no country means NO flag', rows.flag === '' , JSON.stringify(rows.flag));
  }

  // ---- GO BACK TO IT: no request, no blank, no em dash flash ----
  await closeSheet(page);
  reset();
  await openVisitor(page);
  const immediate = await page.evaluate(() => ({
    offline: [...(document.getElementById('profile-play-offline')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent),
    online: [...(document.getElementById('profile-play-online')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent),
    achievements: document.getElementById('profile-achievements')?.textContent,
    name: document.getElementById('profile-name')?.textContent,
  }));
  await page.waitForTimeout(400); // give a stray request every chance to appear
  check('reopen: ZERO player requests', playerReads().length === 0, summary());
  check('reopen: the facts are on screen in the first frame — no em dash flash',
    immediate.name === 'BloomHeron' && immediate.achievements === '12/35'
      && JSON.stringify(immediate.online) === JSON.stringify(['40', '65%', '7'])
      && (withCard ? JSON.stringify(immediate.offline) === JSON.stringify(['60', '12', '3']) : immediate.offline[0] === '—'),
    JSON.stringify(immediate));
  await closeSheet(page);
  return { reads, ms, log };
};

const ownMeasure = async (page: Page, withCard: boolean) => {
  reset();
  await page.evaluate(() => { (window as unknown as { __profileT0: number }).__profileT0 = performance.now(); });
  await page.click('#menu-login');
  await page.waitForFunction((card) => {
    const values = [...(document.getElementById('profile-play-offline')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent);
    const done = document.getElementById('profile-tiles')?.textContent === '3'
      && document.getElementById('profile-achievements')?.textContent === '12/35'
      // The card carries the account's offline row; the old-server fallback has no such row and
      // falls back to this device's own count (0 in a fresh profile), with dashes for the streaks.
      && (card ? values.join(',') === '24,5,2' : values.join(',') === '0,—,—');
    if (done) (window as unknown as { __profileT1: number }).__profileT1 = performance.now();
    return done;
  }, withCard, { timeout: 15_000 });
  const ms = await elapsed(page);
  const reads = playerReads().length;
  const log = summary();
  const painted = await page.evaluate(() => [...(document.getElementById('profile-play-offline')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent));
  await closeSheet(page);
  reset();
  await page.click('#menu-login');
  const immediate = await page.evaluate(() => [...(document.getElementById('profile-play-offline')?.querySelectorAll('dd') ?? [])].map((d) => d.textContent));
  await page.waitForTimeout(400);
  check('own reopen: ZERO sheet requests', playerReads().length === 0, summary());
  check('own reopen: the offline row is already painted', JSON.stringify(immediate) === JSON.stringify(painted), JSON.stringify(immediate));
  await closeSheet(page);
  return { reads, ms, log };
};

console.log(`\n--- visitor profile, new combined route ---`);
const visitorNew = await phase('visitor', true, visitorMeasure);
console.log(`\n--- visitor profile, server without /card (the old sequence) ---`);
const visitorOld = await phase('visitor', false, visitorMeasure);
console.log(`\n--- own profile, new combined route ---`);
const ownNew = await phase('visitor-own', true, ownMeasure);
console.log(`\n--- own profile, server without /card (the old sequence) ---`);
const ownOld = await phase('visitor-own', false, ownMeasure);

console.log('\nRESULT');
console.log(`  visitor: ${visitorOld.reads} -> ${visitorNew.reads} player request(s); ${visitorOld.ms} -> ${visitorNew.ms} ms to every fact`);
console.log(`  own:     ${ownOld.reads} -> ${ownNew.reads} player request(s); ${ownOld.ms} -> ${ownNew.ms} ms to every fact`);
console.log(`  reopen:  0 requests for both sheets (asserted above)`);

assert.equal(visitorNew.reads, 1, 'the visitor sheet is ONE request');
assert.equal(ownNew.reads, 1, 'the own sheet is ONE request too (ownOffline rides the card)');
assert.ok(visitorOld.reads >= 2, 'the old sequence needed more than one');
assert.ok(visitorNew.reads < visitorOld.reads, 'the collapse removed a round trip');
assert.ok(ownNew.reads < ownOld.reads, 'the own sheet also asks less');

await browser.close();
await fixture.close();
if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS profile sheet: one request, instant reopen, both rows and the flag');
