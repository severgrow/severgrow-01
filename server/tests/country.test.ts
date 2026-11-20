// WHERE THE FLAG COMES FROM (owner, 2026-11-20: "country flag should be shown on each player profile
// publicly in the planet or elsewhere tapped").
//
// The contract has three parts, and each is checked here:
//   1. the EDGE's answer is read from the real geo headers, and anything that is not a country
//      ('XX', 'T1', junk, nothing at all) is NOT a country;
//   2. the stored row is written at sign-in, served by the public profile, and simply absent when
//      the platform said nothing — never a guessed flag;
//   3. a database without migration 0031 reads as "unknown" and accepts a silent no-op write, so
//      the profile keeps working while the migration is pending.
import { describe, expect, it } from 'vitest';
import { requestCountry } from '../src/geo.js';
import { normalizeCountry } from '../src/country-code.js';
import { memoryCountryStore, postgresCountryStore } from '../src/accounts/country.js';
import type { PgPool, PgQueryResult } from '../src/storage/postgres.js';
import { MemoryIdentityLinkStore, createAccountsRouter } from '../src/accounts/accounts.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { createFetchApp } from '../src/fetch-app.js';

const headers = (pairs: Record<string, string>): { get(name: string): string | null } => ({
  get: (name) => pairs[name.toLowerCase()] ?? null,
});

describe('the request geo: only a real country code is a country', () => {
  it('reads the edge’s own header, in either case, and trims it', () => {
    expect(requestCountry(headers({ 'cf-ipcountry': 'PL' }))).toBe('PL');
    expect(requestCountry(headers({ 'cf-ipcountry': ' pl ' }))).toBe('PL');
  });

  it('falls back to the other fronting headers only when the first is absent', () => {
    expect(requestCountry(headers({ 'x-vercel-ip-country': 'de' }))).toBe('DE');
    expect(requestCountry(headers({ 'x-country-code': 'fr' }))).toBe('FR');
    expect(requestCountry(headers({ 'cf-ipcountry': 'gb', 'x-vercel-ip-country': 'de' }))).toBe('GB');
  });

  it('refuses the edge’s "unknown" markers, malformed values and an absent header', () => {
    for (const value of ['XX', 'T1', 'EU1', 'P', 'POL', '', '  ', '1P']) {
      expect(requestCountry(headers({ 'cf-ipcountry': value })), value).toBeNull();
    }
    expect(requestCountry(headers({}))).toBeNull();
  });

  it('normalizes the same way everywhere', () => {
    expect(normalizeCountry('pl')).toBe('PL');
    expect(normalizeCountry('XX')).toBeNull();
    expect(normalizeCountry(42)).toBeNull();
  });
});

describe('the country store', () => {
  it('remembers a code and replaces it on a later sign-in', async () => {
    const store = memoryCountryStore();
    await store.save('p1', 'pl', 1);
    expect(await store.read('p1')).toBe('PL');
    await store.save('p1', 'de', 2);
    expect(await store.read('p1')).toBe('DE');
  });

  it('never invents a country from a bad value', async () => {
    const store = memoryCountryStore();
    await store.save('p1', 'XX', 1);
    await store.save('p1', 'nowhere', 2);
    expect(await store.read('p1')).toBeNull();
  });

  it('reads as unknown, and accepts a quiet no-op write, before migration 0031', async () => {
    const pool: PgPool = {
      query: async (): Promise<PgQueryResult> => { throw Object.assign(new Error('no table'), { code: '42P01' }); },
      connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
    };
    const store = postgresCountryStore(pool);
    await expect(store.read('p1')).resolves.toBeNull();
    await expect(store.save('p1', 'PL', 1)).resolves.toBeUndefined();
  });

  it('does not swallow a real database failure', async () => {
    const pool: PgPool = {
      query: async (): Promise<PgQueryResult> => { throw Object.assign(new Error('down'), { code: '08006' }); },
      connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
    };
    await expect(postgresCountryStore(pool).read('p1')).rejects.toThrow('down');
  });

  it('writes ONE upsert and reads ONE row', async () => {
    const statements: string[] = [];
    const pool: PgPool = {
      query: async (text: string): Promise<PgQueryResult> => {
        statements.push(text);
        if (text.startsWith('select')) return { rows: [{ country: 'pl' }] };
        return { rows: [] };
      },
      connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
    };
    const store = postgresCountryStore(pool);
    await store.save('p1', 'PL', 1);
    await expect(store.read('p1')).resolves.toBe('PL');
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('insert into player_countries');
    expect(statements[0]).toContain('on conflict (player_id) do update');
    expect(statements[1]).toContain('select country from player_countries');
    // Nothing private is ever read from this table.
    expect(statements.join(' ').toLowerCase()).not.toContain('token');
  });
});

describe('the country is written at SIGN-IN, from the edge’s own answer', () => {
  const fakeAuth = () => ({
    async user(t: string) {
      return t === 'access-token-aaaaaaaaaaaaaaaaaaaa' ? { id: 'google-sub', email: 'a@b.c', providers: ['google'], emailConfirmed: true } : null;
    },
    async deleteUser() { return true; },
  });

  const setup = async () => {
    const storage = new MemoryStorage();
    const service = new MatchService({ storage });
    const country = memoryCountryStore();
    const accounts = createAccountsRouter({
      links: new MemoryIdentityLinkStore(),
      storage,
      auth: fakeAuth(),
      country,
      authenticate: (t) => service.authenticate(t),
      now: () => 1_000,
    });
    const signIn = async (extra: Record<string, string> = {}) => {
      const res = await accounts(new Request('http://x/v1/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...extra },
        body: JSON.stringify({ accessToken: 'access-token-aaaaaaaaaaaaaaaaaaaa' }),
      }), '/v1/auth/google');
      return res as { status: number; body: { player?: { id: string } } };
    };
    return { storage, country, signIn };
  };

  it('stores the header’s country for the signed-in player', async () => {
    const h = await setup();
    const res = await h.signIn({ 'cf-ipcountry': 'pl' });
    expect(res.status).toBe(200);
    expect(await h.country.read(res.body.player!.id)).toBe('PL');
  });

  it('writes nothing when the platform reports nothing — never a guessed flag', async () => {
    const h = await setup();
    const res = await h.signIn();
    expect(res.status).toBe(200);
    expect(await h.country.read(res.body.player!.id)).toBeNull();
  });

  it('records a GUEST’s country at creation too (most map tiles are guests)', async () => {
    const storage = new MemoryStorage();
    const service = new MatchService({ storage });
    const country = memoryCountryStore();
    const app = createFetchApp({ service, country });
    const res = await app(new Request('http://x/v1/guests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-ipcountry': 'fr' },
      body: '{}',
    }));
    expect(res.status).toBe(201);
    const body = await res.json() as { player: { id: string } };
    expect(await country.read(body.player.id)).toBe('FR');
  });

  it('a later sign-in from elsewhere replaces the stored country, and a bad value cannot', async () => {
    const h = await setup();
    const first = await h.signIn({ 'cf-ipcountry': 'PL' });
    const id = first.body.player!.id;
    await h.signIn({ 'cf-ipcountry': 'DE' });
    expect(await h.country.read(id)).toBe('DE');
    await h.signIn({ 'cf-ipcountry': 'XX' });
    expect(await h.country.read(id)).toBe('DE');
  });
});
