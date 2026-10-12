// The HTTP edge: malformed input, oversized bodies, CORS preflight, method/path handling and the
// promise that error responses never leak internals. Uses real HTTP so the Node layer is exercised.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createHttpServer } from '../src/http.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

type Response = { status: number; headers: Headers; body: unknown; text: string };

describe('HTTP surface', () => {
  let server: Server;
  let baseUrl: string;
  const logs: string[] = [];

  beforeAll(async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    server = createHttpServer({ service, config: DEFAULT_SERVER_CONFIG, logger: (line) => logs.push(line) });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const request = async (method: string, path: string, options: { token?: string; body?: string; headers?: Record<string, string> } = {}): Promise<Response> => {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    const canHaveBody = method !== 'GET' && method !== 'HEAD' && options.body !== undefined;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(canHaveBody ? { body: options.body } : {}),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: response.status, headers: response.headers, body, text };
  };

  const guest = async (): Promise<string> => {
    const response = await request('POST', '/v1/guests', { body: '{}' });
    return (response.body as { token: string }).token;
  };

  it('answers a CORS preflight without touching the service', async () => {
    const response = await request('OPTIONS', '/v1/matches', { headers: { origin: 'https://game.example' } });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('sets no-store and nosniff on API responses', async () => {
    const response = await request('GET', '/v1/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects malformed JSON and an oversized body', async () => {
    const malformed = await request('POST', '/v1/guests', { body: '{not json' });
    expect(malformed.status).toBe(400);
    expect((malformed.body as { code: string }).code).toBe('INVALID_REQUEST');

    const huge = await request('POST', '/v1/guests', { body: JSON.stringify({ displayName: 'x'.repeat(DEFAULT_SERVER_CONFIG.maxBodyBytes + 100) }) });
    expect(huge.status).toBe(400);
    expect((huge.body as { code: string }).code).toBe('INVALID_REQUEST');
  });

  it('treats a missing body as empty rather than failing', async () => {
    const response = await request('POST', '/v1/guests');
    expect(response.status).toBe(201);
  });

  it('404s unknown paths and does not leak internals in an error body', async () => {
    const response = await request('GET', '/v1/nope');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Unknown endpoint.' });
    expect(response.text).not.toContain('at ');
    expect(response.text.toLowerCase()).not.toContain('stack');
  });

  it('requires a bearer token on every match route', async () => {
    for (const [method, path] of [
      ['POST', '/v1/matches'],
      ['POST', '/v1/matches/join'],
      ['GET', '/v1/matches/abc'],
      ['GET', '/v1/matches/abc/view'],
      ['POST', '/v1/matches/abc/reconnect'],
      ['POST', '/v1/matches/abc/actions'],
      ['POST', '/v1/players/me/upgrade'],
    ] as const) {
      const response = await request(method, path, { body: '{}' });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect((response.body as { code: string }).code).toBe('UNAUTHORIZED');
    }
  });

  it('validates required fields with precise codes', async () => {
    const token = await guest();
    const badRevision = await request('POST', '/v1/matches/abc/actions', {
      token,
      body: JSON.stringify({ expectedRevision: 'nope', requestId: 'r', action: { t: 'EndAct' } }),
    });
    expect((badRevision.body as { code: string }).code).toBe('INVALID_REQUEST');

    const missingCode = await request('POST', '/v1/matches/join', { token, body: '{}' });
    expect((missingCode.body as { code: string }).code).toBe('INVALID_REQUEST');

    const badSince = await request('GET', '/v1/matches/abc/view?since=-5', { token });
    expect(badSince.status).toBe(400);
  });

  it('logs only method, path, status and duration — never tokens or bodies', async () => {
    const token = await guest();
    await request('GET', '/v1/matches/unknown-id/view', { token });
    const joined = logs.join('\n');
    expect(joined).toContain('GET /v1/matches/unknown-id/view');
    expect(joined).not.toContain(token);
    expect(joined).not.toContain('authorization');
    expect(joined).not.toContain('{"');
    // Every logged line ends with a status and a duration.
    for (const line of logs) expect(line).toMatch(/(20\d|30\d|40\d|50\d) \d+ms$/);
  });
});
