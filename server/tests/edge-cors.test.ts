// Regression guard for the live "Could not create a FUTASAKU guest" outage.
//
// The browser sends x-futasaku-client-version / x-futasaku-rules-version on every
// duel request, so it always preflights. The Supabase Edge entry used to answer
// OPTIONS with its own short header list ('authorization, content-type'), which
// omitted the custom headers — the browser then blocked the real POST and guest
// creation failed even though curl worked. Every OPTIONS path must share one list.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG, PRODUCTION_CORS_ORIGIN } from '../src/config.js';
import { CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS, corsHeaders, corsPreflight } from '../src/cors.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

describe('CORS single source of truth', () => {
  it('allows the auth, content-type and both x-futasaku headers', () => {
    const headers = CORS_ALLOWED_HEADERS.split(',').map((h) => h.trim());
    for (const required of ['authorization', 'content-type', 'x-futasaku-client-version', 'x-futasaku-rules-version']) {
      expect(headers).toContain(required);
    }
  });

  it('allows PATCH (player rename) as well as GET/POST/OPTIONS', () => {
    for (const method of ['GET', 'POST', 'PATCH', 'OPTIONS']) {
      expect(CORS_ALLOWED_METHODS).toContain(method);
    }
  });

  it('keeps the production preflight consistent with the shared app preflight', async () => {
    const app = createFetchApp({
      service: new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG }),
      config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: [PRODUCTION_CORS_ORIGIN] },
    });
    const fromApp = await app(new Request('https://duel.test/v1/guests', { method: 'OPTIONS', headers: { origin: PRODUCTION_CORS_ORIGIN } }));
    const fromEdge = corsPreflight(PRODUCTION_CORS_ORIGIN);
    expect(fromApp.status).toBe(204);
    expect(fromApp.headers.get('access-control-allow-headers')).toBe(fromEdge.headers.get('access-control-allow-headers'));
    expect(fromApp.headers.get('access-control-allow-headers')).toBe(CORS_ALLOWED_HEADERS);
    expect(fromApp.headers.get('access-control-allow-origin')).toBe(PRODUCTION_CORS_ORIGIN);
    expect(fromApp.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('the Edge entry does not define its own CORS header list', () => {
    const source = readFileSync(new URL('../src/edge-entry.ts', import.meta.url), 'utf8');
    expect(source).toContain("from './cors.js'");
    // A local literal 'access-control-allow-headers' is exactly the drift that broke
    // the live site; the entry must reuse the shared helper instead.
    expect(source).not.toContain('access-control-allow-headers');
    // The entry resolves the allow-list from config (env-overridable) instead of pinning a single
    // hardcoded origin — that hardcoded origin was the blocker for calling the API from a custom
    // domain. See server/tests/cors-allow-list.test.ts for the behaviour proof.
    expect(source).toContain('corsHeadersForRequest(corsOrigins');
    expect(source).toContain('productionCorsOrigins()');
    expect(source).not.toContain("corsOrigin: PRODUCTION_CORS_ORIGIN");
  });

  it('adds vary: origin for a locked origin but not for wildcard dev', () => {
    expect(corsHeaders('https://severgrow.github.io').vary).toBe('origin');
    expect(corsHeaders('*').vary).toBeUndefined();
  });
});
