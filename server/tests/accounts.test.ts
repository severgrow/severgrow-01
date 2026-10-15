// Accounts ("Continue with Google"): guest upgrade in place, cross-device recovery, returning users,
// duplicate / racing sign-ins, failures, and account deletion. Supabase Auth is faked: the fake only
// answers "who owns this access token", exactly like GET /auth/v1/user does.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { chainRouters } from '../src/feedback/feedback.js';
import { MemoryIdentityLinkStore, createAccountsRouter, supabaseAuthProvider } from '../src/accounts/accounts.js';
import type { AuthProvider, AuthUser } from '../src/accounts/accounts.js';

type Json = Record<string, unknown> & { player?: { id: string; kind: string; displayName: string }; token?: string; code?: string };

const fakeAuth = () => {
  const users = new Map<string, AuthUser>(); // access token -> user
  const deleted: string[] = [];
  const auth: AuthProvider = {
    async user(t) {
      return users.get(t) ?? null;
    },
    async deleteUser(id) {
      deleted.push(id);
      return true;
    },
  };
  /** A fresh access token for this Google user, as Supabase would hand the browser after sign-in. */
  let n = 0;
  const google = (sub: string, email = `${sub}@gmail.com`, providers = ['google']) => {
    const t = `access-token-${sub}-${(n += 1)}-xxxxxxxxxxxx`;
    users.set(t, { id: sub, email, providers });
    return t;
  };
  return { auth, google, deleted };
};

const setup = (opts: { auth?: AuthProvider | null; limits?: { signInPerIpPerHour: number; unlinkPerPlayerPerHour: number } } = {}) => {
  const storage = new MemoryStorage();
  const config = { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' };
  const service = new MatchService({ storage, config });
  const fake = fakeAuth();
  const links = new MemoryIdentityLinkStore((p, k, now) => storage.revokeTokensOfPlayer(p, k, now));
  const accounts = createAccountsRouter({
    links,
    storage,
    auth: opts.auth === undefined ? fake.auth : opts.auth,
    authenticate: (t) => service.authenticate(t),
    now: () => Date.now(),
    ...(opts.limits ? { limits: opts.limits } : {}),
  });
  const app = createFetchApp({ service, config, live: chainRouters(async () => null, accounts) });
  const call = async (method: string, path: string, body: unknown, token?: string, ip = '8.8.8.8'): Promise<{ status: number; json: Json }> => {
    const res = await app(
      new Request(`http://x${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    return { status: res.status, json: (await res.json()) as Json };
  };
  const signIn = (accessToken: string, deviceToken?: string, extra: Record<string, unknown> = {}) => call('POST', '/v1/auth/google', { accessToken, ...extra }, deviceToken);
  const pair = async () => {
    const a = await service.createGuest();
    const b = await service.createGuest();
    const m = await service.createMatch(await service.authenticate(a.token));
    await service.joinMatch(await service.authenticate(b.token), m.match.inviteCode);
    return { a, b, matchId: m.match.matchId };
  };
  const matchIds = async (token: string) => (await service.listMyMatches(await service.authenticate(token))).map((m) => m.matchId);
  return { service, storage, links, fake, signIn, call, pair, matchIds };
};

describe('POST /v1/auth/google', () => {
  it('a guest who signs in keeps the SAME player: id, name, matches and history', async () => {
    const t = setup();
    const { a, matchId } = await t.pair();
    const res = await t.signIn(t.fake.google('g-alice'), a.token);
    expect(res.status).toBe(200);
    expect(res.json.outcome).toBe('linked');
    expect(res.json.player).toMatchObject({ id: a.player.id, kind: 'account', displayName: a.player.displayName });
    expect(res.json.email).toBe('g-alice@gmail.com');
    // The new token and the old one are the same player; nothing was moved or split.
    expect(await t.matchIds(res.json.token!)).toEqual([matchId]);
    expect((await t.service.authenticate(a.token)).id).toBe(a.player.id);
    expect(t.links.rows).toEqual([expect.objectContaining({ provider: 'google', subject: 'g-alice', playerId: a.player.id })]);
  });

  it('on another device (no guest yet), the same Google brings back the exact player and matches', async () => {
    const t = setup();
    const { a, matchId } = await t.pair();
    await t.signIn(t.fake.google('g-alice'), a.token);
    const phone2 = await t.signIn(t.fake.google('g-alice'));
    expect(phone2.status).toBe(200);
    expect(phone2.json.outcome).toBe('signed-in');
    expect(phone2.json.player!.id).toBe(a.player.id);
    expect(await t.matchIds(phone2.json.token!)).toEqual([matchId]);
  });

  it('a returning player on a device that made a new guest switches to their account; the guest is never merged in', async () => {
    const t = setup();
    const { a } = await t.pair();
    await t.signIn(t.fake.google('g-alice'), a.token);
    const { b: strangerGuest, matchId: guestMatch } = await t.pair();
    const res = await t.signIn(t.fake.google('g-alice'), strangerGuest.token);
    expect(res.json.outcome).toBe('signed-in');
    expect(res.json.player!.id).toBe(a.player.id);
    expect(await t.matchIds(res.json.token!)).not.toContain(guestMatch);
    // The guest is untouched: still a guest, still owns its match, no Google link.
    const guest = await t.service.authenticate(strangerGuest.token);
    expect(guest.kind).toBe('guest');
    expect(await t.matchIds(strangerGuest.token)).toEqual([guestMatch]);
    expect(t.links.rows).toHaveLength(1);
  });

  it('signing in twice on the same device is harmless (outcome "same", still one link)', async () => {
    const t = setup();
    const g = await t.service.createGuest();
    const first = await t.signIn(t.fake.google('g-bo'), g.token);
    const again = await t.signIn(t.fake.google('g-bo'), first.json.token);
    expect(again.json.outcome).toBe('same');
    expect(again.json.player!.id).toBe(g.player.id);
    expect(t.links.rows).toHaveLength(1);
  });

  it('a second, different Google on a device whose player already has one gets its OWN player (no overwrite)', async () => {
    const t = setup();
    const g = await t.service.createGuest();
    const alice = await t.signIn(t.fake.google('g-alice'), g.token);
    const bob = await t.signIn(t.fake.google('g-bob'), alice.json.token);
    expect(bob.json.outcome).toBe('created');
    expect(bob.json.player!.id).not.toBe(g.player.id);
    expect(bob.json.player!.kind).toBe('account');
    expect(bob.json.player!.displayName).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
    expect(t.links.rows.find((r) => r.subject === 'g-alice')!.playerId).toBe(g.player.id);
    expect(t.links.rows.find((r) => r.subject === 'g-bob')!.playerId).toBe(bob.json.player!.id);
  });

  it('a first sign-in with no device token creates one account player', async () => {
    const t = setup();
    const res = await t.signIn(t.fake.google('g-new'));
    expect(res.json.outcome).toBe('created');
    expect(res.json.player!.kind).toBe('account');
    expect((await t.service.authenticate(res.json.token!)).id).toBe(res.json.player!.id);
  });

  it('two devices racing the very first sign-in end up on ONE player', async () => {
    const t = setup();
    const [x, y] = await Promise.all([t.signIn(t.fake.google('g-race')), t.signIn(t.fake.google('g-race'))]);
    expect(x.status).toBe(200);
    expect(y.status).toBe(200);
    expect(x.json.player!.id).toBe(y.json.player!.id);
    expect(t.links.rows).toHaveLength(1);
  });

  it('never trusts an id or email sent by the browser: only what Supabase says counts', async () => {
    const t = setup();
    const { a } = await t.pair();
    await t.signIn(t.fake.google('g-victim'), a.token);
    // An attacker with their own Google session claims to be the victim.
    const res = await t.signIn(t.fake.google('g-attacker', 'attacker@gmail.com'), undefined, { userId: 'g-victim', subject: 'g-victim', email: 'victim@gmail.com', playerId: a.player.id });
    expect(res.json.player!.id).not.toBe(a.player.id);
    expect(res.json.email).toBe('attacker@gmail.com');
  });

  it('a bad, expired or non-Google token is refused and changes nothing', async () => {
    const t = setup();
    const g = await t.service.createGuest();
    expect((await t.signIn('not-a-real-supabase-token-xxxx', g.token)).json.code).toBe('UNAUTHORIZED');
    expect((await t.signIn(t.fake.google('mail-user', 'm@x.com', ['email']), g.token)).json.code).toBe('UNAUTHORIZED');
    expect((await t.signIn('short', g.token)).json.code).toBe('INVALID_REQUEST');
    expect((await t.call('POST', '/v1/auth/google', {}, g.token)).json.code).toBe('INVALID_REQUEST');
    expect((await t.service.authenticate(g.token)).kind).toBe('guest');
    expect(t.links.rows).toHaveLength(0);
  });

  it('a stale device token never blocks signing in', async () => {
    const t = setup();
    const res = await t.signIn(t.fake.google('g-x'), 'stale-token-from-a-reset-database-xxxx');
    expect(res.status).toBe(200);
    expect(res.json.outcome).toBe('created');
  });

  it('is switched off (403) on a server with no Supabase project configured', async () => {
    const t = setup({ auth: null });
    const g = await t.service.createGuest();
    const res = await t.signIn('anything-long-enough-xxxxxxxx', g.token);
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('FORBIDDEN');
  });

  it('is rate limited per IP', async () => {
    const t = setup({ limits: { signInPerIpPerHour: 2, unlinkPerPlayerPerHour: 10 } });
    await t.signIn(t.fake.google('a'));
    await t.signIn(t.fake.google('b'));
    expect((await t.signIn(t.fake.google('c'))).json.code).toBe('RATE_LIMITED');
  });
});

describe('POST /v1/auth/google/delete (delete my account)', () => {
  it('removes the Google link and the Supabase user, signs out other devices, keeps this device playing as a guest', async () => {
    const t = setup();
    const { a, matchId } = await t.pair();
    const phone1 = await t.signIn(t.fake.google('g-alice'), a.token);
    const phone2 = await t.signIn(t.fake.google('g-alice'));
    const res = await t.call('POST', '/v1/auth/google/delete', {}, phone1.json.token);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ unlinked: true, emailDeleted: true });
    expect(res.json.player!.kind).toBe('guest');
    expect(t.fake.deleted).toEqual(['g-alice']);
    expect(t.links.rows).toHaveLength(0);
    // This device still plays, with its matches; the other phone and the old guest token are signed out.
    expect(await t.matchIds(phone1.json.token!)).toEqual([matchId]);
    await expect(t.service.authenticate(phone2.json.token!)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(t.service.authenticate(a.token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    // Signing in with that Google again starts fresh: it can no longer reach the deleted account from elsewhere.
    const later = await t.signIn(t.fake.google('g-alice'));
    expect(later.json.outcome).toBe('created');
    expect(later.json.player!.id).not.toBe(a.player.id);
  });

  it('needs a valid device token', async () => {
    const t = setup();
    expect((await t.call('POST', '/v1/auth/google/delete', {})).status).toBe(401);
    expect((await t.call('POST', '/v1/auth/google/delete', {}, 'nope-nope-nope-nope-nope')).status).toBe(401);
  });

  it('on a guest with no Google, it is a harmless no-op', async () => {
    const t = setup();
    const g = await t.service.createGuest();
    const res = await t.call('POST', '/v1/auth/google/delete', {}, g.token);
    expect(res.json).toMatchObject({ unlinked: false, emailDeleted: false });
    expect(t.fake.deleted).toEqual([]);
  });
});

describe('supabaseAuthProvider (plain HTTP to Supabase Auth)', () => {
  const recorder = (status: number, body: unknown) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) });
      return new Response(JSON.stringify(body), { status });
    };
    return { calls, fetch };
  };

  it('asks Supabase who owns the token (anon key + the user token), and reads the providers', async () => {
    const r = recorder(200, { id: 'u1', email: 'a@gmail.com', app_metadata: { provider: 'google', providers: ['google'] } });
    const p = supabaseAuthProvider({ url: 'https://proj.supabase.co/', anonKey: 'anon', fetch: r.fetch });
    expect(await p.user('tok')).toEqual({ id: 'u1', email: 'a@gmail.com', providers: ['google'] });
    expect(r.calls[0]!.url).toBe('https://proj.supabase.co/auth/v1/user');
    expect(r.calls[0]!.init!.headers).toEqual({ apikey: 'anon', authorization: 'Bearer tok' });
  });

  it('a 401 means "not signed in"; a Supabase outage is an error, never a silent sign-in', async () => {
    expect(await supabaseAuthProvider({ url: 'https://p', anonKey: 'a', fetch: recorder(401, {}).fetch }).user('t')).toBeNull();
    await expect(supabaseAuthProvider({ url: 'https://p', anonKey: 'a', fetch: recorder(500, {}).fetch }).user('t')).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(await supabaseAuthProvider({ url: 'https://p', anonKey: 'a', fetch: recorder(200, { email: 'x' }).fetch }).user('t')).toBeNull();
  });

  it('deleting a user needs the service key; without it nothing is called', async () => {
    const none = recorder(200, {});
    expect(await supabaseAuthProvider({ url: 'https://p', anonKey: 'a', fetch: none.fetch }).deleteUser('u1')).toBe(false);
    expect(none.calls).toHaveLength(0);
    const legacy = recorder(200, {});
    expect(await supabaseAuthProvider({ url: 'https://p', anonKey: 'a', serviceRoleKey: 'eyJlegacy', fetch: legacy.fetch }).deleteUser('u 1')).toBe(true);
    expect(legacy.calls[0]!.url).toBe('https://p/auth/v1/admin/users/u%201');
    expect(legacy.calls[0]!.init).toMatchObject({ method: 'DELETE', headers: { apikey: 'eyJlegacy', authorization: 'Bearer eyJlegacy' } });
    const modern = recorder(404, {});
    expect(await supabaseAuthProvider({ url: 'https://p', anonKey: 'a', serviceRoleKey: 'sb_secret_x', fetch: modern.fetch }).deleteUser('u1')).toBe(true);
    expect(modern.calls[0]!.init!.headers).toEqual({ apikey: 'sb_secret_x' });
  });
});

describe('migration 0010_accounts.sql', () => {
  const sql = readFileSync(new URL('../migrations/0010_accounts.sql', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  it('stores only the link (no email), one Google per player and one player per Google', () => {
    expect(sql).toContain('create table if not exists player_identities');
    expect(sql).toContain('primary key (provider, subject)');
    expect(sql).toContain('unique (player_id, provider)');
    expect(sql).not.toMatch(/\bemail\s+text\b/);
  });
  it('is locked down like every other table (P-21) and kept out of realtime', () => {
    expect(sql).toContain('alter table player_identities enable row level security');
    expect(sql).toContain("revoke all on player_identities from %I");
    expect(sql).toContain('alter publication supabase_realtime drop table player_identities');
    expect(sql).not.toMatch(/create policy/i);
  });
  it('the nightly IP-counter cleanup only runs where pg_cron exists, under one fixed job name', () => {
    expect(sql).toContain("if exists (select 1 from pg_namespace where nspname = 'cron')");
    expect(sql).toContain("'futasaku-rate-limit-cleanup'");
    expect(sql).toContain('delete from public.rate_limits where window_start <');
  });
});
