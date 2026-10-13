// Invite codes: short by default, PERMANENT, and made safe by a bounded collision retry
// (owner-approved relaxation of P-13). These tests pin:
//
//   * the default code length is exactly `config.inviteCodeLength` (4), and a configured length is
//     honoured — so nothing can silently hard-code a length again;
//   * a genuine collision is retried with a FRESH code and creation still succeeds, on BOTH create
//     paths (invite `createMatch` and the parked Find-Opponent search) and BOTH adapters (memory
//     end-to-end, Postgres for real where the shared live queue allows; the Postgres park-insert
//     collision signal is also pinned against a recording fake pool in postgres.test.ts);
//   * if every bounded attempt collides, creation fails with a clear error and leaves NO partial row;
//   * an existing 8-character code still resolves and joins (the lookup is by value, not length).
//
// The generated code is controlled by mocking ONLY `newInviteCode`; every other id/token/seed uses
// the real implementation (the mock falls through when the forced queue is empty).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const forced = vi.hoisted(() => ({ queue: [] as string[] }));

vi.mock('../src/ids.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ids.js')>();
  return {
    ...actual,
    newInviteCode: (length: number): string => forced.queue.shift() ?? actual.newInviteCode(length),
  };
});

import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { newId } from '../src/ids.js';
import { INVITE_CODE_LENGTH, LINK_CODE_LENGTH } from '../../src/invite-code.js';
import { ONLINE, inviteCodeFormatHint, linkCodeHelpText } from '../../src/strings.js';
import { MAX_INVITE_CODE_ATTEMPTS, MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { poolFromUrl } from '../src/storage/pg-pool.js';
import { postgresStorage } from '../src/storage/postgres.js';
import type { PgPool } from '../src/storage/postgres.js';
import type { MatchRecord, Storage } from '../src/storage/types.js';
import { migrate } from '../scripts/migrate.js';

const testConfig = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  turnTimeoutMs: 10_000,
  waitingExpireMs: 60_000,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 100_000,
    joinPerPlayerPerHour: 100_000,
    joinPerIpPerHour: 100_000,
    actionsPerPlayerPerMinute: 100_000,
  },
  ...overrides,
});

const guest = async (service: MatchService, name: string) => {
  const created = await service.createGuest(name);
  return { token: created.token, player: await service.authenticate(created.token) };
};

const expectCode = async (promise: Promise<unknown>, code: string): Promise<ApiError> => {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected ${code}`).toBeInstanceOf(ApiError);
  const apiError = caught as ApiError;
  expect(apiError.code).toBe(code);
  return apiError;
};

const silenceWarnings = () => vi.spyOn(console, 'warn').mockImplementation(() => undefined);

beforeEach(() => {
  forced.queue.length = 0;
});

describe('invite codes: length and safe generation (memory adapter)', () => {
  const harness = (overrides: Partial<ServerConfig> = {}) => {
    const storage = new MemoryStorage();
    const service = new MatchService({ storage, config: testConfig(overrides), now: () => 1_000_000 });
    return { storage, service };
  };

  it('generates a code of exactly the configured length by default (4 — owner-approved)', async () => {
    const { service } = harness();
    const a = await guest(service, 'A');
    const created = await service.createMatch(a.player);
    expect(created.match.inviteCode).toHaveLength(DEFAULT_SERVER_CONFIG.inviteCodeLength);
    expect(DEFAULT_SERVER_CONFIG.inviteCodeLength).toBe(4);
  });

  it('honours a configured length, so no length is hard-coded outside config', async () => {
    const { service } = harness({ inviteCodeLength: 6 });
    const a = await guest(service, 'A');
    const created = await service.createMatch(a.player);
    expect(created.match.inviteCode).toHaveLength(6);
  });

  it('retries a genuine collision on the invite path and succeeds with a fresh code', async () => {
    const { service } = harness();
    const a = await guest(service, 'A');
    const first = await service.createMatch(a.player);
    forced.queue.push(first.match.inviteCode); // the next generated code already exists

    const warn = silenceWarnings();
    const second = await service.createMatch(a.player);

    expect(second.match.inviteCode).not.toBe(first.match.inviteCode);
    expect(second.match.inviteCode).toHaveLength(DEFAULT_SERVER_CONFIG.inviteCodeLength);
    // A warning only because a retry was actually needed, and it must never contain the code.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(first.match.inviteCode);
    warn.mockRestore();
  });

  it('retries a genuine collision on the parked Find-Opponent path and succeeds with a fresh code', async () => {
    const { service } = harness();
    const a = await guest(service, 'A');
    const invite = await service.createMatch(a.player); // invite-only: not joinable in the queue
    forced.queue.push(invite.match.inviteCode);
    const b = await guest(service, 'B');

    const warn = silenceWarnings();
    const parked = await service.findOpponent(b.player);

    expect(parked.paired).toBe(false);
    expect(parked.match.status).toBe('waiting');
    expect(parked.match.inviteCode).not.toBe(invite.match.inviteCode);
    expect(parked.match.inviteCode).toHaveLength(DEFAULT_SERVER_CONFIG.inviteCodeLength);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('fails clearly after the bounded attempts and leaves no partial row behind', async () => {
    const { service, storage } = harness();
    const a = await guest(service, 'A');
    const existing = await service.createMatch(a.player);
    const before = (await storage.matchesOfPlayer(a.player.id)).length;
    forced.queue.push(...Array.from({ length: MAX_INVITE_CODE_ATTEMPTS }, () => existing.match.inviteCode));

    const warn = silenceWarnings();
    await expectCode(service.createMatch(a.player), 'INTERNAL');

    expect(warn).toHaveBeenCalledTimes(MAX_INVITE_CODE_ATTEMPTS);
    // No partial match row: the player still owns exactly the one match they started with.
    expect((await storage.matchesOfPlayer(a.player.id)).length).toBe(before);
    expect(await storage.matchByInviteCode(existing.match.inviteCode)).not.toBeNull();
    warn.mockRestore();
  });

  it('still resolves and joins an existing 8-character code (backwards compatible)', async () => {
    const { service, storage } = harness();
    const host = await guest(service, 'Host');
    const created = await service.createMatch(host.player);
    const original = (await storage.matchById(created.match.matchId)) as MatchRecord;
    // A pre-existing (longer) code, exactly as the old 8-character rule produced it.
    const legacy: MatchRecord = { ...original, id: newId(), inviteCode: 'ABCD2345', openQueue: false };
    expect((await storage.createMatch(legacy)).ok).toBe(true);

    const joiner = await guest(service, 'Joiner');
    // Read aloud by a human: spaces and a dash must normalise away; case must not matter.
    const joined = await service.joinMatch(joiner.player, ' abcd-2345 ');

    expect(joined.match.matchId).toBe(legacy.id);
    expect(joined.match.status).toBe('waiting');
    expect(joined.player.seat).toBe(0);
  });
});

// A DEVICE LINK code is a different concept from a match invite code: redeeming it mints a new token
// for another player (account takeover), so it must be long. These tests pin that the two lengths
// are independent — the exact regression that shipped when `createLinkCode` read the invite length.
describe('device link codes keep their own length (account-takeover guard)', () => {
  const harness = (overrides: Partial<ServerConfig> = {}) => {
    const storage = new MemoryStorage();
    const service = new MatchService({ storage, config: testConfig(overrides), now: () => 1_000_000 });
    return { storage, service };
  };

  it('a match invite code is 4 characters and a device link code is 8, by default', async () => {
    const { service } = harness();
    const a = await guest(service, 'A');
    const match = await service.createMatch(a.player);
    expect(match.match.inviteCode).toHaveLength(4);
    expect(match.match.inviteCode).toHaveLength(INVITE_CODE_LENGTH);
    const link = await service.createLinkCode(a.player);
    expect(link.code).toHaveLength(8);
    expect(link.code).toHaveLength(LINK_CODE_LENGTH);
  });

  it('the two lengths are INDEPENDENT: a longer invite length never lengthens a link code', async () => {
    const { service } = harness({ inviteCodeLength: 10 });
    const a = await guest(service, 'A');
    const match = await service.createMatch(a.player);
    expect(match.match.inviteCode).toHaveLength(10);
    const link = await service.createLinkCode(a.player);
    // The regression: this used to be 10 too, because link codes shared `inviteCodeLength`.
    expect(link.code).toHaveLength(LINK_CODE_LENGTH);
    expect(link.code).toHaveLength(8);
  });

  it('the two lengths are INDEPENDENT: a longer link length never lengthens an invite code', async () => {
    const { service } = harness({ linkCodeLength: 12 });
    const a = await guest(service, 'A');
    const match = await service.createMatch(a.player);
    expect(match.match.inviteCode).toHaveLength(INVITE_CODE_LENGTH);
    expect(match.match.inviteCode).toHaveLength(4);
    const link = await service.createLinkCode(a.player);
    expect(link.code).toHaveLength(12);
  });

  it('a link code round-trips: created, then redeemed for the same player with a new token', async () => {
    const { service } = harness();
    const a = await guest(service, 'A');
    const { code, expiresAt } = await service.createLinkCode(a.player);
    expect(expiresAt).toBeGreaterThan(1_000_000);
    const linked = await service.redeemLinkCode(code);
    expect(linked.player.id).toBe(a.player.id);
    expect(linked.token).not.toBe(a.token);
    // Single use: the same code cannot be redeemed twice.
    await expectCode(service.redeemLinkCode(code), 'NOT_FOUND');
  });

  it('redeems a link code typed in groups, case-insensitively (normalisation is length-agnostic)', async () => {
    const { service } = harness();
    const a = await guest(service, 'A');
    const { code } = await service.createLinkCode(a.player);
    const grouped = `${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`;
    const linked = await service.redeemLinkCode(grouped);
    expect(linked.player.id).toBe(a.player.id);
  });
});

// The displayed format hints are derived from the same constants the server config uses, so this
// class of drift (a hard-coded length in the copy) can never return. They must read correctly for
// the default AND for a non-default length.
describe('the invite-code format hint cannot drift from the configured length', () => {
  it('ties the server config and the player copy to the one shared length', () => {
    expect(DEFAULT_SERVER_CONFIG.inviteCodeLength).toBe(INVITE_CODE_LENGTH);
    expect(ONLINE.errCodeFormat).toBe(inviteCodeFormatHint(DEFAULT_SERVER_CONFIG.inviteCodeLength));
  });

  it('reads the real number for the default (4) and for a non-default length (6)', () => {
    expect(inviteCodeFormatHint(4)).toBe('Enter the 4 characters.');
    expect(inviteCodeFormatHint(6)).toBe('Enter the 6 characters.');
    // The old wording claimed a fixed "8 letters and numbers"; it must be gone.
    expect(ONLINE.errCodeFormat).not.toMatch(/letters and numbers/i);
    expect(ONLINE.errCodeFormat).toMatch(new RegExp(`\\b${DEFAULT_SERVER_CONFIG.inviteCodeLength}\\b`));
  });

  it('follows a configured invite length, not a fixed string', () => {
    const six = testConfig({ inviteCodeLength: 6 });
    expect(inviteCodeFormatHint(six.inviteCodeLength)).toBe('Enter the 6 characters.');
  });
});

// Same guarantee for the LINK-code copy: the Settings hint states the length, and that number is
// derived from `LINK_CODE_LENGTH`/`config.linkCodeLength`, so it can never be hard-coded or inherit
// the invite length by accident.
describe('the link-code help copy cannot drift from the configured length', () => {
  it('ties the server config and the player copy to the one shared link length', () => {
    expect(DEFAULT_SERVER_CONFIG.linkCodeLength).toBe(LINK_CODE_LENGTH);
    expect(LINK_CODE_LENGTH).toBe(8);
    expect(ONLINE.linkCodeHelp).toBe(linkCodeHelpText(DEFAULT_SERVER_CONFIG.linkCodeLength));
  });

  it('reads the real number for the default (8) and for a non-default length (12)', () => {
    expect(linkCodeHelpText(8)).toBe(
      'Creates a one-time 8-character code (10 minutes). It never moves your existing token.',
    );
    expect(linkCodeHelpText(12)).toBe(
      'Creates a one-time 12-character code (10 minutes). It never moves your existing token.',
    );
    expect(ONLINE.linkCodeHelp).toMatch(new RegExp(`\\b${DEFAULT_SERVER_CONFIG.linkCodeLength}\\b`));
    // It must describe the LINK length, not the invite length.
    expect(ONLINE.linkCodeHelp).not.toMatch(new RegExp(`\\b${DEFAULT_SERVER_CONFIG.inviteCodeLength}\\b`));
  });
});

// ---------------------------------------------------------------------------------------------
// The real Postgres adapter. Skipped (loudly) without DATABASE_URL; pinned by REQUIRE_DATABASE=1.
// ---------------------------------------------------------------------------------------------
const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const pgEnabled = DATABASE_URL.length > 0;

if (!pgEnabled) {
  console.warn('\n*** invite-code Postgres suite SKIPPED — DATABASE_URL is not set ***\n');
}
if (!pgEnabled && process.env.REQUIRE_DATABASE === '1') {
  throw new Error('invite-code Postgres suite: DATABASE_URL is not set (REQUIRE_DATABASE=1).');
}

const pgSuite = describe.skipIf(!pgEnabled);

let pool: PgPool | undefined;
let storage: Storage;
let pgService: MatchService;
const PLAYERS: string[] = [];
const MATCHES: string[] = [];

pgSuite('invite codes on the real Postgres adapter', () => {
  beforeAll(async () => {
    pool = poolFromUrl(DATABASE_URL, { max: 4 });
    await migrate(pool); // idempotent: the schema is already applied in practice
    storage = postgresStorage(pool);
    pgService = new MatchService({ storage, config: testConfig() });
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      if (MATCHES.length > 0) await pool.query('delete from matches where id = any($1::uuid[])', [MATCHES]);
      if (PLAYERS.length > 0) await pool.query('delete from players where id = any($1::uuid[])', [PLAYERS]);
    } finally {
      await (pool as unknown as { end?: () => Promise<void> }).end?.();
    }
  });

  const pgGuest = async (name: string) => {
    const g = await guest(pgService, name);
    PLAYERS.push(g.player.id);
    return g;
  };

  it('generates a 4-character code on real rows', async () => {
    const a = await pgGuest('PgLen-A');
    const created = await pgService.createMatch(a.player);
    MATCHES.push(created.match.matchId);
    expect(created.match.inviteCode).toHaveLength(DEFAULT_SERVER_CONFIG.inviteCodeLength);
  });

  it('retries a real unique violation on the invite path and succeeds with a fresh code', async () => {
    const a = await pgGuest('PgRetry-A');
    const first = await pgService.createMatch(a.player);
    MATCHES.push(first.match.matchId);
    forced.queue.push(first.match.inviteCode);

    const warn = silenceWarnings();
    const second = await pgService.createMatch(a.player);
    MATCHES.push(second.match.matchId);

    expect(second.match.inviteCode).not.toBe(first.match.inviteCode);
    expect(second.match.inviteCode).toHaveLength(DEFAULT_SERVER_CONFIG.inviteCodeLength);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    // Exactly the two successful rows exist: the colliding insert left nothing behind.
    expect(await storage.matchesOfPlayer(a.player.id)).toHaveLength(2);
  });

  it('fails clearly after the bounded attempts and writes no partial row on real rows', async () => {
    const a = await pgGuest('PgExhaust-A');
    const existing = await pgService.createMatch(a.player);
    MATCHES.push(existing.match.matchId);
    forced.queue.push(...Array.from({ length: MAX_INVITE_CODE_ATTEMPTS }, () => existing.match.inviteCode));

    const warn = silenceWarnings();
    await expectCode(pgService.createMatch(a.player), 'INTERNAL');
    warn.mockRestore();

    expect(await storage.matchesOfPlayer(a.player.id)).toHaveLength(1);
    expect(await storage.matchByInviteCode(existing.match.inviteCode)).not.toBeNull();
  });

  it('retries a real unique violation on the parked Find-Opponent path and succeeds with a fresh code', async () => {
    // The parked path only inserts a new row when there is nothing in the open queue to join, so
    // this precondition is asserted (loudly) rather than assumed on the shared live database.
    const open = await pool!.query(
      `select count(*)::int as n from matches m
        where m.status = 'waiting' and m.open_queue = true
          and (select count(*)::int from match_participants p where p.match_id = m.id) = 1`,
    );
    expect(Number(open.rows[0]?.n ?? 0), 'shared live open queue must be empty for the park retry test').toBe(0);

    const a = await pgGuest('PgPark-A');
    const invite = await pgService.createMatch(a.player); // invite-only: not in the queue
    MATCHES.push(invite.match.matchId);
    forced.queue.push(invite.match.inviteCode);

    const b = await pgGuest('PgPark-B');
    const warn = silenceWarnings();
    const parked = await pgService.findOpponent(b.player);
    MATCHES.push(parked.match.matchId);

    expect(parked.paired).toBe(false);
    expect(parked.match.status).toBe('waiting');
    expect(parked.match.inviteCode).not.toBe(invite.match.inviteCode);
    expect(parked.match.inviteCode).toHaveLength(DEFAULT_SERVER_CONFIG.inviteCodeLength);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('still resolves and joins an existing 8-character code (backwards compatible)', async () => {
    const host = await pgGuest('PgLegacy-Host');
    const created = await pgService.createMatch(host.player);
    MATCHES.push(created.match.matchId);
    const original = (await storage.matchById(created.match.matchId)) as MatchRecord;
    const legacy: MatchRecord = { ...original, id: newId(), inviteCode: 'ZY8K4M2P', openQueue: false };
    expect((await storage.createMatch(legacy)).ok).toBe(true);
    MATCHES.push(legacy.id);

    const joiner = await pgGuest('PgLegacy-Joiner');
    const joined = await pgService.joinMatch(joiner.player, ' zy8k-4m2p ');

    expect(joined.match.matchId).toBe(legacy.id);
    expect(joined.match.status).toBe('waiting');
    expect(joined.player.seat).toBe(0);
  });
});
