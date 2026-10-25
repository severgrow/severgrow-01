// Self-contained local duel harness for browser tests: a real in-process MatchService (memory
// storage) behind the real HTTP app, plus the built `/futa0.5/` page served by Vite's preview.
//
// It exists so the two-seat gate and touch-painting tests run offline in CI with no secrets: the
// page talks to 127.0.0.1, and a real `DuelClient` talks to the same service so a test can read
// the authoritative board (never the page's own copy).
//
// The CHANNEL=futa05 build guard requires the public online config to be present, so dummy values
// are supplied unless the caller has real ones. The realtime channel then cannot connect
// (expected): polling is the sync engine's own safety net, which is the path under test.
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../../server/src/config.js';
import { createHttpServer } from '../../../server/src/http.js';
import { MatchService } from '../../../server/src/service.js';
import { MemoryStorage } from '../../../server/src/storage/memory.js';
import { DuelClient } from '../../../server/src/client.js';
import { DEFAULT_LIVE_CONFIG } from '../../../server/src/live/config.js';
import { MemoryLiveStore } from '../../../server/src/live/memory.js';
import { createLiveRuntime } from '../../../server/src/live/runtime.js';
import type { FetchLike } from '../../../server/src/client.js';
import { openMenuEntry } from './menu-nav.js';

/** The Chromium the other e2e suites use; override with PW_CHROMIUM. */
export const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

/** The channel prefix `web/src/channel.ts` adds for the futa05 build. */
export const PREFIX = 'futa05:';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type Guest = { token: string; playerId: string; displayName: string | null };

const toGuest = (res: {
  token: string;
  player: { id: string; displayName: string | null };
}): Guest => ({ token: res.token, playerId: res.player.id, displayName: res.player.displayName });

/** One created+joined duel: two guests, one match. */
export type LocalMatch = {
  matchId: string;
  guests: [Guest, Guest];
  inviteCode: string;
  /** The seat that moves first (the engine's seeded lottery). */
  starterSeat: 0 | 1;
};

export type LocalDuel = {
  origin: string;
  apiBase: string;
  api: DuelClient;
  browser: Browser;
  /** Create + join a fresh duel on the same local service. */
  newMatch(): Promise<LocalMatch>;
  close(): Promise<void>;
};

export type LocalDuelOptions = {
  /** Preview port (must be free); each suite picks its own. */
  port: number;
  /** Turn length; a test wants it long so a slow machine never times a seat out. */
  turnTimeoutMs?: number;
  /** Live-duel settings to override (e.g. a short `turnMs` to reach the low-time state quickly). */
  liveConfig?: Partial<import('../../../server/src/live/config.js').LiveConfig>;
};

const buildWithApi = (apiBase: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'],
      {
        env: {
          ...process.env,
          PATH: process.env.PATH,
          CHANNEL: 'futa05',
          VITE_DUEL_API_URL: apiBase,
          VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:9',
          VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'local-e2e-anon-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let err = '';
    child.stderr?.on('data', (b) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

/** Boot the API + the built page. Call `close()` in a finally block. */
export const startLocalDuel = async (options: LocalDuelOptions): Promise<LocalDuel> => {
  const memory = new MemoryStorage();
  const server = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: options.turnTimeoutMs ?? 24 * 3_600_000 };
  // The CHANNEL=futa05 build now ships live duels (see web/src/online/live/flag.ts), so the harness
  // serves the live routes too — otherwise the live listener would log 404s and its challenge
  // inbox could never answer. These suites still exercise the online duel itself (live duels have
  // their own proof in web/e2e/live-duels.ts); this just keeps the build under test faithful.
  const live = createLiveRuntime({
    storage: memory,
    live: new MemoryLiveStore(memory),
    server,
    config: { ...DEFAULT_LIVE_CONFIG, ...(options.liveConfig ?? {}) },
  });
  const service = new MatchService({ storage: live.storage, config: server });
  const apiServer = createHttpServer({ service, config: server, live: live.router(service) });
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;

  await buildWithApi(apiBase);
  const previewServer = await preview({
    configFile: 'web/vite.config.ts',
    preview: { host: '127.0.0.1', port: options.port, strictPort: true },
    logLevel: 'error',
  });
  const origin =
    previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ??
    `http://127.0.0.1:${(previewServer.httpServer?.address() as AddressInfo | null)?.port ?? options.port}`;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${origin}/`);
      if (res.ok || res.status === 404) break;
    } catch {
      await sleep(100);
    }
  }

  const nodeFetch: FetchLike = (url, init) => fetch(url, init);
  const api = new DuelClient({ baseUrl: apiBase, fetch: nodeFetch });

  const newMatch = async (): Promise<LocalMatch> => {
    const creator = toGuest(await api.createGuest());
    const joiner = toGuest(await api.createGuest());
    const created = await api.createMatch(creator.token);
    const joined = await api.joinMatch(joiner.token, created.match.inviteCode);
    // The seat that acts first is the engine's starting player for the match.
    const starterSeat: 0 | 1 =
      created.player.startingPlayer === created.player.seat ? created.player.seat : joined.player.seat;
    return {
      matchId: created.match.matchId,
      guests: [creator, joiner],
      inviteCode: created.match.inviteCode,
      starterSeat,
    };
  };

  const browser = await chromium.launch({ executablePath: CHROME });

  return {
    origin,
    apiBase,
    api,
    browser,
    newMatch,
    close: async () => {
      await browser.close().catch(() => undefined);
      await previewServer.close().catch(() => undefined);
      await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    },
  };
};

export type SeatSession = {
  seat: 0 | 1;
  guest: Guest;
  context: BrowserContext;
  page: Page;
  identityKey: string;
  sessionKey: string;
};

export type SeatOptions = {
  viewport?: { width: number; height: number };
  hasTouch?: boolean;
  isMobile?: boolean;
  reduceMotion?: boolean;
  speed?: 'slow' | 'normal' | 'fast' | 'skip';
  /** Override the user agent (e.g. to exercise the iOS Safari instruction face). */
  userAgent?: string;
};

/**
 * Open one seat of a duel in its own context, with that seat's identity + session pre-seeded so the
 * lobby list resumes straight into the match.
 */
export const openSeat = async (
  duel: LocalDuel,
  match: LocalMatch,
  seat: 0 | 1,
  options: SeatOptions = {},
): Promise<SeatSession> => {
  const guest = match.guests[seat];
  const identityKey = `${PREFIX}severgrow.duel.identity.v1`;
  const sessionKey = `${PREFIX}severgrow.duel.session.v1`;
  const context = await duel.browser.newContext({
    viewport: options.viewport ?? { width: 390, height: 844 },
    hasTouch: options.hasTouch ?? true,
    isMobile: options.isMobile ?? true,
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
  });
  await context.addInitScript(
    ({ identityKey: ik, sessionKey: sk, identity, session, speed, reduceMotion }) => {
      try {
        localStorage.clear();
        localStorage.setItem(ik, JSON.stringify(identity));
        localStorage.setItem(sk, JSON.stringify(session));
        localStorage.setItem('futa05:severgrow.duel.firstCard.v1', '1');
        localStorage.setItem(
          'futa05:severgrow.settings.v1',
          JSON.stringify({
            sound: false,
            music: false,
            coach: false,
            speed,
            reduceMotion,
            eyeCandy: false,
            autoSkip: false,
          }),
        );
      } catch {
        /* storage blocked: the flow will report it */
      }
    },
    {
      identityKey,
      sessionKey,
      identity: {
        token: guest.token,
        playerId: guest.playerId,
        displayName: guest.displayName,
        kind: 'guest',
      },
      session: { token: guest.token, matchId: match.matchId, seat },
      speed: options.speed ?? 'normal',
      reduceMotion: options.reduceMotion ?? false,
    },
  );
  const page = await context.newPage();
  if (options.reduceMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(duel.origin, { waitUntil: 'domcontentloaded' });
  return { seat, guest, context, page, identityKey, sessionKey };
};

/** Walk the lobby into the running duel (the match row resumes it). */
export const openDuel = async (session: SeatSession, matchId: string): Promise<void> => {
  const { page } = session;
  // Play online lives behind the PLAY doorway on product channels; this opens it either way.
  await openMenuEntry(page, 'menu-online', { timeout: 40_000 });
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
  const row = page.locator(`#online-matches li[data-match-id="${matchId}"]`);
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
};

export type OnlineHook = {
  revealing: boolean;
  live: boolean;
  myTurn: boolean;
  seat: 0 | 1;
  finished: boolean;
  /** True when the local draft can be taken back (the OnlineSession's own answer). */
  canUndo: boolean;
  queued: number;
};

/** Read the page's own online gate state (the `__severgrow.online()` test hook). */
export const readOnline = (session: SeatSession): Promise<OnlineHook | null> =>
  session.page
    .evaluate(
      () =>
        (window as unknown as { __severgrow?: { online: () => OnlineHook | null } }).__severgrow?.online() ?? null,
    )
    .catch(() => null);

/** The hex keys currently drawn on the board (what the animation shows right now). */
export const drawnTiles = (session: SeatSession): Promise<string[]> =>
  session.page
    .evaluate(() =>
      Array.from(document.querySelectorAll('.l-tiles .tile[data-key]'))
        .map((el) => (el as HTMLElement).dataset.key ?? '')
        .filter(Boolean)
        .sort(),
    )
    .catch(() => [] as string[]);

export const turnWord = (session: SeatSession): Promise<string> =>
  session.page
    .evaluate(() => (document.querySelector('[data-duel-turn]')?.textContent ?? '').trim())
    .catch(() => '');

export const statePhase = (session: SeatSession): Promise<string> =>
  session.page
    .evaluate(
      () =>
        (window as unknown as { __severgrow?: { state: () => null | { phase: string } } }).__severgrow?.state()?.phase ??
        '',
    )
    .catch(() => '');

/** Wait until the page has finished animating (its moves row is empty while it is busy). */
export const waitIdle = async (session: SeatSession, timeout = 15_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!(await session.page.evaluate('!!(window.__severgrow && window.__severgrow.busy())'))) return true;
    await sleep(100);
  }
  return false;
};

/**
 * A point really inside the element: a fanned hand card's centre can sit under the next card,
 * which matters because Futa04 forces one specific card into the throw pile.
 */
export const exposedPoint = (session: SeatSession, selector: string): Promise<{ x: number; y: number } | null> =>
  session.page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (const yf of [0.5, 0.35, 0.65, 0.22, 0.78]) {
      for (const xf of [0.5, 0.3, 0.7, 0.2, 0.8]) {
        const x = r.left + r.width * xf;
        const y = r.top + r.height * yf;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) return { x: x, y: y };
      }
    }
    return null;
  })()`) as Promise<{ x: number; y: number } | null>;

/** A real finger tap on a selector. */
export const tapExposed = async (session: SeatSession, selector: string): Promise<boolean> => {
  const p = await exposedPoint(session, selector);
  if (!p) return false;
  await touchTap(session, p);
  return true;
};

/**
 * End this seat's online turn THE WAY THE PAGE DOES: the Throw control leaves the Grow step (its
 * EndAct is batched with the local draft), then the forced card goes to the throw pile. Owner rule
 * (2026-10-25): a tap picks the card; the same card tapped again DESELECTS. The throw is the tap
 * on the Throw pile while the card is picked.
 */
export const endTurnViaPage = async (session: SeatSession, timeout = 25_000): Promise<boolean> => {
  await waitIdle(session);
  const start = Date.now();
  while (Date.now() - start < timeout && (await statePhase(session)) === 'ACT') {
    const clicked = (await session.page.evaluate(`(() => {
      const b = document.querySelector('#moves .end, #moves .futa04-skip, .futa04-skip, .end');
      if (!b || b.disabled) return false;
      b.click();
      return true;
    })()`)) as boolean;
    if (!clicked) await sleep(300);
    await sleep(250);
  }
  if ((await statePhase(session)) !== 'DISCARD') return false;
  const cardId = (await session.page.evaluate(
    `(() => { const d = window.__severgrow.legal().filter(function (a) { return a.t === 'Discard'; })[0]; return d ? d.card : null; })()`,
  )) as number | null;
  if (cardId === null) return false;
  for (let i = 0; i < 3; i++) {
    await tapExposed(session, `#hand [data-card="${cardId}"]`); // pick (never throw)
    await sleep(250);
    if ((await statePhase(session)) !== 'DISCARD') return true;
    await tapExposed(session, '#discard'); // the throw: tap the pile while it is picked
    await sleep(450);
    if ((await statePhase(session)) !== 'DISCARD') return true;
  }
  return (await statePhase(session)) !== 'DISCARD';
};

export const waitingFlag = (session: SeatSession): Promise<boolean> =>
  session.page
    .evaluate(() => document.documentElement.dataset.futa04Waiting === 'true')
    .catch(() => false);

/** Touch-tap a point (a finger, not a mouse: the phone path). */
export const touchTap = (session: SeatSession, point: { x: number; y: number }): Promise<void> =>
  session.page.touchscreen.tap(point.x, point.y);

/** The centre of a drawn hex (screen coordinates). */
export const hexCentre = async (session: SeatSession, key: string): Promise<{ x: number; y: number } | null> =>
  session.page.evaluate((k) => {
    const el = document.querySelector(`#board .hex-cell[data-key="${k}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, key);
