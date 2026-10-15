// Device/browser matrix harness for FUTASAKU 0.5 online duels (live site + live Edge API).
//
// This file is new and owned by the device-matrix stream (futa0.5-online). It only reads the
// deployed build and the public HTTP API; it never imports or changes app code except for the
// pure perspective key-mapping helper (no side effects).
//
//   npx tsx web/e2e/online-device-matrix.ts [--games=30] [--concurrency=3] [--only=<device-id>]
import { mkdirSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright-core';
import type { Browser, BrowserContext, Page, Request, Response } from 'playwright-core';
import { onlinePerspective } from '../../src/online/perspective.js';
import { coordKey } from '../../../src/engine/index.js';
import type { Action, Player } from '../../../src/engine/index.js';
import { openMenuEntry, openOnlineHub, waitMenuEntry } from './menu-nav.js';

export const LIVE_APP = 'https://severgrow.github.io/severgrow-01/futa0.5/';
export const LIVE_API = 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel';
export const RULES_VERSION = 'futasaku0.4-strength-draw';
export const CLIENT_VERSION = '0.5.0';

/** Storage prefix the futa05 preview channel adds (see web/src/channel.ts). */
export const STORAGE_PREFIX = 'futa05:';
export const SCREEN_DIR = 'docs/screens/online/device-matrix';
/** Evidence folder for the extra device/browser volume pass (TASK 3). */
export const VOLUME_SCREEN_DIR = 'docs/screens/online/device-matrix-volume';
let activeScreenDir = SCREEN_DIR;
export const setScreenDir = (dir: string): void => {
  activeScreenDir = dir;
};

export const IDENTITY_KEY = 'severgrow.duel.identity.v1';
export const FIRST_CARD_KEY = 'severgrow.duel.firstCard.v1';
export const SETTINGS_KEY = 'severgrow.settings.v1';
export const SESSION_KEY = 'severgrow.duel.session.v1';
export const DRAFT_KEY_PREFIX = 'severgrow.duel.draft.v1.';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------- devices

export type EngineKind = 'chromium' | 'firefox' | 'webkit';

export type DeviceProfile = {
  id: string;
  label: string;
  engine: EngineKind;
  /** Realistic platform tag recorded in the report. */
  platform: string;
  viewport: { width: number; height: number };
  /** Landscape viewport used by the rotate variant. */
  rotated?: { width: number; height: number };
  hasTouch: boolean;
  isMobile: boolean;
  userAgent: string;
  deviceScaleFactor: number;
  /** Smallest sensible tap target this device's platform guideline expects. */
  touchTargetPx: number;
};

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const DESKTOP_FIREFOX_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0';
const DESKTOP_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

const FIREFOX_MOBILE_UA =
  'Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0';

/**
 * Extra profiles for the TASK 3 volume pass. Kept separate from `DEVICES` so the original
 * 30-duel report and its screenshot names never change.
 */
export const VOLUME_DEVICES: readonly DeviceProfile[] = Object.freeze([
  {
    id: 'webkit-android-412x915',
    label: 'WebKit at an Android phone size 412x915',
    engine: 'webkit',
    platform: 'WebKit, Android-sized (touch)',
    viewport: { width: 412, height: 915 },
    rotated: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_UA,
    deviceScaleFactor: 3,
    touchTargetPx: 48,
  },
  {
    id: 'firefox-mobile-390x844',
    label: 'Firefox mobile-ish 390x844',
    engine: 'firefox',
    platform: 'Firefox mobile-ish (touch)',
    viewport: { width: 390, height: 844 },
    rotated: { width: 844, height: 390 },
    hasTouch: true,
    // Playwright's isMobile is Chromium/WebKit only; a small touch viewport stands in for mobile.
    isMobile: false,
    userAgent: FIREFOX_MOBILE_UA,
    deviceScaleFactor: 3,
    touchTargetPx: 48,
  },
  {
    id: 'narrow-320x568',
    label: 'Chromium 320x568 (smallest supported)',
    engine: 'chromium',
    platform: 'Chromium 320px (touch)',
    viewport: { width: 320, height: 568 },
    rotated: { width: 568, height: 320 },
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_UA,
    deviceScaleFactor: 2,
    touchTargetPx: 44,
  },
  {
    id: 'large-1920x1080',
    label: 'Desktop Chrome 1920x1080',
    engine: 'chromium',
    platform: 'Desktop Chrome large (mouse)',
    viewport: { width: 1920, height: 1080 },
    hasTouch: false,
    isMobile: false,
    userAgent: DESKTOP_CHROME_UA,
    deviceScaleFactor: 1,
    touchTargetPx: 24,
  },
  {
    id: 'a11y-390x844',
    label: 'Android Chrome 390x844 — reduced motion + large text',
    engine: 'chromium',
    platform: 'Chromium accessibility settings (touch)',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_UA,
    deviceScaleFactor: 3,
    touchTargetPx: 48,
  },
] as const);

export const DEVICES: readonly DeviceProfile[] = Object.freeze([
  {
    id: 'iphone-390x844',
    label: 'iPhone Safari 390x844',
    engine: 'webkit',
    platform: 'iOS Safari (WebKit, touch)',
    viewport: { width: 390, height: 844 },
    rotated: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    userAgent: IPHONE_UA,
    deviceScaleFactor: 3,
    touchTargetPx: 44,
  },
  {
    id: 'android-390x844',
    label: 'Android Chrome 390x844',
    engine: 'chromium',
    platform: 'Android Chrome (touch)',
    viewport: { width: 390, height: 844 },
    rotated: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_UA,
    deviceScaleFactor: 3,
    touchTargetPx: 48,
  },
  {
    id: 'iphone-360x640',
    label: 'iPhone Safari 360x640',
    engine: 'webkit',
    platform: 'iOS Safari small (WebKit, touch)',
    viewport: { width: 360, height: 640 },
    rotated: { width: 640, height: 360 },
    hasTouch: true,
    isMobile: true,
    userAgent: IPHONE_UA,
    deviceScaleFactor: 3,
    touchTargetPx: 44,
  },
  {
    id: 'android-360x640',
    label: 'Android Chrome 360x640',
    engine: 'chromium',
    platform: 'Android Chrome small (touch)',
    viewport: { width: 360, height: 640 },
    rotated: { width: 640, height: 360 },
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_UA,
    deviceScaleFactor: 3,
    touchTargetPx: 48,
  },
  {
    id: 'ipad-768x1024',
    label: 'iPad Safari 768x1024',
    engine: 'webkit',
    platform: 'iPadOS Safari (WebKit, touch)',
    viewport: { width: 768, height: 1024 },
    rotated: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
    userAgent: IPAD_UA,
    deviceScaleFactor: 2,
    touchTargetPx: 44,
  },
  {
    id: 'desktop-chromium-1280x800',
    label: 'Desktop Chrome 1280x800',
    engine: 'chromium',
    platform: 'Desktop Chrome (macOS)',
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
    userAgent: DESKTOP_CHROME_UA,
    deviceScaleFactor: 1,
    touchTargetPx: 24,
  },
  {
    id: 'desktop-firefox-1280x800',
    label: 'Desktop Firefox 1280x800',
    engine: 'firefox',
    platform: 'Desktop Firefox (macOS)',
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
    userAgent: DESKTOP_FIREFOX_UA,
    deviceScaleFactor: 1,
    touchTargetPx: 24,
  },
  {
    id: 'desktop-webkit-1280x800',
    label: 'Desktop Safari 1280x800',
    engine: 'webkit',
    platform: 'Desktop Safari (WebKit)',
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
    userAgent: DESKTOP_SAFARI_UA,
    deviceScaleFactor: 1,
    touchTargetPx: 24,
  },
] as const);

export const deviceById = (id: string): DeviceProfile | undefined =>
  DEVICES.find((d) => d.id === id);

// ---------------------------------------------------------------------------- results

export type Check = { name: string; ok: boolean; note?: string };

export type LayoutIssue = {
  kind: 'horizontal-overflow' | 'small-touch-target' | 'clipped-text' | 'unreachable-control';
  severity: 'high' | 'medium' | 'low';
  detail: string;
};

export type GameRecord = {
  index: number;
  variant: string;
  creator: string;
  joiner: string | null;
  engines: string;
  views: string;
  pass: boolean;
  skipped?: string;
  checks: Check[];
  consoleErrors: string[];
  networkFailures: string[];
  httpErrors: string[];
  corsIssues: string[];
  layout: LayoutIssue[];
  whoStarts: 'creator' | 'joiner' | 'unknown';
  whoStartsShown: boolean | null;
  opponentMidTurnHidden: boolean | null;
  timerOk: boolean | null;
  screenshots: string[];
  durationMs: number;
  notes: string[];
};

export const makeRecord = (index: number, variant: string, creator: DeviceProfile): GameRecord => ({
  index,
  variant,
  creator: creator.id,
  joiner: null,
  engines: creator.engine,
  views: `${creator.viewport.width}x${creator.viewport.height}`,
  pass: false,
  checks: [],
  consoleErrors: [],
  networkFailures: [],
  httpErrors: [],
  corsIssues: [],
  layout: [],
  whoStarts: 'unknown',
  whoStartsShown: null,
  opponentMidTurnHidden: null,
  timerOk: null,
  screenshots: [],
  durationMs: 0,
  notes: [],
});

export const addCheck = (rec: GameRecord, name: string, ok: boolean, note?: string): boolean => {
  rec.checks.push(note === undefined ? { name, ok } : { name, ok, note });
  return ok;
};

/** Fail the record with a single reason (used by scenario guards). */
export const fail = (rec: GameRecord, name: string, note: string): void => {
  addCheck(rec, name, false, note);
};

// ---------------------------------------------------------------------------- HTTP API

export type Guest = { token: string; playerId: string; displayName: string | null };

type ApiOptions = { method?: 'GET' | 'POST'; token?: string; body?: unknown };

const apiRequest = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-futasaku-client-version': CLIENT_VERSION,
    'x-futasaku-rules-version': RULES_VERSION,
  };
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${LIVE_API}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const json = (await response.json().catch(() => null)) as
    | (T & { ok?: boolean; code?: string; message?: string })
    | null;
  if (!response.ok || (json && json.ok === false)) {
    const code = json?.code ?? 'HTTP_ERROR';
    const message = json?.message ?? `HTTP ${response.status}`;
    throw new Error(`API ${path} failed: ${code} ${message}`);
  }
  return json as T;
};

export const createGuest = async (): Promise<Guest> => {
  const res = await apiRequestWithRetry<{ player: { id: string; displayName: string | null }; token: string }>(
    '/v1/guests',
    { method: 'POST', body: {} },
  );
  return { token: res.token, playerId: res.player.id, displayName: res.player.displayName };
};

/** How many times the live API answered 5xx during this run (recorded for the report). */
let serverErrorCount = 0;
export const serverErrorTally = (): number => serverErrorCount;

/** Retry the live API's intermittent 5xx (observed on /view and /matches during the matrix). */
const apiRequestWithRetry = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await apiRequest<T>(path, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/INTERNAL|HTTP_ERROR|Something went wrong|502|503|504/i.test(message)) throw error;
      lastError = error;
      serverErrorCount++;
      await sleep(1_200 + attempt * 800);
    }
  }
  throw lastError ?? new Error(`API ${path} failed`);
};

export type ServerView = {
  matchId: string;
  revision: number;
  turnStartRevision: number;
  seat: Player;
  status: string;
  actor: Player;
  turnPlayer: Player;
  phase: string;
  actPhase: string | null;
  board: Record<string, unknown>;
  handIds: number[];
  legalActions: Action[];
  turnDeadlineAt: number | null;
  serverNow: number;
  raw: Record<string, unknown>;
};

export const fetchView = async (token: string, matchId: string): Promise<ServerView> => {
  const res = await apiRequestWithRetry<{
    player: {
      revision: number;
      turnStartRevision: number;
      seat: Player;
      status: string;
      actor: Player;
      turnPlayer: Player;
      view: { phase: string; board: Record<string, unknown>; hand: { id: number }[] };
      legalActions: Action[];
      turnDeadlineAt: number | null;
    };
    serverNow: number;
  }>(`/v1/matches/${matchId}/view`, { token });
  const p = res.player;
  return {
    matchId,
    revision: p.revision,
    turnStartRevision: p.turnStartRevision,
    seat: p.seat,
    status: p.status,
    actor: p.actor,
    turnPlayer: p.turnPlayer,
    phase: p.view.phase,
    actPhase: (p.view as { act?: string }).act ?? null,
    board: p.view.board ?? {},
    handIds: (p.view.hand ?? []).map((c) => c.id),
    legalActions: p.legalActions ?? [],
    turnDeadlineAt: p.turnDeadlineAt,
    serverNow: res.serverNow,
    raw: p as unknown as Record<string, unknown>,
  };
};

export type MatchListEntry = { matchId: string; status: string; inviteCode: string; revision: number };

export const listMatches = async (token: string): Promise<MatchListEntry[]> => {
  const res = await apiRequestWithRetry<{ matches: MatchListEntry[] }>('/v1/players/me/matches', { token });
  return res.matches ?? [];
};

export const resignMatch = async (token: string, matchId: string): Promise<boolean> => {
  try {
    await apiRequest(`/v1/matches/${matchId}/resign`, { method: 'POST', token, body: {} });
    return true;
  } catch {
    return false;
  }
};

/** Best effort: close any duel this guest still has open so the 10-open-match cap never trips. */
export const cleanupOpenMatches = async (guest: Guest): Promise<number> => {
  let closed = 0;
  try {
    const matches = await listMatches(guest.token);
    for (const m of matches) {
      if (m.status === 'active' && (await resignMatch(guest.token, m.matchId))) closed++;
    }
  } catch {
    /* keep going: the matrix must not die on a cleanup hiccup */
  }
  return closed;
};

/**
 * A waiting invite that is never joined counts against the owner's 10-open-match budget and cannot
 * be cancelled. Have the pair partner join it (turning it active) and then resign as its owner.
 */
export const closeWaitingMatches = async (owner: Guest, partner: Guest, limit = 3): Promise<number> => {
  let closed = 0;
  try {
    const matches = await listMatches(owner.token);
    for (const m of matches) {
      if (closed >= limit) break;
      if (m.status !== 'waiting' || !m.inviteCode) continue;
      try {
        await apiRequest('/v1/matches/join', { method: 'POST', token: partner.token, body: { inviteCode: m.inviteCode } });
      } catch {
        continue;
      }
      if (await resignMatch(owner.token, m.matchId)) closed++;
    }
  } catch {
    /* best effort */
  }
  return closed;
};

/**
 * JSON paths where a *card id* from `ids` appears in a payload. Only id-shaped leaves are
 * inspected (`.id`, `.card`, `.cards[n]`), so small ids cannot collide with revision/seat/count
 * numbers — that collision was a false positive in an early pass of this suite.
 */
export const findNumberPaths = (node: unknown, ids: number[]): string[] => {
  const hits: string[] = [];
  const isCardSlot = (path: string): boolean => /(\.id|\.card|\.cards\[\d+\]|\.hexes\[\d+\])$/.test(path);
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'number') {
      if (isCardSlot(path) && ids.includes(value)) hits.push(`${path}=${value}`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
    }
  };
  walk(node, 'player');
  return hits;
};

// ---------------------------------------------------------------------------- browsers

export class BrowserPool {
  private readonly browsers = new Map<EngineKind, Promise<Browser>>();

  constructor(private readonly headed = false) {}

  get(engine: EngineKind): Promise<Browser> {
    const existing = this.browsers.get(engine);
    if (existing) return existing;
    const launched = this.launch(engine);
    this.browsers.set(engine, launched);
    return launched;
  }

  private async launch(engine: EngineKind): Promise<Browser> {
    const headless = !this.headed;
    if (engine === 'chromium') {
      const fallback = process.env.PW_CHROMIUM;
      if (fallback) return chromium.launch({ headless, executablePath: fallback });
      return chromium.launch({ headless });
    }
    if (engine === 'firefox') return firefox.launch({ headless });
    return webkit.launch({ headless });
  }

  async close(): Promise<void> {
    for (const pending of this.browsers.values()) {
      try {
        (await pending).close();
      } catch {
        /* already gone */
      }
    }
    this.browsers.clear();
  }
}

// ---------------------------------------------------------------------------- sessions

export type SessionOptions = {
  /** Make every Storage method throw (the honest-warning path). */
  storageBlocked?: boolean;
  /** Skip the first-run online card. */
  seedFirstCard?: boolean;
  /** Skip the settings boot noise (sound off, no motion). */
  seedSettings?: boolean;
  /** Add this many ms of latency to duel API calls (slow-network variant). */
  apiLatencyMs?: number;
  /** Keep the duel API unreachable from the very first request. */
  offlineAtStart?: boolean;
  /** Start with no stored identity at all, even when one is supplied. */
  anonymous?: boolean;
  /** Apply the OS-level reduced-motion preference to the page (media query + app setting). */
  reducedMotion?: boolean;
  /** Turn on the app's Large text accessibility setting. */
  largeText?: boolean;
};

export type Session = {
  label: string;
  device: DeviceProfile;
  context: BrowserContext;
  page: Page;
  guest: Guest;
  consoleErrors: string[];
  networkFailures: string[];
  httpErrors: string[];
  corsIssues: string[];
  pageErrors: string[];
  matchId: string | null;
  /** The token the page actually stored (should equal guest.token when seeding worked). */
  pageToken: string | null;
  close(): Promise<void>;
};

const identityScript = (guest: Guest): string =>
  JSON.stringify({ token: guest.token, playerId: guest.playerId, displayName: guest.displayName, kind: 'guest' });

/** A JS string literal holding `text` (double-encoded, so it can be embedded in the init script). */
const literal = (text: string): string => JSON.stringify(text);

export const seedScript = (guest: Guest, options: SessionOptions): { content: string } => {
  const lines = [
    'try {',
    options.storageBlocked
      ? "  for (const k of ['getItem','setItem','removeItem']) Object.defineProperty(Storage.prototype, k, { value() { throw new Error('storage blocked'); }, configurable: true });"
      : '',
    options.anonymous
      ? ''
      : `  localStorage.setItem(${literal(STORAGE_PREFIX + IDENTITY_KEY)}, ${literal(identityScript(guest))});`,
    options.seedFirstCard === false ? '' : `  localStorage.setItem(${literal(STORAGE_PREFIX + FIRST_CARD_KEY)}, '1');`,
    options.seedSettings === false
      ? ''
      : `  localStorage.setItem(${literal(STORAGE_PREFIX + SETTINGS_KEY)}, ${literal(
          JSON.stringify({
            sound: false,
            music: false,
            coach: false,
            speed: 'skip',
            reduceMotion: true,
            largeText: options.largeText === true,
            eyeCandy: false,
          }),
        )});`,
    '} catch (e) {}',
  ];
  return { content: lines.filter(Boolean).join('\n') };
};

const isApiUrl = (url: string): boolean => url.startsWith(LIVE_API);

export const openSession = async (
  pool: BrowserPool,
  device: DeviceProfile,
  guest: Guest,
  label: string,
  options: SessionOptions = {},
): Promise<Session> => {
  const browser = await pool.get(device.engine);
  const context = await browser.newContext({
    viewport: device.viewport,
    hasTouch: device.hasTouch,
    isMobile: device.isMobile,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
  });
  await context.addInitScript(seedScript(guest, options));
  // Take the browser confirm() out of the loop for automated resign taps (string script: no
  // tsx/esbuild transform, so no `__name` helper is injected).
  await context.addInitScript({ content: "try { window.confirm = function () { return true; }; } catch (e) {}" });

  const page = await context.newPage();
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  const session: Session = {
    label,
    device,
    context,
    page,
    guest,
    consoleErrors: [],
    networkFailures: [],
    httpErrors: [],
    corsIssues: [],
    pageErrors: [],
    matchId: null,
    pageToken: null,
    close: async () => {
      try {
        await context.close();
      } catch {
        /* already closed */
      }
    },
  };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text().slice(0, 300);
    session.consoleErrors.push(text);
    // WebKit in particular reports a CORS error for a cross-origin call that actually succeeded.
    if (/access-control-allow-origin|blocked by cors/i.test(text)) session.corsIssues.push(`console: ${text}`);
  });
  page.on('pageerror', (error) => session.pageErrors.push(String(error.message).slice(0, 300)));
  page.on('requestfailed', (request: Request) => {
    const failure = request.failure();
    session.networkFailures.push(
      `${request.method()} ${shortUrl(request.url())} — ${failure?.errorText ?? 'failed'}`,
    );
  });
  page.on('response', (response: Response) => {
    if (!isApiUrl(response.url())) return;
    const status = response.status();
    if (status >= 400) session.httpErrors.push(`${status} ${response.request().method()} ${shortUrl(response.url())}`);
    const acao = response.headers()['access-control-allow-origin'];
    if (acao === undefined) session.corsIssues.push(`missing ACAO on ${status} ${shortUrl(response.url())}`);
  });

  if (options.apiLatencyMs !== undefined && options.apiLatencyMs > 0) {
    const latency = options.apiLatencyMs;
    await page.route('**/functions/v1/duel/**', async (route) => {
      await sleep(latency);
      await route.continue();
    });
  }
  if (options.offlineAtStart) await context.setOffline(true);

  return session;
};

export const shortUrl = (url: string): string => url.replace(LIVE_API, '/duel').replace(LIVE_APP, '/futa0.5/');

/** Reopen a page (same device/context) for the async/refresh variants. */
export const newPage = async (session: Session, options: SessionOptions = {}): Promise<Page> => {
  if (Object.keys(options).length > 0) await session.context.addInitScript(seedScript(session.guest, options));
  const page = await session.context.newPage();
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  session.page = page;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text().slice(0, 300);
    session.consoleErrors.push(text);
    if (/access-control-allow-origin|blocked by cors/i.test(text)) session.corsIssues.push(`console: ${text}`);
  });
  page.on('pageerror', (error) => session.pageErrors.push(String(error.message).slice(0, 300)));
  page.on('requestfailed', (request: Request) => {
    session.networkFailures.push(`${request.method()} ${shortUrl(request.url())} — ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response: Response) => {
    if (!isApiUrl(response.url())) return;
    if (response.status() >= 400) session.httpErrors.push(`${response.status()} ${shortUrl(response.url())}`);
  });
  return page;
};

// ---------------------------------------------------------------------------- flow

const waitHidden = async (page: Page, selector: string, timeout = 25_000): Promise<void> => {
  await page.waitForSelector(`${selector}:not([hidden])`, { timeout });
};

export const openHub = async (session: Session): Promise<void> => {
  const { page } = session;
  // The deployed page can reload itself once (the ?_fresh= asset-recovery guard), which aborts a
  // goto in flight; retry instead of failing the game.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(LIVE_APP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      break;
    } catch (error) {
      const message = String(error);
      if (attempt === 2 || !/interrupted by another navigation|ERR_ABORTED/i.test(message)) throw error;
      await sleep(1_500);
    }
  }
  await waitHidden(page, '#menu');
  await openOnlineHub(page, { timeout: 30_000 });
  const firstOk = page.locator('#online-first-ok');
  if (await firstOk.isVisible().catch(() => false)) await firstOk.click();
};

/** Create a duel and return the invite code (and the URL, for link-join coverage). */
export const createDuel = async (session: Session): Promise<{ inviteCode: string; link: string }> => {
  const { page } = session;
  await page.click('#online-create');
  // Fail fast when the API refuses (rate limit / open-match cap) instead of burning 30s.
  await page.waitForSelector('#online-waiting:not([hidden]), #game:not([hidden]), #online-hub-notice:not(:empty)', {
    timeout: 30_000,
  });
  if (await page.locator('#game:not([hidden])').isVisible().catch(() => false)) {
    // Server auto-paired (should not happen for create) — treat as unexpected.
    throw new Error('create auto-joined into a game');
  }
  if (!(await page.locator('#online-waiting:not([hidden])').isVisible().catch(() => false))) {
    const notice = ((await page.locator('#online-hub-notice').textContent().catch(() => '')) ?? '').trim();
    throw new Error(`ENVIRONMENT: create refused — ${notice.slice(0, 130) || 'no waiting screen'}`);
  }
  const inviteCode = ((await page.locator('#online-invite-code').textContent()) ?? '').trim();
  return { inviteCode, link: `${LIVE_APP}#/join/${inviteCode}` };
};

export const joinDuel = async (session: Session, inviteCode: string): Promise<void> => {
  const { page } = session;
  await page.click('#online-join-open');
  await waitHidden(page, '#online-join');
  await page.fill('#online-join-code', inviteCode);
  await page.click('#online-join-submit');
};

export const joinDuelViaLink = async (session: Session, inviteCode: string): Promise<void> => {
  const { page } = session;
  await page.goto(`${LIVE_APP}#/join/${inviteCode}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await waitHidden(page, '#menu');
  // Wait for the menu (and the Play online entry behind the PLAY doorway) to be built. The old
  // waitHidden(page, '#menu-online') cannot succeed on a product build any more: the entry lives
  // inside the hidden PLAY submenu, and Playwright's default wait state is "visible".
  await waitMenuEntry(page, 'menu-online', { timeout: 30_000 });
  // An invite link boots straight into the join screen (lobby handles the hash).
  const joinVisible = await page
    .waitForSelector('#online-join:not([hidden])', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!joinVisible) {
    // The deep link did not land on the join screen: reach it the way a player does (PLAY doorway
    // on product channels, the flat menu on legacy ones).
    await openMenuEntry(page, 'menu-online', { timeout: 20_000 });
    await waitHidden(page, '#online-join', 20_000);
  }
  const field = page.locator('#online-join-code');
  if (!((await field.inputValue().catch(() => '')) ?? '').trim()) await field.fill(inviteCode);
  await page.click('#online-join-submit');
};

export const waitGame = async (session: Session, timeout = 40_000): Promise<void> => {
  await waitHidden(session.page, '#game', timeout);
  await waitHidden(session.page, '#duel-hud', timeout);
  const stored = await session.page.evaluate((key) => {
    const sessionRaw = localStorage.getItem(key);
    const identityRaw = localStorage.getItem('severgrow.duel.identity.v1');
    return { sessionRaw, identityRaw };
  }, SESSION_KEY);
  let matchId: string | null = null;
  try {
    matchId = (JSON.parse(stored.sessionRaw ?? '{}') as { matchId?: string }).matchId ?? null;
  } catch {
    matchId = null;
  }
  let token: string | null = null;
  try {
    token = (JSON.parse(stored.identityRaw ?? '{}') as { token?: string }).token ?? null;
  } catch {
    token = null;
  }
  session.matchId = matchId;
  session.pageToken = token;
};

/** Where the lobby currently is, for diagnosing a failed join. */
export const whereAmI = async (session: Session): Promise<string> => {
  try {
    return await session.page.evaluate(() => {
      const ids = ['menu', 'online-hub', 'online-waiting', 'online-join', 'game'] as const;
      const shown: Record<string, boolean> = {};
      const texts: Record<string, string> = {};
      for (const id of ids) {
        const el = document.getElementById(id) as HTMLElement | null;
        shown[id] = !!el && !el.hidden;
        texts[id] = (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      }
      for (const id of ['online-hub-notice', 'online-join-notice', 'online-waiting-notice', 'captions']) {
        texts[id] = (document.getElementById(id)?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
      }
      return JSON.stringify({ shown, texts });
    });
  } catch (error) {
    return `unreadable: ${String(error).slice(0, 80)}`;
  }
};

export type Hud = {
  turn: string;
  opponent: string;
  presence: string;
  scoreMe: string;
  scoreOpp: string;
  scoreMeLabel: string;
  scoreOppLabel: string;
  notice: string;
  hudVisible: boolean;
  /** Resign moved into the pause menu after the HUD trim; this is the live `#gm-resign` state. */
  resignInMenu: boolean;
  /** True when the trimmed strip still carries a deadline/who-starts chip it should not have. */
  hasRemovedChips: boolean;
  revisionText: string;
};

export const readHud = async (session: Session): Promise<Hud> =>
  session.page.evaluate(() => {
    // No named inner functions here on purpose: tsx/esbuild rewrites them with a `__name` helper
    // that does not exist in the page, which would break page.evaluate.
    const hud = document.getElementById('duel-hud');
    const resign = document.getElementById('gm-resign') as HTMLButtonElement | null;
    return {
      turn: (document.querySelector('#duel-hud [data-duel-turn]')?.textContent ?? '').trim(),
      opponent: (document.querySelector('#duel-hud [data-duel-opponent]')?.textContent ?? '').trim(),
      presence: (document.querySelector('#duel-hud [data-duel-presence]')?.textContent ?? '').trim(),
      scoreMe: (document.querySelector('#score-you')?.textContent ?? '').trim(),
      scoreOpp: (document.querySelector('#score-bot')?.textContent ?? '').trim(),
      scoreMeLabel: (document.querySelector('#score-you-label')?.textContent ?? '').trim(),
      scoreOppLabel: (document.querySelector('#score-bot-label')?.textContent ?? '').trim(),
      notice: (document.querySelector('#duel-hud [data-duel-notice]')?.textContent ?? '').trim(),
      hudVisible: !!hud && !hud.hidden,
      resignInMenu: !!resign && !resign.hidden,
      hasRemovedChips: !!document.querySelector('#duel-hud [data-duel-deadline], #duel-hud [data-duel-starter], #duel-hud #duel-resign'),
      revisionText: (document.querySelector('#duel-hud [data-duel-revision]')?.textContent ?? '').trim(),
    };
  });

/**
 * The turn deadline now lives in the lobby match list (the duel strip no longer shows it). Reads
 * the row in a separate tab so the running duel is untouched; returns the label plus whether the
 * last-two-hours warning is present.
 */
export const readMatchListDeadline = async (
  session: Session,
  matchId: string,
): Promise<{ time: string; warned: boolean }> => {
  const page = await session.context.newPage();
  try {
    await page.goto(LIVE_APP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitHidden(page, '#menu');
    await openOnlineHub(page, { timeout: 30_000 });
    const row = page.locator(`#online-matches li[data-match-id="${matchId}"]`);
    await row.waitFor({ state: 'visible', timeout: 25_000 });
    const time = ((await row.locator('.online-row-time').textContent()) ?? '').replace(/\s+/g, ' ').trim();
    const warned = (await row.locator('.online-row-time small').count()) > 0;
    return { time, warned };
  } finally {
    await page.close().catch(() => undefined);
  }
};

export const readDisplayState = async (
  session: Session,
): Promise<{ phase: string; actor: number; hand: number; turnNumber: number } | null> =>
  session.page.evaluate(() => {
    const hook = (window as unknown as { __severgrow?: { state: () => null | { phase: string; actor: number; hand: unknown[]; turnNumber: number } } }).__severgrow;
    const state = hook?.state();
    if (!state) return null;
    return { phase: state.phase, actor: state.actor, hand: state.hand.length, turnNumber: state.turnNumber };
  });

export const canUndo = async (session: Session): Promise<boolean> =>
  session.page.evaluate(() => !!(window as unknown as { __severgrow?: { canUndo: () => boolean } }).__severgrow?.canUndo());

export const pendingAction = async (session: Session): Promise<Action | null> =>
  session.page.evaluate(() => (window as unknown as { __severgrow?: { pending: () => Action | null } }).__severgrow?.pending() ?? null);

/** Wait until the local display state says it is this session's turn to act. */
export const waitMyTurn = async (session: Session, timeout = 30_000): Promise<boolean> =>
  session.page
    .waitForFunction(
      () => {
        const hook = (window as unknown as { __severgrow?: { state: () => null | { actor: number; phase: string } } }).__severgrow;
        const state = hook?.state();
        return !!state && state.actor === 0 && state.phase !== 'GAME_OVER';
      },
      undefined,
      { timeout },
    )
    .then(() => true)
    .catch(() => false);

/** Click the deck (which commits a Draw) and wait for the ACT phase. */
export const drawViaDeck = async (session: Session, useTouch = false): Promise<boolean> => {
  const { page } = session;
  try {
    await page.waitForSelector('#deck:not([disabled])', { timeout: 25_000 });
  } catch {
    return false;
  }
  // The piles animate continuously, so Playwright's actionability wait never settles: tap real
  // coordinates instead (the same thing a finger does) and retry until the phase moves.
  for (let attempt = 0; attempt < 5; attempt++) {
    const box = await page.locator('#deck').boundingBox().catch(() => null);
    if (!box) return false;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (useTouch && session.device.hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    const ok = await page
      .waitForFunction(
        () => (window as unknown as { __severgrow?: { state: () => null | { phase: string } } }).__severgrow?.state()?.phase === 'ACT',
        undefined,
        { timeout: 4_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (ok) return true;
  }
  return false;
};

export const displayPhase = async (session: Session): Promise<string> =>
  session.page.evaluate(
    () => (window as unknown as { __severgrow?: { state: () => null | { phase: string } } }).__severgrow?.state()?.phase ?? '',
  );

export type EndTurnResult = { ok: boolean; steps: string[] };

/**
 * End this player's turn the way a person does:
 *   1. leave the Grow step with the on-screen Skip control (`#smart-context`);
 *   2. throw a hand card onto the throw pile with a real drag.
 * Falls back to the (hidden) hardware EndAct control, and records every step for the report.
 */
export const endTurn = async (session: Session, attempts = 4): Promise<EndTurnResult> => {
  const { page } = session;
  const steps: string[] = [];
  try {
    const smart = page.locator('#smart-context');
    const smartVisible = await smart.isVisible().catch(() => false);
    if (smartVisible) {
      const box = await smart.boundingBox();
      if (box) {
        if (session.device.hasTouch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        steps.push('tapped #smart-context (on-screen Skip / end Grow)');
      }
    } else {
      steps.push('#smart-context not visible');
    }
    const advanced = await page
      .waitForFunction(
        () => {
          const s = (window as unknown as { __severgrow?: { state: () => null | { phase: string; actor: number } } }).__severgrow?.state();
          return !!s && (s.phase === 'DISCARD' || s.phase === 'DRAW' || s.actor === 1);
        },
        undefined,
        { timeout: 12_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!advanced) {
      // The on-screen Skip/Throw control is a hidden `futa04-hardware-control`; force it so the
      // scenario can continue measuring the rest of the flow.
      await page.evaluate(`(() => { const e = document.querySelector('#moves .end, .end'); if (e) e.click(); })()`);
      await sleep(2_500);
      steps.push('fallback: forced a DOM click on the hidden EndAct control');
    }

    for (let i = 0; i < attempts; i++) {
      const point = (await page.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('#hand .card'));
        const el = cards[${i}];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        for (const yf of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          for (const xf of [0.5, 0.3, 0.7]) {
            const x = r.left + r.width * xf;
            const y = r.top + r.height * yf;
            const hit = document.elementFromPoint(x, y);
            if (hit && (hit === el || el.contains(hit))) return { x: x, y: y };
          }
        }
        return null;
      })()`)) as { x: number; y: number } | null;
      if (!point) {
        steps.push('no hand card could be grabbed');
        break;
      }
      const pile = (await page.evaluate(
        `(() => { const r = document.getElementById('discard').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
      )) as { x: number; y: number };
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) {
        await page.mouse.move(point.x + ((pile.x - point.x) * k) / 8, point.y + ((pile.y - point.y) * k) / 8);
      }
      await page.mouse.up();
      const done = await page
        .waitForFunction(
          () => {
            const s = (window as unknown as { __severgrow?: { state: () => null | { phase: string; actor: number } } }).__severgrow?.state();
            return !!s && (s.phase === 'DRAW' || s.actor === 1);
          },
          undefined,
          { timeout: 6_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (done) {
        steps.push(`threw hand card #${i} onto the throw pile`);
        return { ok: true, steps };
      }
      steps.push(`hand card #${i}: drag did not end the turn`);
    }
    return { ok: false, steps };
  } catch (error) {
    steps.push(`error: ${String(error).slice(0, 120)}`);
    return { ok: false, steps };
  }
};

/**
 * Apply ONE local (not yet thrown) mid-turn Grow move for the session whose turn it is.
 * Uses the server's own legal actions, then taps the card and the mapped hex — exactly the taps a
 * player would make. futa04 has no Confirm box: a card with a single target plays on the card tap,
 * otherwise the hex tap places it. Returns the action plus whether a local draft now exists.
 */
export const applyLocalDraft = async (
  session: Session,
  view: ServerView,
  useTouch = false,
): Promise<{ action: Action; draft: boolean } | null> => {
  const { page } = session;
  const grow =
    view.legalActions.find((a) => a.t === 'Sprout') ??
    view.legalActions.find((a) => a.t === 'Bloom') ??
    view.legalActions.find((a) => a.t === 'MegaBomb') ??
    null;
  if (!grow || grow.t !== 'Sprout') return null;
  const perspective = onlinePerspective(view.seat);
  const tapPoint = async (x: number, y: number): Promise<void> => {
    if (useTouch && session.device.hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };

  const hasDraftNow = async (): Promise<boolean> => (await hasDraft(session)) || (await canUndo(session));

  // 1) tap the growable card
  const cardPoint = (await page.evaluate(`(() => {
    const el = document.querySelector('#hand [data-card="${grow.card}"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (const yf of [0.5, 0.3, 0.7, 0.2, 0.85]) {
      for (const xf of [0.5, 0.3, 0.7]) {
        const x = r.left + r.width * xf;
        const y = r.top + r.height * yf;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) return { x: x, y: y };
      }
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)) as { x: number; y: number } | null;
  if (!cardPoint) return null;
  await tapPoint(cardPoint.x, cardPoint.y);
  await page.waitForTimeout(350);

  // 2) tap the mapped target hex (this is what places the tile)
  const screenKey = perspective.mapKey(coordKey(grow.coord));
  const hexPoint = (await page.evaluate(`(() => {
    const el = document.querySelector('#board .hex-cell[data-key="${screenKey}"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`)) as { x: number; y: number } | null;
  if (!hexPoint) return null;
  await tapPoint(hexPoint.x, hexPoint.y);
  await page.waitForTimeout(600);

  // 3) if this build did show a Confirm box, accept it
  const pending = await pendingAction(session);
  const confirmVisible = await page
    .locator('#confirm:not([hidden])')
    .isVisible()
    .catch(() => false);
  if (pending && confirmVisible) {
    await page.evaluate(`(() => { const b = document.getElementById('confirm-play'); if (b) b.click(); })()`);
    await page.waitForTimeout(600);
  }
  return { action: pending ?? grow, draft: await hasDraftNow() };
};

/**
 * Whether this device has a local mid-turn draft. The ONLINE draft engine persists to
 * `sessionStorage` (`web/src/online/draft.ts`), not `localStorage`, so both are checked — the
 * original check only looked at localStorage and so reported "no draft" even when one existed.
 */
export const hasDraft = async (session: Session): Promise<boolean> =>
  session.page.evaluate(`(() => {
  const prefix = ${JSON.stringify(DRAFT_KEY_PREFIX)};
  let found = false;
  try { found = Object.keys(localStorage).some((k) => k.indexOf(prefix) !== -1); } catch (e) {}
  if (!found) { try { found = Object.keys(sessionStorage).some((k) => k.indexOf(prefix) !== -1); } catch (e) {} }
  return found;
})()`);

/**
 * Resign from a session's duel through the in-game pause menu (the page's confirm() is stubbed at
 * context creation). The top-row Resign control was removed in the HUD trim.
 */
export const resign = async (session: Session, timeout = 30_000): Promise<boolean> => {
  const { page } = session;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.click('#hud-menu');
      await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
      const clicked = await page.evaluate(`(() => {
        const button = document.getElementById('gm-resign');
        if (!button || button.hidden) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error('no Resign in the pause menu');
      await page.waitForFunction(
        () => {
          const go = document.getElementById('gameover');
          return !!go && !go.hidden;
        },
        undefined,
        { timeout },
      );
      return true;
    } catch {
      await sleep(1_500);
    }
  }
  return false;
};

export const waitFinished = async (session: Session, timeout = 30_000): Promise<string | null> => {
  try {
    await session.page.waitForFunction(
      () => {
        const go = document.getElementById('gameover');
        return !!go && !go.hidden;
      },
      undefined,
      { timeout },
    );
    return ((await session.page.locator('#go-title').textContent()) ?? '').trim();
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------- audit

export type LayoutAudit = { issues: LayoutIssue[]; metrics: Record<string, number> };

/**
 * Measure overflow, tap-target sizes, clipping and reachability on the current screen.
 * The page side is a plain string: tsx/esbuild rewrites named inner functions with a `__name`
 * helper that does not exist in the page, which would make page.evaluate throw.
 */
export const auditLayout = async (session: Session): Promise<LayoutAudit> => {
  const minTarget = session.device.touchTargetPx;
  const result = (await session.page.evaluate(`(() => {
  const minTarget = ${minTarget};
  const issues = [];
  const doc = document.documentElement;
  const metrics = {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: doc.scrollWidth,
    scrollHeight: doc.scrollHeight,
  };
  if (doc.scrollWidth > window.innerWidth + 1) {
    issues.push({ kind: 'horizontal-overflow', severity: 'high',
      detail: 'document scrollWidth ' + doc.scrollWidth + ' > viewport ' + window.innerWidth + ' (horizontal scroll / clipped right edge)' });
  }
  const onScreen = function (rect) {
    return rect.width >= 1 && rect.height >= 1 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
  };
  const isHidden = function (el, style) {
    return style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || !!el.closest('[hidden]');
  };
  // Touch targets: only when the device actually uses touch (a desktop mouse is fine at 24px).
  const controls = Array.from(document.querySelectorAll('button, [role="button"], a.btn, input'));
  const small = [];
  for (const el of controls) {
    const rect = el.getBoundingClientRect();
    if (!onScreen(rect)) continue;
    const style = getComputedStyle(el);
    if (isHidden(el, style)) continue;
    if (minTarget >= 44 && (rect.width < minTarget || rect.height < minTarget)) {
      const label = el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + (el.className || '').split(' ').slice(0, 2).join('.');
      small.push(label + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
    }
  }
  if (small.length) {
    issues.push({ kind: 'small-touch-target', severity: 'medium',
      detail: small.length + ' control(s) under ' + minTarget + 'px: ' + small.slice(0, 6).join('; ') });
  }
  // Clipped text in the containers that carry live messages.
  const hosts = Array.from(document.querySelectorAll('#duel-hud, .online-row, #captions, #confirm, #hint, .online-notice, .online-code, #go-title'));
  for (const el of hosts) {
    const rect = el.getBoundingClientRect();
    if (!onScreen(rect)) continue;
    const style = getComputedStyle(el);
    if (isHidden(el, style)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      issues.push({ kind: 'clipped-text', severity: 'medium',
        detail: (el.id || el.className.split(' ')[0]) + ' ' + el.scrollWidth + '>' + el.clientWidth });
    }
  }
  // Reachability: the primary controls must be hit-testable at their centre.
  for (const selector of ['#duel-resign', '#deck', '#confirm-play', 'button.end']) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (!onScreen(rect)) continue;
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
      issues.push({ kind: 'unreachable-control', severity: 'high',
        detail: selector + ' centre is covered by ' + (hit ? hit.tagName + '.' + (hit.className || '') : 'nothing') });
    }
  }
  return { issues: issues, metrics: metrics };
})()`)) as LayoutAudit;
  return result;
};

// ---------------------------------------------------------------------------- misc

export const shot = async (session: Session, name: string, dir = activeScreenDir): Promise<string> => {
  mkdirSync(dir, { recursive: true });
  // JPEG at a width fitted to 1024px: the evidence stays readable and the folder stays small
  // enough to keep in the repo (retina PNG dumps were ~300 MB for 110 shots).
  const path = `${dir}/${name}.jpg`;
  try {
    await session.page.screenshot({ path, type: 'jpeg', quality: 80 });
  } catch {
    return '';
  }
  return path;
};

/** Emulate the tab going hidden / visible (visibilityState + the matching event). */
export const setVisibility = async (page: Page, hidden: boolean): Promise<void> => {
  await page.evaluate(`(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return ${hidden ? "'hidden'" : "'visible'"}; } });
  Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return ${hidden}; } });
  document.dispatchEvent(new Event('visibilitychange'));
})()`);
};

/** Count duel-API GET /view polls over the next `ms` (background-poll behaviour check). */
export const countPolls = async (page: Page, ms: number): Promise<number> => {
  let count = 0;
  const handler = (request: Request): void => {
    if (/\/view(\?|$)/.test(request.url())) count++;
  };
  page.on('request', handler);
  await sleep(ms);
  page.off('request', handler);
  return count;
};

export const parseRemainingMs = (label: string): number | null => {
  const hours = /(\d+)h/.exec(label);
  const minutes = /(\d+)m/.exec(label);
  const seconds = /(\d+)s/.exec(label);
  if (!hours && !minutes && !seconds) return null;
  return (
    (hours ? Number(hours[1]) * 3_600_000 : 0) +
    (minutes ? Number(minutes[1]) * 60_000 : 0) +
    (seconds ? Number(seconds[1]) * 1000 : 0)
  );
};

export const jsonLeaks = (haystack: unknown, needles: number[]): number[] => {
  const text = JSON.stringify(haystack);
  return needles.filter((id) => text.includes(`"id":${id}`));
};
