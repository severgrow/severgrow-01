// NAT / shared-IP rate-limit regression tests.
//
// A household, cafe, office or carrier NAT puts several real players behind one public IP. These
// tests lock in that (a) per-IP budgets are generous enough for that, (b) a single IP flooding guest
// creation is still stopped, and (c) the per-PLAYER limits remain the primary anti-abuse control.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { Storage } from '../src/storage/types.js';

const config = (rateLimits: Partial<ServerConfig['rateLimits']> = {}, extra: Partial<ServerConfig> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  ...extra,
  rateLimits: { ...DEFAULT_SERVER_CONFIG.rateLimits, ...rateLimits },
});

/** MemoryStorage that records every rate-limit bucket the service touches. */
const recordingStorage = (): { storage: Storage; buckets: string[] } => {
  const base = new MemoryStorage();
  const buckets: string[] = [];
  const original = base.hitRateLimit.bind(base);
  base.hitRateLimit = (bucket, windowStart, max) => {
    buckets.push(bucket);
    return original(bucket, windowStart, max);
  };
  return { storage: base, buckets };
};

const expectCode = async (promise: Promise<unknown>, code: string): Promise<ApiError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
    return error as ApiError;
  }
  throw new Error(`Expected ${code} but the call resolved.`);
};

describe('NAT: many real players behind one IP', () => {
  it('lets two different players behind the SAME IP each create a guest and join', async () => {
    const { storage, buckets } = recordingStorage();
    const service = new MatchService({ storage, config: config() });
    const ip = '90.244.119.212';

    const a = await service.createGuest(null, ip);
    const b = await service.createGuest(null, ip);
    const pa = await service.authenticate(a.token);
    const pb = await service.authenticate(b.token);
    const created = await service.createMatch(pa);
    const joined = await service.joinMatch(pb, created.match.inviteCode, ip);

    expect(joined.match.status).toBe('active');
    expect(buckets).toContain(`guest:ip:${ip}`);
    expect(buckets).toContain(`join:player:${pb.id}`);
    expect(buckets).toContain(`join:ip:${ip}`);
  });

  it('keeps the default per-IP guest ceiling well above a normal household', () => {
    // Documented defaults: enough for several players, still finite.
    expect(DEFAULT_SERVER_CONFIG.rateLimits.guestPerIpPerHour).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_SERVER_CONFIG.rateLimits.joinPerIpPerHour).toBeGreaterThanOrEqual(200);
    expect(DEFAULT_SERVER_CONFIG.rateLimits.sweepPerIpPerHour).toBeGreaterThanOrEqual(60);
  });
});

describe('NAT: abuse protection is unchanged', () => {
  it('blocks a single IP that floods guest creation with the friendly rate-limit error', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: config({ guestPerIpPerHour: 5 }) });
    const ip = '203.0.113.5';
    for (let i = 0; i < 5; i++) await service.createGuest(null, ip);
    const error = await expectCode(service.createGuest(null, ip), 'RATE_LIMITED');
    expect(error.message).toBe('Too many requests. Try again in a moment.');
    expect(error.status).toBe(429);
  });

  it('trips the per-PLAYER join limit independently of the IP', async () => {
    const service = new MatchService({
      storage: new MemoryStorage(),
      config: config({ joinPerPlayerPerHour: 1, joinPerIpPerHour: 1000 }),
    });
    const host = await service.createGuest(null, '1.1.1.1');
    const phost = await service.authenticate(host.token);
    const created = await service.createMatch(phost);

    const joiner = await service.createGuest(null, '2.2.2.2');
    const pjoiner = await service.authenticate(joiner.token);
    await service.joinMatch(pjoiner, created.match.inviteCode, '2.2.2.2');

    // A different IP does not reset the player's own budget.
    const error = await expectCode(service.joinMatch(pjoiner, created.match.inviteCode, '3.3.3.3'), 'RATE_LIMITED');
    expect(error.message).toBe('Too many requests. Try again in a moment.');
  });

  it('still caps actions per player per minute', async () => {
    const service = new MatchService({
      storage: new MemoryStorage(),
      config: config({ actionsPerPlayerPerMinute: 1 }),
    });
    expect(DEFAULT_SERVER_CONFIG.rateLimits.actionsPerPlayerPerMinute).toBeLessThanOrEqual(240);
    const guest = await service.createGuest();
    const player = await service.authenticate(guest.token);
    const created = await service.createMatch(player);
    const view = await service.viewPayload(player, created.match.matchId);
    // The rate-limit gate runs before action validation, so even a not-acting player consumes the
    // bucket; the second attempt must be refused regardless of the action's legality.
    await service
      .submitAction(player, created.match.matchId, {
        expectedRevision: view.revision,
        requestId: 'nat-actions-1',
        action: (view.legalActions[0] ?? ({ t: 'EndAct' } as never)),
      })
      .catch(() => undefined);
    await expectCode(
      service.submitAction(player, created.match.matchId, {
        expectedRevision: view.revision,
        requestId: 'nat-actions-2',
        action: (view.legalActions[0] ?? ({ t: 'EndAct' } as never)),
      }),
      'RATE_LIMITED',
    );
  });
});

describe('client IP header -> rate-limit bucket', () => {
  it('buckets two different forwarded IPs separately', async () => {
    const { storage, buckets } = recordingStorage();
    const service = new MatchService({ storage, config: config() });
    const app = createFetchApp({ service, config: config() });

    const create = (ip: string): Promise<Response> =>
      app(new Request('http://localhost/v1/guests', { method: 'POST', headers: { 'x-forwarded-for': ip } }));

    expect((await create('1.1.1.1')).status).toBe(201);
    expect((await create('2.2.2.2')).status).toBe(201);

    expect(buckets).toContain('guest:ip:1.1.1.1');
    expect(buckets).toContain('guest:ip:2.2.2.2');
    expect(buckets).not.toContain('guest:ip:unknown');
  });

  it('never lets a spoofed x-forwarded-for override a present cf-connecting-ip', async () => {
    const { storage, buckets } = recordingStorage();
    const service = new MatchService({ storage, config: config() });
    const app = createFetchApp({ service, config: config() });

    await app(
      new Request('http://localhost/v1/guests', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
      }),
    );

    expect(buckets).toContain('guest:ip:1.2.3.4');
    expect(buckets).not.toContain('guest:ip:9.9.9.9');
  });

  it('gives an authenticated cron sweep a dedicated bucket so players cannot starve it', async () => {
    const secret = 'cron-secret-value';
    const { storage, buckets } = recordingStorage();
    const cfg = config({ sweepPerIpPerHour: 1 }, { sweepCronToken: secret });
    const service = new MatchService({ storage, config: cfg });
    const app = createFetchApp({ service, config: cfg });

    const cron = await app(
      new Request('http://localhost/v1/sweep', { method: 'POST', headers: { 'x-futasaku-cron': secret, 'x-forwarded-for': '5.5.5.5' } }),
    );
    expect(cron.status).toBe(200);
    expect(buckets).toContain('sweep:internal');
    expect(buckets).not.toContain('sweep:ip:5.5.5.5');

    // Without the token, the ordinary per-IP player bucket is used.
    const plain = await app(
      new Request('http://localhost/v1/sweep', { method: 'POST', headers: { 'x-forwarded-for': '6.6.6.6' } }),
    );
    expect(plain.status).toBe(200);
    expect(buckets).toContain('sweep:ip:6.6.6.6');
  });
});
