// Fetch-API request handler shared by the Node HTTP server and the Deno Edge entry.
// Same routes, same MatchService — no rules live here.
import { pickClientIp } from './client-ip.js';
import { PRODUCTION_CORS_ORIGIN, type ServerConfig } from './config.js';
import { DEFAULT_SERVER_CONFIG } from './config.js';
import { corsHeadersForRequest } from './cors.js';
import { ApiError } from './errors.js';
import type { MatchService } from './service.js';

export type FetchAppDeps = {
  service: MatchService;
  config?: ServerConfig;
  logger?: (line: string) => void;
  /** Live duels router (server/src/live/router.ts); returns null for paths it does not own. */
  live?: (req: Request, path: string) => Promise<Outcome | null>;
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

    if (method === 'GET' && path === '/v1/health') {
      const serverNow = service.serverNow();
      const body: { ok: true; rulesVersion: string; serverNow: number; db?: { ok: true; ms: number } } = {
        ok: true,
        rulesVersion: service.rulesVersion,
        serverNow,
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
      const created = await service.createGuest(null, clientIpOf(req));
      return { status: 201, body: { ok: true, ...created, serverNow: service.serverNow() } };
    }

    if (method === 'GET' && path === '/v1/players/me') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      return { status: 200, body: { ok: true, player: await service.getMe(player), serverNow: service.serverNow() } };
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
      await readJson(req, config.maxBodyBytes);
      const found = await service.findOpponent(player, clientIpOf(req));
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

    const matchRoute = /^\/v1\/matches\/([^/]+)(\/view|\/reconnect|\/actions|\/resign|\/cancel)?$/.exec(path);
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
