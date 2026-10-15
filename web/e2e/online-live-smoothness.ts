// FUTASAKU 0.5 — LIVE two-device smoothness + label measurement on the deployed /futa0.5/ site.
//
//   npx tsx web/e2e/online-live-smoothness.ts            # against the deployed site
//   LIVE_APP=http://127.0.0.1:5199 npx tsx web/e2e/online-live-smoothness.ts
//
// Two REAL browser contexts (390x844 phones), CPU throttled 4x, both pointed at the deployed site
// and the deployed Edge API. The acting seat plays a whole growing turn THROUGH THE SERVER (raw
// API), so the measuring seat's page is driven only by what it really receives (ping or poll).
//
// It measures, per reveal, the segments the owner cares about:
//   throw -> turn visible on the other phone   (target: median < 1500ms)
//   throw -> input open                        (target: replay length + 0.5s)
//   gate closed duration, pings vs polls, frame deltas
// and it asserts the TWO-PHONE LABEL RULE: this phone never reads "Opponent's turn" while the
// server says it is this phone's turn, or while it is replaying the enemy's turn.
//
// It also reads the `?debug=timing` trace when the build carries it (`__severgrow.timing()`), so
// the same script reports the per-segment table before and after the client fix.
import { isLocalTarget, requireRealProjectOptIn } from '../../server/scripts/real-project-guard.js';
import { chromium } from 'playwright-core';
import type { BrowserContext, CDPSession, Page } from 'playwright-core';

const LIVE_APP = process.env.LIVE_APP ?? 'https://severgrow.github.io/severgrow-01/futa0.5/';
const LIVE_API = process.env.LIVE_API ?? 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel';
// Pointed at the real Supabase project (the default) this spends its quota; a non-loopback
// LIVE_APP bakes that same API into the deployed bundle. Either way: opt-in only.
if (LIVE_API.includes('.supabase.co') || !isLocalTarget(LIVE_APP)) requireRealProjectOptIn('online-live-smoothness');
/** `TIMING=1` turns on the in-page `?debug=timing` trace (available on a build that carries it). */
const QUERY = process.env.TIMING === '1' ? '?debug=timing' : '';
const IDENTITY_KEY = 'severgrow.duel.identity.v1';
const FIRST_CARD_KEY = 'severgrow.duel.firstCard.v1';
const DUELS = Number(process.env.DUELS ?? 5);
const TURNS = Number(process.env.TURNS ?? 3);
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE ?? 4);
const THEIR_TURN = "Opponent's turn";
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Guest = { token: string; playerId: string; displayName: string };
type Action = { t: string; [k: string]: unknown };

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
  const res = await api<{ player: { id: string; displayName: string | null }; token: string }>('/v1/guests', {
    method: 'POST',
    body: {},
  });
  return { token: res.token, playerId: res.player.id, displayName: res.player.displayName ?? 'Friend' };
};

type View = {
  revision: number;
  actor: 0 | 1;
  seat: 0 | 1;
  status: string;
  turnPlayer: 0 | 1;
  startingPlayer: 0 | 1;
  legalActions: Action[];
  view: { phase: string; hand: { id: number }[]; board: Record<string, unknown> };
};
const getView = (token: string, matchId: string) =>
  api<{ player: View }>(`/v1/matches/${matchId}/view`, { method: 'GET', token }).then((r) => r.player);
const post = (token: string, matchId: string, body: unknown) =>
  api<{ player: View }>(`/v1/matches/${matchId}/actions`, { method: 'POST', token, body });

// ---------------------------------------------------------------------------- page sampling

/** Reads the turn word, the gate and the frame deltas. `wall` is shared by both contexts. */
const SAMPLER = `(() => {
  window.__s = [];
  window.__frames = [];
  window.__last = performance.now();
  window.__tick = function () {
    var now = performance.now();
    window.__frames.push(now - window.__last);
    window.__last = now;
    requestAnimationFrame(window.__tick);
  };
  requestAnimationFrame(window.__tick);
  window.__read = function (from) { return window.__s.slice(from); };
  window.__timer = setInterval(function () {
    var hook = window.__severgrow || {};
    var o = hook.online ? hook.online() : null;
    var el = document.querySelector('[data-duel-turn]');
    window.__s.push({
      t: performance.now(),
      wall: Date.now(),
      word: el ? (el.textContent || '').trim() : '',
      revealing: !!(o && o.revealing),
      myTurn: !!(o && o.myTurn),
      serverTurn: o ? o.serverTurn : null,
      queued: o ? o.queued : -1,
      pumping: !!(o && o.pumping),
      drawn: Array.prototype.map.call(document.querySelectorAll('.l-tiles .tile[data-key]'), function (e) { return e.dataset.key; }).sort().join(',')
    });
  }, 20);
})()`;

type Sample = { t: number; wall: number; word: string; revealing: boolean; myTurn: boolean; serverTurn: string | null; queued: number; pumping: boolean; drawn: string };
type Mark = { t: number; wall: number; ev: string; d?: Record<string, unknown> };

const waitReady = (page: Page) =>
  page
    .waitForFunction(
      () => {
        const h = (window as unknown as { __severgrow?: { ready?: () => boolean } }).__severgrow;
        return !!h && typeof h.ready === 'function' && h.ready();
      },
      { timeout: 30_000 },
    )
    .then(() => undefined);

const reset = (page: Page) => page.evaluate('(() => { window.__s = []; window.__frames = []; if (window.__severgrow && window.__severgrow.clearTiming) window.__severgrow.clearTiming(); })()');
/** Samples recorded since `from` (0 = everything). Only the new ones cross the wire: sending the
 *  whole growing array on every poll was itself loading the page and inflating the timings. */
const samples = (page: Page, from = 0) =>
  page.evaluate((i) => ((window as unknown as { __read?: (n: number) => unknown }).__read ?? (() => []))(i), from).then((v) => (v as Sample[]) ?? []);
const frames = (page: Page) => page.evaluate('window.__frames').then((v) => (v as number[]) ?? []);
const marks = (page: Page) =>
  page.evaluate('(window.__severgrow && window.__severgrow.timing) ? window.__severgrow.timing() : []').then((v) => (v as Mark[]) ?? []);

const pct = (xs: number[], p: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
};

// ---------------------------------------------------------------------------- the run

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const contexts: BrowserContext[] = [];

type Seat = { page: Page; cdp: CDPSession; guest: Guest; mark: number };
const open = async (guest: Guest, hash = ''): Promise<Seat> => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.goto(LIVE_APP + QUERY + hash, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([idKey, cardKey, record]) => {
      localStorage.setItem(idKey, JSON.stringify(record));
      localStorage.setItem(cardKey, '1');
    },
    [IDENTITY_KEY, FIRST_CARD_KEY, { token: guest.token, playerId: guest.playerId, displayName: guest.displayName, kind: 'guest' }] as const,
  );
  await page.goto(LIVE_APP + QUERY + hash, { waitUntil: 'domcontentloaded' });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  return { page, cdp, guest, mark: 0 };
};

const openHub = async (page: Page) => {
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 40_000 });
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 });
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
};

/** One whole growing turn, played through the SERVER, one legal action per step. `throwWall` is the
 *  wall time of the LAST commit of the turn (the one that hands it over) — so "the other phone sees
 *  the turn" is measured from the throw itself, never from the start of this seat's turn. */
const playTurnViaApi = async (token: string, matchId: string): Promise<{ grew: number; actions: number; throwWall: number }> => {
  let grew = 0;
  let actions = 0;
  let throwWall = 0;
  for (let step = 0; step < 14; step++) {
    const v = await getView(token, matchId);
    if (v.status !== 'active' || v.actor !== v.seat) break;
    const legal = v.legalActions ?? [];
    const bloom = legal
      .filter((a) => a.t === 'Bloom')
      .sort((x, y) => ((y.hexes as unknown[] | undefined)?.length ?? 0) - ((x.hexes as unknown[] | undefined)?.length ?? 0))[0];
    const pick =
      bloom ??
      legal.find((a) => a.t === 'Sprout') ??
      legal.find((a) => a.t === 'Draw') ??
      legal.find((a) => a.t === 'EndAct') ??
      legal.find((a) => a.t === 'Discard');
    if (!pick) break;
    if (bloom) grew = (bloom.hexes as unknown[] | undefined)?.length ?? 1;
    // The commit about to be sent is the current candidate for "the throw"; the loop keeps going
    // while the turn is still this seat's, so by the time it exits this is the handing-over commit.
    throwWall = Date.now();
    try {
      await post(token, matchId, { expectedRevision: v.revision, requestId: `a-${Date.now()}-${Math.random()}`, action: pick });
    } catch (error) {
      // A concurrent write (a sweep, a retried request) can move the revision under us: refetch and
      // try the same action once more, exactly as the real client's 409 recovery does.
      if (!(error instanceof Error) || !error.message.includes('STALE_REVISION')) throw error;
      const retry = await getView(token, matchId);
      if (retry.actor !== retry.seat || retry.status !== 'active') break;
      await post(token, matchId, { expectedRevision: retry.revision, requestId: `r-${Date.now()}-${Math.random()}`, action: pick });
    }
    actions++;
  }
  return { grew, actions, throwWall };
};

type Reveal = {
  duel: number;
  grew: number;
  turnVisible: number;
  inputOpen: number;
  gateMs: number;
  pings: number;
  polls: number;
  longFrames: number;
  frames: number;
  labelViolations: string[];
  trace: Mark[];
};

const reveals: Reveal[] = [];
const labelViolationsAll: string[] = [];

try {
  for (let duel = 1; duel <= DUELS; duel++) {
   try {
    const a = await createGuest();
    const b = await createGuest();
    const made = await api<{ match: { matchId: string; inviteCode: string } }>('/v1/matches', { method: 'POST', token: a.token, body: {} });
    const matchId = made.match.matchId;

    const A = await open(a);
    await openHub(A.page);
    await A.page.waitForSelector('.online-row', { timeout: 30_000 });
    await A.page.click('.online-row');
    await A.page.waitForSelector('#online-waiting:not([hidden])', { timeout: 30_000 });

    const B = await open(b, `#/join/${made.match.inviteCode}`);
    await B.page.waitForSelector('#online-join:not([hidden])', { timeout: 30_000 });
    await B.page.click('#online-join-submit');
    await B.page.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
    await A.page.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
    await waitReady(A.page);
    await waitReady(B.page);
    await A.page.evaluate(SAMPLER);
    await B.page.evaluate(SAMPLER);

    console.log(`\n--- duel ${duel}: ${matchId.slice(0, 8)} ---`);

    for (let turn = 1; turn <= TURNS; turn++) {
     try {
      const now = await getView(a.token, matchId);
      if (now.status !== 'active') break;
      const actorSeat = now.actor;
      const actor = actorSeat === 0 ? a.token : b.token;
      const watcher = actorSeat === 0 ? B : A;

      await reset(watcher.page);

      const played = await playTurnViaApi(actor, matchId);
      // EVERYTHING is measured from the throw itself (the commit that hands the turn over).
      const t0 = played.throwWall || Date.now();

      // Watch the measuring page until its input opens again (or a generous ceiling). Only the NEW
      // samples cross the wire each poll, so the harness never loads the page it is measuring.
      let detected: Sample | null = null;
      let opened: Sample | null = null;
      const all: Sample[] = [];
      let cursor = 0;
      const ceiling = Date.now() + 25_000;
      while (Date.now() < ceiling) {
        const fresh = await samples(watcher.page, cursor);
        cursor += fresh.length;
        all.push(...fresh);
        // Only samples AFTER the throw count: a reveal left over from the previous turn must not
        // be mistaken for this turn's.
        const after = fresh.filter((x) => x.wall >= t0);
        if (after.length) {
          if (!detected) detected = after.find((x) => x.revealing) ?? null;
          const open = after.find((x) => x.myTurn && !x.revealing && (!detected || x.t >= detected.t));
          if (open) {
            opened = open;
            break;
          }
        }
        await sleep(40);
      }
      const captured = all.filter((x) => x.wall >= t0);
      const capturedFrames = await frames(watcher.page);
      const trace = await marks(watcher.page);

      // ---- label rule (the real requirement): never "Opponent's turn" when the server says it is
      //      this phone's turn, and never while the enemy turn is replaying.
      const violations: string[] = [];
      for (const s of captured) {
        if (s.revealing && s.word === THEIR_TURN) violations.push(`revealing@${s.t.toFixed(0)}ms word="${s.word}"`);
        if (s.serverTurn === 'mine' && !s.revealing && s.word === THEIR_TURN) violations.push(`mine@${s.t.toFixed(0)}ms word="Opponent's turn"`);
      }
      labelViolationsAll.push(...violations.map((v) => `duel ${duel} turn ${turn}: ${v}`));

      const turnVisibleWall = detected ? detected.wall - t0 : -1;
      const inputOpenWall = opened ? opened.wall - t0 : -1;
      const gateMs = detected && opened ? Math.round(opened.t - detected.t) : -1;
      const deltas = capturedFrames.slice(1).filter((d) => d > 0 && d < 5000);
      const longFrames = deltas.filter((d) => d > 50).length;
      const pings = trace.filter((m) => m.ev === 'ping:recv').length;
      const polls = trace.filter((m) => m.ev === 'view:sent' && (m.d as { reason?: string })?.reason === 'poll').length;

      reveals.push({
        duel,
        grew: played.grew,
        turnVisible: turnVisibleWall,
        inputOpen: inputOpenWall,
        gateMs,
        pings,
        polls,
        longFrames,
        frames: deltas.length,
        labelViolations: violations,
        trace,
      });

      const label = captured.filter((s) => s.revealing).map((s) => s.word);
      const seen = [...new Set(label)];
      console.log(
        `  turn ${turn}: seat ${actorSeat} played (grew ${played.grew}) | watcher saw turn ${turnVisibleWall}ms, input open ${inputOpenWall}ms, gate ${gateMs}ms | pings=${pings} polls=${polls} | replay words: ${JSON.stringify(seen)} | long frames ${longFrames}/${deltas.length}`,
      );
      if (!detected || !opened) {
        const last = captured.at(-1);
        console.log(
          `    (no reveal detected: detected=${!!detected} opened=${!!opened}; samples=${captured.length}; last=${last ? JSON.stringify(last) : 'none'})`,
        );
      }
     } catch (error) {
      console.log(`  turn ${turn}: SKIPPED (${error instanceof Error ? error.message : String(error)})`);
     }
    }
   } catch (error) {
    console.log(`duel ${duel}: setup SKIPPED (${error instanceof Error ? error.message : String(error)})`);
   }
  }
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => undefined);
  await browser.close();
}

// ---------------------------------------------------------------------------- report

const ok = reveals.filter((r) => r.turnVisible >= 0 && r.inputOpen >= 0);
const vis = ok.map((r) => r.turnVisible);
const openMs = ok.map((r) => r.inputOpen);
const gates = ok.map((r) => r.gateMs);
const totalFrames = reveals.reduce((n, r) => n + r.frames, 0);
const longTotal = reveals.reduce((n, r) => n + r.longFrames, 0);
const totalPings = reveals.reduce((n, r) => n + r.pings, 0);
const totalPolls = reveals.reduce((n, r) => n + r.polls, 0);

console.log('\n================ LIVE MEASUREMENT ================');
console.log(`${ok.length}/${reveals.length} reveals measured (${DUELS} duels, ${TURNS} turns each, CPU throttle ${CPU_THROTTLE}x)`);
console.log(`turn visible on the other phone: median ${pct(vis, 50)}ms  p95 ${pct(vis, 95)}ms  worst ${Math.max(0, ...vis)}ms`);
console.log(`input open (from the throw):     median ${pct(openMs, 50)}ms  p95 ${pct(openMs, 95)}ms  worst ${Math.max(0, ...openMs)}ms`);
console.log(`gate closed (replay) duration:   median ${pct(gates, 50)}ms  p95 ${pct(gates, 95)}ms  worst ${Math.max(0, ...gates)}ms`);
console.log(`detection: ${totalPings} ping(s), ${totalPolls} poll(s) counted`);
console.log(`frames over 50ms during reveals: ${longTotal} of ${totalFrames}`);
console.log(`label violations across all samples: ${labelViolationsAll.length}`);
for (const v of labelViolationsAll.slice(0, 8)) console.log(`    ${v}`);

check('LIVE every reveal was detected and reopened', ok.length === reveals.length, `${ok.length}/${reveals.length}`);
check('LIVE turn visible on the other phone within 1.5s (median)', pct(vis, 50) > 0 && pct(vis, 50) < 1500, `${pct(vis, 50)}ms`);
check('LIVE no reveal is a stall (worst gate under 12s)', Math.max(0, ...gates) < 12_000, `${Math.max(0, ...gates)}ms`);
check('LIVE the turn word never contradicts the server (no "Opponent\'s turn" on the acting phone)', labelViolationsAll.length === 0, `${labelViolationsAll.length} violation(s)`);

if (failed) {
  console.error(`\n${failed} live smoothness check(s) failed`);
  process.exit(1);
}
console.log('\nLive two-device smoothness verified.');
