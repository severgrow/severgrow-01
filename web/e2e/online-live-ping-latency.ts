// LIVE proof for /futa0.5/ (severgrow.github.io) against the live Edge duel API.
//
// PROVES, on the DEPLOYED site:
//   1. the built bundle really carries its online config (the client reaches the live API at all);
//   2. create-duel and find-opponent SUCCEED with no "Something went wrong. Try again.";
//   3. a live two-context duel is PING-DRIVEN: both clients open the Realtime websocket, the
//      server's turn-boundary broadcast arrives as a ping frame, and the waiting client refetches
//      WELL under the 900ms wait-poll (POLL_WAITING_MS).
//
// The Realtime broadcast is deliberately best-effort ("the ping is a hint; polling is truth"), so
// the action is repeated up to 3 times and the run reports honestly what it observed. A ping frame
// is only broadcast on a turn boundary, so the actor completes a whole turn each attempt.
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
const ATTEMPTS = 3;
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

type PlayerView = { revision: number; actor: 0 | 1; seat: 0 | 1; view: { hand: { id: number }[] }; status: string };
const getView = (token: string, matchId: string) =>
  api<{ player: PlayerView }>(`/v1/matches/${matchId}/view`, { method: 'GET', token }).then((r) => r.player);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  await sleep(1_500);
  const wsOk = A.rec.wsUrls.some((u) => u.includes('realtime/v1/websocket')) && B.rec.wsUrls.some((u) => u.includes('realtime/v1/websocket'));
  check('LIVE both clients opened the Realtime websocket', wsOk, `${A.rec.wsUrls.length}+${B.rec.wsUrls.length}`);

  const recFor = (seat: 0 | 1): Rec => (seat === 0 ? A.rec : B.rec);
  const tokenFor = (seat: 0 | 1): string => (seat === 0 ? a.token : b.token);

  // Baseline poll cadence of the client that is waiting (informational).
  const boot = await getView(a.token, made.match.matchId);
  const baselineRec = recFor(boot.actor === 0 ? 1 : 0);
  const baseStart = baselineRec.viewTimes.length;
  await sleep(3_000);
  const baselineGaps: number[] = [];
  for (let i = baseStart + 1; i < baselineRec.viewTimes.length; i++) baselineGaps.push(baselineRec.viewTimes[i]! - baselineRec.viewTimes[i - 1]!);

  type Obs = { attempt: number; frames: number; latency: number | null };
  const obs: Obs[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    // The on-turn seat flips each completed turn, so the waiting client flips too.
    const now = await getView(a.token, made.match.matchId);
    const actorSeat = now.actor;
    const waiting = recFor(actorSeat === 0 ? 1 : 0);
    const actor = tokenFor(actorSeat);

    // Complete a FULL turn so the server crosses a turn boundary and broadcasts a ping.
    let v = await getView(actor, made.match.matchId);
    await api(`/v1/matches/${made.match.matchId}/actions`, {
      method: 'POST',
      token: actor,
      body: { expectedRevision: v.revision, requestId: `live-draw-${attempt}-${Date.now()}`, action: { t: 'Draw', from: 'deck' } },
    });
    v = await getView(actor, made.match.matchId);
    const cardId = v.view.hand[0]!.id;
    const framesBefore = waiting.frames.length;
    const t0 = Date.now();
    await api(`/v1/matches/${made.match.matchId}/actions`, {
      method: 'POST',
      token: actor,
      body: { expectedRevision: v.revision, requestId: `live-turn-${attempt}-${Date.now()}`, actions: [{ t: 'EndAct' }, { t: 'Discard', card: cardId }] },
    });
    // A ping-driven refetch can land before the POST response returns, so measure from t0.
    let latency: number | null = null;
    for (let i = 0; i < 600; i++) {
      const hit = waiting.viewTimes.find((t) => t >= t0);
      if (hit !== undefined) {
        latency = hit - t0;
        break;
      }
      await sleep(5);
    }
    await sleep(500); // let an in-flight ping frame land before we count
    const frames = waiting.frames.length - framesBefore;
    obs.push({ attempt, frames, latency });
    console.log(`      attempt ${attempt}: ${frames} ping frame(s), refetch ${latency ?? 'not observed'}ms`);
    if (frames > 0 && latency !== null && latency < POLL_WAITING_MS) break;
  }

  const median = (xs: number[]) => (xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)]! : null);
  const withFrame = obs.filter((o) => o.frames > 0);
  const bestLatency = withFrame.map((o) => o.latency).filter((l): l is number => l !== null).sort((p, q) => p - q)[0] ?? null;

  check('LIVE the turn-boundary broadcast reached the waiting client as a ping frame', withFrame.length > 0, JSON.stringify(obs));
  check('LIVE the refetch is ping-driven (a ping frame plus a refetch under the 900ms poll)', bestLatency !== null && bestLatency < POLL_WAITING_MS, bestLatency === null ? 'no ping-driven refetch observed' : `${bestLatency}ms`);
  console.log(`      safety-net poll gaps observed (ms): ${baselineGaps.join(', ') || 'none'} (median ${median(baselineGaps) ?? 'n/a'}; wait-poll interval is ${POLL_WAITING_MS}ms)`);
  console.log(`      best ping-frame -> /view refetch latency (ms): ${bestLatency ?? 'not observed'}`);
  if (A.rec.consoleErrors.length || B.rec.consoleErrors.length) console.log(`      console errors: ${[...A.rec.consoleErrors, ...B.rec.consoleErrors].slice(0, 3).join(' | ')}`);
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => undefined);
  await browser.close();
}

if (failed) {
  console.error(`\n${failed} live check(s) failed`);
  process.exit(1);
}
console.log('\nLive /futa0.5/ config + create/find + ping-driven duel verified.');
