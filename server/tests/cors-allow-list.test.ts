// CORS allow-list: the domain-move safety net.
//
// The duel API used to allow exactly ONE hardcoded browser origin
// (`PRODUCTION_CORS_ORIGIN`), which meant a custom domain pointed at the same GitHub Pages site
// could not call the API at all — every online request would be blocked by the browser. The
// allow-list now holds several origins and is overridable with the comma-separated `CORS_ORIGINS`
// environment variable / Edge secret, so BOTH the old GitHub Pages origin and a new custom domain
// work while the switch happens.
//
// Two security properties are pinned here with real HTTP (not by reading the code):
//   1. an allow-listed origin is ECHOED back (the new domain can play), and
//   2. a FOREIGN origin never is — it only ever receives the configured production origin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_PRODUCTION_CORS_ORIGINS,
  DEFAULT_SERVER_CONFIG,
  PRODUCTION_CORS_ORIGIN,
  corsOriginsFromEnv,
  parseCorsOriginList,
  productionCorsOrigins,
} from '../src/config.js';
import { corsOriginFor } from '../src/cors.js';
import { createHttpServer } from '../src/http.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

// The owner's real domain, reached through Cloudflare DNS → the same GitHub Pages site. The bare
// domain is allowed as well: both usually resolve, and the one that was not allow-listed would fail
// every API call for whoever landed on it.
const CUSTOM_ORIGIN = 'https://www.futasaku.com';
const APEX_ORIGIN = 'https://futasaku.com';
const FOREIGN_ORIGIN = 'https://not-our-site.example';

describe('CORS allow-list parsing', () => {
  it('ships the GitHub Pages origin plus the custom domain by default, never the dev wildcard', () => {
    // The production DEFAULT already carries the real domain, so a fresh deploy needs no secret.
    expect([...DEFAULT_PRODUCTION_CORS_ORIGINS]).toEqual([PRODUCTION_CORS_ORIGIN, CUSTOM_ORIGIN, APEX_ORIGIN]);
    expect(DEFAULT_PRODUCTION_CORS_ORIGINS).not.toContain('*');
    const saved = process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGINS;
    try {
      expect(productionCorsOrigins()).toEqual([PRODUCTION_CORS_ORIGIN, CUSTOM_ORIGIN, APEX_ORIGIN]);
    } finally {
      if (saved !== undefined) process.env.CORS_ORIGINS = saved;
    }
  });

  it('lets CORS_ORIGINS override the default list entirely', () => {
    const saved = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = `${CUSTOM_ORIGIN},${APEX_ORIGIN}`;
    try {
      // The override wins, so a domain can be REMOVED (here: GitHub Pages) without a rebuild.
      expect(productionCorsOrigins()).toEqual([CUSTOM_ORIGIN, APEX_ORIGIN]);
    } finally {
      if (saved === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = saved;
    }
  });

  it('reads a comma-separated CORS_ORIGINS list, keeping both origins for the transition', () => {
    expect(parseCorsOriginList(`${PRODUCTION_CORS_ORIGIN},${CUSTOM_ORIGIN}`)).toEqual([
      PRODUCTION_CORS_ORIGIN,
      CUSTOM_ORIGIN,
    ]);
    // Whitespace, a trailing slash and blank entries are tolerated.
    expect(parseCorsOriginList(` ${CUSTOM_ORIGIN}/ , , ${PRODUCTION_CORS_ORIGIN} `)).toEqual([
      CUSTOM_ORIGIN,
      PRODUCTION_CORS_ORIGIN,
    ]);
  });

  it('drops entries a browser Origin header can never match', () => {
    // A path, a query and a non-http scheme can never equal a real Origin value; a stored entry
    // that can never match would silently lock the site out, so it is discarded instead.
    expect(parseCorsOriginList(`${CUSTOM_ORIGIN}/futa0.5`)).toEqual([]);
    expect(parseCorsOriginList(`${CUSTOM_ORIGIN}?x=1`)).toEqual([]);
    expect(parseCorsOriginList('ftp://game.example.com')).toEqual([]);
    expect(parseCorsOriginList('not a url')).toEqual([]);
    expect(parseCorsOriginList('')).toEqual([]);
  });

  it('never lets the dev wildcard leak into production, even if CORS_ORIGINS says so', () => {
    const saved = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = '*';
    try {
      expect(productionCorsOrigins()).toEqual([PRODUCTION_CORS_ORIGIN, CUSTOM_ORIGIN, APEX_ORIGIN]);
    } finally {
      if (saved === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = saved;
    }
  });

  it('keeps a port when one is given, because a port is part of an origin', () => {
    expect(parseCorsOriginList('https://localhost:8787')).toEqual(['https://localhost:8787']);
  });

  it('leaves the local dev server on the wildcard unless an env var is set', () => {
    const savedList = process.env.CORS_ORIGINS;
    const savedSingle = process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGIN;
    try {
      expect(corsOriginsFromEnv()).toEqual({});
      process.env.CORS_ORIGIN = '*';
      expect(corsOriginsFromEnv()).toEqual({ corsOrigins: ['*'] });
      process.env.CORS_ORIGINS = `${PRODUCTION_CORS_ORIGIN},${CUSTOM_ORIGIN}`;
      // The list form wins over the older single-value form.
      expect(corsOriginsFromEnv()).toEqual({ corsOrigins: [PRODUCTION_CORS_ORIGIN, CUSTOM_ORIGIN] });
    } finally {
      if (savedList === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = savedList;
      if (savedSingle === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = savedSingle;
    }
  });
});

describe('corsOriginFor resolves one request against the allow-list', () => {
  const allowed = [PRODUCTION_CORS_ORIGIN, CUSTOM_ORIGIN, APEX_ORIGIN];

  it('echoes an allow-listed origin, including www and the bare domain', () => {
    expect(corsOriginFor(allowed, CUSTOM_ORIGIN)).toBe(CUSTOM_ORIGIN);
    expect(corsOriginFor(allowed, APEX_ORIGIN)).toBe(APEX_ORIGIN);
    expect(corsOriginFor(allowed, PRODUCTION_CORS_ORIGIN)).toBe(PRODUCTION_CORS_ORIGIN);
  });

  it('never echoes a foreign origin — it falls back to the configured production origin', () => {
    expect(corsOriginFor(allowed, FOREIGN_ORIGIN)).toBe(PRODUCTION_CORS_ORIGIN);
    // Absent Origin (curl, server-to-server) also gets the production origin, as before.
    expect(corsOriginFor(allowed, null)).toBe(PRODUCTION_CORS_ORIGIN);
  });

  it('answers * only for the local-development wildcard', () => {
    expect(corsOriginFor(['*'], FOREIGN_ORIGIN)).toBe('*');
  });
});

// Real HTTP through the Node adapter, with the exact production allow-list.
describe('CORS over real HTTP with the GitHub Pages origin plus the futasaku.com domain', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: [...DEFAULT_PRODUCTION_CORS_ORIGINS] };
    const service = new MatchService({ storage: new MemoryStorage(), config });
    server = createHttpServer({ service, config });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const preflight = async (origin: string | null): Promise<Headers> => {
    const headers: Record<string, string> = {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type, x-futasaku-client-version',
    };
    if (origin !== null) headers.origin = origin;
    const response = await fetch(`${baseUrl}/v1/guests`, { method: 'OPTIONS', headers });
    expect(response.status).toBe(204);
    return response.headers;
  };

  it('MU1: the current GitHub Pages origin still preflights successfully', async () => {
    const headers = await preflight(PRODUCTION_CORS_ORIGIN);
    expect(headers.get('access-control-allow-origin')).toBe(PRODUCTION_CORS_ORIGIN);
    expect(headers.get('access-control-allow-headers')).toContain('x-futasaku-client-version');
    expect(headers.get('access-control-allow-methods')).toContain('PATCH');
  });

  it('MU2: https://www.futasaku.com is echoed back AND can create a guest', async () => {
    const headers = await preflight(CUSTOM_ORIGIN);
    expect(headers.get('access-control-allow-origin')).toBe(CUSTOM_ORIGIN);
    expect(headers.get('vary')).toBe('origin');
    // The real request that used to be blocked from a custom domain.
    const created = await fetch(`${baseUrl}/v1/guests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: CUSTOM_ORIGIN, 'x-futasaku-client-version': '0.5.0' },
      body: '{}',
    });
    expect(created.status).toBe(201);
    expect(created.headers.get('access-control-allow-origin')).toBe(CUSTOM_ORIGIN);
  });

  it('MU2b: the bare domain https://futasaku.com is echoed back too', async () => {
    const headers = await preflight(APEX_ORIGIN);
    expect(headers.get('access-control-allow-origin')).toBe(APEX_ORIGIN);
    const created = await fetch(`${baseUrl}/v1/guests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: APEX_ORIGIN, 'x-futasaku-client-version': '0.5.0' },
      body: '{}',
    });
    expect(created.status).toBe(201);
    expect(created.headers.get('access-control-allow-origin')).toBe(APEX_ORIGIN);
  });

  it('MU3: a FOREIGN origin is refused — it gets the production origin, never an echo', async () => {
    const headers = await preflight(FOREIGN_ORIGIN);
    expect(headers.get('access-control-allow-origin')).toBe(PRODUCTION_CORS_ORIGIN);
    expect(headers.get('access-control-allow-origin')).not.toBe(FOREIGN_ORIGIN);
    expect(headers.get('access-control-allow-origin')).not.toBe('*');

    // And on a real request too, not only the preflight.
    const attempted = await fetch(`${baseUrl}/v1/guests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: FOREIGN_ORIGIN },
      body: '{}',
    });
    expect(attempted.headers.get('access-control-allow-origin')).toBe(PRODUCTION_CORS_ORIGIN);
    expect(attempted.headers.get('access-control-allow-origin')).not.toBe(FOREIGN_ORIGIN);
  });

  it('MU3b: a lookalike futasaku host is refused — matching is exact, not by prefix', async () => {
    for (const lookalike of ['https://www.futasaku.com.evil.example', 'http://www.futasaku.com', 'https://evil-futasaku.com']) {
      const headers = await preflight(lookalike);
      expect(headers.get('access-control-allow-origin')).toBe(PRODUCTION_CORS_ORIGIN);
      expect(headers.get('access-control-allow-origin')).not.toBe(lookalike);
    }
  });

  it('MU4: a request with no Origin header still gets the production origin', async () => {
    const headers = await preflight(null);
    expect(headers.get('access-control-allow-origin')).toBe(PRODUCTION_CORS_ORIGIN);
  });

  it('MU5: an origin-lookalike host is not allow-listed by a prefix match', async () => {
    const headers = await preflight('https://severgrow.github.io.evil.example');
    expect(headers.get('access-control-allow-origin')).toBe(PRODUCTION_CORS_ORIGIN);
    expect(headers.get('access-control-allow-origin')).not.toBe('https://severgrow.github.io.evil.example');
  });
});
