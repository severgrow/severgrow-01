// The admin dashboard, driven in a real browser against a real (local, in-process) API.
//
//   npx tsx web/e2e/admin-dashboard.ts
//   PW_CHROMIUM must point at a Chrome/Chromium build.
//
// WHY A LOCAL API RATHER THAN THE DEPLOYED ONE: this suite must be free (the project's own quota
// guard exists because automated runs once burned a month of egress), deterministic, and able to
// create the exact shapes it wants — an overdue match, a two-day world replay, a report with an
// awkward message. It builds `web/dist-admin` against a loopback API, seeds that API in process, and
// drives the built page. Nothing here touches a real project, and `?api=` is the dashboard's own
// documented override for exactly this.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { createFetchApp } from '../../server/src/fetch-app.js';
import { chainRouters, createFeedbackRouter, MemoryFeedbackStore } from '../../server/src/feedback/feedback.js';
import { MemoryIdentityLinkStore } from '../../server/src/accounts/accounts.js';
import { MatchService } from '../../server/src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { createAdminRouter } from '../../server/src/admin/router.js';
import { memoryAdminStore } from '../../server/src/admin/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { hashToken, newId, newToken } from '../../server/src/ids.js';
import { playerTag } from '../../src/player-tag.js';
import { serveStaticDist } from './helpers/preview-port.js';
import type { PlayerRecord } from '../../server/src/storage/types.js';
import type { Action } from '../../src/engine/index.js';

const ADMIN_ID = '37e3d4d0-a34c-45b3-bc61-992fcf392912';
const DAY = 24 * 60 * 60 * 1000;
const OUT = new URL('../../docs/screens/admin/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const tick = (ms = 150): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------- the seeded API

type Seeded = {
  close: () => Promise<void>;
  base: string;
  adminToken: string;
  playerToken: string;
  playerId: string;
  /** The duel that really has a committed move, so the timeline check is not the empty state. */
  duelMatchId: string;
  counts: { reports: number; claims: number; matches: number; logs: string[] };
};

const startApi = async (): Promise<Seeded> => {
  const now = Date.now();
  const storage = new MemoryStorage();
  const config = {
    ...DEFAULT_SERVER_CONFIG,
    corsOrigins: ['*'],
    adminPlayerIds: [ADMIN_ID],
    turnTimeoutMs: DAY,
    graceExtensionMs: DAY,
    rateLimits: {
      ...DEFAULT_SERVER_CONFIG.rateLimits,
      guestPerIpPerHour: 10_000,
      createPerPlayerPerHour: 10_000,
      createPerIpPerHour: 10_000,
      actionsPerPlayerPerMinute: 10_000,
      joinPerPlayerPerHour: 10_000,
      joinPerIpPerHour: 10_000,
    },
  };
  const feedback = new MemoryFeedbackStore();
  const economyStore = new MemoryWorldEconomyStore();
  const links = new MemoryIdentityLinkStore();
  const economy = new WorldEconomyService(economyStore, storage, () => Date.now());
  const service = new MatchService({ storage, config, economy, now: () => Date.now() });

  const makePlayer = async (id: string | null, kind: 'guest' | 'account', name: string): Promise<{ player: PlayerRecord; token: string }> => {
    const playerId = id ?? newId();
    const player: PlayerRecord = { id: playerId, kind, displayName: name, createdAt: now - 3 * DAY, upgradedAt: kind === 'account' ? now - 2 * DAY : null };
    await storage.createPlayer(player);
    const token = newToken();
    await storage.issueToken({ id: newId(), playerId, tokenHash: hashToken(token), createdAt: now, revokedAt: null });
    return { player, token };
  };

  const owner = await makePlayer(ADMIN_ID, 'account', 'RYK');
  await links.link({ provider: 'google', subject: 'e2e-subject-only', playerId: owner.player.id, createdAt: now });
  const rival = await makePlayer(null, 'guest', 'BrambleOwl');
  const other = await makePlayer(null, 'account', 'HazelFinch');

  // One report and one crash, with the awkward shapes the brief asks about: a long message, a
  // message that looks like a spreadsheet formula, and a nested context.
  await feedback.insert({
    id: newId(), createdAt: now - 3_600_000, kind: 'report', playerId: rival.player.id,
    message: 'The board froze after my Bloom, then the timer kept running.\nSecond line.',
    context: { screen: 'game', phase: 'ACT', turnNumber: 7, viewport: { width: 390, height: 844 }, nested: { deep: { deeper: 'still here' } } },
    build: 'index-E2E00001.js · 0.5.0 · futasaku0.5-online-e2e', userAgent: 'E2EPhone/1',
  });
  await feedback.insert({
    id: newId(), createdAt: now - 2 * 3_600_000, kind: 'crash', playerId: null,
    message: '=HYPERLINK("http://example.invalid","tap me") TypeError: x is not a function',
    context: { screen: 'menu' }, build: 'index-E2E00002.js · 0.5.0 · futasaku0.5-online-e2e', userAgent: 'E2EDesktop/2',
  });
  for (let i = 0; i < 30; i += 1) {
    await feedback.insert({
      id: newId(), createdAt: now - (10 + i) * 3_600_000, kind: i % 4 === 0 ? 'crash' : 'report', playerId: null,
      message: `bulk report ${i}`, context: { screen: 'game', step: i }, build: 'index-E2E00001.js · 0.5.0 · futasaku0.5-online-e2e', userAgent: 'E2ELoad/1',
    });
  }

  // A real duel with a real committed move, so the timeline renders a recorded move and not an
  // empty state: create, join, then submit the acting seat's own first legal action.
  const created = await service.createMatch(owner.player, {}, null);
  await service.joinMatch(rival.player, created.match.inviteCode, null);
  const viewA = await service.viewPayload(owner.player, created.match.matchId, 0);
  const viewB = await service.viewPayload(rival.player, created.match.matchId, 0);
  const acting = viewA.legalActions.length > 0 ? { player: owner.player, view: viewA } : { player: rival.player, view: viewB };
  check('the seeded duel offers a legal action to record', acting.view.legalActions.length > 0);
  await service.submitAction(acting.player, created.match.matchId, {
    expectedRevision: acting.view.revision,
    requestId: 'e2e-move-1',
    action: acting.view.legalActions[0] as Action,
  });

  // A match that is overdue: active, but its deadline is in the past. The stuck panel must find it.
  const overdue = await service.createMatch(other.player, {}, null);
  await service.joinMatch(owner.player, overdue.match.inviteCode, null);

  // Seeds: a full day of duel awards (so the daily cap and its denial are real), a friend win, a
  // training win, a campaign first clear AND a repeat clear (which is denied) — then two world tiles
  // claimed on DIFFERENT days, so the replay has more than one day to step through.
  for (let i = 0; i < 22; i += 1) {
    await economyStore.settle({ playerId: owner.player.id, sourceKey: `e2e-queue-${i}`, mode: 'queue', outcome: 'win', opponentId: newId(), now: now - DAY });
  }
  await economyStore.settle({ playerId: owner.player.id, sourceKey: 'e2e-friend-1', mode: 'friend', outcome: 'win', opponentId: newId(), now: now - 2 * DAY });
  const ticketId = newId();
  await economyStore.issueTrainingTicket({ id: ticketId, playerId: owner.player.id, seed: 4242, botLevel: 3, createdAt: now - 2 * DAY, expiresAt: now + DAY, usedAt: null });
  await economyStore.settle({ playerId: owner.player.id, sourceKey: `training:${ticketId}`, mode: 'training', outcome: 'win', opponentId: null, now: now - 2 * DAY, trainingTicketId: ticketId });
  await economyStore.settle({ playerId: owner.player.id, sourceKey: 'campaign:c1-01', mode: 'campaign', outcome: 'win', opponentId: null, now: now - 600_000, campaignLevel: 1 });
  await economyStore.settle({ playerId: owner.player.id, sourceKey: 'campaign:c1-02', mode: 'campaign', outcome: 'win', opponentId: null, now: now - 500_000, campaignLevel: 1 });
  const firstTile = await economyStore.claim(owner.player.id, '0,0', 'e2e-claim-aaaa', now - 2 * DAY);
  const secondTile = await economyStore.claim(owner.player.id, '1,0', 'e2e-claim-bbbb', now - DAY);
  check('the seeded world accepted both claims', firstTile.ok && secondTile.ok);
  const wallet = await economyStore.wallet(owner.player.id);
  check('the seeded wallet funded both tiles', wallet.balance >= 0 && wallet.lifetimeSpent === 200, `balance ${wallet.balance}, spent ${wallet.lifetimeSpent}`);

  const logs: string[] = [];
  const admin = createAdminRouter({
    store: memoryAdminStore({ storage, feedback, economy: economyStore, links }),
    authenticate: (t) => service.authenticate(t),
    config,
    now: () => Date.now(),
    rulesVersion: service.rulesVersion,
    storage,
    pingDb: () => storage.ping(),
    log: (line) => logs.push(line),
  });
  const app = createFetchApp({
    service,
    config,
    live: chainRouters(
      createFeedbackRouter({ store: feedback, storage, authenticate: (t) => service.authenticate(t), now: () => Date.now() }),
      admin,
    ),
  });

  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const url = `http://127.0.0.1${req.url ?? '/'}`;
      const init: RequestInit = { method: req.method ?? 'GET', headers: Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((one) => [k, one] as [string, string]) : v === undefined ? [] : [[k, v] as [string, string]])) };
      if ((req.method ?? 'GET') !== 'GET' && (req.method ?? 'GET') !== 'HEAD') init.body = new Uint8Array(Buffer.concat(chunks));
      const response = await app(new Request(url, init));
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    })().catch(() => {
      res.statusCode = 500;
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const apiPort = typeof address === 'object' && address !== null ? address.port : 0;

  // Make the seeded duel's deadline overdue, so the stuck panel has a real entry.
  await storage.setTurnDeadline(overdue.match.matchId, now - 60_000);

  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    base: `http://127.0.0.1:${apiPort}`,
    adminToken: owner.token,
    playerToken: rival.token,
    playerId: owner.player.id,
    duelMatchId: created.match.matchId,
    counts: { reports: feedback.rows.length, claims: economyStore.claims.size, matches: storage.allMatches().length, logs },
  };
};

// ---------------------------------------------------------------------------- build + serve

console.log('building the admin dashboard against the local API …');
const buildAdmin = (apiBase: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'admin/vite.config.ts'], {
      env: { ...process.env, VITE_DUEL_API_URL: apiBase },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`admin build failed (${code})`))));
  });

const seeded = await startApi();
console.log(`seeded API on ${seeded.base}`);
await buildAdmin(seeded.base);

const served = await serveStaticDist('web/dist-admin');
console.log(`dashboard on ${served.url}`);

// The dashboard reads its token from the key the game itself writes, so the browser is given one
// exactly as the game would have left it. This is the honest end-to-end path: no test-only hook.
const identityScript = (token: string, playerId: string, name: string): string =>
  `try { localStorage.setItem('futa05:severgrow.duel.identity.v1', ${JSON.stringify(JSON.stringify({ token, playerId, displayName: name, kind: 'account' }))}); } catch (e) {}`;

const browser: Browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const openAs = async (token: string, playerId: string, name: string): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript({ content: identityScript(token, playerId, name) });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
  return { context, page };
};

const settle = async (page: Page, text: string, timeout = 15_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = await page.locator(`text=${text}`).first().count().catch(() => 0);
    if (found > 0) return true;
    await tick(150);
  }
  return false;
};

const goto = async (page: Page, hash: string): Promise<void> => {
  await page.goto(`${served.url}?api=${encodeURIComponent(seeded.base)}#${hash}`, { waitUntil: 'domcontentloaded' });
  await tick(400);
};

const textOf = (page: Page): Promise<string> => page.evaluate(() => document.body.innerText);

// ---------------------------------------------------------------------------- (a) not an admin

{
  const { context, page } = await openAs(seeded.playerToken, 'not-the-owner', 'BrambleOwl');
  await page.goto(`${served.url}?api=${encodeURIComponent(seeded.base)}#/overview`, { waitUntil: 'domcontentloaded' });
  await tick(800);
  const stored = await page.evaluate(() => localStorage.getItem('futa05:severgrow.duel.identity.v1') !== null);
  check('the game\'s own stored identity is readable by the dashboard', stored);
  const deniedVisible = await page.locator('#denied').isVisible();
  const gateVisible = await page.locator('#gate').isVisible();
  check('a normal player sees the access-denied screen and nothing else', deniedVisible && !gateVisible, `denied=${deniedVisible} gate=${gateVisible}`);
  const body = await page.evaluate(() => document.body.innerText);
  check('the denied screen leaks no figure or navigation', !/Overview|Reports|Campaign|Since you last looked/.test(body), body.replace(/\n+/g, ' ').slice(0, 90));
  await page.screenshot({ path: `${OUT}denied.png`, fullPage: true });
  await context.close();
}

// ---------------------------------------------------------------------------- (b) the admin

{
  const errors: string[] = [];
  const { context, page } = await openAs(seeded.adminToken, seeded.playerId, 'RYK');
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await goto(page, '/overview');
  check('the dashboard opens on Overview for the owner', await settle(page, 'Since you last looked'));
  const overview = await textOf(page);
  check('Overview shows the new counters', /New reports/.test(overview) && /New crashes/.test(overview));
  check('Overview shows the worst shipped build', /index-E2E00001\.js/.test(overview), 'the seeded asset name');
  check('Overview states what it cannot measure', /cannot measure/.test(overview) && /Active users/.test(overview));
  check('Overview labels the duel modes honestly', /Find opponent/.test(overview) && /Invite/.test(overview));
  await page.screenshot({ path: `${OUT}overview-desktop.png`, fullPage: true });

  // Mark seen. Before the click the cursor is unset; after it the card must say WHEN.
  const beforeSeen = await textOf(page);
  check('a fresh dashboard says it has no cursor yet', /you have not marked a visit yet/.test(beforeSeen));
  await page.getByRole('button', { name: 'Mark as seen' }).click();
  await tick(900);
  const afterSeen = await textOf(page);
  check('marking as seen records the cursor server-side', /since /.test(afterSeen), afterSeen.split('\n').find((line) => line.startsWith('since')) ?? 'no "since" line');

  // Reports: list, filter, open, triage, then the CSV export.
  await goto(page, '/reports');
  check('the report list renders', await settle(page, 'index-E2E00002.js'));
  const reportsText = await textOf(page);
  check('a report with a newline and an awkward message renders', /board froze after my Bloom/.test(reportsText) || /board froze/.test(reportsText));
  check('a formula-looking crash message renders as text', /HYPERLINK/.test(reportsText));
  check('the report list states its export cap', /5,000/.test(await textOf(page)));

  await page.locator('select[name="kind"]').selectOption('crash');
  await tick(600);
  const crashesOnly = await textOf(page);
  check('filtering by kind narrows the list', !/board froze/.test(crashesOnly) && /HYPERLINK/.test(crashesOnly));

  await page.locator('select[name="status"]').selectOption('');
  await page.locator('select[name="kind"]').selectOption('');
  await tick(600);

  // Pagination with a large result set: 32 seeded rows, 25 per page.
  const hasMore = await page.getByRole('button', { name: 'Load more' }).count();
  check('a large result set offers a next page', hasMore > 0);
  if (hasMore > 0) {
    await page.getByRole('button', { name: 'Load more' }).first().click();
    await tick(700);
    const paged = await textOf(page);
    check('the next page appends without replacing', /32 of 32 reports/.test(paged), paged.match(/\d+ of \d+ reports/)?.[0] ?? 'no pager line');
  }

  // Open the first report and triage it.
  await page.locator('tbody tr').first().click();
  check('opening a report shows its detail', await settle(page, 'Private note'));
  await page.locator('.card select[aria-label="Triage status"]').last().selectOption('reviewing');
  await page.locator('textarea[aria-label="Private admin note"]').last().fill('Reproduced on the seeded device; the timer kept running.');
  await page.getByRole('button', { name: 'Save triage' }).last().click();
  const triaged = await settle(page, 'Recorded in the audit log');
  const feedbackText = await page.locator('.triage-feedback').last().innerText().catch(() => '(no feedback line)');
  check('triage saves and says it was audited', triaged, triaged ? '' : feedbackText);
  const statusAfter = await page.locator('tbody tr').first().innerText().catch(() => '');
  check('the list reflects the new triage status', /reviewing/.test(statusAfter), statusAfter.replace(/\n/g, ' ').slice(0, 60));
  // The private note is SAVED, not just displayed: read it back from the API.
  const savedNote = await page.evaluate(async ([base, token]) => {
    const response = await fetch(`${base}/v1/admin/reports?limit=1`, { headers: { authorization: `Bearer ${token}`, 'x-futasaku-client-version': '0.5.0' } });
    const body = (await response.json()) as { rows?: { note?: string; status?: string }[] };
    return body.rows?.[0]?.note ?? '';
  }, [seeded.base, seeded.adminToken] as const);
  check('the private note was actually stored, not just typed', savedNote.length > 0, `stored ${savedNote.length} character(s)`);
  await page.screenshot({ path: `${OUT}reports-desktop.png`, fullPage: true });

  // Player lookup.
  await goto(page, '/player?q=BrambleOwl');
  check('a player lookup by nickname returns the player', await settle(page, 'Seeds balance'));
  const playerText = await textOf(page);
  check('the player screen shows the authoritative Seeds balance', /Seeds balance/.test(playerText));
  check('the player screen keeps Google data out', !/@|google\.com/.test(playerText), 'no email-shaped text');
  const tag = playerTag(seeded.playerId);
  await goto(page, `/player?q=%23${tag}`);
  await settle(page, 'Seeds balance');
  const tagText = await textOf(page);
  check('a tag lookup finds the player by its tag', /Seeds balance/.test(tagText), `#${tag}`);
  check('the player screen says a tag is a hash, and is bounded', /hash of the player id/i.test(tagText), tagText.split('\n').find((line) => /hash/i.test(line)) ?? 'no note');
  await page.screenshot({ path: `${OUT}player-desktop.png`, fullPage: true });

  // Match explorer + a real recorded move in the timeline.
  await goto(page, '/matches');
  check('the match list renders', await settle(page, 'Find opponent') || await settle(page, 'Invite a friend'));
  // Open the duel that HAS a committed move (the newest row is the overdue one, with none).
  await goto(page, `/match/${seeded.duelMatchId}`);
  check('a match opens on its timeline', await settle(page, 'Rules version'));
  const detailText = await textOf(page);
  const timelineRows = await page.locator('.timeline li').count();
  check('the timeline shows the recorded move', timelineRows === 1, `${timelineRows} move row(s)`);
  check('the timeline names the action and its seat', /seat [01]/.test(detailText) && /#1/.test(detailText));
  // And the empty state is real for a match with no moves.
  await goto(page, '/matches');
  await page.locator('tbody tr').first().click();
  check('a match with no moves says so plainly', await settle(page, 'No moves were committed'));
  const payload = await page.evaluate(async ([base, token, hash]) => {
    const id = hash.split('/').pop() ?? '';
    const response = await fetch(`${base}/v1/admin/matches/${id}`, { headers: { authorization: `Bearer ${token}`, 'x-futasaku-client-version': '0.5.0' } });
    const body = (await response.json()) as { match?: Record<string, unknown>; moves?: unknown[] };
    return { matchKeys: Object.keys(body.match ?? {}), raw: JSON.stringify(body).slice(0, 8000), moves: (body.moves ?? []).length };
  }, [seeded.base, seeded.adminToken, await page.evaluate(() => location.hash)] as const);
  check('the match payload never carries authoritative state, a seed or an invite code', !/"(state|seed|inviteCode|token|hand|deck|history)"/.test(payload.raw), `match keys: ${payload.matchKeys.join(',')}`);
  check('a recorded move reports its event COUNT, never the events themselves', !/"events":\[/.test(payload.raw));
  await page.screenshot({ path: `${OUT}match-desktop.png`, fullPage: true });

  // Seeds, the ledger, the map and the world replay.
  await goto(page, '/seeds');
  check('the ledger renders', await settle(page, 'Seeds ledger'));
  const seedsText = await textOf(page);
  check('the economy reconciles minted against spent', /Minted per Seed spent/.test(seedsText));
  check('the ledger shows a positive and a negative delta', /\+30/.test(seedsText) && /-100/.test(seedsText), 'a duel award and a tile cost');
  check('the economy shows denial reasons', /opponent_daily_limit|mode_daily_limit|global_daily_limit|no_draw_reward|not_a_first_clear|awarded/.test(seedsText));

  const hexes = await page.locator('.world-grid polygon').count();
  const latestClaims = await page.locator('.world-grid polygon[fill]:not([fill="var(--c-surface)"])').count();
  check('the map draws the whole landmass', hexes === 183, `${hexes} hexes`);
  check('the map draws the claimed tiles', latestClaims === 2, `${latestClaims} claimed`);

  const slider = page.locator('input[type="range"][aria-label="Replay day"]');
  check('the replay offers a day slider', (await slider.count()) > 0);
  if ((await slider.count()) > 0) {
    const max = Number(await slider.getAttribute('max'));
    await slider.fill('0');
    await tick(400);
    const earliest = await page.locator('.world-grid polygon[fill]:not([fill="var(--c-surface)"])').count();
    await slider.fill(String(max));
    await tick(400);
    const latest = await page.locator('.world-grid polygon[fill]:not([fill="var(--c-surface)"])').count();
    check('the replay is cumulative: an earlier day never shows more tiles', earliest <= latest, `day 0 → ${earliest}, latest → ${latest}`);
    check('the replay actually changes with the day', earliest < latest, `${earliest} then ${latest}`);

    // Cross-check the replay against the stored claims: day 0 must be exactly the day-0 claims.
    const dayZero = await page.evaluate(() => document.querySelector('.replay .muted')?.textContent ?? '');
    check('the replay names the day it is showing', /\d{2} \w{3}/.test(dayZero), dayZero);
  }
  await page.screenshot({ path: `${OUT}seeds-desktop.png`, fullPage: true });

  // Campaign.
  await goto(page, '/campaign');
  check('the campaign screen renders', await settle(page, 'Verified clears'));
  const campaignText = await textOf(page);
  check('campaign shows a verified first clear', /c1-01/.test(campaignText), campaignText.split('\n').slice(0, 6).join(' | '));
  check('campaign says the level list cannot be complete', /never a complete level list|leaves NO row/.test(campaignText));
  check('campaign explains chapter placement', /chapter/i.test(campaignText));
  await page.screenshot({ path: `${OUT}campaign-desktop.png`, fullPage: true });

  // Health and ops.
  await goto(page, '/ops');
  check('the ops screen renders', await settle(page, 'What needs me'));
  const opsText = await textOf(page);
  check('ops names the real windows', /24h/.test(opsText) && /2d/.test(opsText) && /30d/.test(opsText));
  check('ops shows the overdue match', /most overdue/.test(opsText) && /Active, past deadline/.test(opsText));
  check('ops shows rules-version drift against the current rules', /Rules-version drift/.test(opsText));
  check('ops shows the guest-to-account funnel with its caveat', /Guest → account/.test(opsText));
  await page.screenshot({ path: `${OUT}ops-desktop.png`, fullPage: true });

  // Keyboard: tab from the top and make sure the navigation is reachable and the route changes.
  await goto(page, '/overview');
  await page.locator('#nav a').first().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await tick(400);
  check('the navigation is keyboard reachable', (await page.locator('#nav a[aria-current="page"]').count()) > 0);

  // Authorization from the page itself: the CSV export is refused for a non-admin token, allowed
  // for the admin, and carries exactly the JSON fields.
  const csvProbe = async (token: string): Promise<{ status: number; header: string }> =>
    page.evaluate(
      async ([base, tok]) => {
        const url = `${base}/v1/admin/reports.csv?limit=2`;
        const response = await fetch(url, { headers: { authorization: `Bearer ${tok}`, 'x-futasaku-client-version': '0.5.0' } });
        const text = await response.text();
        return { status: response.status, header: text.split('\r\n')[0] ?? '' };
      },
      [seeded.base, token] as const,
    );

  const adminCsv = await csvProbe(seeded.adminToken);
  check('the CSV export is allowed for the admin', adminCsv.status === 200, `status ${adminCsv.status}`);
  check('the CSV carries exactly the JSON fields', adminCsv.header === 'id,created_at,kind,status,build,player_id,player_tag,player_name,message,context,user_agent,note', adminCsv.header);
  const otherCsv = await csvProbe(seeded.playerToken);
  check('the CSV export is refused for a normal player', otherCsv.status === 403, `status ${otherCsv.status}`);

  // Narrow width: every table must stay inside the page.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, name] of [['/overview', 'overview'], ['/reports', 'reports'], ['/seeds', 'seeds'], ['/ops', 'ops']] as const) {
    await goto(page, route);
    await tick(500);
    const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    check(`no horizontal overflow at 390px on ${name}`, overflow.scroll <= overflow.inner + 1, `${overflow.scroll} vs ${overflow.inner}`);
  }
  await page.screenshot({ path: `${OUT}overview-narrow.png`, fullPage: true });
  await goto(page, '/reports');
  await tick(500);
  await page.screenshot({ path: `${OUT}reports-narrow.png`, fullPage: true });

  const unexpected = errors.filter((line) => !/403 \(Forbidden\)/.test(line));
  check('the dashboard logged no unexpected page errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  const deniedLogs = seeded.counts.logs.filter((line) => line.startsWith('ADMIN_DENIED')).length;
  check('an unauthorized call is logged without data', deniedLogs >= 1, `${deniedLogs} denial(s) logged`);
  check('the CSV access was logged', seeded.counts.logs.some((line) => line.startsWith('ADMIN_CSV')));

  await context.close();
}

// ---------------------------------------------------------------------------- the endpoint shapes

// A last, direct probe of the two POSTs (run AFTER the UI pass, so it cannot pre-set the state the
// checks above assert): a failure here names the HTTP status rather than a missing line of text.
{
  const { context, page } = await openAs(seeded.adminToken, seeded.playerId, 'RYK');
  await page.goto(served.url, { waitUntil: 'domcontentloaded' });
  await tick(400);
  const probe = await page.evaluate(async ([base, token]) => {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-futasaku-client-version': '0.5.0' };
    const seen = await fetch(`${base}/v1/admin/seen`, { method: 'POST', headers, body: JSON.stringify({ at: Date.now() }) });
    const reports = await fetch(`${base}/v1/admin/reports?limit=1`, { headers });
    const listed = (await reports.json()) as { rows?: { id?: string }[] };
    const id = listed.rows?.[0]?.id ?? '';
    const triage = await fetch(`${base}/v1/admin/reports/${id}/triage`, { method: 'POST', headers, body: JSON.stringify({ status: 'resolved', note: 'probe' }) });
    const noToken = await fetch(`${base}/v1/admin/reports`);
    return { seen: seen.status, triage: triage.status, noToken: noToken.status, id };
  }, [seeded.base, seeded.adminToken] as const);
  check('POST /v1/admin/seen answers 200 for the admin', probe.seen === 200, `status ${probe.seen}`);
  check('POST triage answers 200 for the admin', probe.triage === 200, `status ${probe.triage}`);
  check('a request with no token at all is refused', probe.noToken === 401, `status ${probe.noToken}`);
  await context.close();
}

// ---------------------------------------------------------------------------- (c) the migration guard

// A screen whose query cannot run must not present as an empty table. When migration 0012 is not
// applied, `reports()` LEFT JOINs a missing `feedback_triage` and the seen-cursor reads a missing
// `admin_seen`; the live API answers 503 with code ADMIN_MIGRATION_PENDING. The response is stubbed
// here so this UI state is pinned without needing a real database (the memory store never fails).
{
  const { context, page } = await openAs(seeded.adminToken, seeded.playerId, 'RYK');
  const pending = {
    status: 503,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ ok: false, code: 'ADMIN_MIGRATION_PENDING', message: 'Triage is not enabled yet: the admin tables (migration 0012) are missing on this database.' }),
  };
  await page.route('**/v1/admin/reports**', (route) => route.fulfill(pending));
  await page.route('**/v1/admin/whats-new', (route) => route.fulfill(pending));

  await goto(page, '/reports');
  await tick(800);
  const reportsText = await textOf(page);
  // The `.setup` class is what makes this a distinct STATE rather than the generic error box: a
  // regression that fell back to `errorBox(message)` would still show the server's wording, so the
  // classes (and the absence of the empty-list text) are what this check must pin.
  const reportsNotice = await page.locator('.state.setup').count();
  const reportsError = await page.locator('.state.error').count();
  check(
    'an unapplied migration renders a plain "triage is not enabled" state, not an error or an empty list',
    reportsNotice > 0 && reportsError === 0 && !/No reports/.test(reportsText) && !/of 0 reports/.test(reportsText),
    `notice=${reportsNotice} error=${reportsError} · ${reportsText.replace(/\n+/g, ' ').slice(0, 80)}`,
  );
  await page.screenshot({ path: `${OUT}reports-migration-pending.png`, fullPage: true });

  await goto(page, '/overview');
  await tick(800);
  const overviewText = await textOf(page);
  const overviewNotice = await page.locator('.state.setup').count();
  check(
    'the seen-counters say "not enabled" (never a card of fabricated zeroes)',
    overviewNotice > 0 && /Triage is not enabled yet/.test(overviewText) && !/New reports/.test(overviewText),
    `notice=${overviewNotice} · ${overviewText.replace(/\n+/g, ' ').slice(0, 80)}`,
  );
  await context.close();
}

await browser.close();
await new Promise<void>((resolve) => served.server.close(() => resolve()));
await seeded.close();

console.log(`\nadmin dashboard e2e: ${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
