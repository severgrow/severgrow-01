// Accounts: "Continue with Google" (docs/ACCOUNTS.md). Its own router and store, so nothing in the
// match pipeline changes. Google sign-in runs through Supabase Auth in the browser; the app then
// hands the short-lived Supabase access token to POST /v1/auth/google ONCE, and gets back one of our
// own bearer tokens — exactly the kind a guest already has. From then on nothing else changes.
//
// The one rule that matters: signing in attaches Google to an EXISTING players row and never splits
// a player in two. A guest who signs in keeps the same id, so every match and the history stay.
import { pickClientIp } from '../client-ip.js';
import { ApiError } from '../errors.js';
import { hashToken, newId, newToken } from '../ids.js';
import { natureName } from '../nature-names.js';
import type { PgPool } from '../storage/postgres.js';
import type { PlayerRecord, Storage } from '../storage/types.js';
import { playerSummary } from '../storage/types.js';

export type Provider = 'google';

export type IdentityLink = { provider: Provider; subject: string; playerId: string; createdAt: number };

export type IdentityLinkStore = {
  bySubject(provider: Provider, subject: string): Promise<IdentityLink | null>;
  byPlayer(playerId: string, provider: Provider): Promise<IdentityLink | null>;
  /** 'taken' when that subject (or that player's slot for the provider) is already linked. */
  link(record: IdentityLink): Promise<'ok' | 'taken'>;
  unlink(playerId: string, provider: Provider): Promise<IdentityLink | null>;
  /** Signs the player out everywhere except the device holding `keepTokenHash`. */
  revokeOtherTokens(playerId: string, keepTokenHash: string, now: number): Promise<number>;
};

export class MemoryIdentityLinkStore implements IdentityLinkStore {
  readonly rows: IdentityLink[] = [];
  constructor(private readonly revoke: (playerId: string, keepTokenHash: string, now: number) => Promise<number> = async () => 0) {}
  revokeOtherTokens(playerId: string, keepTokenHash: string, now: number) {
    return this.revoke(playerId, keepTokenHash, now);
  }
  async bySubject(provider: Provider, subject: string) {
    return this.rows.find((r) => r.provider === provider && r.subject === subject) ?? null;
  }
  async byPlayer(playerId: string, provider: Provider) {
    return this.rows.find((r) => r.provider === provider && r.playerId === playerId) ?? null;
  }
  async link(record: IdentityLink): Promise<'ok' | 'taken'> {
    if (this.rows.some((r) => r.provider === record.provider && (r.subject === record.subject || r.playerId === record.playerId))) return 'taken';
    this.rows.push({ ...record });
    return 'ok';
  }
  async unlink(playerId: string, provider: Provider) {
    const i = this.rows.findIndex((r) => r.provider === provider && r.playerId === playerId);
    return i < 0 ? null : this.rows.splice(i, 1)[0]!;
  }
}

const rowToLink = (row: Record<string, unknown>): IdentityLink => ({
  provider: String(row.provider) as Provider,
  subject: String(row.subject),
  playerId: String(row.player_id),
  createdAt: Number(row.created_at),
});

export const postgresIdentityLinkStore = (pool: PgPool): IdentityLinkStore => ({
  async bySubject(provider, subject) {
    const { rows } = await pool.query('select * from player_identities where provider = $1 and subject = $2', [provider, subject]);
    return rows[0] ? rowToLink(rows[0]) : null;
  },
  async byPlayer(playerId, provider) {
    const { rows } = await pool.query('select * from player_identities where player_id = $1 and provider = $2', [playerId, provider]);
    return rows[0] ? rowToLink(rows[0]) : null;
  },
  async link(r) {
    const { rows } = await pool.query(
      `insert into player_identities (provider, subject, player_id, created_at) values ($1,$2,$3,$4)
       on conflict do nothing returning provider`,
      [r.provider, r.subject, r.playerId, r.createdAt],
    );
    return rows.length === 1 ? 'ok' : 'taken';
  },
  async unlink(playerId, provider) {
    const { rows } = await pool.query('delete from player_identities where player_id = $1 and provider = $2 returning *', [playerId, provider]);
    return rows[0] ? rowToLink(rows[0]) : null;
  },
  async revokeOtherTokens(playerId, keepTokenHash, now) {
    const { rows } = await pool.query(
      'update player_tokens set revoked_at = $3 where player_id = $1 and token_hash <> $2 and revoked_at is null returning id',
      [playerId, keepTokenHash, now],
    );
    return rows.length;
  },
});

/** Who a Supabase access token belongs to. `providers` lists how that user has signed in. */
export type AuthUser = { id: string; email: string | null; providers: string[] };

export type AuthProvider = {
  /** Resolves a Supabase access token to its user, or null when it is not valid. */
  user(accessToken: string): Promise<AuthUser | null>;
  /** Deletes the Supabase Auth user (their email). False when this server cannot (no admin key). */
  deleteUser(id: string): Promise<boolean>;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Supabase Auth over plain HTTP (no SDK). The access token is checked by asking Supabase who it
 * belongs to, so no JWT secret is ever needed here. `serviceRoleKey` is only for deleting a user.
 */
export const supabaseAuthProvider = (opts: { url: string; anonKey: string; serviceRoleKey?: string | null; fetch?: FetchLike }): AuthProvider => {
  const base = opts.url.replace(/\/+$/, '');
  const f: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init));
  return {
    async user(accessToken) {
      const res = await f(`${base}/auth/v1/user`, { headers: { apikey: opts.anonKey, authorization: `Bearer ${accessToken}` } });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new ApiError('INTERNAL', 'Google sign-in is not available right now.');
      const body = (await res.json()) as { id?: unknown; email?: unknown; app_metadata?: { providers?: unknown; provider?: unknown } };
      if (typeof body.id !== 'string' || body.id.length === 0) return null;
      const meta = body.app_metadata ?? {};
      const providers = Array.isArray(meta.providers) ? meta.providers.filter((p): p is string => typeof p === 'string') : typeof meta.provider === 'string' ? [meta.provider] : [];
      return { id: body.id, email: typeof body.email === 'string' ? body.email : null, providers };
    },
    async deleteUser(id) {
      const key = opts.serviceRoleKey?.trim();
      if (!key) return false;
      // Legacy service-role keys are JWTs and go in both headers; new secret keys go in `apikey` only.
      const headers: Record<string, string> = { apikey: key };
      if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
      const res = await f(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      return res.ok || res.status === 404;
    },
  };
};

export const ACCOUNT_LIMITS = { signInPerIpPerHour: 30, unlinkPerPlayerPerHour: 10 } as const;

export type AccountsRouter = (req: Request, path: string) => Promise<{ status: number; body: unknown } | null>;

const bearer = (req: Request): string | null => {
  const auth = req.headers.get('authorization');
  return auth && /^bearer /i.test(auth) ? auth.slice(7).trim() : null;
};

export const createAccountsRouter = (deps: {
  links: IdentityLinkStore;
  storage: Storage;
  /** Null when this server has no Supabase project configured: the routes answer "not available". */
  auth: AuthProvider | null;
  authenticate: (token: string | null) => Promise<PlayerRecord>;
  now: () => number;
  limits?: { signInPerIpPerHour: number; unlinkPerPlayerPerHour: number };
}): AccountsRouter => {
  const limits = deps.limits ?? ACCOUNT_LIMITS;
  const hour = 60 * 60 * 1000;
  const limit = async (bucket: string, max: number) => {
    const now = deps.now();
    const hit = await deps.storage.hitRateLimit(bucket, Math.floor(now / hour) * hour, max);
    if (!hit.ok) throw new ApiError('RATE_LIMITED', 'Too many tries. Try again in a moment.');
  };
  const issueToken = async (playerId: string): Promise<string> => {
    const token = newToken();
    await deps.storage.issueToken({ id: newId(), playerId, tokenHash: hashToken(token), createdAt: deps.now(), revokedAt: null });
    return token;
  };
  const asAccount = async (player: PlayerRecord): Promise<PlayerRecord> => {
    if (player.kind === 'account') return player;
    const upgraded: PlayerRecord = { ...player, kind: 'account', upgradedAt: deps.now() };
    await deps.storage.updatePlayer(upgraded);
    return upgraded;
  };
  const currentPlayer = async (req: Request): Promise<PlayerRecord | null> => {
    const token = bearer(req);
    if (!token) return null;
    try {
      return await deps.authenticate(token);
    } catch {
      return null; // a stale device token never blocks signing in
    }
  };

  const signIn = async (req: Request) => {
    if (!deps.auth) throw new ApiError('FORBIDDEN', 'Google sign-in is not switched on yet.');
    await limit(`auth:google:ip:${pickClientIp(req.headers) ?? 'unknown'}`, limits.signInPerIpPerHour);
    let body: Record<string, unknown> = {};
    try {
      const parsed = (await req.json()) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      throw new ApiError('INVALID_REQUEST', 'Sign-in request is not valid JSON.');
    }
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    if (accessToken.length < 16 || accessToken.length > 8192) throw new ApiError('INVALID_REQUEST', 'A Google sign-in is required.');
    const user = await deps.auth.user(accessToken);
    if (!user || !user.providers.includes('google')) throw new ApiError('UNAUTHORIZED', 'Google sign-in did not work. Please try again.');

    const current = await currentPlayer(req);
    // Up to two passes: a second device racing the same first sign-in loses the insert and then
    // simply finds the link the winner made.
    for (let pass = 0; pass < 2; pass += 1) {
      const existing = await deps.links.bySubject('google', user.id);
      if (existing) {
        const player = await deps.storage.playerById(existing.playerId);
        if (!player) throw new ApiError('INTERNAL', 'That account could not be loaded.');
        const token = await issueToken(player.id);
        return {
          status: 200,
          body: { ok: true, player: playerSummary(player), token, email: user.email, outcome: current && current.id === player.id ? 'same' : 'signed-in', serverNow: deps.now() },
        };
      }
      // First sign-in for this Google account: attach it to the player on this device, unless that
      // player already carries a different Google account — then this Google gets a fresh player.
      let player: PlayerRecord;
      let outcome: 'linked' | 'created';
      if (current && !(await deps.links.byPlayer(current.id, 'google'))) {
        player = current;
        outcome = 'linked';
      } else {
        const id = newId();
        player = { id, kind: 'account', displayName: natureName(id), createdAt: deps.now(), upgradedAt: deps.now() };
        await deps.storage.createPlayer(player);
        outcome = 'created';
      }
      if ((await deps.links.link({ provider: 'google', subject: user.id, playerId: player.id, createdAt: deps.now() })) === 'taken') continue;
      player = await asAccount(player);
      const token = await issueToken(player.id);
      return { status: 200, body: { ok: true, player: playerSummary(player), token, email: user.email, outcome, serverNow: deps.now() } };
    }
    throw new ApiError('INTERNAL', 'Google sign-in did not work. Please try again.');
  };

  /**
   * "Delete my account": the Google link and the Supabase user (the email) go, and every OTHER device
   * is signed out. The player itself stays on this device as a guest, so an opponent's history of a
   * finished match is never rewritten.
   */
  const unlink = async (req: Request) => {
    const token = bearer(req);
    const player = await deps.authenticate(token);
    await limit(`auth:unlink:player:${player.id}`, limits.unlinkPerPlayerPerHour);
    const removed = await deps.links.unlink(player.id, 'google');
    let emailDeleted = false;
    if (removed && deps.auth) emailDeleted = await deps.auth.deleteUser(removed.subject);
    const guest: PlayerRecord = { ...player, kind: 'guest' };
    if (player.kind !== 'guest') await deps.storage.updatePlayer(guest);
    const signedOut = await deps.links.revokeOtherTokens(player.id, hashToken(token!), deps.now());
    return { status: 200, body: { ok: true, player: playerSummary(guest), unlinked: removed !== null, emailDeleted, signedOut, serverNow: deps.now() } };
  };

  return async (req, path) => {
    if (path === '/v1/auth/google' && req.method === 'POST') return signIn(req);
    // POST, not DELETE: the API's CORS allow-list is GET/POST/PATCH (server/src/cors.ts).
    if (path === '/v1/auth/google/delete' && req.method === 'POST') return unlink(req);
    return null;
  };
};
