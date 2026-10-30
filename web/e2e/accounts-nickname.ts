// Choosing a name, in a real browser, end to end, against a local API and a FAKE Supabase Auth
// (never the real project, never real Google). The fake plays Google + Supabase: /authorize jumps
// straight back with a code, /token checks the PKCE verifier for real, /user says who a token is.
//
//   PW_CHROMIUM=... npx tsx web/e2e/accounts-nickname.ts
//   SHOTS=1 ... also writes docs/screens/accounts/*.png
//
// What it proves: the nickname step appears after the sign-in that FORMS an account and must be
// answered (owner, 2026-10-28: an account TYPES its nickname — no suggested name, no skip, and a
// reload brings it back until a name is saved), saving stores the typed name with the #tag
// untouched, Settings can change it later, a guest never sees it, and a later sign-in on another
// device does not ask again.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { MemoryIdentityLinkStore, createAccountsRouter, supabaseAuthProvider } from '../../server/src/accounts/accounts.js';
import { playerTag } from '../../src/player-tag.js';
import { CHROME } from './helpers/local-duel.js';
import { openMenuEntry } from './helpers/menu-nav.js';

const PORT = 4244;
const SHOTS = process.env.SHOTS === '1';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 20_000): Promise<boolean> => {
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
  /** Who "picks their Google account" on the next /authorize. */
  nextUser: 'alice' as string,
  codes: new Map<string, { challenge: string; user: string }>(),
  tokens: new Map<string, string>(),
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
    const code = randomUUID();
    fake.codes.set(code, { challenge: url.searchParams.get('code_challenge') ?? '', user: fake.nextUser });
    back.searchParams.set('code', code);
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
    if (url.pathname === '/auth/v1/logout') return void (res.writeHead(204, cors), res.end());
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
const browser = await chromium.launch({ executablePath: CHROME });
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync('docs/screens/accounts', { recursive: true });
  await page.screenshot({ path: `docs/screens/accounts/${name}.png` });
};

type Identity = { token: string; playerId: string; displayName: string | null; kind: string };
const identity = async (page: Page): Promise<Identity | null> =>
  (await page.evaluate(`(() => { try { return JSON.parse(localStorage.getItem('severgrow.duel.identity.v1')); } catch { return null; } })()`)) as Identity | null;
const toastText = (page: Page) => page.locator('.acct-toast').innerText().catch(() => '');
const settingsText = (page: Page) => page.locator('#acct-settings').innerText().catch(() => '');
const sheetVisible = (page: Page, id: string) => page.locator(`#${id}`).isVisible().catch(() => false);
const nicknameOpen = (page: Page, timeout = 20_000) => waitFor(() => sheetVisible(page, 'acct-nickname'), timeout);

/** Reach the duel lobby through the ONE shared doorway helper (helpers/menu-nav.ts): it opens the
 *  PLAY submenu on product channels and clicks the entry directly on legacy flat menus, so the
 *  module's own handler still runs either way. */
const openLobbyEntry = (page: Page) => openMenuEntry(page, 'menu-online');

/** Boot a fresh phone-sized device and walk it as far as the first online visit. */
const device = async (w: number, h: number) => {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  // The menu reveals its entries once the app is ready. One slow boot would strand the whole run,
  // so a plain reload is retried a couple of times (this is harness patience, not an app change).
  const entryReady = () =>
    page.evaluate(
      `(() => { const p = document.getElementById('menu-play'); const o = document.getElementById('menu-online'); return (!!p && !p.hidden) || (!!o && !o.hidden); })()`,
    ) as Promise<boolean>;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`${origin}/`);
    if (await waitFor(entryReady, 25_000)) break;
  }
  await waitFor(() => page.evaluate("document.body.classList.contains('acct-on')") as Promise<boolean>);
  await openLobbyEntry(page);
  await waitFor(() => sheetVisible(page, 'acct-welcome'));
  return { context, page };
};
const signIn = async (page: Page, user: string) => {
  fake.nextUser = user;
  await page.click('[data-acct="welcome-google"]');
};
const saveName = async (page: Page, name: string) => {
  await page.fill('#acct-nickname .acct-input', name);
  await page.locator('#acct-nickname .acct-input').dispatchEvent('keydown', {key:'Enter',isComposing:true,bubbles:true});
  await page.waitForTimeout(100);
  check('IME confirmation does not submit the nickname', await sheetVisible(page, 'acct-nickname'));

  await page.click('[data-acct="nickname-save"]');
};
const openSettings = async (page: Page) => {
  // Leave the hub (it takes over the whole screen) so the menu, and its Settings button, are back.
  const back = page.locator('#online-back');
  if (await back.isVisible().catch(() => false)) await back.click();
  await waitFor(() => page.locator('#menu-settings').isVisible().catch(() => false));
  await page.click('#menu-settings');
  await waitFor(() => sheetVisible(page, 'sheet-settings'));
};

try {
  // ---- 1. the first sign-in that forms an account asks for a name, once ----
  const d1 = await device(390, 844);
  await signIn(d1.page, 'alice');
  check('the first Google sign-in shows the nickname step', await nicknameOpen(d1.page));
  check('the new account starts from an empty box: no suggested name', (await d1.page.inputValue('#acct-nickname .acct-input')) === '');
  check('there is no skip on a new account', (await d1.page.locator('[data-acct="nickname-skip"]').count()) === 0);
  const fits = (await d1.page.evaluate(`(() => {
    const p = document.getElementById('acct-nickname');
    const r = p.getBoundingClientRect();
    const controls = [...p.querySelectorAll('button, input')];
    return { inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
             small: controls.filter((el) => el.getBoundingClientRect().height < 44).length,
             count: controls.length };
  })()`)) as { inView: boolean; small: number; count: number };
  check('the step fits a phone, every control at least 44px', fits.inView && fits.small === 0, `${fits.count} controls`);
  // The look the owner asked for: the SAME accounts glass as the welcome/privacy panels (dark,
  // cream), and a name field with NO border contour of its own. 16px so iOS never zooms on focus.
  const look = (await d1.page.evaluate(`(() => {
    const p = document.getElementById('acct-nickname');
    const field = p.querySelector('.acct-input');
    const fieldCss = getComputedStyle(field);
    const m = getComputedStyle(p).backgroundColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return { border: fieldCss.borderTopWidth, font: fieldCss.fontSize, avg: m ? (+m[1] + +m[2] + +m[3]) / 3 : 999 };
  })()`)) as { border: string; font: string; avg: number };
  check('the step is the dark accounts glass and the name field has no border', look.avg < 60 && look.border === '0px', `bg avg ${look.avg.toFixed(0)}, border ${look.border}`);
  check('the name field is 16px, so iOS never zooms on focus', look.font === '16px', look.font);
  // THE OWNER'S LIMIT (2026-10-30): account names are at most 8 characters on the way in.
  const nameMax = await d1.page.getAttribute('#acct-nickname .acct-input', 'maxlength');
  check('the name field caps at the server\'s 8 characters', nameMax === '8', String(nameMax));
  await shot(d1.page, 'nickname-390x844');

  // The server is the authority: a blocked word is refused and the sheet stays open.
  await saveName(d1.page, 'fuck');
  const errShown = await waitFor(async () => ((await d1.page.locator('#acct-nickname .acct-status').innerText().catch(() => '')) ?? '').trim().length > 0);
  check('a refused name shows an error line and the step stays open', errShown && (await sheetVisible(d1.page, 'acct-nickname')));

  const before1 = (await identity(d1.page))!;
  await saveName(d1.page, "Renée OH");
  check('saving closes the step and says so', await waitFor(async () => !(await sheetVisible(d1.page, 'acct-nickname')) && (await toastText(d1.page)).includes('Name saved')));
  const after1 = (await identity(d1.page))!;
  check('the typed name is stored (normalised), not a generated one', after1.displayName === "Renée OH", String(after1.displayName));
  check('the #tag did not move on the rename', playerTag(after1.playerId) === playerTag(before1.playerId) && after1.playerId === before1.playerId);

  await openSettings(d1.page);
  const myTag = `#${playerTag(after1.playerId)}`;
  check('Settings shows the new name with the same tag', await waitFor(async () => (await settingsText(d1.page)).includes(`Renée OH ${myTag}`)));
  check('Settings offers the "change nickname" entry', await d1.page.locator('[data-acct="change-nickname"]').isVisible());

  // ---- 2. changing it later from Settings keeps the tag ----
  await d1.page.click('[data-acct="change-nickname"]');
  check('the Settings entry reopens the same step, prefilled', await nicknameOpen(d1.page) && (await d1.page.inputValue('#acct-nickname .acct-input')) === "Renée OH");
  await shot(d1.page, 'settings-nickname-390x844');
  await saveName(d1.page, 'Renée II');
  check('a later change is stored too', await waitFor(async () => (await identity(d1.page))?.displayName === 'Renée II'));
  check('the tag is STILL the same after a second rename', `#${playerTag(((await identity(d1.page))!).playerId)}` === myTag);

  // ---- 3. a fresh account on a smaller phone: the step must be answered ----
  const d2 = await device(360, 640);
  await signIn(d2.page, 'bob');
  check('a second, brand-new account is asked too', await nicknameOpen(d2.page));
  await shot(d2.page, 'nickname-360x640');
  await d2.page.keyboard.press('Escape');
  await d2.page.mouse.click(4, 4);
  await d2.page.waitForTimeout(300);
  check('Escape and the scrim do not dismiss a new account\'s name step', await sheetVisible(d2.page, 'acct-nickname'));
  await saveName(d2.page, '   ');
  await d2.page.waitForTimeout(300);
  check('an empty name is not accepted', await sheetVisible(d2.page, 'acct-nickname'));
  await d2.page.reload();
  check('a reload brings the step back until a name is saved', await nicknameOpen(d2.page));
  await saveName(d2.page, 'Bobbin');
  check('typing a name closes it', await waitFor(async () => !(await sheetVisible(d2.page, 'acct-nickname'))));
  check('the typed name is the account\'s name', ((await identity(d2.page))?.displayName ?? '') === 'Bobbin');
  await d2.page.reload();
  check('once saved, it does not come back', !(await nicknameOpen(d2.page, 1_500)));

  // ---- 4. signing in again on another device never asks twice ----
  const d3 = await device(390, 844);
  await signIn(d3.page, 'alice');
  check('a later sign-in says "Welcome back"', await waitFor(async () => (await toastText(d3.page)).includes('Welcome back'), 25_000));
  check('a later sign-in does NOT ask for a name again', !(await nicknameOpen(d3.page, 3_000)));
  check('the name chosen on the other device is here', ((await identity(d3.page))?.displayName ?? '') === 'Renée II');

  // ---- 5. a guest is unaffected: no nickname entry anywhere ----
  const d4 = await device(390, 844);
  await d4.page.click('[data-acct="welcome-guest"]');
  await waitFor(() => sheetVisible(d4.page, 'online-hub'), 25_000);
  check('no nickname step for a guest', !(await nicknameOpen(d4.page, 1_500)));
  await openSettings(d4.page);
  check('no "change nickname" entry for a guest', (await d4.page.locator('[data-acct="change-nickname"]').count()) === 0 && (await settingsText(d4.page)).includes('Guest on this device'));

  for (const d of [d1, d2, d3, d4]) await d.context.close();
} finally {
  await browser.close().catch(() => undefined);
  await previewServer.close().catch(() => undefined);
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  await new Promise<void>((resolve) => authServer.close(() => resolve()));
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
