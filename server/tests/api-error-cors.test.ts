// EVERY response this API produces must be readable by the browser.
//
// Live evidence (2026-11-20, /test @ c471ed8c): bursts of 503s on the duel routes arrived WITHOUT
// `access-control-allow-origin`, so WebKit reported an opaque "due to access control checks" and
// Chromium net::ERR_FAILED. The page could not read the real status. This file pins the part of that
// which IS ours: a thrown route, an ApiError (including a 503), and the Node adapter's last-resort
// catch all answer with the shared CORS headers plus `{ok:false,code,message}`.
//
// It deliberately also records the part that is NOT ours: the Supabase Edge runtime can kill or
// refuse a request BEFORE this code runs, and that platform response cannot be decorated here. The
// source guard on `edge-entry.ts` below proves our own boot/start failure path does decorate.
import { request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { createHttpServer } from '../src/http.js';
import { ApiError } from '../src/errors.js';
import type { MatchService } from '../src/service.js';
import { MatchService as RealMatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

const ORIGIN = 'https://www.futasaku.com';

/** A service stub shaped just enough for the routes under test (no storage, no clock). */
const serviceThat = (
  overrides: Partial<{ authenticate: () => Promise<never>; pingStorage: () => Promise<never> }>,
): MatchService =>
  ({
    rulesVersion: 'test',
    serverNow: () => 0,
    assertClientVersion: () => undefined,
    authenticate: async () => {
      throw new Error('authenticate was not expected to succeed');
    },
    ...overrides,
  }) as unknown as MatchService;

const appWith = (service: MatchService) =>
  createFetchApp({
    service,
    config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: [ORIGIN] },
  });

const expectCorsJson = async (response: Response): Promise<Record<string, unknown>> => {
  expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  expect(response.headers.get('access-control-allow-headers')).toContain('x-futasaku-client-version');
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(response.headers.get('cache-control')).toBe('no-store');
  return (await response.json()) as Record<string, unknown>;
};

describe('an error answer from the Fetch app is always CORS-readable JSON', () => {
  it('an unexpected thrown error is a 500 with CORS and a generic JSON body (no internals)', async () => {
    const app = appWith(
      serviceThat({
        authenticate: async () => {
          throw new Error('SECRET internals boom');
        },
      }),
    );
    const response = await app(
      new Request('https://duel.test/v1/players/me', { headers: { origin: ORIGIN, authorization: 'Bearer t' } }),
    );

    expect(response.status).toBe(500);
    const body = await expectCorsJson(response);
    expect(body).toEqual({ ok: false, code: 'INTERNAL', message: 'Something went wrong on the server.' });
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });

  it('a thrown ApiError keeps its status, code and CORS — including a 503', async () => {
    const app = appWith(
      serviceThat({
        authenticate: async () => {
          throw new ApiError('DB_UNAVAILABLE', 'The duel database is briefly busy. Please retry in a moment.');
        },
      }),
    );
    const response = await app(
      new Request('https://duel.test/v1/players/me', { headers: { origin: ORIGIN, authorization: 'Bearer t' } }),
    );

    expect(response.status).toBe(503);
    const body = await expectCorsJson(response);
    expect(body).toEqual({
      ok: false,
      code: 'DB_UNAVAILABLE',
      message: 'The duel database is briefly busy. Please retry in a moment.',
    });
  });

  it('an unknown route is a CORS-readable 404', async () => {
    const response = await appWith(serviceThat({}))(
      new Request('https://duel.test/v1/does-not-exist', { headers: { origin: ORIGIN } }),
    );

    expect(response.status).toBe(404);
    const body = await expectCorsJson(response);
    expect(body).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Unknown endpoint.' });
  });

  it('a foreign origin never gets echoed, but still receives a readable CORS answer', async () => {
    const app = appWith(serviceThat({}));
    const response = await app(
      new Request('https://duel.test/v1/does-not-exist', { headers: { origin: 'https://evil.example' } }),
    );

    // The first configured origin is the deliberate fallback (see corsOriginFor), never an echo.
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });
});

describe('the Edge entry decorates its own boot/start failures', () => {
  const edgeEntry = readFileSync(new URL('../src/edge-entry.ts', import.meta.url), 'utf8');

  it('builds every failure response with the shared per-request CORS headers', () => {
    // The one builder used by the /v1/health?db=1 catch and the app catch.
    expect(edgeEntry).toContain('const failureResponse = (error: unknown, cors: Record<string, string>): Response');
    expect(edgeEntry).toContain("headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }");
    // 503 for a retryable/unconfigured start, 500 otherwise — never a bare runtime error.
    expect(edgeEntry).toContain('status: missingSecret || unavailable ? 503 : 500');
    expect(edgeEntry).toContain('return failureResponse(error, cors);');
  });

  it('resolves CORS for the request rather than pinning one origin', () => {
    expect(edgeEntry).toContain('corsHeadersForRequest(corsOrigins, req)');
  });
});

// THE NODE ADAPTER'S LAST-RESORT CATCH.
//
// `createFetchApp` never rejects in practice, but the adapter's catch is still part of "every
// response". A Host header that is not a valid authority makes `new URL()` throw before the shared
// app's try/catch, so this is a real request that reaches that catch. It must answer with CORS too.
describe('the Node adapter joins the same invariant', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const service = new RealMatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    server = createHttpServer({ service, config: DEFAULT_SERVER_CONFIG });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('a request that throws before the shared app returns CORS JSON, not a bare 500', async () => {
    const result = await new Promise<{
      status: number;
      headers: Record<string, string | string[] | undefined>;
      text: string;
    }>((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: '/v1/health',
          method: 'GET',
          headers: { host: 'not a valid authority' },
          setHost: false,
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            text += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
        },
      );
      req.on('error', reject);
      req.end();
    });

    expect(result.status).toBe(500);
    // DEFAULT_SERVER_CONFIG uses the local wildcard origin.
    expect(result.headers['access-control-allow-origin']).toBe('*');
    expect(String(result.headers['content-type'])).toContain('application/json');
    expect(JSON.parse(result.text)).toEqual({
      ok: false,
      code: 'INTERNAL',
      message: 'Something went wrong on the server.',
    });
  });
});
