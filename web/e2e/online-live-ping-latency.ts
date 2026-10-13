// LIVE proof for /futa0.5/ (severgrow.github.io) against the live Edge duel API.
//
// PROVES, on the DEPLOYED site:
//   1. the built bundle really carries its online config (the client reaches the live API at all);
//   2. create-duel and find-opponent SUCCEED with no "Something went wrong. Try again.";
//   3. a live two-context duel is PING-DRIVEN: the waiting client opens the Realtime websocket, the
//      server's turn-boundary broadcast arrives as a ping frame, and the refetch lands WELL under
//      the 900ms wait-poll (POLL_WAITING_MS). A ping frame is only broadcast on a turn boundary,
//      so the actor completes a whole turn (Draw -> EndAct -> Discard) to trigger it.
//
//   npx tsx web/e2e/online-live-ping-latency.ts
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';

const LIVE_APP = 'https://severgrow.github.io/severgrow-01/futa0.5/';
const LIVE_API = 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel';
const IDENTITY_KEY = 'severgrow.duel.identity.v1';
const FIRST_CARD_KEY = 'severgrow.duel.firstCard.v1';
const POLL_WAITING_MS = 900;
const GENERIC = 'Something went wrong. Try again.';
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

type Guest = { token: string; playerId: string; displayName: string };
type Rec = { label: string; wsUrls: string[]; frames: string[]; viewTimes: number[]; consoleErrors: string[]; failed: string[] };

const api = async <T>(path: string, init: { method: string; token?: string; body?: unknown }): Promise<T> => {
  const res = await fetch(`${LIVE_API}${path}`, {
    method: init.method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-futasaku-client-version': '0.5.0',
      'x-futasaku-rules-version': 'futasaku0.4-strength-draw',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const data = (await res.json()) as T & { ok?: boolean; code?: string; message?: string };
  if (!res.ok || data.ok === false) throw new Error(`${init.method} ${path} -> ${res.status} ${data.code ?? ''} ${data.message ?? ''}`);
  return data;
};

const createGuest = async (): Promise<Guest> => {
  const res = await api<{ player: { id: string; displayName: string | null }; token: string }>('/v1/guests', { method: 'POST', body: {} });
  return { token: res.token, playerId: res.player.id, displayName: res.player.displayName ?? 'Friend' };
};

type PlayerView = { revision: number; actor: 0 | 1; view: { hand: { id: number }[] }; status: string };
const getView = (token: string, matchId: string) =>
  api<{ player: PlayerView }>(`/v1/matches/${matchId}/view`, { method: 'GET', token }).then((r) => r.player);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const contexts: BrowserContext[] = [];

/** Open a page with the guest's identity seeded; attach ALL listeners before the duel opens. */
const open = async (guest: Guest, hash = '', label = ''): Promise<{ page: Page; rec: Rec }> => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  contexts.push(ctx);
  const page = await ctx.newPage();
  const rec: Rec = { label, wsUrls: [], frames: [], viewTimes: [], consoleErrors: [], failed: [] };
  page.on('websocket', (ws) => {
    rec.wsUrls.push(ws.url());
    ws.on('framereceived', (f) => rec.frames.push(typeof f.payload === 'string' ? f.payload : String(f.payload)));
  });
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/functions/v1/duel/v1/matches/') && req.url().includes('/view')) rec.viewTimes.push(Date.now());
  });
  page.on('console', (m) => {
    if (m.type() === 'error') rec.consoleErrors.push(m.text());
  });
  page.on('requestfailed', (r) => {
    if (r.url().includes('realtime') || r.url().includes('duel')) rec.failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`);
  });
  await page.goto(LIVE_APP + hash, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([idKey, cardKey, record]) => {
      localStorage.setItem(idKey, JSON.stringify(record));
      localStorage.setItem(cardKey, '1');
    },
    [IDENTITY_KEY, FIRST_CARD_KEY, { token: guest.token, playerId: guest.playerId, displayName: guest.displayName, kind: 'guest' }] as const,
  );
  await page.goto(LIVE_APP + hash, { waitUntil: 'domcontentloaded' });
  return { page, rec };
};

const visible = (page: Page, id: string) =>
  page.evaluate((sel) => {
    const el = document.getElementById(sel) as HTMLElement | null;
    return !!el && !el.hidden;
  }, id);

const openHub = async (page: Page) => {
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 40_000 });
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 15_000 });
  if (await visible(page, 'online-first-card')) await page.click('#online-first-ok');
};

try {
  // ---- 1 + 2. create-duel and find-opponent on the LIVE site, with no generic error ----------
  const created = await open(await createGuest(), '', 'create');
  await openHub(created.page);
  await created.page.click('#online-create');
  const createOk = await created.page
    .waitForSelector('#online-waiting:not([hidden])', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  const createText = await created.page.evaluate(() => document.body.innerText);
  check('LIVE create-duel succeeds', createOk);
  check('LIVE create-duel shows no generic error', !createText.includes(GENERIC));

  const finding = await open(await createGuest(), '', 'find');
  await openHub(finding.page);
  await finding.page.click('#online-find');
  const findOk = await finding.page
    .waitForFunction(
      () => {
        const w = document.getElementById('online-waiting') as HTMLElement | null;
        const g = document.getElementById('game') as HTMLElement | null;
        return (!!w && !w.hidden) || (!!g && !g.hidden);
      },
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
  const findText = await finding.page.evaluate(() => document.body.innerText);
  check('LIVE find-opponent succeeds', findOk);
  check('LIVE find-opponent shows no generic error', !findText.includes(GENERIC));

  // ---- 3. live two-context duel: ping-driven, not poll-driven ---------------------------------
  const a = await createGuest();
  const b = await createGuest();
  const made = await api<{ match: { matchId: string; inviteCode: string } }>('/v1/matches', { method: 'POST', token: a.token, body: {} });

  const A = await open(a, '', 'A');
  await openHub(A.page);
  await A.page.waitForSelector('.online-row', { timeout: 20_000 });
  await A.page.click('.online-row');
  await A.page.waitForSelector('#online-waiting:not([hidden])', { timeout: 20_000 });

  const B = await open(b, `#/join/${made.match.inviteCode}`, 'B');
  await B.page.waitForSelector('#online-join:not([hidden])', { timeout: 20_000 });
  await B.page.click('#online-join-submit');
  await B.page.waitForSelector('#game:not([hidden])', { timeout: 20_000 });
  await A.page.waitForSelector('#game:not([hidden])', { timeout: 20_000 });
  check('LIVE both contexts reach the live duel', (await visible(A.page, 'game')) && (await visible(B.page, 'game')));

  // The live duel must have opened a Realtime websocket on BOTH clients.
  await new Promise((r) => setTimeout(r, 1_500));
  check('LIVE both clients opened the Realtime websocket', A.rec.wsUrls.some((u) => u.includes('realtime/v1/websocket')) && B.rec.wsUrls.some((u) => u.includes('realtime/v1/websocket')), `${A.rec.wsUrls.length}+${B.rec.wsUrls.length}`);

  let vAny = await getView(a.token, made.match.matchId);
  const waitingRec = vAny.actor === 0 ? B.rec : A.rec;
  const actorToken = vAny.actor === 0 ? a.token : b.token;

  // Baseline: the waiting client's poll cadence while it waits for the opponent.
  const baselineStart = waitingRec.viewTimes.length;
  await new Promise((r) => setTimeout(r, 3_000));
  const baselineGaps: number[] = [];
  for (let i = baselineStart + 1; i < waitingRec.viewTimes.length; i++) baselineGaps.push(waitingRec.viewTimes[i]! - waitingRec.viewTimes[i - 1]!);

  // The actor completes a FULL turn (Draw -> EndAct -> Discard) so the server crosses a turn
  // boundary and broadcasts a ping. A bare Draw changes no boundary and is deliberately silent.
  // Read the ACTOR's own view: the waiting seat's revision is clamped to the turn start (P-9).
  let v = await getView(actorToken, made.match.matchId);
  await api(`/v1/matches/${made.match.matchId}/actions`, {
    method: 'POST',
    token: actorToken,
    body: { expectedRevision: v.revision, requestId: `live-draw-${Date.now()}`, action: { t: 'Draw', from: 'deck' } },
  });
  v = await getView(actorToken, made.match.matchId);
  const cardId = v.view.hand[0]!.id;
  const framesBefore = waitingRec.frames.length;
  const tSubmit = Date.now();
  await api(`/v1/matches/${made.match.matchId}/actions`, {
    method: 'POST',
    token: actorToken,
    body: {
      expectedRevision: v.revision,
      requestId: `live-turn-${Date.now()}`,
      actions: [{ t: 'EndAct' }, { t: 'Discard', card: cardId }],
    },
  });
  const submitted = Date.now();
  void vAny;

  let latency: number | null = null;
  for (let i = 0; i < 300; i++) {
    const hit = waitingRec.viewTimes.find((t) => t >= submitted);
    if (hit !== undefined) {
      latency = hit - submitted;
      break;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  const newFrames = waitingRec.frames.length - framesBefore;
  const pingFrames = waitingRec.frames.filter((f) => f.includes('"ping"')).length;

  check('LIVE the turn-boundary broadcast reached the waiting client as a ping frame', newFrames > 0, `${newFrames} new frame(s), ${pingFrames} ping frame(s) total`);
  check('LIVE the refetch is ping-driven', newFrames > 0 && latency !== null && latency < POLL_WAITING_MS, latency === null ? 'no refetch' : `${latency}ms`);
  const median = (xs: number[]) => (xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)]! : null);
  console.log(`      safety-net poll gaps observed (ms): ${baselineGaps.join(', ') || 'none'} (median ${median(baselineGaps) ?? 'n/a'}; wait-poll interval is ${POLL_WAITING_MS}ms)`);
  console.log(`      ping-frame -> /view refetch latency (ms): ${latency ?? 'not observed'}`);
  if (waitingRec.consoleErrors.length) console.log(`      waiting-client console errors: ${waitingRec.consoleErrors.slice(0, 3).join(' | ')}`);
  void tSubmit;
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => undefined);
  await browser.close();
}

if (failed) {
  console.error(`\n${failed} live check(s) failed`);
  process.exit(1);
}
console.log('\nLive /futa0.5/ config + create/find + ping-driven duel verified.');
