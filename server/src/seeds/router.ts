import type { Action } from '../../../src/engine/index.js';
import { ApiError } from '../errors.js';
import type { PlayerRecord } from '../storage/types.js';
import type { WorldEconomyService } from './service.js';

type Outcome = { status: number; body: unknown };
const bearer = (req: Request): string | null => {
  const value = req.headers.get('authorization');
  return value && /^bearer /i.test(value) ? value.slice(7).trim() : null;
};
const bodyOf = async (req: Request): Promise<Record<string, unknown>> => {
  const raw = await req.arrayBuffer();
  if (raw.byteLength > 64 * 1024) throw new ApiError('INVALID_REQUEST', 'Result is too large.');
  try {
    const data = raw.byteLength ? JSON.parse(new TextDecoder().decode(raw)) as unknown : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('shape');
    return data as Record<string, unknown>;
  } catch { throw new ApiError('INVALID_REQUEST', 'Invalid request.'); }
};

export const createWorldEconomyRouter = (deps: {
  economy: WorldEconomyService;
  authenticate: (token: string | null) => Promise<PlayerRecord>;
}): ((req: Request, path: string) => Promise<Outcome | null>) => async (req, path) => {
  const { economy } = deps;
  const ok = (status: number, data: Record<string, unknown>): Outcome => ({ status, body: { ok: true, ...data } });
  if (req.method === 'GET' && path === '/v1/world') return ok(200, { world: await economy.world() });
  if (!path.startsWith('/v1/world') && !path.startsWith('/v1/seeds')) return null;
  const player = await deps.authenticate(bearer(req));
  if (req.method === 'GET' && path === '/v1/seeds/wallet') return ok(200, { wallet: await economy.wallet(player) });
  if (req.method === 'POST' && path === '/v1/world/claims') {
    const body = await bodyOf(req);
    if (typeof body.cellId !== 'string' || typeof body.requestId !== 'string') throw new ApiError('INVALID_REQUEST', 'Choose a world tile.');
    const result = await economy.claim(player, body.cellId, body.requestId);
    return { status: result.ok ? 200 : 409, body: result.ok ? { ok: true, claim: result } : result };
  }
  if (req.method === 'POST' && path === '/v1/world/invitation') {
    await bodyOf(req);
    await economy.acknowledge(player);
    return ok(200, { acknowledged: true });
  }
  if (req.method === 'POST' && path === '/v1/seeds/training/tickets') {
    const body = await bodyOf(req);
    if (!Number.isInteger(body.botLevel)) throw new ApiError('INVALID_REQUEST', 'Invalid Training level.');
    return ok(201, { ticket: await economy.issueTraining(player, body.botLevel as number) });
  }
  if (req.method === 'POST' && (path === '/v1/seeds/campaign' || path === '/v1/seeds/training')) {
    const body = await bodyOf(req);
    if (!Array.isArray(body.actions) || typeof body.botVersion !== 'string') throw new ApiError('INVALID_REQUEST', 'A match replay is required.');
    const actions = body.actions as Action[];
    if (path === '/v1/seeds/campaign') {
      if (typeof body.levelId !== 'string') throw new ApiError('INVALID_REQUEST', 'A Campaign level is required.');
      return ok(200, { reward: await economy.campaign(player, body.levelId, actions, body.botVersion) });
    }
    if (typeof body.ticketId !== 'string') throw new ApiError('INVALID_REQUEST', 'A Training ticket is required.');
    return ok(200, { reward: await economy.training(player, body.ticketId, actions, body.botVersion) });
  }
  return null;
};
