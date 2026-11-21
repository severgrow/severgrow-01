// Fetch-API request handler shared by the Node HTTP server and the Deno Edge entry.
// Same routes, same MatchService — no rules live here.
import { pickClientIp } from './client-ip.js';
import { requestCountry } from './geo.js';
import type { CountryStore } from './accounts/country.js';
import { PRODUCTION_CORS_ORIGIN, type ServerConfig } from './config.js';
import { DEFAULT_SERVER_CONFIG } from './config.js';
import { corsHeadersForRequest } from './cors.js';
import { ApiError } from './errors.js';
import type { MatchService } from './service.js';
import { BOT_VERSIONS } from '../../src/bots/versions.js';
import { ACCOUNT_CAMPAIGN_PROGRESS_FEATURE } from './account-campaign-progress.js';
import { ACCOUNT_GUIDE_FEATURE } from './account-guide.js';
import { googleReturnMetric } from '../../src/google-return-metrics.js';

/**
 * What this server can do that an older one could not; a page checks before relying on it.
 * `campaign-random-deals` (owner, 2026-11-01) is the campaign's `RANDOM_DEALS_FEATURE` — spelled out
 * here because the online core never imports the campaign module (tests/campaign/isolation.test.ts);
 * server/tests/seeds-verify.test.ts pins the two spellings together.
 * Every bot version it can verify is listed too (2026-11-04, bots-v0.11): a page keeps a proof against
 * a newer bot queued until the server it talks to names that version (web/src/online/seed-rewards.ts).
 * `account-campaign-progress` (owner, 2026-11-08) is the further-ahead campaign snapshot route.
 */
/** The health feature that says Practice deals are accepted (web/src/online/seed-rewards.ts reads it). */
export const TRAINING_DEALS_FEATURE = 'training-deals';

export const SERVER_FEATURES: readonly string[] = Object.freeze([
  'campaign-random-deals',
  // A proof check in slices with a signed resume token (seeds/verify.ts stepOfflineMatch, 2026-11-12).
  'sliced-proofs',
  // A Practice game the phone dealt is accepted as `deal: { seed, botLevel }` (seeds/service.ts
  // dealTicket, 2026-11-16). A page sends such a proof only once this server lists it.
  TRAINING_DEALS_FEATURE,
  ACCOUNT_CAMPAIGN_PROGRESS_FEATURE,
  ACCOUNT_GUIDE_FEATURE,
  ...Object.keys(BOT_VERSIONS),
]);

export type FetchAppDeps = {
  service: MatchService;
  config?: ServerConfig;
  logger?: (line: string) => void;
  /** Live duels router (server/src/live/router.ts); returns null for paths it does not own. */
  live?: (req: Request, path: string) => Promise<Outcome | null>;
  /**
   * THE COMBINED PROFILE SHEET (owner, 2026-11-20). `GET /v1/players/:id/card` answers everything
   * the profile sheet renders in ONE round trip: the public allow-list (online + offline rows and
   * the stored flag) plus the achievements count and the best online Blitz streak. Both extra reads
   * already existed as their own route; this only stops a visitor's sheet needing two requests.
   */
  card?: {
    achievementsOf?: (playerId: string) => Promise<{ done: number; total: number } | null>;
    onlineBlitzBest?: (playerId: string) => Promise<number | null>;
  };
  /** Where a new guest's country is remembered (migration 0031). Absent: no flag, never a guess. */
  country?: CountryStore;
};

type Outcome = { status: number; body?: unknown; raw?: { contentType: string; text: string } };

const bearer = (header: string | null): string | null => {
  if (typeof header !== 'string') return null;
  const prefix = 'bearer ';
  return header.slice(0, prefix.length).toLowerCase() === prefix ? header.slice(prefix.length).trim() : null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const requireInteger = (value: unknown, name: string): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(n) || (n as number) < 0) throw new ApiError('INVALID_REQUEST', `${name} must be a non-negative integer.`);
  return n as number;
};

const requireString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new ApiError('INVALID_REQUEST', `${name} is required.`);
  return value;
};

const readJson = async (req: Request, maxBytes: number): Promise<unknown> => {
  const raw = await req.arrayBuffer();
  if (raw.byteLength > maxBytes) throw new ApiError('INVALID_REQUEST', 'Request body is too large.');
  if (raw.byteLength === 0) return {};
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    throw new ApiError('INVALID_REQUEST', 'Request body is not valid JSON.');
  }
};

// The real client IP behind the proxy, or null (which the service buckets as "unknown").
// See client-ip.ts for why the header order and validation matter.
const clientIpOf = (req: Request): string | null => pickClientIp(req.headers);

/** Build a Fetch handler. Production hosts should pass corsOrigins = productionCorsOrigins(). */
export const createFetchApp = (deps: FetchAppDeps): ((req: Request) => Promise<Response>) => {
  const service = deps.service;
  const config = deps.config ?? DEFAULT_SERVER_CONFIG;
  const logger = deps.logger ?? (() => undefined);
  // CORS is resolved PER REQUEST: the allow-list may hold several front-end origins (the GitHub
  // Pages origin plus a custom domain during the move), and an allow-listed caller is echoed back
  // while a foreign one only ever sees the first configured origin (see corsOriginFor).
  const corsFor = (req: Request): Record<string, string> => corsHeadersForRequest(config.corsOrigins, req);

  const handle = async (req: Request, path: string, url: URL): Promise<Outcome> => {
    const method = req.method;
    service.assertClientVersion(req.headers.get('x-futasaku-client-version'));
    const liveOutcome = deps.live ? await deps.live(req, path) : null;
    if (liveOutcome) return liveOutcome;

    if (method === 'POST' && path === '/v1/auth/google/metrics') {
      const metric = googleReturnMetric(await readJson(req, 512));
      if (!metric) throw new ApiError('INVALID_REQUEST', 'Sign-in metric is invalid.');
      logger(`google-return ${JSON.stringify(metric)}`);
      return { status: 200, body: { ok: true } };
    }

    if (method === 'GET' && path === '/v1/health') {
      const serverNow = service.serverNow();
      const body: { ok: true; rulesVersion: string; serverNow: number; features: readonly string[]; db?: { ok: true; ms: number } } = {
        ok: true,
        rulesVersion: service.rulesVersion,
        serverNow,
        features: SERVER_FEATURES,
      };
      if (url.searchParams.get('db') === '1') {
        const startedDb = Date.now();
        await service.pingStorage();
        body.db = { ok: true, ms: Date.now() - startedDb };
      }
      return { status: 200, body };
    }

    if (method === 'POST' && path === '/v1/guests') {
      await readJson(req, config.maxBodyBytes);
      // An automated harness tags its own guests (`x-futasaku-traffic: test`). Only guest CREATION
      // reads it, and only to set `players.is_test` — no gameplay path, no way to change an existing
      // account. A real player's browser never sends it (DuelClient sets it only outside a browser).
      const testTraffic = req.headers.get('x-futasaku-traffic')?.trim().toLowerCase() === 'test';
      const created = await service.createGuest(null, clientIpOf(req), testTraffic);
      // The guest's flag comes from the edge's own geo answer, recorded once here (migration 0031).
      // A platform that reports nothing stores nothing: the profile then shows no flag at all.
      const country = requestCountry(req.headers);
      if (country) await deps.country?.save(created.player.id, country, service.serverNow());
      return { status: 201, body: { ok: true, ...created, serverNow: service.serverNow() } };
    }

    if (method === 'GET' && path === '/v1/players/me') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      return { status: 200, body: { ok: true, player: await service.getMe(player), serverNow: service.serverNow() } };
    }

    /**
     * ANOTHER PLAYER'S PUBLIC PROFILE (owner, 2026-11-01: look up other people's profiles from
     * Territory). A SIGNED-IN caller only — the token names who is asking, and a missing or stale
     * one is the usual 401; there is no anonymous read. The response is the closed allow-list in
     * `PublicPlayerProfile`: name, tag, level, tiles, colour and the ONLINE record. It can never
     * carry an email, a Seeds wallet, an offline record, a token, a device, or anything private:
     * the store query selects only the public columns (see `seeds/postgres.ts`).
     *
     * A malformed/percent-broken id and an unknown one are the SAME 404, so this route cannot be
     * used to tell which player ids exist.
     */
    const profileRoute = /^\/v1\/players\/([^/]+)\/profile$/.exec(path);
    if (method === 'GET' && profileRoute) {
      const viewer = await service.authenticate(bearer(req.headers.get('authorization')));
      let playerId = profileRoute[1]!;
      try {
        playerId = decodeURIComponent(playerId);
      } catch {
        throw new ApiError('NOT_FOUND', 'No such player.');
      }
      const profile = await service.publicProfile(playerId);
      const headToHead =
        viewer.id !== playerId ? await service.headToHead(viewer.id, playerId) : undefined;
      return {
        status: 200,
        body: {
          ok: true,
          profile,
          ...(headToHead !== undefined ? { headToHead } : {}),
          serverNow: service.serverNow(),
        },
      };
    }

    /**
     * ONE PLAYER'S WHOLE SHEET (owner, 2026-11-20: "make it load up quickly cheaply"). The SAME
     * closed allow-list as `/profile`, plus the two facts the sheet also renders — the achievements
     * count and the best online Blitz streak — so a visitor's sheet costs ONE request instead of
     * two (and no fan-out for the offline row, which rides the profile read).
     *
     * It never widens `PublicPlayerProfile`: the extra two values are numbers the existing
     * `/record` route already published. Older servers simply have no `/card`, and the page falls
     * back to `/profile` + `/record` exactly as before.
     */
    const cardRoute = /^\/v1\/players\/([^/]+)\/card$/.exec(path);
    if (method === 'GET' && cardRoute) {
      const viewer = await service.authenticate(bearer(req.headers.get('authorization')));
      let playerId = cardRoute[1]!;
      try {
        playerId = decodeURIComponent(playerId);
      } catch {
        throw new ApiError('NOT_FOUND', 'No such player.');
      }
      const profile = await service.publicProfile(playerId);
      const id = playerId.toLowerCase();
      // Sequential on purpose: the Edge pool is max: 2 (see publicProfile in seeds/service.ts).
      const achievements = deps.card?.achievementsOf ? await deps.card.achievementsOf(id) : null;
      const onlineBlitzBest = deps.card?.onlineBlitzBest ? await deps.card.onlineBlitzBest(id) : null;
      const headToHead = viewer.id !== id ? await service.headToHead(viewer.id, id) : undefined;
      // THE VIEWER'S OWN OFFLINE TOTALS ride the same answer, so opening your own sheet is also one
      // request (the client used to sync `/v1/players/me/offline` on every open). Only ever the
      // caller's own record: `viewer` comes from the token, never from the path.
      const ownOffline = viewer.id === id ? await service.offlineStats(viewer) : undefined;
      return {
        status: 200,
        body: {
          ok: true,
          profile,
          achievements,
          onlineBlitzBest,
          ...(headToHead !== undefined ? { headToHead } : {}),
          ...(ownOffline !== undefined ? { ownOffline } : {}),
          serverNow: service.serverNow(),
        },
      };
    }

    if (method === 'PATCH' && path === '/v1/players/me') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      const renamed = await service.renameMe(player, requireString(body.displayName, 'displayName'));
      return { status: 200, body: { ok: true, player: renamed, serverNow: service.serverNow() } };
    }

    if (method === 'GET' && path === '/v1/players/me/matches') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      return {
        status: 200,
        body: { ok: true, matches: await service.listMyMatches(player), serverNow: service.serverNow() },
      };
    }

    // The Profile screen's three OFFLINE numbers (migration 0022). Authenticated and player-agnostic
    // in its inputs: the token names the account, so a request can never read or write someone
    // else's record. GET is one aggregate over all devices; POST stores one device's cumulative
    // snapshot and answers with the same aggregate.
    if (method === 'GET' && path === '/v1/players/me/offline') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      return { status: 200, body: { ok: true, offline: await service.offlineStats(player), serverNow: service.serverNow() } };
    }

    // THE ACCOUNT'S FURTHEST CAMPAIGN LEVEL (owner brief, 2026-11-01). One authenticated read for
    // the account-place rule and the menu's campaign suggestion, and ONE source:
    // `campaignHighestLevel`, the same single indexed `max` over the player's `campaign:cN-M`
    // receipts the map uses. Deliberately NOT `campaign_clears`
    // (that table is only written when a reward proof is submitted, so ordinary wins never land in
    // it). Levels unlock in order, so "highest = N" means chapter-1 levels 1..N are cleared; the
    // client derives the ten lessons. A guest is never asked: the client only calls this with an
    // account.
    if (method === 'GET' && path === '/v1/players/me/campaign') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      return {
        status: 200,
        body: { ok: true, campaign: { highestLevel: await service.campaignHighestLevel(player) }, serverNow: service.serverNow() },
      };
    }

    // ACCOUNT CAMPAIGN PROGRESS SNAPSHOT (owner, 2026-11-08). Further-ahead completed ids + best
    // attempts only — never Seeds, Territory or achievements. GET is null until the first POST.
    if (method === 'GET' && path === '/v1/players/me/campaign/progress') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      return {
        status: 200,
        body: { ok: true, progress: await service.accountCampaignProgress(player), serverNow: service.serverNow() },
      };
    }

    if (method === 'POST' && path === '/v1/players/me/campaign/progress') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      return {
        status: 200,
        body: { ok: true, progress: await service.putAccountCampaignProgress(player, body), serverNow: service.serverNow() },
      };
    }

    // THE IN-GAME GUIDE (owner, 2026-11-09): which teaching windows this account has opened, and how
    // many games it has started with the guide on. Beats only ever join; GET is null until a POST.
    if (method === 'GET' && path === '/v1/players/me/guide') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      return { status: 200, body: { ok: true, guide: await service.accountGuide(player), serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/players/me/guide') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      return { status: 200, body: { ok: true, guide: await service.putAccountGuide(player, body), serverNow: service.serverNow() } };
    }

    // SETTINGS, LESSON PROGRESS AND TIPS FOLLOW THE ACCOUNT (owner, 2026-11-18, accounts pass). A
    // server without migration 0030 answers 404, and the page keeps its own copy.
    if ((method === 'GET' || method === 'POST') && path === '/v1/players/me/prefs') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      try {
        if (method === 'GET') return { status: 200, body: { ok: true, prefs: await service.accountPrefs(player), serverNow: service.serverNow() } };
        const raw = await readJson(req, config.maxBodyBytes);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError('INVALID_REQUEST', 'Preferences must be an object.');
        return { status: 200, body: { ok: true, prefs: await service.putAccountPrefs(player, raw as Record<string, unknown>), serverNow: service.serverNow() } };
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === '42P01') throw new ApiError('NOT_FOUND', 'Not available yet.');
        throw error;
      }
    }

    if (method === 'POST' && path === '/v1/players/me/offline') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      return { status: 200, body: { ok: true, offline: await service.putOfflineStats(player, body), serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/players/me/upgrade') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      const upgraded = await service.upgradePlayer(player, requireString(body.displayName, 'displayName'));
      return { status: 200, body: { ok: true, player: upgraded, serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/players/me/link-code') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      await readJson(req, config.maxBodyBytes);
      const link = await service.createLinkCode(player);
      return { status: 201, body: { ok: true, ...link, serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/players/link') {
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      const linked = await service.redeemLinkCode(requireString(body.code, 'code'), clientIpOf(req));
      return { status: 200, body: { ok: true, ...linked, serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/matches') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      await readJson(req, config.maxBodyBytes);
      const created = await service.createMatch(player, {}, clientIpOf(req));
      return { status: 201, body: { ok: true, ...created, serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/matches/join') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      const joined = await service.joinMatch(player, requireString(body.inviteCode, 'inviteCode'), clientIpOf(req));
      return { status: 200, body: { ok: true, ...joined, serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/matchmaking/find') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      const searchMatchId = body.searchMatchId === undefined || body.searchMatchId === null ? body.searchMatchId : requireString(body.searchMatchId,'searchMatchId');
      const found = await service.findOpponent(player, clientIpOf(req),searchMatchId);
      return { status: 200, body: { ok: true, ...found, serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/matchmaking/cancel') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      await readJson(req, config.maxBodyBytes);
      const cancelled = await service.cancelSearch(player);
      return { status: 200, body: { ok: true, ...cancelled, serverNow: service.serverNow() } };
    }

    if (method === 'POST' && path === '/v1/sweep') {
      await readJson(req, config.maxBodyBytes);
      // Routine sweeps run from cron/CI from a shared or changing address. When the caller presents
      // the configured internal token they use a dedicated bucket, so player per-IP budgets can
      // never starve housekeeping. Without the token the normal per-IP player bucket applies.
      const cronToken = config.sweepCronToken;
      const internal = typeof cronToken === 'string' && cronToken.length > 0 && req.headers.get('x-futasaku-cron') === cronToken;
      const result = await service.sweep(clientIpOf(req), { internal });
      return { status: 200, body: { ok: true, ...result, serverNow: service.serverNow() } };
    }

    const matchRoute = /^\/v1\/matches\/([^/]+)(\/view|\/reconnect|\/actions|\/resign|\/cancel|\/rematch|\/replay)?$/.exec(path);
    if (matchRoute) {
      const matchId = decodeURIComponent(matchRoute[1]!);
      const sub = matchRoute[2] ?? '';

      if (method === 'GET' && sub === '') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        return { status: 200, body: { ok: true, match: await service.getMatch(player, matchId), serverNow: service.serverNow() } };
      }
      if (method === 'POST' && sub === '/cancel') {
        // Retire the caller's own WAITING match (the invite screen's "Cancel match"). Owner-only
        // and idempotent; a calm `{ cancelled: false }` when there is nothing to cancel.
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        await readJson(req, config.maxBodyBytes);
        const cancelled = await service.cancelWaitingMatch(player, matchId);
        return { status: 200, body: { ok: true, ...cancelled, serverNow: service.serverNow() } };
      }
      if (method === 'GET' && sub === '/view') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        const since = url.searchParams.has('since') ? requireInteger(url.searchParams.get('since'), 'since') : 0;
        return {
          status: 200,
          body: { ok: true, player: await service.viewPayload(player, matchId, since), serverNow: service.serverNow() },
        };
      }
      if (method === 'GET' && sub === '/replay') {
        // A FINISHED duel's whole action log, for one of its two players (403 otherwise). The
        // client rebuilds every position from it with the deterministic engine.
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        return {
          status: 200,
          body: { ok: true, replay: await service.replayOf(player, matchId), serverNow: service.serverNow() },
        };
      }
      if (method === 'POST' && sub === '/reconnect') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        const body = asRecord(await readJson(req, config.maxBodyBytes));
        const since = body.sinceRevision === undefined ? 0 : requireInteger(body.sinceRevision, 'sinceRevision');
        return {
          status: 200,
          body: { ok: true, player: await service.viewPayload(player, matchId, since), serverNow: service.serverNow() },
        };
      }
      if (method === 'POST' && sub === '/actions') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        const body = asRecord(await readJson(req, config.maxBodyBytes));
        const submitted = await service.submitAction(player, matchId, {
          expectedRevision: requireInteger(body.expectedRevision, 'expectedRevision'),
          requestId: requireString(body.requestId, 'requestId'),
          ...(Array.isArray(body.actions)
            ? { actions: body.actions as never }
            : { action: body.action as never }),
        });
        return { status: 200, body: submitted };
      }
      if (method === 'POST' && sub === '/resign') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        await readJson(req, config.maxBodyBytes);
        const resigned = await service.resign(player, matchId);
        return { status: 200, body: { ok: true, ...resigned, serverNow: service.serverNow() } };
      }
      if (method === 'POST' && sub === '/rematch') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        await readJson(req, config.maxBodyBytes);
        const rematch = await service.rematch(player, matchId);
        return { status: 200, body: { ok: true, ...rematch, serverNow: service.serverNow() } };
      }
    }

    throw new ApiError('NOT_FOUND', 'Unknown endpoint.');
  };

  return async (req: Request): Promise<Response> => {
    const started = Date.now();
    const url = new URL(req.url);
    // Edge Functions are mounted at /functions/v1/duel — strip that prefix when present.
    let path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    // Supabase may present the full /functions/v1/duel/... path or a shorter /duel/... path.
    for (const mount of ['/functions/v1/duel', '/duel']) {
      if (path === mount) {
        path = '/';
        break;
      }
      if (path.startsWith(`${mount}/`)) {
        path = path.slice(mount.length) || '/';
        break;
      }
    }
    if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '');

    if (req.method === 'OPTIONS') {
      logger(`OPTIONS ${path} 204 ${Date.now() - started}ms`);
      return new Response(null, { status: 204, headers: corsFor(req) });
    }

    try {
      const outcome = await handle(req, path, url);
      logger(`${req.method} ${path} ${outcome.status} ${Date.now() - started}ms`);
      // A router may return a raw body instead of JSON (the admin CSV export). It is written
      // verbatim with its own content type; `no-store` still comes from the CORS headers.
      if (outcome.raw) {
        return new Response(outcome.raw.text, {
          status: outcome.status,
          headers: { ...corsFor(req), 'content-type': outcome.raw.contentType },
        });
      }
      return new Response(JSON.stringify(outcome.body), {
        status: outcome.status,
        headers: { ...corsFor(req), 'content-type': 'application/json; charset=utf-8' },
      });
    } catch (error: unknown) {
      const apiError = error instanceof ApiError ? error : new ApiError('INTERNAL', 'Something went wrong on the server.');
      if (!(error instanceof ApiError)) logger(`ERROR ${req.method} ${path} ${String(error)}`);
      logger(`${req.method} ${path} ${apiError.status} ${Date.now() - started}ms`);
      return new Response(JSON.stringify({ ok: false, code: apiError.code, message: apiError.message }), {
        status: apiError.status,
        headers: { ...corsFor(req), 'content-type': 'application/json; charset=utf-8' },
      });
    }
  };
};

export { PRODUCTION_CORS_ORIGIN };
