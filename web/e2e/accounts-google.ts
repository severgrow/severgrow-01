// "Continue with Google" in a real browser, end to end, against a local API and a FAKE Supabase Auth
// (never the real project, never real Google). The fake plays Google + Supabase: /authorize jumps
// straight back with a code, /token checks the PKCE verifier for real, /user says who a token is.
// The API checks tokens through the real supabaseAuthProvider over HTTP, exactly as in production.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx web/e2e/accounts-google.ts
//   SHOTS=1 ... also writes docs/screens/accounts/*.png
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, webkit } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { MemoryIdentityLinkStore, createAccountsRouter, supabaseAuthProvider } from '../../server/src/accounts/accounts.js';
import { playerTag } from '../../src/player-tag.js';
import { CHROME } from './helpers/local-duel.js';
import { openMenuEntry, waitMenuEntry } from './helpers/menu-nav.js';
import { expandYourMatches } from './helpers/lobby-matches.js';

const PORT = 4243;
const SHOTS = process.env.SHOTS === '1';
const CALLBACK_ONLY = process.env.GOOGLE_CALLBACK_ONLY === '1';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 15_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await cond()) return true;
    } catch {
      /* navigating */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

// ---- the fake Supabase Auth (+ "Google") ----
const fake = {
  googleOn: true,
  /** Who "picks their Google account" on the next /authorize; 'cancel' sends back an error. */
  nextUser: 'alice' as string,
  codes: new Map<string, { challenge: string; user: string }>(),
  tokens: new Map<string, string>(),
  deleted: [] as string[],
  logouts: 0,
};
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const authServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS' };
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return void (res.writeHead(204, cors), res.end());
  if (url.pathname === '/auth/v1/settings') return json(200, { external: { google: fake.googleOn, email: true } });
  if (url.pathname === '/auth/v1/authorize') {
    const back = new URL(url.searchParams.get('redirect_to') ?? '');
    if (url.searchParams.get('provider') !== 'google' || url.searchParams.get('code_challenge_method') !== 's256') return json(400, {});
    if (fake.nextUser === 'cancel') {
      back.searchParams.set('error', 'access_denied');
      back.searchParams.set('error_description', 'The user cancelled');
    } else {
      const code = randomUUID();
      fake.codes.set(code, { challenge: url.searchParams.get('code_challenge') ?? '', user: fake.nextUser });
      back.searchParams.set('code', code);
    }
    res.writeHead(302, { location: back.toString() });
    return void res.end();
  }
  let body = '';
  req.on('data', (c) => (body += String(c)));
  req.on('end', () => {
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const { auth_code, code_verifier } = JSON.parse(body || '{}') as { auth_code?: string; code_verifier?: string };
      const entry = fake.codes.get(auth_code ?? '');
      fake.codes.delete(auth_code ?? '');
      if (!entry || b64url(createHash('sha256').update(code_verifier ?? '').digest()) !== entry.challenge) return json(400, { error: 'invalid_grant' });
      const access = `fake-access-${randomUUID()}`;
      fake.tokens.set(access, entry.user);
      return json(200, { access_token: access, refresh_token: 'r', user: { email: `${entry.user}@gmail.com` } });
    }
    if (url.pathname === '/auth/v1/user') {
      const who = fake.tokens.get((req.headers.authorization ?? '').replace(/^Bearer /, ''));
      return who ? json(200, { id: `uid-${who}`, email: `${who}@gmail.com`, app_metadata: { provider: 'google', providers: ['google'] } }) : json(401, {});
    }
    if (url.pathname === '/auth/v1/logout') {
      fake.logouts += 1;
      return void (res.writeHead(204, cors), res.end());
    }
    const del = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(url.pathname);
    if (del && req.method === 'DELETE') {
      fake.deleted.push(decodeURIComponent(del[1]!));
      return json(200, {});
    }
    json(404, {});
  });
});
await new Promise<void>((r) => authServer.listen(0, '127.0.0.1', r));
const authBase = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`;

// ---- the API, with the real Supabase provider pointed at the fake ----
const storage = new MemoryStorage();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' };
const service = new MatchService({ storage, config });
const links = new MemoryIdentityLinkStore((p, k, n) => storage.revokeTokensOfPlayer(p, k, n));
const accounts = createAccountsRouter({
  links,
  storage,
  auth: supabaseAuthProvider({ url: authBase, anonKey: 'local-anon', serviceRoleKey: 'sb_secret_local' }),
  emailEnabled: CALLBACK_ONLY,
  authenticate: (t) => service.authenticate(t),
  now: () => Date.now(),
});
const apiServer = createHttpServer({ service, config, live: accounts });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: apiBase, VITE_SUPABASE_URL: authBase, VITE_SUPABASE_ANON_KEY: 'local-anon', VITE_ACCOUNTS: 'on' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});
const previewServer = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = `http://127.0.0.1:${PORT}`;
const browser = process.env.GOOGLE_WEBKIT === '1' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CI ? chromium.executablePath() : CHROME });
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync('docs/screens/accounts', { recursive: true });
  await page.screenshot({ path: `docs/screens/accounts/${name}.png` });
};

type Identity = { token: string; playerId: string; displayName: string; kind: string };
const identity = async (page: Page): Promise<Identity | null> =>
  (await page.evaluate(`(() => { try { return JSON.parse(localStorage.getItem('severgrow.duel.identity.v1')); } catch { return null; } })()`)) as Identity | null;

const device = async (b: Browser, w = 390, h = 844) => {
  const context = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700, isMobile: w < 700 });
  const page = await context.newPage();
  await page.goto(`${origin}/`);
  await waitMenuEntry(page, 'menu-online', { timeout: 40_000 });
  return { context, page };
};
const dismissFirstCard = async (page: Page) => {
  const ok = page.locator('#online-first-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
};
const hubOpen = (page: Page) => waitFor(() => page.locator('#online-hub').isVisible(), 20_000);
const createDuel = async (page: Page): Promise<string> => {
  await page.click('#online-create');
  await page.waitForSelector('#online-waiting:not([hidden])', { timeout: 25_000 });
  const code = ((await page.locator('#online-invite-code').textContent()) ?? '').trim();
  await page.click('#online-waiting-back');
  await hubOpen(page);
  return code;
};
const listText = async (page: Page) => {
  await expandYourMatches(page);
  return ((await page.locator('#online-matches').innerText().catch(() => '')) ?? '').trim();
};

try {
  {
    const d = await device(browser, 1100, 800);
    fake.nextUser = 'callback-timing';
    const callbackDocuments: string[] = [];
    const started: string[] = [];
    let result: Record<string, unknown> | null = null;
    let openToken!: () => void;
    const tokenGate = new Promise<void>(resolve => { openToken = resolve; });
    d.page.on('request', request => {
      const url = new URL(request.url());
      if (request.isNavigationRequest() && url.origin === origin) callbackDocuments.push(url.pathname);
      if (callbackDocuments.length && (url.pathname === '/v1/health' || url.pathname === '/auth/v1/token')) started.push(url.pathname);
      if (url.pathname === '/v1/auth/google/metrics') result = request.postDataJSON() as Record<string, unknown>;
    });
    await d.page.route('**/auth/v1/token?**', async route => { await tokenGate; await route.continue(); });
    await openMenuEntry(d.page, 'menu-online');
    // THE FIRST WELCOME'S ONE EMPHASIS (owner, 2026-11-20): Play as guest is the primary key.
    const welcomeKeys = await d.page.evaluate(`(() => {
      const guest = document.querySelector('[data-acct="welcome-guest"]');
      const google = document.querySelector('[data-acct="welcome-google"]');
      const style = guest ? getComputedStyle(guest) : null;
      return {
        guestPrimary: !!guest?.classList.contains('primary'),
        guestFill: style?.backgroundColor ?? '',
        guestInk: style?.color ?? '',
        googlePrimary: !!google?.classList.contains('primary'),
      };
    })()`) as { guestPrimary: boolean; guestFill: string; guestInk: string; googlePrimary: boolean };
    check('welcome: Play as guest is the primary key', welcomeKeys.guestPrimary && !welcomeKeys.googlePrimary && welcomeKeys.guestFill !== 'rgba(0, 0, 0, 0)',
      JSON.stringify(welcomeKeys));
    await d.page.locator('[data-acct="welcome-google"]').click();
    try {
      check('callback: signing in replaces LOG IN while token exchange is pending', await waitFor(async () =>
        /signing in/i.test((await d.page.locator('#menu-login').textContent({ timeout: 1000 })) ?? ''), 3000));
      const parallel = await waitFor(() => started.includes('/v1/health') && started.includes('/auth/v1/token'), 4000);
      check('callback: wake starts before token exchange', parallel && started.indexOf('/v1/health') < started.indexOf('/auth/v1/token'), started.join(' → '));
    } finally { openToken(); }
    check('callback: the account key updates in the same document', await waitFor(async () => (await identity(d.page))?.kind === 'account' &&
      !/log in|signing in/i.test((await d.page.locator('#menu-login').textContent()) ?? ''), 6000));
    check('callback: no second game boot', callbackDocuments.length === 1, `${callbackDocuments.length} documents`);
    // A new account may ask for its nickname (a required sheet, so the scrim blocks the game until
    // it is answered). Complete it the way a player would, then verify the new identity reaches the
    // surfaces that read the same storage: Profile and the Planet's always-on line.
    const nickname = d.page.locator('#acct-nickname input');
    d.page.on('dialog', () => undefined);
    if (await waitFor(() => nickname.isVisible(), 2500)) {
      await nickname.fill('ShellCheck');
      await d.page.locator('[data-acct="nickname-save"]').click();
      await waitFor(async () => !(await d.page.locator('#acct-nickname').isVisible()), 5000);
    }
    const signed = (await identity(d.page))!;
    await waitFor(async () => !(await d.page.locator('.acct-scrim:visible').count()), 5000);
    if (await d.page.locator('#online-hub').isVisible().catch(() => false)) {
      await d.page.click('#online-back');
      await waitFor(() => d.page.locator('#menu-login').isVisible(), 5000);
    }
    await d.page.click('#menu-login');
    const profileOpen = await waitFor(() => d.page.locator('#sheet-profile:not([hidden])').isVisible(), 5000);
    const profileName = profileOpen ? ((await d.page.locator('#profile-name').textContent()) ?? '').trim() : '';
    check('callback: Profile opens as the new identity', profileOpen && profileName === signed.displayName, `${profileName} / ${signed.displayName}`);
    await d.page.keyboard.press('Escape');
    await waitFor(async () => !(await d.page.locator('#sheet-profile').isVisible()), 5000);
    await openMenuEntry(d.page, 'menu-world');
    const planet = await waitFor(async () => {
      const line = ((await d.page.locator('#online-world-wallet').textContent().catch(() => '')) ?? '').trim();
      return line.includes(signed.displayName ?? '');
    }, 12_000);
    check('callback: the Planet line names the new identity', planet, ((await d.page.locator('#online-world-wallet').textContent().catch(() => '')) ?? '').trim());
    await d.page.click('#online-world-back').catch(() => undefined);
    const elapsed = await d.page.evaluate(() => performance.getEntriesByName('futasaku:google:success')[0]?.startTime ?? null);
    check('callback: the browser records completion timing', elapsed !== null, elapsed === null ? '' : `${Math.round(elapsed)} ms`);
    check('callback: publishes stage timings without account fields', await waitFor(() => result?.stage === 'success' &&
      Object.keys(result).sort().join(',') === 'handoverMs,stage,startedMs,tokenMs,totalMs', 2000), JSON.stringify(result));
    await d.context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await openMenuEntry(page, 'menu-online');
    await page.locator('[data-acct="welcome-google"]').click();
    check('Home Screen app: guidance explains signing in with Safari', await waitFor(async () =>
      /open FUTASAKU in Safari/.test(await page.locator('#acct-google-return').innerText({ timeout: 2000 }))));
    check('Home Screen app: Google retry is hidden inside the isolated app', !(await page.locator('[data-acct="google-return-retry"]').isVisible()));
    if (CALLBACK_ONLY) {
      await page.locator('[data-acct="google-return-email"]').click();
      check('Home Screen app: email opens inside the app', await waitFor(() => page.locator('#acct-email').isVisible(), 3000));
    }
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    fake.nextUser = 'retry-callback';
    // Serve the failed return as a fresh browser document. The recovery UI is the milestone;
    // unrelated assets can still be loading after WebKit has already rendered the retry.
    await page.goto(`${origin}/?code=missing-verifier`, { waitUntil: 'commit' });
    const retry = page.locator('[data-acct="google-return-retry"]');
    const visible = await waitFor(() => retry.isVisible(), 5000);
    check('callback without pending sign-in: visible recovery', visible);
    if (visible) {
      await retry.click();
      check('callback retry starts a new sign-in', await waitFor(async () => (await identity(page))?.kind === 'account', 6000));
    }
    await context.close();
  }

  // ---- 5b. FIRST TRY ALWAYS WORKS (owner, 2026-11-11: "sometimes when logging through Google it's
  // not logged in straight away and I need to log in second time"). Two ways the first try was lost:
  //   (a) our server's hand-over fails once (a cold start): the page retries it by itself;
  //   (b) the page reloads in the middle of the hand-over (an app update swapping in its new files):
  //       the reloaded page resumes the sign-in instead of forgetting it.
  for (const how of ['server fails once', 'reload mid-hand-over'] as const) {
    const d = await device(browser);
    await openMenuEntry(d.page, 'menu-online');
    await waitFor(() => d.page.locator('#acct-welcome').isVisible());
    await d.page.click('[data-acct="welcome-guest"]');
    await hubOpen(d.page);
    await dismissFirstCard(d.page);
    await waitFor(async () => (await identity(d.page)) !== null);
    fake.nextUser = how === 'server fails once' ? 'bob' : 'carol';
    let calls = 0;
    await d.page.route('**/v1/auth/google', async (route) => {
      calls += 1;
      if (calls === 1) {
        if (how === 'server fails once') {
          await new Promise(resolve => setTimeout(resolve, 700));
          return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false}' });
        }
        const reloaded = d.page.waitForNavigation({ waitUntil: 'commit', timeout: 8000 });
        await d.page.evaluate('setTimeout(() => location.reload(), 0)');
        await reloaded;
        await route.abort().catch(() => undefined);
        return;
      }
      return route.continue();
    });
    await d.page.click('[data-acct="hub-google"]');
    const signed = await waitFor(async () => (await identity(d.page))?.kind === 'account', 25_000);
    check(`first try (${how}): signed in without a second tap`, signed, `${calls} hand-over call(s)`);
    check(`first try (${how}): the menu key no longer says LOG IN`, await waitFor(async () => {
      const key = d.page.locator('#menu-login');
      return !(await key.isVisible().catch(() => false)) || !/log in/i.test((await key.innerText().catch(() => '')) ?? '');
    }, 10_000));
    const elapsed = await d.page.evaluate(() => performance.getEntriesByName('futasaku:google:success')[0]?.startTime ?? null);
    check(`first try (${how}): completion recorded`, elapsed !== null, elapsed === null ? '' : `${Math.round(elapsed)} ms`);
    await d.context.close();
  }

  // ---- 5c. A PATIENT HAND-OVER (owner, 2026-11-20, on /test/): after signing out, "Continue with
  // Google" showed the "Google sign-in did not finish" sheet. The game-API hand-over had a 3 s
  // deadline and ONE retry, so a slow answer (a cold isolate) or a short burst of 503s failed a
  // sign-in whose server was merely busy. These cases assert what the PLAYER gets, not the request:
  //   * a hand-over that takes 3.5 s (past the old 3 s deadline) must still sign the player in;
  //   * two 503s then success must sign in (the old code retried exactly once, so it did not);
  //   * one 503 then success — the case the old single retry covered — must keep signing in;
  //   * a server that never answers must SAY SO, not use the vague "did not finish" line.
  {
    type HandOver = (call: number) => 'pass' | 'slow' | '503' | 'abort';
    const cases: { name: string; user: string; plan: HandOver; signsIn: boolean }[] = [
      { name: 'a hand-over that takes 3.5 s', user: 'handover-slow', plan: () => 'slow', signsIn: true },
      { name: 'two 503s then success', user: 'handover-503s', plan: (n) => (n <= 2 ? '503' : 'pass'), signsIn: true },
      { name: 'one 503 then success', user: 'handover-503', plan: (n) => (n === 1 ? '503' : 'pass'), signsIn: true },
      { name: 'no answer at all', user: 'handover-silent', plan: () => 'abort', signsIn: false },
    ];
    for (const one of cases) {
      const d = await device(browser);
      await openMenuEntry(d.page, 'menu-online');
      await waitFor(() => d.page.locator('#acct-welcome').isVisible());
      await d.page.click('[data-acct="welcome-guest"]');
      await hubOpen(d.page);
      await dismissFirstCard(d.page);
      await waitFor(async () => (await identity(d.page)) !== null);
      fake.nextUser = one.user;
      let calls = 0;
      let stage = '';
      d.page.on('request', (request) => {
        if (new URL(request.url()).pathname !== '/v1/auth/google/metrics') return;
        stage = String((request.postDataJSON() as { stage?: unknown } | null)?.stage ?? '');
      });
      await d.page.route('**/v1/auth/google', async (route) => {
        calls += 1;
        const how = one.plan(calls);
        if (how === 'abort') return route.abort().catch(() => undefined);
        // CORS headers, as in production: a cross-origin 503 without them is a status 0, not a 503.
        if (how === '503') return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false}' }).catch(() => undefined);
        // A slow server is slow on EVERY attempt: a cold isolate does not warm up between them.
        if (how === 'slow') await new Promise((resolve) => setTimeout(resolve, 3500));
        return route.continue().catch(() => undefined);
      });
      await d.page.click('[data-acct="hub-google"]');
      const sheet = d.page.locator('#acct-google-return');
      const settled = await waitFor(async () => (await identity(d.page))?.kind === 'account' || await sheet.isVisible(), 40_000);
      const text = (await sheet.isVisible().catch(() => false))
        ? ((await sheet.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim() : '';
      const signed = ((await identity(d.page))?.kind === 'account' ? await identity(d.page) : null);
      const note = `stage ${stage || '(none)'}, ${calls} hand-over call(s)${text ? `, sheet: "${text}"` : ''}`;
      check(`patient hand-over (${one.name}): ${one.signsIn ? 'the player is signed in' : 'the sheet says the server did not answer'}`,
        settled && (one.signsIn ? signed !== null : /did not answer/i.test(text)), note);
      if (one.signsIn) {
        // SIGNED IN, not merely "no sheet": the server accepts the token and the menu key is live.
        const me = signed ? await service.authenticate(signed.token).catch(() => null) : null;
        check(`patient hand-over (${one.name}): the server knows this account`, me?.kind === 'account', me?.kind ?? 'no identity');
        check(`patient hand-over (${one.name}): the menu key no longer says LOG IN`, await waitFor(async () => {
          const key = d.page.locator('#menu-login');
          return !(await key.isVisible().catch(() => false)) || !/log in/i.test((await key.innerText().catch(() => '')) ?? '');
        }, 10_000));
      } else {
        check(`patient hand-over (${one.name}): it is not the vague "did not finish" line`, settled && !/did not finish/i.test(text), note);
      }
      await d.context.close();
    }
  }

  if (!CALLBACK_ONLY) {

  // ---- 1. a new player: the welcome, then guest play ----
  const d1 = await device(browser);
  await waitFor(() => d1.page.evaluate("document.body.classList.contains('acct-on')") as Promise<boolean>);
  await openMenuEntry(d1.page, 'menu-online');
  check('first Play online shows the welcome (Google or guest)', await waitFor(() => d1.page.locator('#acct-welcome').isVisible()));
  check('the hub is NOT opened behind it (nothing forced)', !(await d1.page.locator('#online-hub').isVisible()));
  const wFits = (await d1.page.evaluate(`(() => { const r = document.getElementById('acct-welcome').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && [...document.querySelectorAll('#acct-welcome button')].every(b => b.getBoundingClientRect().height >= 44); })()`)) as boolean;
  check('the welcome fits a phone, every button at least 44px', wFits);
  await shot(d1.page, 'welcome-390x844');
  await d1.page.click('[data-acct="welcome-guest"]');
  check('"Play as guest" opens the online hub', await hubOpen(d1.page));
  await dismissFirstCard(d1.page);
  check('the hub offers Google to a guest', await waitFor(() => d1.page.locator('#acct-hub').isVisible()));
  const invite = await createDuel(d1.page);
  const guest1 = (await identity(d1.page))!;
  check('the guest has an identity and a match', guest1?.kind === 'guest' && invite.length > 0);
  // A friend joins, so the list shows an opponent with a name tag.
  const friend = await service.createGuest();
  await service.joinMatch(await service.authenticate(friend.token), invite);
  await d1.page.click('#online-back');
  await openMenuEntry(d1.page, 'menu-online');
  check('the welcome is shown only once', await hubOpen(d1.page) && !(await d1.page.locator('#acct-welcome').isVisible()));
  const friendShown = `${friend.player.displayName} #${playerTag(friend.player.id)}`;
  check('the match list shows the opponent with a name tag', await waitFor(async () => (await listText(d1.page)).includes(friendShown)), friendShown);
  await shot(d1.page, 'hub-guest-390x844');

  // ---- 2. the guest signs in: same player, same matches ----
  fake.nextUser = 'alice';
  await d1.page.click('[data-acct="hub-google"]');
  check('after Google, the hub is back and says signed in', await waitFor(async () => (await d1.page.locator('.acct-toast').innerText().catch(() => '')).includes('Signed in'), 25_000));
  check('it returns to Play online', await hubOpen(d1.page));
  // The sign-in that FORMS an account asks once for a nickname (aeb0064, 2026-10-15). This suite
  // predates that step and stalled behind its sheet; it now proves the step appears, then skips it
  // like a player would, keeping the generated name the checks below expect.
  check('the first sign-in asks for a nickname, once', await waitFor(() => d1.page.locator('[data-acct="nickname-skip"]').isVisible(), 10_000));
  await d1.page.locator('[data-acct="nickname-skip"]').click();
  check('skipping closes the nickname step', await waitFor(async () => !(await d1.page.locator('[data-acct="nickname-skip"]').isVisible()), 5_000));
  const acct1 = (await identity(d1.page))!;
  check('SAME player id after signing in (upgraded in place)', acct1.playerId === guest1.playerId && acct1.kind === 'account');
  check('the match is still there', await waitFor(async () => (await listText(d1.page)).includes(friendShown)));
  check('the guest line is gone for a signed-in player', !(await d1.page.locator('#acct-hub').isVisible()));
  check('the address bar has no ?code= left in it', !((await d1.page.evaluate('location.search')) as string).includes('code'));
  check('the Supabase session was closed after the hand-over', fake.logouts >= 1);
  await shot(d1.page, 'signed-in-hub-390x844');
  await d1.page.click('#online-back');
  await d1.page.click('#menu-settings');
  const myName = `${acct1.displayName} #${playerTag(acct1.playerId)}`;
  check('Settings shows "You are Name #TAG" and the Google email', await waitFor(async () => {
    const t = await d1.page.locator('#acct-settings').innerText();
    return t.includes(myName) && t.includes('alice@gmail.com');
  }), myName);
  await d1.page.locator('#acct-settings').scrollIntoViewIfNeeded();
  await shot(d1.page, 'settings-signed-in-390x844');

  // ---- 3. another phone: the same Google brings back the exact player and matches ----
  const d2 = await device(browser, 360, 640);
  await openMenuEntry(d2.page, 'menu-online');
  await waitFor(() => d2.page.locator('#acct-welcome').isVisible());
  await shot(d2.page, 'welcome-360x640');
  fake.nextUser = 'alice';
  await d2.page.click('[data-acct="welcome-google"]');
  check('phone 2: welcome back', await waitFor(async () => (await d2.page.locator('.acct-toast').innerText().catch(() => '')).includes('Welcome back'), 25_000));
  check('phone 2: lands in Play online', await hubOpen(d2.page));
  await dismissFirstCard(d2.page);
  const acct2 = (await identity(d2.page))!;
  check('phone 2: the SAME player as phone 1', acct2.playerId === guest1.playerId);
  check('phone 2: the same match is in the list', await waitFor(async () => (await listText(d2.page)).includes(friendShown)));

  // ---- 4. a phone that already played as someone else switches; nothing is merged ----
  const d3 = await device(browser);
  await openMenuEntry(d3.page, 'menu-online');
  await waitFor(() => d3.page.locator('#acct-welcome').isVisible());
  await d3.page.click('[data-acct="welcome-guest"]');
  await hubOpen(d3.page);
  await dismissFirstCard(d3.page);
  await createDuel(d3.page);
  const guest3 = (await identity(d3.page))!;
  fake.nextUser = 'alice';
  await d3.page.click('[data-acct="hub-google"]');
  check('phone 3: says the guest games were not moved', await waitFor(async () => (await d3.page.locator('.acct-toast').innerText().catch(() => '')).includes('were not moved'), 25_000));
  const acct3 = (await identity(d3.page))!;
  check('phone 3: now alice, and the other guest still exists untouched', acct3.playerId === guest1.playerId && (await service.authenticate(guest3.token)).kind === 'guest');

  // ---- 5. a cancelled Google sign-in changes nothing ----
  const d4 = await device(browser);
  await openMenuEntry(d4.page, 'menu-online');
  await waitFor(() => d4.page.locator('#acct-welcome').isVisible());
  await d4.page.click('[data-acct="welcome-guest"]');
  await hubOpen(d4.page);
  await dismissFirstCard(d4.page);
  await waitFor(async () => (await identity(d4.page)) !== null);
  const guest4 = (await identity(d4.page))!;
  fake.nextUser = 'cancel';
  await d4.page.click('[data-acct="hub-google"]');
  check('cancelled: an honest "did not finish" message', await waitFor(async () => (await d4.page.locator('.acct-toast').innerText().catch(() => '')).includes('did not finish'), 25_000));
  check('cancelled: still the same guest, no error left in the address', (await identity(d4.page))?.playerId === guest4.playerId && !((await d4.page.evaluate('location.search')) as string).includes('error'));
  await shot(d4.page, 'cancelled-390x844');

  // ---- 6. sign out on phone 3, then delete the account from phone 1 ----
  await d3.page.click('#online-back');
  await d3.page.click('#menu-settings');
  await d3.page.click('[data-acct="sign-out"]');
  await d3.page.click('[data-acct="confirm-yes"]');
  await waitMenuEntry(d3.page, 'menu-online', { timeout: 40_000 });
  check('signed out: this phone forgot the account', (await identity(d3.page)) === null);
  await openMenuEntry(d3.page, 'menu-online');
  check('signed out: the welcome offers Google again', await waitFor(() => d3.page.locator('#acct-welcome').isVisible()));

  await d1.page.click('[data-acct="delete"]');
  check('delete asks first, and says what happens', await waitFor(async () => (await d1.page.locator('#acct-confirm').innerText()).includes('signed out')));
  await shot(d1.page, 'delete-confirm-390x844');
  await d1.page.click('[data-acct="confirm-yes"]');
  check('deleted: a clear message', await waitFor(async () => (await d1.page.locator('.acct-toast').innerText().catch(() => '')).includes('account is deleted')));
  check('deleted: the Supabase user (the email) is deleted too', fake.deleted.includes('uid-alice'));
  const after1 = (await identity(d1.page))!;
  check('deleted: this phone keeps playing as a guest, same player', after1.kind === 'guest' && after1.playerId === guest1.playerId && (await service.authenticate(after1.token)).id === guest1.playerId);
  let p2Out = false;
  try {
    await service.authenticate(acct2.token);
  } catch {
    p2Out = true;
  }
  check('deleted: phone 2 is signed out', p2Out);
  check('deleted: Settings offers Google again', await waitFor(() => d1.page.locator('[data-acct="settings-google"]').isVisible()));

  // ---- 7. the privacy policy ----
  await d1.page.goto(`${origin}/#privacy`);
  check('futasaku.com/#privacy opens the policy', await waitFor(() => d1.page.locator('#acct-privacy').isVisible(), 20_000));
  const pFits = (await d1.page.evaluate(`(() => { const r = document.getElementById('acct-privacy').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })()`)) as boolean;
  check('the policy fits the screen', pFits);
  await d1.page.evaluate("document.querySelector('.acct-toast')?.setAttribute('hidden', '')");
  await shot(d1.page, 'privacy-390x844');
  await d1.page.click('[data-acct="privacy-close"]');
  check('closing it clears #privacy', await waitFor(async () => !(await d1.page.locator('#acct-privacy').isVisible()) && !(await d1.page.evaluate('location.hash'))));

  // ---- 8. Google not switched on in Supabase yet: nothing about accounts shows ----
  fake.googleOn = false;
  const d5 = await device(browser);
  await openMenuEntry(d5.page, 'menu-online');
  check('Google off: Play online goes straight to the hub', await hubOpen(d5.page));
  check('Google off: no welcome, no Google button anywhere', !(await d5.page.locator('#acct-welcome').isVisible()) && (await d5.page.locator('.acct-google:visible').count()) === 0);
  for (const d of [d1, d2, d3, d4, d5]) await d.context.close();
  }
} finally {
  await browser.close().catch(() => undefined);
  await previewServer.close().catch(() => undefined);
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  await new Promise<void>((resolve) => authServer.close(() => resolve()));
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
