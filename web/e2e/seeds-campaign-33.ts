// LEVEL 33, END TO END: a real built page, a real Campaign win on the Outliers board, and the Seeds
// line the finish card actually paints (owner report, 2026-10-25: "I'm on level 33 and haven't been
// getting seeds - every level of campaign and any other game should pay out seeds immediately").
//
// The stub API verifies the replay with the SERVER's own verifier (`verifyCampaignProof`) and pays
// the economy's real amount for level 33 (20 Seeds, server/src/seeds/config.ts). Only the transport
// is stubbed, so what is measured is the client: the proof it builds, the queue it drains, and the
// line it paints.
//
// Three walks, because the bug was a QUEUE bug, not a level-data bug:
//
//   pay       a plain first clear: the proof is sent, the server pays 20, the card shows "+20 Seeds"
//   blocked   the device is also holding a Training proof the server answers with its CPU limit
//             (HTTP 546). The queue is drained oldest-first, so a pass that stopped at the first
//             answered failure never reached level 33's proof: the card showed NOTHING and no
//             Campaign request was ever made. The pass must step over it.
//   recover   NO game is played: the device boots holding one genuine winning proof, and the app
//             must pay it at start (the owner's stranded-Seeds path).
//
//   CHANNEL=futa05 node --import tsx web/e2e/seeds-campaign-33.ts   (writes /tmp/seeds33/*.png)
//   SKIP_BUILD=1 … reuses web/dist (for a before/after pair on the same script)
//   SEEDS_LIVE_API=https://<project>.supabase.co/functions/v1/duel … the SAME walks against the
//     deployed server (one fresh guest per walk, forwarded from Node so no CORS wall); a real receipt
//     is written for the exact player id printed as `LIVE guest …`. Opt-in: CI never spends quota.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page, Route } from 'playwright-core';
import { preview } from 'vite';
import { CAMPAIGN_LEVELS, campaignOpening } from '../../src/campaign/index.js';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { verifyCampaignProof } from '../../server/src/seeds/verify.js';
import { campaignSeedReward } from '../../server/src/seeds/config.js';
import { SEEDS_IDENTITY_UNVERIFIED } from '../src/online/seed-icon.js';

const OUT = process.env.SEEDS_SHOTS ?? '/tmp/seeds33';
const TAG = process.env.SHOT_TAG ?? 'after';
const PORT = Number(process.env.PORT ?? 4327);
const ORIGIN = `http://127.0.0.1:${PORT}`;
/**
 * `SEEDS_LIVE_API=https://…/functions/v1/duel` runs the SAME walk against the deployed server for a
 * real receipt (one guest, one proof). Unset — the default, and what CI runs — every call is stubbed
 * locally, so the suite never spends the free plan's quota.
 */
const LIVE = (process.env.SEEDS_LIVE_API ?? '').trim() || null;
/**
 * The app always talks to its own origin; in LIVE mode every `/functions/v1/duel/...` request is
 * FORWARDED to the deployed server from this process (Node), so the browser never sees a cross-origin
 * request. The server gets the real bytes and writes a real receipt.
 */
const PENDING_RAW = 'severgrow.seeds.pending.v1';
/** The local API base the built app calls; in LIVE mode a route forwards it to the deployed server. */
const LOCAL_API = `${ORIGIN}/functions/v1/duel`;
const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const IDENTITY_KEY = 'futa05:severgrow.duel.identity.v1';
const SETTINGS_KEY = 'futa05:severgrow.settings.v1';
const PROGRESS_KEY = 'futa05:severgrow.campaign.progress.v3';
const PENDING_KEY = 'futa05:severgrow.seeds.pending.v1';
const LEVEL = CAMPAIGN_LEVELS.find((level) => level.number === 33)!;
const REWARD = campaignSeedReward(LEVEL.number)!.firstWin;
const WALLET = { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: true };
/** Everything before level 33, so the campaign's Continue opens level 33 itself. */
const BEFORE_33 = JSON.stringify({
  version: 1,
  unlocked: 33,
  completed: CAMPAIGN_LEVELS.filter((level) => level.number < 33).map((level) => level.id),
  best: {},
});
/** A Training proof the server answers with its CPU limit (546) on every attempt. */
const BLOCKING_PROOF = JSON.stringify([
  { kind: 'training', ticketId: 'blocked-training-proof', actions: [], botVersion: CURRENT_BOT_VERSION },
]);

/**
 * A GENUINE winning line on level 33, computed once with the bot itself — the proof a player's device
 * would still be holding after a settle that never ran. Used only by the `recover/` scenario, which
 * never plays a game: it boots the app and expects the QUEUE ITSELF to be paid.
 */
const recoveryLine = (): Action[] => {
  for (const salt of [0x1234567, 0x9e3779b9, 0x7f4a7c15]) {
    let state = campaignOpening(LEVEL);
    const actions: Action[] = [];
    while (state.phase !== 'GAME_OVER' && actions.length < 900) {
      const actor = state.actor;
      const botLevel = actor === 0 ? 9 : LEVEL.botLevel;
      const action = chooseLevelAction(viewFor(state, actor), botLevel,
        botSeed(state.seed ^ (actor === 0 ? salt : 0), botLevel, state.turnNumber, state.history?.length ?? 0));
      actions.push(action);
      state = apply(state, action);
    }
    if (state.result?.winner === 0) return actions;
  }
  throw new Error('no winning line on c4-33');
};
const RECOVERY_PROOF = JSON.stringify([
  { kind: 'campaign', levelId: LEVEL.id, actions: recoveryLine(), botVersion: CURRENT_BOT_VERSION },
]);

mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const build = (): Promise<void> => new Promise((resolve, reject) => {
  if (process.env.SKIP_BUILD === '1') { resolve(); return; }
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env,
      CHANNEL: 'futa05',
      VITE_DUEL_API_URL: LOCAL_API,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:9',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'local-e2e-anon-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => { err += String(b); });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
});

const MEASURE = `(() => {
  const host = document.getElementById('go-seeds');
  const card = document.querySelector('#gameover .go-card');
  const screen = document.getElementById('gameover');
  const row = host && host.querySelector('.seed-gain');
  const num = row && row.querySelector('.seed-gain-num');
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const r = row ? row.getBoundingClientRect() : null;
  return {
    line: host && shown(host) ? (host.textContent || '').trim() : '',
    rowText: row && shown(row) ? (row.textContent || '').trim() : '',
    title: (document.getElementById('go-title') || {}).textContent || '',
    number: num ? num.textContent : null,
    rowHeight: r ? Math.round(r.height) : null,
    cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
    screenOverflow: screen ? screen.scrollHeight - screen.clientHeight : null,
    pageWide: document.documentElement.scrollWidth > window.innerWidth,
  };
})()`;

type Measured = { line: string; rowText: string; title: string; number: string | null; rowHeight: number | null; cardOverflow: number | null; screenOverflow: number | null; pageWide: boolean };

const waitStarter = async (page: Page): Promise<void> => {
  await page.waitForFunction(`(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  })()`, undefined, { timeout: 15_000 }).catch(() => undefined);
};

const dismissInstall = async (page: Page): Promise<void> => {
  for (const id of ['#install-close', '#install-later']) {
    if (await page.locator(id).isVisible().catch(() => false)) {
      await page.locator(id).click({ timeout: 2_000 }).catch(() => undefined);
      return;
    }
  }
};

/** The human policy: the strongest bot, choosing on the page's OWN live state.
 *
 *  A precomputed line cannot be replayed through the page: the app auto-advances some phases (an
 *  ACT with nothing left to do ends itself), so the stream of legal moves is not the engine's verbatim
 *  action list. Choosing per turn from the live state is immune to that. The salt only perturbs the
 *  choice (botSeed), so a fresh salt is a fresh game — the caller retries until one is won. */
const chooseHumanAction = (state: State, salt: number): Action => {
  const view = viewFor(state, 0);
  return chooseLevelAction(view, 9, botSeed(state.seed ^ salt, 9, state.turnNumber, state.history?.length ?? 0));
};

/** The salts tried, in order: on Outliers the first one usually wins; a fresh page replays a fresh game. */
const SALTS = [0x1234567, 0x9e3779b9, 0x7f4a7c15];

/** Play level 33 to its end; returns the winner (0/1/null) or a failure note. */
const playLevel33 = async (page: Page, salt: number): Promise<{ winner: number | null; note: string }> => {
  await waitStarter(page);
  const read = () => page.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
  const idle = () => page.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 30_000 });
  let waited = 0;
  for (let guard = 0; guard < 4000; guard++) {
    const s = await read();
    if (!s) return { winner: null, note: 'no state' };
    if (s.phase === 'GAME_OVER') return { winner: s.result?.winner ?? null, note: 'ended' };
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') return { winner: now.result?.winner ?? null, note: 'ended' };
    if (now.actor !== 0) {
      if (++waited > 600) return { winner: null, note: `the bot never finished its turn (${now.actor}, ${now.phase})` };
      await page.waitForTimeout(60);
      continue;
    }
    waited = 0;
    const legal = legalActions(viewFor(now, 0));
    const wanted = chooseHumanAction(now, salt);
    const action = legal.some((move) => JSON.stringify(move) === JSON.stringify(wanted)) ? wanted : legal[0];
    if (!action) return { winner: null, note: `no legal move at turn ${now.turnNumber} (${now.phase})` };
    const ok = await page.evaluate(`(() => window.__severgrow.playFor(${JSON.stringify(action)}, 0))()`) as boolean;
    if (!ok) await page.waitForTimeout(120);
  }
  return { winner: null, note: 'still playing' };
};

type Stub = { campaignPosts: string[]; trainingPosts: number; awards: number[] };

const stubSeeds = async (page: Page, options: { blockTraining: boolean }): Promise<Stub> => {
  const stub: Stub = { campaignPosts: [], trainingPosts: 0, awards: [] };
  await page.route('**/v1/seeds/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/v1/seeds/campaign')) {
      const body = JSON.parse(route.request().postData() ?? '{}') as { levelId: string; actions: Action[]; botVersion: string };
      stub.campaignPosts.push(body.levelId);
      const verified = verifyCampaignProof(body.levelId, body.actions, body.botVersion);
      if (!verified) {
        return route.fulfill({ status: 400, json: { ok: false, code: 'INVALID_REQUEST', message: 'That Campaign result could not be verified.' } });
      }
      const levelNumber = Number(body.levelId.split('-')[1]);
      const awarded = verified.winner === 0 ? (campaignSeedReward(levelNumber)?.firstWin ?? 0) : 0;
      stub.awards.push(awarded);
      return route.fulfill({ json: { reward: { awarded, reason: null, wallet: WALLET, replayed: false } } });
    }
    if (path.endsWith('/v1/seeds/training')) {
      stub.trainingPosts += 1;
      // The production answer the owner's device actually got: HTTP 546, "CPU Time exceeded".
      return route.fulfill({ status: 546, body: 'CPU Time exceeded' });
    }
    if (path.endsWith('/v1/seeds/wallet')) return route.fulfill({ json: { wallet: WALLET } });
    if (path.endsWith('/v1/seeds/training/tickets')) {
      return route.fulfill({ json: { ticket: { id: 'ticket-e2e', seed: 1, botLevel: 3, expiresAt: Date.now() + 3_600_000 } } });
    }
    return route.fulfill({ status: 404, json: { ok: false, code: 'NOT_FOUND', message: 'no stub route' } });
  });
  void options;
  return stub;
};

const boot = async (
  browser: Browser,
  viewport: { width: number; height: number },
  queuedProof: string | null,
  identity?: { token: string; playerId: string } | 'none',
) => {
  const context = await browser.newContext({
    viewport, hasTouch: viewport.width < 800, isMobile: viewport.width < 800, deviceScaleFactor: 1, serviceWorkers: 'block',
  });
  // `'none'` is the "no usable identity on this device" case: no record is seeded at all.
  const seededIdentity = identity === 'none' ? null : identity
    ? { token: identity.token, playerId: identity.playerId, displayName: 'E2E LIVE', kind: 'guest' }
    : { token: 'e2e-campaign-token', playerId: 'e2e-campaign-player', displayName: 'E2E', kind: 'guest' };
  await context.addInitScript({
    content: `(() => {
      try {
        localStorage.clear();
        ${seededIdentity ? `localStorage.setItem(${JSON.stringify(IDENTITY_KEY)}, ${JSON.stringify(JSON.stringify(seededIdentity))});` : ''}
        localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: true, eyeCandy: false, autoSkip: false }));
        localStorage.setItem('futa05:severgrow.install-prompt.v1', JSON.stringify({ games: 0, shown: true, never: true }));
        localStorage.setItem(${JSON.stringify(PROGRESS_KEY)}, ${JSON.stringify(BEFORE_33)});
        ${queuedProof ? `localStorage.setItem(${JSON.stringify(PENDING_KEY)}, ${JSON.stringify(queuedProof)});` : ''}
      } catch { /* storage blocked */ }
    })();`,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
};

const openCampaign = async (page: Page): Promise<void> => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('(() => !!(window.__severgrow && window.__severgrow.ready && window.__severgrow.ready()))()', undefined, { timeout: 60_000 });
  await page.waitForSelector('#menu-play:not([hidden])', { timeout: 30_000 }).catch(() => undefined);
  if (!(await page.locator('#play-menu').isVisible().catch(() => false))) {
    await page.click('#menu-play');
    await page.waitForSelector('#play-menu:not([hidden])', { timeout: 20_000 });
  }
  await page.click('#menu-campaign');
  await page.waitForFunction('(() => !!window.__severgrow.state() || !document.getElementById("campaign").hidden)()', undefined, { timeout: 30_000 });
  if (await page.locator('#campaign-continue').isVisible().catch(() => false)) await page.click('#campaign-continue');
  await page.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 60_000 });
};

/**
 * LIVE only: every app request to its own `/functions/v1/duel/...` is FORWARDED to the deployed
 * server from Node. The browser sees a same-origin response (so no CORS wall) while the server gets
 * the real bytes and writes a real receipt.
 */
const wireLive = async (page: Page, counts: Stub): Promise<void> => {
  page.on('requestfailed', (request) => {
    if (request.url().includes('/seeds/')) console.log(`REQ FAILED ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') console.log(`PAGE ${message.type()}: ${message.text().slice(0, 400)}`);
  });
  await page.route('**/functions/v1/duel/**', async (route: Route) => {
    const target = route.request().url().replace(LOCAL_API, LIVE ?? LOCAL_API);
    // Count what the app ACTUALLY sent. The stub counters never see a forwarded call, so a live run
    // used to print `campaignPosts=0` even when the proof was paid — a measurement artifact, not a bug.
    const path = new URL(target).pathname;
    if (path.endsWith('/v1/seeds/campaign')) {
      try {
        const body = JSON.parse(route.request().postData() ?? '{}') as { levelId?: string };
        counts.campaignPosts.push(body.levelId ?? '(no levelId)');
      } catch { counts.campaignPosts.push('(unreadable body)'); }
    }
    if (path.endsWith('/v1/seeds/training')) counts.trainingPosts += 1;
    console.log(`FORWARD ${route.request().method()} ${target}`);
    try {
      const response = await route.fetch({ url: target });
      console.log(`FORWARD -> ${response.status()}`);
      await route.fulfill({ response });
    } catch (error) {
      console.log('FORWARD FAILED', error);
      await route.abort();
    }
  });
};

const portrait = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };

await build();
// A build-time API-base misconfiguration affects EVERY player at once. Read the artifact back: the
// built config chunk must carry exactly the base this build was given. (The deployed production
// bundle was checked the same way; it carries the real Edge URL.)
const configChunks = readdirSync('web/dist/assets').filter((file) => file.startsWith('config-') && file.endsWith('.js'));
check(
  `the built bundle carries the API base (${LOCAL_API})`,
  configChunks.some((file) => readFileSync(`web/dist/assets/${file}`, 'utf8').includes(LOCAL_API)),
  configChunks.join(', ') || 'no config chunk',
);
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({
  executablePath: CHROME,
  // The CI box runs several suites at once; these keep a single browser's footprint down.
  args: ['--disable-dev-shm-usage', '--disable-gpu'],
});
const rows: string[] = [];
/** `ONLY="pay/phone"` re-runs one scenario while iterating on the frames. */
const ONLY = (process.env.ONLY ?? '').split(',').map((value) => value.trim()).filter(Boolean);

const run = async (
  name: string,
  viewport: { width: number; height: number },
  queuedProof: string | null,
  shot: string,
  identity?: { token: string; playerId: string } | 'none',
  options: { blockIdentity?: boolean } = {},
) => {
  if (ONLY.length && !ONLY.includes(name)) return;
  const { context, page, errors } = await boot(browser, viewport, queuedProof, identity);
  try {
    const stub: Stub = LIVE
      ? { campaignPosts: [], trainingPosts: 0, awards: [] }
      : await stubSeeds(page, { blockTraining: queuedProof === BLOCKING_PROOF });
    if (LIVE) await wireLive(page, stub);
    if (options.blockIdentity) {
      // The device cannot establish an identity at all (the owner's live case: guest creation
      // unreachable). Every seed call must be preceded by this, so nothing is ever posted.
      await page.route('**/v1/guests', (route: Route) =>
        route.fulfill({ status: 503, json: { ok: false, code: 'UNAVAILABLE', message: 'Sign-in is unavailable right now.' } }));
    }
    let winner: number | null = null;
    let played = '';
    // A fresh salt is a fresh game: the same level, a different line. Level 33 is open ground at bot
    // 9, so the first line is not always the winning one.
    for (const salt of SALTS) {
      if (salt !== SALTS[0]) {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
      await openCampaign(page);
      const opened = await page.evaluate('(() => { const s = window.__severgrow.state(); return s && s.seed; })()') as number | null;
      if (salt === SALTS[0]) check(`${name}: level 33 is the game on the board`, opened === LEVEL.seed, `seed ${opened} vs ${LEVEL.seed}`);
      const result = await playLevel33(page, salt);
      winner = result.winner;
      played = result.note;
      if (result.note !== 'ended') break;
      if (winner === 0) break;
    }
    check(`${name}: the game reached a real end`, played === 'ended', played);
    check(`${name}: the human WON level 33`, winner === 0, `winner ${String(winner)}`);
    await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
    await dismissInstall(page);
    if (options.blockIdentity) {
      // THE SILENT-DEFERRAL REGRESSION (owner reproduction, 2026-10-25). With no usable identity the
      // settle must SAY SO on the card and leave the proof queued — not paint nothing for a session
      // and send nothing, which is what made the bug invisible.
      await page.waitForFunction(
        `(() => (document.getElementById('go-seeds')?.textContent ?? '').trim() === ${JSON.stringify(SEEDS_IDENTITY_UNVERIFIED)})()`,
        undefined,
        { timeout: 20_000 },
      ).catch(() => undefined);
      await page.waitForTimeout(400);
      const seen = await page.evaluate(MEASURE) as Measured;
      await page.screenshot({ path: `${OUT}/${TAG}-${shot}.png` });
      const left = await page.evaluate(`(() => localStorage.getItem(${JSON.stringify(PENDING_RAW)}))()`) as string | null;
      const queued = JSON.parse(left ?? '[]') as { levelId?: string }[];
      check(`${name}: the card says the honest identity line`, seen.line === SEEDS_IDENTITY_UNVERIFIED, `"${seen.line}"`);
      check(`${name}: the unverified proof is STILL QUEUED`, queued.some((entry) => entry.levelId === LEVEL.id), `pending ${String(left).slice(0, 120)}`);
      check(`${name}: nothing was posted to the server`, stub.campaignPosts.length === 0, `posts: [${stub.campaignPosts.join(', ')}]`);
      check(`${name}: the card did not scroll and the page did not widen`,
        seen.cardOverflow === 0 && seen.screenOverflow === 0 && !seen.pageWide,
        `card ${seen.cardOverflow} screen ${seen.screenOverflow} wide ${seen.pageWide}`);
      check(`${name}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
      rows.push(`${name}: line="${seen.line}" campaignPosts=${stub.campaignPosts.length} queued=${queued.length}`);
      return;
    }
    // The settle answers within a few seconds on an honest line; give the card its moment.
    await page.waitForFunction(`(() => (document.getElementById('go-seeds')?.textContent ?? '').trim() !== '')()`, undefined, { timeout: 20_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1_600);
    const seen = await page.evaluate(MEASURE) as Measured;
    await page.screenshot({ path: `${OUT}/${TAG}-${shot}.png` });
    if (!LIVE) {
      check(`${name}: the Campaign proof reached the server`, stub.campaignPosts.includes('c4-33'), `posts: [${stub.campaignPosts.join(', ')}]`);
      check(`${name}: the server paid ${REWARD} Seeds`, stub.awards.includes(REWARD), `awards: [${stub.awards.join(', ')}]`);
    }
    check(`${name}: the card shows +${REWARD} Seeds`, seen.line === `+${REWARD} Seeds` || seen.rowText.includes(`+${REWARD}`), `line "${seen.line}" row "${seen.rowText}"`);
    if (LIVE) {
      check(`${name}: the Campaign proof reached the live server`, stub.campaignPosts.includes('c4-33'), `posts: [${stub.campaignPosts.join(', ')}]`);
      // The real server answered with a receipt: the queue must be empty afterwards, because only a
      // paid (or replayed) proof is removed.
      // The app patches `Storage.prototype` to prepend the channel prefix, so reading from the page
      // must use the UNPREFIXED key.
      const left = await page.evaluate(`(() => localStorage.getItem(${JSON.stringify(PENDING_RAW)}))()`) as string | null;
      check(`${name}: the paid proof left the queue`, (left ?? '[]') === '[]', `pending ${left}`);
    }
    check(`${name}: the card did not scroll and the page did not widen`, seen.cardOverflow === 0 && seen.screenOverflow === 0 && !seen.pageWide,
      `card ${seen.cardOverflow} screen ${seen.screenOverflow} wide ${seen.pageWide}`);
    check(`${name}: no page errors`, errors.length === 0, errors.join(' | '));
    rows.push(`${name}: line="${seen.line}" row="${seen.rowText}" campaignPosts=${stub.campaignPosts.length} trainingPosts=${stub.trainingPosts} award=${stub.awards.join('/')}`);
  } finally {
    await context.close();
  }
};

// A real receipt needs a real identity, and EVERY run needs its own: a second first clear on the
// same guest is (correctly) `replayed` and paints no second +N.
const liveGuest = async (): Promise<{ token: string; playerId: string } | undefined> => {
  if (!LIVE) return undefined;
  const res = await fetch(`${LIVE}/v1/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const body = await res.json() as { token?: string; player?: { id?: string } };
  if (!res.ok || !body.token || !body.player?.id) throw new Error(`live guest failed: ${res.status} ${JSON.stringify(body)}`);
  console.log(`LIVE guest ${body.player.id} on ${LIVE}`);
  return { token: body.token, playerId: body.player.id };
};

/**
 * THE RECOVERY WALK — no game is played. The device boots holding one genuine winning proof, and
 * nothing else happens: if the queue is settled at app start, a receipt exists by the time the menu
 * paints. This is the owner's stranded-Seeds path (levels whose finish card never reached the server).
 */
const runRecover = async (
  name: string,
  viewport: { width: number; height: number },
  shot: string,
  identity?: { token: string; playerId: string },
) => {
  if (ONLY.length && !ONLY.includes(name)) return;
  const { context, page, errors } = await boot(browser, viewport, RECOVERY_PROOF, identity);
  try {
    const stub: Stub = LIVE
      ? { campaignPosts: [], trainingPosts: 0, awards: [] }
      : await stubSeeds(page, { blockTraining: false });
    if (LIVE) await wireLive(page, stub);
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('(() => !!(window.__severgrow && window.__severgrow.ready && window.__severgrow.ready()))()', undefined, { timeout: 60_000 });
    const drained = await page.waitForFunction(
      `(() => localStorage.getItem(${JSON.stringify(PENDING_RAW)}) === '[]')()`,
      undefined, { timeout: 30_000 },
    ).then(() => true).catch(() => false);
    const left = await page.evaluate(`(() => localStorage.getItem(${JSON.stringify(PENDING_RAW)}))()`) as string | null;
    check(`${name}: the queued proof was settled on boot`, drained, `pending ${String(left).slice(0, 120)}`);
    if (!LIVE) {
      check(`${name}: the queued Campaign proof reached the server`, stub.campaignPosts.includes('c4-33'), `posts: [${stub.campaignPosts.join(', ')}]`);
      check(`${name}: the server paid ${REWARD} Seeds`, stub.awards.includes(REWARD), `awards: [${stub.awards.join(', ')}]`);
    }
    await page.screenshot({ path: `${OUT}/${TAG}-${shot}.png` });
    check(`${name}: no page errors`, errors.length === 0, errors.join(' | '));
    rows.push(`${name}: drained=${drained} campaignPosts=${stub.campaignPosts.length} award=${stub.awards.join('/')}`);
  } finally {
    await context.close();
  }
};

await run('pay/phone', portrait, null, 'pay-390x844', await liveGuest());
await run('pay/desktop', desktop, null, 'pay-1280x800', await liveGuest());
if (!LIVE) {
  await run('blocked/phone', portrait, BLOCKING_PROOF, 'blocked-390x844');
  await run('blocked/desktop', desktop, BLOCKING_PROOF, 'blocked-1280x800');
  // No identity can be established: the card must say so and keep the proof (the live silent case).
  await run('unverified/desktop', desktop, null, 'unverified-1280x800', 'none', { blockIdentity: true });
}
await runRecover('recover/phone', portrait, 'recover-390x844', await liveGuest());
await runRecover('recover/desktop', desktop, 'recover-1280x800', await liveGuest());

await browser.close();
await server.close();
console.log('\n' + rows.join('\n'));
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}  screenshots: ${OUT}/${TAG}-*.png`);
process.exit(failed === 0 ? 0 : 1);
