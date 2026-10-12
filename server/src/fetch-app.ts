// Fetch-API request handler shared by the Node HTTP server and the Deno Edge entry.
// Same routes, same MatchService — no rules live here.
import { PRODUCTION_CORS_ORIGIN, type ServerConfig } from './config.js';
import { DEFAULT_SERVER_CONFIG } from './config.js';
import { ApiError } from './errors.js';
import type { MatchService } from './service.js';

export type FetchAppDeps = {
  service: MatchService;
  config?: ServerConfig;
  logger?: (line: string) => void;
};

type Outcome = { status: number; body: unknown };

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

const corsHeaders = (origin: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (origin !== '*') headers.vary = 'origin';
  return headers;
};

/** Build a Fetch handler. Production hosts should pass corsOrigin = PRODUCTION_CORS_ORIGIN. */
export const createFetchApp = (deps: FetchAppDeps): ((req: Request) => Promise<Response>) => {
  const service = deps.service;
  const config = deps.config ?? DEFAULT_SERVER_CONFIG;
  const logger = deps.logger ?? (() => undefined);
  const cors = corsHeaders(config.corsOrigin);

  const handle = async (req: Request, path: string, url: URL): Promise<Outcome> => {
    const method = req.method;

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
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      const displayName = typeof body.displayName === 'string' ? body.displayName : null;
      const created = await service.createGuest(displayName);
      return { status: 201, body: { ok: true, ...created } };
    }

    if (method === 'POST' && path === '/v1/players/me/upgrade') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      const upgraded = await service.upgradePlayer(player, requireString(body.displayName, 'displayName'));
      return { status: 200, body: { ok: true, player: upgraded } };
    }

    if (method === 'POST' && path === '/v1/matches') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      await readJson(req, config.maxBodyBytes);
      const created = await service.createMatch(player);
      return { status: 201, body: { ok: true, ...created } };
    }

    if (method === 'POST' && path === '/v1/matches/join') {
      const player = await service.authenticate(bearer(req.headers.get('authorization')));
      const body = asRecord(await readJson(req, config.maxBodyBytes));
      const joined = await service.joinMatch(player, requireString(body.inviteCode, 'inviteCode'));
      return { status: 200, body: { ok: true, ...joined } };
    }

    const matchRoute = /^\/v1\/matches\/([^/]+)(\/view|\/reconnect|\/actions)?$/.exec(path);
    if (matchRoute) {
      const matchId = decodeURIComponent(matchRoute[1]!);
      const sub = matchRoute[2] ?? '';

      if (method === 'GET' && sub === '') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        return { status: 200, body: { ok: true, match: await service.getMatch(player, matchId) } };
      }
      if (method === 'GET' && sub === '/view') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        const since = url.searchParams.has('since') ? requireInteger(url.searchParams.get('since'), 'since') : 0;
        return { status: 200, body: { ok: true, player: await service.viewPayload(player, matchId, since) } };
      }
      if (method === 'POST' && sub === '/reconnect') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        const body = asRecord(await readJson(req, config.maxBodyBytes));
        const since = body.sinceRevision === undefined ? 0 : requireInteger(body.sinceRevision, 'sinceRevision');
        return { status: 200, body: { ok: true, player: await service.viewPayload(player, matchId, since) } };
      }
      if (method === 'POST' && sub === '/actions') {
        const player = await service.authenticate(bearer(req.headers.get('authorization')));
        const body = asRecord(await readJson(req, config.maxBodyBytes));
        const submitted = await service.submitAction(player, matchId, {
          expectedRevision: requireInteger(body.expectedRevision, 'expectedRevision'),
          requestId: requireString(body.requestId, 'requestId'),
          action: body.action as never,
        });
        return { status: 200, body: submitted };
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
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const outcome = await handle(req, path, url);
      logger(`${req.method} ${path} ${outcome.status} ${Date.now() - started}ms`);
      return new Response(JSON.stringify(outcome.body), {
        status: outcome.status,
        headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
      });
    } catch (error: unknown) {
      const apiError = error instanceof ApiError ? error : new ApiError('INTERNAL', 'Something went wrong on the server.');
      if (!(error instanceof ApiError)) logger(`ERROR ${req.method} ${path} ${String(error)}`);
      logger(`${req.method} ${path} ${apiError.status} ${Date.now() - started}ms`);
      return new Response(JSON.stringify({ ok: false, code: apiError.code, message: apiError.message }), {
        status: apiError.status,
        headers: { ...cors, 'content-type': 'application/json; charset=utf-8' },
      });
    }
  };
};

export { PRODUCTION_CORS_ORIGIN };
