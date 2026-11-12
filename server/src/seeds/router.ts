import type { Action } from '../../../src/engine/index.js';
import { isDealSeed } from '../../../src/campaign/index.js';
import { ApiError } from '../errors.js';
import type { PlayerRecord } from '../storage/types.js';
import type { WorldEconomyService } from './service.js';
import { pickClientIp } from '../client-ip.js';
import { createWorldReadGuard } from './world-read.js';

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
  /** Public map reads per IP per hour (`rateLimits.worldPerIpPerHour`). */
  worldReadsPerIpPerHour?: number;
  now?: () => number;
}): ((req: Request, path: string) => Promise<Outcome | null>) => {
  const { economy } = deps;
  // One guard per router, so per Edge isolate: see world-read.ts.
  const worldRead = createWorldReadGuard(() => economy.world(), {
    now: deps.now ?? (() => Date.now()),
    perIpPerHour: deps.worldReadsPerIpPerHour ?? 1200,
  });
  // Every successful world write drops this isolate's cached map.
  const wrote = <T>(value: T): T => { worldRead.invalidate(); return value; };
  return async (req, path) => {
    const ok = (status: number, data: Record<string, unknown>): Outcome => ({ status, body: { ok: true, ...data } });
    if (req.method === 'GET' && path === '/v1/world') {
      // Only the Territory screen's POLL (`?poll=1`, anonymous, every 12 s) may be answered from the
      // short cache: that is where the read volume is. Every other read is fresh: the menu's one read
      // on return, a read after the player's own move, a signed-in read. Every read counts against
      // the per-IP budget. A bad token is simply an anonymous read: the public map never fails on it.
      const token = bearer(req);
      const signedIn = token !== null && await deps.authenticate(token).then(() => true, () => false);
      const poll = new URL(req.url, 'http://local').searchParams.get('poll') === '1';
      return ok(200, { world: await worldRead.read(pickClientIp(req.headers), signedIn || !poll) });
    }
    if (!path.startsWith('/v1/world') && !path.startsWith('/v1/seeds')) return null;
    const player = await deps.authenticate(bearer(req));
    if (req.method === 'GET' && path === '/v1/seeds/wallet') {
      // The wallet read is also the account's PLACE (owner report, 2026-10-25): the furthest Campaign
      // level this player has a verified first-clear receipt for. It is derived from THIS player's
      // token — there is no player id in the request — so the value can never be another account's.
      return ok(200, {
        wallet: await economy.wallet(player),
        campaignHighestLevel: await economy.campaignHighestLevel(player),
      });
    }
    // ---- Territory achievements (one-time Seeds for first steps; server-verified) ----
    if (req.method === 'GET' && path === '/v1/seeds/achievements') {
      return ok(200, { achievements: await economy.achievements(player) });
    }
    // ---- Your tile colour (owner, 2026-10-30): a preference, not a game action ----------------
    // Authenticated, and read from the TOKEN only — there is no player id in the request, so one
    // account can only ever read or change its own colour.
    if (req.method === 'GET' && path === '/v1/world/colour') {
      return ok(200, { colour: await economy.colour(player) });
    }
    if (req.method === 'POST' && path === '/v1/world/colour') {
      const body = await bodyOf(req);
      return ok(200, { colour: await economy.chooseColour(player, body.colourId) });
    }
    if (req.method === 'POST' && path === '/v1/seeds/achievements/claim') {
      const body = await bodyOf(req);
      if (typeof body.id !== 'string') throw new ApiError('INVALID_REQUEST', 'Choose an achievement.');
      const result = await economy.claimAchievement(player, body.id);
      if (!result.ok) return { status: 409, body: { ok: false, code: result.code, message: 'Not earned yet.' } };
      return ok(200, { claim: result });
    }
    // ---- Territory challenges -------------------------------------------------
    // The list is private to the two participants (the map is public, the challenges are not), and
    // no route exposes a balance: a challenge names a stake, never a wallet.
    if (path === '/v1/world/challenges') {
      if (req.method === 'GET') return ok(200, await economy.challenges(player));
      if (req.method === 'POST') {
        const body = await bodyOf(req);
        if (typeof body.cellId !== 'string' || typeof body.requestId !== 'string') {
          throw new ApiError('INVALID_REQUEST', 'Choose a rival tile.');
        }
        const result = wrote(await economy.sendChallenge(player, body.cellId, body.requestId));
        if (!result.ok) return { status: 409, body: { ok: false, code: result.code, message: 'That challenge could not be sent.' } };
        return ok(201, { challenge: result.challenge, replayed: result.replayed });
      }
    }
    const challengeWrite = /^\/v1\/world\/challenges\/([0-9a-fA-F-]{8,64})\/(respond|confirm)$/.exec(path);
    if (challengeWrite && req.method === 'POST') {
      const id = challengeWrite[1]!;
      if (challengeWrite[2] === 'respond') {
        const body = await bodyOf(req);
        if (typeof body.accept !== 'boolean') throw new ApiError('INVALID_REQUEST', 'Answer the challenge.');
        return ok(200, wrote(await economy.respond(player, id, body.accept)));
      }
      await bodyOf(req);
      return ok(200, wrote(await economy.confirm(player, id)));
    }
    if (req.method === 'POST' && path === '/v1/world/claims') {
      const body = await bodyOf(req);
      if (typeof body.cellId !== 'string' || typeof body.requestId !== 'string') throw new ApiError('INVALID_REQUEST', 'Choose a world tile.');
      const result = wrote(await economy.claim(player, body.cellId, body.requestId));
      return { status: result.ok ? 200 : 409, body: result.ok ? { ok: true, claim: result } : result };
    }
    if (req.method === 'POST' && path === '/v1/world/sales') {
      const body = await bodyOf(req);
      if (typeof body.cellId !== 'string' || typeof body.requestId !== 'string') throw new ApiError('INVALID_REQUEST', 'Choose one of your tiles.');
      const result = wrote(await economy.sell(player, body.cellId, body.requestId));
      return { status: result.ok ? 200 : 409, body: result.ok ? { ok: true, sale: result } : result };
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
      // SLICED CHECKS (2026-11-12): a page that says `resumable` is checked in slices and gets 202 with
      // a `resume` token until the proof is done; it sends the same proof back with that token. A page
      // that does not say so is checked whole, exactly as before.
      const resumable = body.resumable === true;
      const token = typeof body.resume === 'string' ? body.resume : null;
      if (resumable) {
        let step;
        if (path === '/v1/seeds/campaign') {
          if (typeof body.levelId !== 'string') throw new ApiError('INVALID_REQUEST', 'A Campaign level is required.');
          if (body.dealSeed !== undefined && !isDealSeed(body.dealSeed)) throw new ApiError('INVALID_REQUEST', 'That deal is not valid.');
          step = await economy.campaignStep(player, body.levelId, actions, body.botVersion,
            body.dealSeed === undefined ? undefined : body.dealSeed, token);
        } else {
          if (typeof body.ticketId !== 'string') throw new ApiError('INVALID_REQUEST', 'A Training ticket is required.');
          step = await economy.trainingStep(player, body.ticketId, actions, body.botVersion, token);
        }
        if (step.kind === 'resume') return { status: 202, body: { ok: true, resume: step.resume } };
        return ok(200, { reward: step.reward });
      }
      if (path === '/v1/seeds/campaign') {
        if (typeof body.levelId !== 'string') throw new ApiError('INVALID_REQUEST', 'A Campaign level is required.');
        // A random deal's seed (owner, 2026-11-01). Optional: a fixed-deal proof simply omits it.
        if (body.dealSeed !== undefined && !isDealSeed(body.dealSeed)) throw new ApiError('INVALID_REQUEST', 'That deal is not valid.');
        return ok(200, { reward: await economy.campaign(player, body.levelId, actions, body.botVersion,
          body.dealSeed === undefined ? undefined : body.dealSeed) });
      }
      if (typeof body.ticketId !== 'string') throw new ApiError('INVALID_REQUEST', 'A Training ticket is required.');
      return ok(200, { reward: await economy.training(player, body.ticketId, actions, body.botVersion) });
    }
    return null;
  };
};
