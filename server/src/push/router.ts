// The four web-push routes. Thin on purpose: parse → authenticate → service → JSON (the same shape
// every other router in `server/src/` follows), and NOTHING here chooses a recipient.
//
//   GET    /v1/push/status          who am I, how many devices are subscribed
//   POST   /v1/push/subscriptions   this browser's endpoint (+ keys), for the token's player
//   DELETE /v1/push/subscriptions   remove this browser's endpoint (only the owner may)
//   POST   /v1/push/nudge           "look now" — the server decides who is told what
//   POST   /v1/push/dispatch        the 12 h / 1 h challenge reminder sweep (cron token)
//
// When the feature is dark (no PUSH_ENABLED / no VAPID keys) every one of them is a 404: an older
// page and a disabled deployment agree without a version handshake.
import { ApiError } from '../errors.js';
import { pickClientIp } from '../client-ip.js';
import type { PlayerRecord } from '../storage/types.js';
import type { PushService } from './service.js';
import { validPushEndpoint } from './service.js';

type Outcome = { status: number; body: Record<string, unknown> };

const HOUR_MS = 60 * 60 * 1000;
const bearer = (req: Request): string | null => {
  const value = req.headers.get('authorization');
  return value && /^bearer /i.test(value) ? value.slice(7).trim() : null;
};
const bodyOf = async (req: Request): Promise<Record<string, unknown>> => {
  const raw = await req.arrayBuffer();
  if (raw.byteLength > 64 * 1024) throw new ApiError('INVALID_REQUEST', 'Request is too large.');
  try {
    const data = raw.byteLength ? JSON.parse(new TextDecoder().decode(raw)) as unknown : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('shape');
    return data as Record<string, unknown>;
  } catch {
    throw new ApiError('INVALID_REQUEST', 'Invalid request.');
  }
};

export type PushRouterDeps = Readonly<{
  push: PushService;
  authenticate: (token: string | null) => Promise<PlayerRecord>;
  /** The shared Postgres-backed limiter (`MatchService.limit`). */
  limit: (bucket: string, windowMs: number, max: number) => Promise<void>;
  dispatchToken: string | null;
  nudgePerPlayerPerHour: number;
  dispatchPerIpPerHour: number;
}>;

export const createPushRouter = (deps: PushRouterDeps): ((req: Request, path: string) => Promise<Outcome | null>) =>
  async (req, path) => {
    if (!path.startsWith('/v1/push')) return null;
    if (!deps.push.available()) return null; // dark: the app's own NOT_FOUND answers

    const ok = (status: number, data: Record<string, unknown>): Outcome => ({ status, body: { ok: true, ...data } });

    if (req.method === 'GET' && path === '/v1/push/status') {
      const player = await deps.authenticate(bearer(req));
      return ok(200, { subscribed: await deps.push.subscribedDevices(player) });
    }

    if (req.method === 'POST' && path === '/v1/push/subscriptions') {
      const player = await deps.authenticate(bearer(req));
      const body = await bodyOf(req);
      const keys = typeof body.keys === 'object' && body.keys !== null ? body.keys as Record<string, unknown> : {};
      if (typeof body.endpoint !== 'string' || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
        throw new ApiError('INVALID_REQUEST', 'A subscription endpoint and keys are required.');
      }
      const subscribed = await deps.push.subscribe(player, {
        endpoint: body.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers.get('user-agent'),
      });
      return ok(200, { subscribed });
    }

    if (req.method === 'DELETE' && path === '/v1/push/subscriptions') {
      const player = await deps.authenticate(bearer(req));
      const body = await bodyOf(req);
      if (!validPushEndpoint(body.endpoint)) {
        throw new ApiError('INVALID_REQUEST', 'A subscription endpoint is required.');
      }
      return ok(200, { removed: await deps.push.unsubscribe(player, body.endpoint) });
    }

    if (req.method === 'POST' && path === '/v1/push/nudge') {
      const player = await deps.authenticate(bearer(req));
      await bodyOf(req);
      // One player's own page may ask at most this often; the sends themselves are deduped.
      await deps.limit(`push:nudge:player:${player.id}`, HOUR_MS, deps.nudgePerPlayerPerHour);
      const result = await deps.push.nudge(player);
      return ok(200, { sent: result.sent });
    }

    if (req.method === 'POST' && path === '/v1/push/dispatch') {
      // The reminder sweep is housekeeping, not a player action. Without a configured token the
      // route does not exist; with one, only the matching caller may run it.
      if (!deps.dispatchToken) return null;
      if (req.headers.get('x-futasaku-push') !== deps.dispatchToken) {
        throw new ApiError('UNAUTHORIZED', 'A sweep token is required.');
      }
      await bodyOf(req);
      await deps.limit(`push:dispatch:ip:${pickClientIp(req.headers) ?? 'unknown'}`, HOUR_MS, deps.dispatchPerIpPerHour);
      const result = await deps.push.dispatch();
      return ok(200, { due: result.due, sent: result.sent });
    }

    return null;
  };
