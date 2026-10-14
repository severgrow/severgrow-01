// The HTTP surface. Thin Node adapter around the shared Fetch handler in fetch-app.ts.
// Logging records only the method, path, status and duration. Request bodies (which carry
// bearer tokens and actions) are never logged.
import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { DEFAULT_SERVER_CONFIG } from './config.js';
import type { ServerConfig } from './config.js';
import { createFetchApp } from './fetch-app.js';
import type { MatchService } from './service.js';

export type Logger = (line: string) => void;

export type HttpDeps = {
  service: MatchService;
  config?: ServerConfig;
  logger?: Logger;
  live?: import('./fetch-app.js').FetchAppDeps['live'];
};

const readRawBody = async (req: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

const toHeaders = (req: IncomingMessage): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }
  return headers;
};

export const createHttpServer = (deps: HttpDeps): Server => {
  const config = deps.config ?? DEFAULT_SERVER_CONFIG;
  const logger: Logger = deps.logger ?? (() => undefined);
  const app = createFetchApp({ service: deps.service, config, logger, ...(deps.live ? { live: deps.live } : {}) });

  return createServer((req, res) => {
    void (async () => {
      const raw = await readRawBody(req);
      const host = req.headers.host ?? '127.0.0.1';
      const method = req.method ?? 'GET';
      const url = `http://${host}${req.url ?? '/'}`;
      const init: RequestInit = { method, headers: toHeaders(req) };
      if (method !== 'GET' && method !== 'HEAD') init.body = new Uint8Array(raw);
      const response = await app(new Request(url, init));
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      res.end(Buffer.from(await response.arrayBuffer()));
    })().catch((error: unknown) => {
      logger(`ERROR ${req.method ?? 'GET'} ${req.url ?? '/'} ${String(error)}`);
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, code: 'INTERNAL', message: 'Something went wrong on the server.' }));
    });
  });
};
