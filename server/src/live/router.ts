// Live duels — the HTTP routes, in their own router. Thin: parse → authenticate → LiveService.
// Returns null for any path it does not own, so the base routes run unchanged.
import { ApiError } from '../errors.js';
import type { PlayerRecord } from '../storage/types.js';
import type { LiveService } from './service.js';

export type LiveOutcome = { status: number; body: unknown };
export type LiveRouter = (req: Request, path: string) => Promise<LiveOutcome | null>;

const bearer = (header: string | null): string | null => {
  if (typeof header !== 'string') return null;
  const prefix = 'bearer ';
  return header.slice(0, prefix.length).toLowerCase() === prefix ? header.slice(prefix.length).trim() : null;
};

const MAX_BODY = 4 * 1024;

const readJson = async (req: Request): Promise<Record<string, unknown>> => {
  const raw = await req.arrayBuffer();
  if (raw.byteLength > MAX_BODY) throw new ApiError('INVALID_REQUEST', 'Request body is too large.');
  if (raw.byteLength === 0) return {};
  try {
    const v = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new ApiError('INVALID_REQUEST', 'Request body is not valid JSON.');
  }
};

const ID = '([0-9a-fA-F-]{8,64})';
const MATCH_LIVE = new RegExp(`^/v1/matches/${ID}/live(/challenge|/leave)?$`);
const CHALLENGE = new RegExp(`^/v1/challenges/${ID}/(accept|decline|cancel)$`);

export const createLiveRouter = (deps: {
  live: LiveService;
  authenticate: (token: string | null) => Promise<PlayerRecord>;
  now: () => number;
}): LiveRouter => {
  const { live } = deps;
  const auth = (req: Request) => deps.authenticate(bearer(req.headers.get('authorization')));
  const ok = (status: number, body: Record<string, unknown>): LiveOutcome => ({ status, body: { ok: true, ...body, serverNow: deps.now() } });

  return async (req, path) => {
    const method = req.method;

    if (method === 'GET' && path === '/v1/players/me/challenges') {
      return ok(200, { ...(await live.myChallenges(await auth(req))) });
    }
    if (method === 'POST' && path === '/v1/players/me/presence') {
      const player = await auth(req);
      const body = await readJson(req);
      return ok(200, await live.presence(player, body.status, body.matchId));
    }
    if (method === 'PATCH' && path === '/v1/players/me') {
      // Only the live switch is ours; a display-name rename falls through to the base route.
      const body = await readJson(req.clone());
      if (typeof body.liveChallengesEnabled !== 'boolean' || body.displayName !== undefined) return null;
      const player = await auth(req);
      return ok(200, await live.setChallengesEnabled(player, body.liveChallengesEnabled));
    }

    const m = MATCH_LIVE.exec(path);
    if (m) {
      const matchId = m[1]!;
      const sub = m[2] ?? '';
      if (method === 'GET' && sub === '') return ok(200, { live: await live.status(await auth(req), matchId) });
      if (method === 'POST' && sub === '/challenge') {
        const player = await auth(req);
        const body = await readJson(req);
        return ok(201, await live.challenge(player, matchId, body.kind));
      }
      if (method === 'POST' && sub === '/leave') {
        const player = await auth(req);
        await readJson(req);
        return ok(200, { live: await live.leave(player, matchId) });
      }
      return null;
    }

    const c = CHALLENGE.exec(path);
    if (c && method === 'POST') {
      const player = await auth(req);
      await readJson(req);
      const id = c[1]!;
      if (c[2] === 'accept') return ok(200, await live.accept(player, id));
      if (c[2] === 'decline') return ok(200, await live.decline(player, id));
      return ok(200, await live.cancel(player, id));
    }
    return null;
  };
};
