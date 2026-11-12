// PERF PROBE — is an open, idle match chat cheap? (the bar the soak suite holds the board to:
// a visible tab polls ~1 request / 2 s, a hidden tab is nearly free).
//
// The standard `startLocalDuel` harness does NOT mount the chat router, so a chat measured there
// 404s and retries — that is an artefact, not a product cost. This probe boots the server the way
// `web/e2e/match-chat.ts` does (real MatchService + memoryChatStore + createChatRouter) and then
// reuses the same seat/lobby helpers as every other online suite.
//   CHANNEL=futa05 PW_CHROMIUM=... npx tsx web/e2e/perf-chat.ts
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DuelClient } from '../../server/src/client.js';
import { MemoryFeedbackStore } from '../../server/src/feedback/feedback.js';
import { memoryChatStore } from '../../server/src/chat/memory.js';
import { createChatRouter } from '../../server/src/chat/router.js';
import { servePreview } from './helpers/preview-port.js';
import { openDuel, openSeat, sleep } from './helpers/local-duel.js';
import type { LocalDuel, LocalMatch } from './helpers/local-duel.js';

const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const stage = (line: string): void => console.log(`[perf] ${line}`);
let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const storage = new MemoryStorage();
const feedback = new MemoryFeedbackStore();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: 24 * 3_600_000 };
const service = new MatchService({ storage, config });
const apiServer = createHttpServer({
  service,
  config,
  live: createChatRouter({ store: memoryChatStore(storage, feedback), service, storage }),
});
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;
stage(`api on ${apiBase}`);

// The futa05 build must carry the API URL (the build itself refuses without it).
const build = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: {
        ...process.env,
        CHANNEL: 'futa05',
        VITE_DUEL_API_URL: apiBase,
        VITE_SUPABASE_URL: 'http://127.0.0.1:9',
        VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (b) => (log += String(b)));
    child.stderr.on('data', (b) => (log += String(b)));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web build failed: ${log.slice(-800)}`))));
  });
await build();
const preview = await servePreview(4348, { logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
const api = new DuelClient({ baseUrl: apiBase, fetch: (url, init) => fetch(url, init) });
stage(`page on ${preview.origin}`);

const duel: LocalDuel = {
  origin: preview.origin,
  apiBase,
  api,
  browser,
  newMatch: async (): Promise<LocalMatch> => {
    const creator = await api.createGuest();
    const joiner = await api.createGuest();
    const created = await api.createMatch(creator.token);
    const joined = await api.joinMatch(joiner.token, created.match.inviteCode);
    const starterSeat: 0 | 1 = created.player.startingPlayer === created.player.seat ? created.player.seat : joined.player.seat;
    return {
      matchId: created.match.matchId,
      guests: [
        { token: creator.token, playerId: creator.player.id, displayName: creator.player.displayName },
        { token: joiner.token, playerId: joiner.player.id, displayName: joiner.player.displayName },
      ],
      inviteCode: created.match.inviteCode,
      starterSeat,
    };
  },
  close: async () => undefined,
};

type Req = { t: number; method: string; path: string; bytes: number; status: number };
const log: Req[] = [];
const attach = (page: Awaited<ReturnType<typeof openSeat>>['page']): void => {
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(apiBase)) return;
    log.push({ t: Date.now(), method: r.method(), path: url.slice(apiBase.length).split('?')[0]!, bytes: 0, status: 0 });
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.startsWith(apiBase)) return;
    let bytes = 0;
    try {
      bytes = (await res.body()).byteLength;
    } catch {
      bytes = Number(res.headers()['content-length'] ?? 0);
    }
    const path = url.slice(apiBase.length).split('?')[0]!;
    const hit = [...log].reverse().find((r) => r.path === path && r.status === 0);
    if (hit) {
      hit.bytes = bytes;
      hit.status = res.status();
    }
  });
};
const windowReq = async (ms: number): Promise<Req[]> => {
  const t0 = Date.now();
  await sleep(ms);
  return log.filter((r) => r.t >= t0);
};
const setHidden = (page: Awaited<ReturnType<typeof openSeat>>['page'], hidden: boolean): Promise<string> =>
  page.evaluate(`(() => {
    var h = ${hidden ? 'true' : 'false'};
    var proto = Object.getPrototypeOf(document);
    Object.defineProperty(proto, 'visibilityState', { configurable: true, get: function () { return h ? 'hidden' : 'visible'; } });
    Object.defineProperty(proto, 'hidden', { configurable: true, get: function () { return !!h; } });
    document.dispatchEvent(new Event('visibilitychange'));
    return document.visibilityState + '/' + document.hidden;
  })()`);
const summary = (reqs: Req[], ms: number) => {
  const byPath = new Map<string, number>();
  for (const r of reqs) byPath.set(r.path, (byPath.get(r.path) ?? 0) + 1);
  return {
    total: reqs.length,
    perMinute: Math.round((reqs.length * 60_000) / ms),
    bytes: reqs.reduce((s, r) => s + r.bytes, 0),
    byPath: [...byPath.entries()].sort((a, b) => b[1] - a[1]),
  };
};

try {
  const match = await duel.newMatch();
  const seat = await openSeat(duel, match, 0, { speed: 'skip' });
  attach(seat.page);
  await openDuel(seat, match.matchId);
  stage('duel open');

  await seat.page.waitForSelector('#match-chat-toggle', { timeout: 25_000 });
  await seat.page.click('#match-chat-toggle');
  await seat.page.waitForSelector('#match-chat-panel:not([hidden])', { timeout: 15_000 }).catch(() => undefined);
  await sleep(1200);
  const openState = (await seat.page.evaluate(`(() => ({
    panel: !!document.querySelector('#match-chat-panel:not([hidden])'),
    status: (document.querySelector('.match-chat-status')?.textContent ?? '').trim(),
  }))()`)) as { panel: boolean; status: string };
  stage(`chat open: ${JSON.stringify(openState)}`);
  check('the chat panel is open and not in an error state', openState.panel && !/unavailable/i.test(openState.status), openState.status);

  // ---- 1. IDLE, VISIBLE ----
  const IDLE_MS = 45_000;
  const idle = await windowReq(IDLE_MS);
  const idleSum = summary(idle, IDLE_MS);
  console.log(`IDLE visible ${IDLE_MS / 1000}s: ${idleSum.total} API requests (${idleSum.perMinute}/min), ${idleSum.bytes} bytes`);
  console.log(`  by path: ${JSON.stringify(idleSum.byPath)}`);
  const idleChat = idle.filter((r) => r.path.endsWith('/chat'));
  console.log(`  chat requests: ${idleChat.length} (${Math.round((idleChat.length * 60_000) / IDLE_MS)}/min), ${idleChat.reduce((s, r) => s + r.bytes, 0)} bytes, statuses ${JSON.stringify([...new Set(idleChat.map((r) => r.status))])}`);

  // ---- 2. IDLE, HIDDEN ----
  stage(`hidden override: ${await setHidden(seat.page, true)}`);
  const hidden = await windowReq(IDLE_MS);
  const hiddenSum = summary(hidden, IDLE_MS);
  console.log(`IDLE hidden ${IDLE_MS / 1000}s: ${hiddenSum.total} API requests (${hiddenSum.perMinute}/min), ${hiddenSum.bytes} bytes`);
  console.log(`  by path: ${JSON.stringify(hiddenSum.byPath)}`);
  const hiddenChat = hidden.filter((r) => r.path.endsWith('/chat'));
  console.log(`  chat requests while hidden: ${hiddenChat.length}`);
  await setHidden(seat.page, false);

  // ---- 3. BYTES PER NEW MESSAGE: the delta a realtime hint asks for ----
  const before = await api.chatHistory(match.guests[0]!.token, match.matchId, {});
  const cursor = Math.max(0, ...before.messages.map((m) => m.sequence));
  const emptyDelta = await api.chatHistory(match.guests[0]!.token, match.matchId, cursor > 0 ? { after: cursor } : {});
  // A message is only allowed while the OTHER seat is to move, so send as the waiting seat.
  const mine = await api.getState(match.guests[0]!.token, match.matchId);
  const senderSeat = mine.player.seat === 0 ? 1 : 0;
  const sender = match.guests[senderSeat]!;
  const senderState = await api.getState(sender.token, match.matchId);
  let sent = false;
  try {
    await api.chatSend(sender.token, match.matchId, { text: 'nice move', phrase: null }, crypto.randomUUID(), senderState.player.revision);
    sent = true;
  } catch (error) {
    console.log(`  (no message could be sent in this state: ${String(error).slice(0, 160)})`);
  }
  const after = await api.chatHistory(match.guests[0]!.token, match.matchId, cursor > 0 ? { after: cursor } : {});
  const bytes = (r: unknown) => JSON.stringify(r).length;
  console.log(`CHAT DELTA: ${sent ? 'one new message' : 'no new message'} = ${bytes(after)} bytes JSON (${after.messages.length} messages); empty delta ${bytes(emptyDelta)} bytes`);
  console.log(`CHAT FULL PAGE (first open, ${before.messages.length} messages) = ${bytes(before)} bytes JSON`);
  console.log('PERF_CHAT ' + JSON.stringify({ idle: idleSum, hidden: hiddenSum, chatIdle: idleChat.length, chatHidden: hiddenChat.length, delta: { sent, bytes: bytes(after), empty: bytes(emptyDelta), full: bytes(before) } }));
} finally {
  await browser.close();
  await preview.server.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`${failed} perf-chat checks failed`);
  process.exit(1);
}
console.log('perf-chat checks passed');
