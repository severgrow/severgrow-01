// The HTTP surface. It is deliberately thin: parse, authenticate, delegate to the service,
// serialise. All rules, atomicity and hidden-information decisions live in the service/engine.
//
// Logging records only the method, path, status and duration. Request bodies (which carry
// bearer tokens and actions) are never logged.
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { DEFAULT_SERVER_CONFIG } from './config.js';
import type { ServerConfig } from './config.js';
import { ApiError } from './errors.js';
import { MatchService } from './service.js';

export type Logger = (line: string) => void;

export type HttpDeps = {
  service: MatchService;
  config?: ServerConfig;
  logger?: Logger;
};

type Outcome = { status: number; body: unknown };

const bearer = (header: string | undefined): string | null => {
  if (typeof header !== 'string') return null;
  const prefix = 'bearer ';
  return header.slice(0, prefix.length).toLowerCase() === prefix ? header.slice(prefix.length).trim() : null;
};

const readJsonBody = async (req: IncomingMessage, maxBytes: number): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxBytes) throw new ApiError('INVALID_REQUEST', 'Request body is too large.');
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ApiError('INVALID_REQUEST', 'Request body is not valid JSON.');
  }
};

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});

const requireInteger = (value: unknown, name: string): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(n) || (n as number) < 0) throw new ApiError('INVALID_REQUEST', `${name} must be a non-negative integer.`);
  return n as number;
};

const requireString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new ApiError('INVALID_REQUEST', `${name} is required.`);
  return value;
};

export const createHttpServer = (deps: HttpDeps): Server => {
  const { service } = deps;
  const config = deps.config ?? DEFAULT_SERVER_CONFIG;
  const logger: Logger = deps.logger ?? (() => undefined);

  const cors = (res: ServerResponse): void => {
    res.setHeader('access-control-allow-origin', config.corsOrigin);
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    if (config.corsOrigin !== '*') res.setHeader('vary', 'origin');
  };

  const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
    const text = JSON.stringify(body);
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(text);
  };

  const handle = async (req: IncomingMessage, path: string, url: URL): Promise<Outcome> => {
    const method = req.method ?? 'GET';

    if (method === 'GET' && path === '/v1/health') {
      return { status: 200, body: { ok: true, rulesVersion: service.rulesVersion } };
    }

    if (method === 'POST' && path === '/v1/guests') {
      const body = asRecord(await readJsonBody(req, config.maxBodyBytes));
      const displayName = typeof body.displayName === 'string' ? body.displayName : null;
      const created = await service.createGuest(displayName);
      return { status: 201, body: { ok: true, ...created } };
    }

    if (method === 'POST' && path === '/v1/players/me/upgrade') {
      const player = await service.authenticate(bearer(req.headers.authorization));
      const body = asRecord(await readJsonBody(req, config.maxBodyBytes));
      const upgraded = await service.upgradePlayer(player, requireString(body.displayName, 'displayName'));
      return { status: 200, body: { ok: true, player: upgraded } };
    }

    if (method === 'POST' && path === '/v1/matches') {
      const player = await service.authenticate(bearer(req.headers.authorization));
      await readJsonBody(req, config.maxBodyBytes);
      const created = await service.createMatch(player);
      return { status: 201, body: { ok: true, ...created } };
    }

    if (method === 'POST' && path === '/v1/matches/join') {
      const player = await service.authenticate(bearer(req.headers.authorization));
      const body = asRecord(await readJsonBody(req, config.maxBodyBytes));
      const joined = await service.joinMatch(player, requireString(body.inviteCode, 'inviteCode'));
      return { status: 200, body: { ok: true, ...joined } };
    }

    const matchRoute = /^\/v1\/matches\/([^/]+)(\/view|\/reconnect|\/actions)?$/.exec(path);
    if (matchRoute) {
      const matchId = decodeURIComponent(matchRoute[1]!);
      const sub = matchRoute[2] ?? '';

      if (method === 'GET' && sub === '') {
        const player = await service.authenticate(bearer(req.headers.authorization));
        return { status: 200, body: { ok: true, match: await service.getMatch(player, matchId) } };
      }
      if (method === 'GET' && sub === '/view') {
        const player = await service.authenticate(bearer(req.headers.authorization));
        const since = url.searchParams.has('since') ? requireInteger(url.searchParams.get('since'), 'since') : 0;
        return { status: 200, body: { ok: true, player: await service.viewPayload(player, matchId, since) } };
      }
      if (method === 'POST' && sub === '/reconnect') {
        const player = await service.authenticate(bearer(req.headers.authorization));
        const body = asRecord(await readJsonBody(req, config.maxBodyBytes));
        const since = body.sinceRevision === undefined ? 0 : requireInteger(body.sinceRevision, 'sinceRevision');
        return { status: 200, body: { ok: true, player: await service.viewPayload(player, matchId, since) } };
      }
      if (method === 'POST' && sub === '/actions') {
        const player = await service.authenticate(bearer(req.headers.authorization));
        const body = asRecord(await readJsonBody(req, config.maxBodyBytes));
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

  return createServer((req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    cors(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      logger(`OPTIONS ${path} 204 ${Date.now() - started}ms`);
      return;
    }

    void handle(req, path, url)
      .then((outcome) => {
        sendJson(res, outcome.status, outcome.body);
        logger(`${req.method ?? 'GET'} ${path} ${outcome.status} ${Date.now() - started}ms`);
      })
      .catch((error: unknown) => {
        const apiError =
          error instanceof ApiError ? error : new ApiError('INTERNAL', 'Something went wrong on the server.');
        if (!(error instanceof ApiError)) {
          // Server-side detail only (never returned to the caller).
          logger(`ERROR ${req.method ?? 'GET'} ${path} ${String(error)}`);
        }
        sendJson(res, apiError.status, { ok: false, code: apiError.code, message: apiError.message });
        logger(`${req.method ?? 'GET'} ${path} ${apiError.status} ${Date.now() - started}ms`);
      });
  });
};
