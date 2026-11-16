// WHICH PLAYER A FINISHED GAME'S SEEDS ARE PAID TO (owner report, 2026-10-25: "every level of
// campaign and any other game should pay out seeds immediately").
//
// The settle builds its own client + identity (online/seed-settle.ts). That is only safe if it reads
// the SAME identity the online hub reads: `severgrow.duel.identity.v1`, on the channel-prefixed
// browser storage. These pin the answer for every case the owner asked about, through the REAL
// settle + identity store against a fake storage and a fake fetch — no network, no browser:
//
//   * signed in as an account  -> the ACCOUNT token pays; no guest is ever minted;
//   * never signed in          -> a guest is minted once, and it pays;
//   * a proof earned as a guest, then signed in -> it settles under the ACCOUNT (the device's
//     identity at settle time), never stranded on an abandoned guest;
//   * a rejected token         -> recovered ONCE on this device (the hub's own self-heal), and the
//     queue is paid to the replacement; with no replacement the proof stays queued, never dropped.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import { createIdentityStore, IDENTITY_STORAGE_KEY } from '../src/online/identity.js';
import { PENDING_SEED_PROOFS_KEY, pendingSeedProofCount, queueSeedProof } from '../src/online/seed-rewards.js';
import type { SeedConnection } from '../src/online/seed-settle.js';
import { settlePendingSeeds, settleQueuedSeedsOnBoot } from '../src/online/seed-settle.js';

const API = 'https://duel.test/functions/v1/duel';
const account = { token: 'account-token', playerId: 'acct-player', displayName: 'RYK', kind: 'account' as const };
const guest = { token: 'guest-token', playerId: 'guest-player', displayName: 'Sprout', kind: 'guest' as const };
const proof = { kind: 'campaign' as const, levelId: 'c4-33', actions: [], botVersion: 'bots-v0.10' };

type Call = { method: string; path: string; token: string | null };
type Answer = { status: number; body: unknown };

let calls: Call[] = [];
let answer: (call: Call) => Answer;

const storage = (): KeyValue => {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
};

const fetchImpl: FetchLike = async (url, init) => {
  const parsed = new URL(url);
  const headers = (init.headers ?? {}) as Record<string, string>;
  const raw = headers.authorization ?? headers.Authorization;
  const call: Call = {
    method: init.method ?? 'GET',
    path: parsed.pathname,
    token: typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : null,
  };
  calls.push(call);
  const out = answer(call);
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json' } });
};

/** Wired exactly like `seedConnection()`: one client + one identity store over the SAME storage. */
const connection = (store: KeyValue): SeedConnection => {
  const client = new DuelClient({ baseUrl: API, storage: store, fetch: fetchImpl, testTraffic: false });
  return { api: API, storage: store, client, identity: createIdentityStore({ client, storage: store }) };
};

const settle = (store: KeyValue) => settlePendingSeeds(undefined, () => connection(store));
const boot = (store: KeyValue) => settleQueuedSeedsOnBoot(() => connection(store));

beforeEach(() => {
  calls = [];
  answer = (call) => {
    if (call.path.endsWith('/v1/guests')) {
      return { status: 201, body: { token: guest.token, player: { id: guest.playerId, displayName: guest.displayName, kind: 'guest' } } };
    }
    if (call.path.endsWith('/v1/seeds/campaign') || call.path.endsWith('/v1/seeds/training')) {
      return {
        status: 200,
        body: {
          ok: true,
          reward: {
            awarded: 20, reason: null, replayed: false,
            wallet: { balance: 20, lifetimeEarned: 20, lifetimeSpent: 0, worldInvitationSeen: false },
          },
        },
      };
    }
    return { status: 404, body: { ok: false, code: 'NOT_FOUND', message: 'no route' } };
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the settle pays the identity that is actually playing', () => {
  it('signed in as an account: the account token pays, and no guest is minted', async () => {
    const store = storage();
    store.set(IDENTITY_STORAGE_KEY, JSON.stringify(account));
    queueSeedProof(store, proof);

    const result = await settle(store);

    expect(result.awards.map((entry) => entry.key)).toEqual(['campaign:c4-33']);
    expect(calls.map((call) => call.path)).toEqual(['/functions/v1/duel/v1/seeds/campaign']);
    expect(calls[0]!.token).toBe(account.token);
    expect(calls.some((call) => call.path.endsWith('/v1/guests'))).toBe(false);
    expect(store.get(IDENTITY_STORAGE_KEY)).toBe(JSON.stringify(account));
  });

  it('never signed in: one guest pays the proof, and the device keeps it', async () => {
    const store = storage();
    queueSeedProof(store, proof);

    await settle(store);

    expect(calls.map((call) => call.path)).toEqual([
      '/functions/v1/duel/v1/guests',
      '/functions/v1/duel/v1/seeds/campaign',
    ]);
    expect(calls[1]!.token).toBe(guest.token);
    expect(JSON.parse(store.get(IDENTITY_STORAGE_KEY) ?? '{}').playerId).toBe(guest.playerId);
  });

  it('a proof earned as a guest settles under the account after signing in', async () => {
    // The reverse case: the game was played as a guest, then the player signed in. The proof must not
    // stay on an abandoned guest — the device's CURRENT identity is the player the wallet belongs to.
    const store = storage();
    store.set(IDENTITY_STORAGE_KEY, JSON.stringify(guest));
    queueSeedProof(store, proof);
    store.set(IDENTITY_STORAGE_KEY, JSON.stringify(account)); // sign-in writes the same key

    const result = await settle(store);

    expect(result.awards.map((entry) => entry.key)).toEqual(['campaign:c4-33']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.token).toBe(account.token);
  });

  it('a rejected token is recovered ONCE on this device, and the queue pays the replacement', async () => {
    // A 401 means the stored token is dead. The hub self-heals exactly this way (discard, mint a
    // guest, write the shared key), so the settle does the same — otherwise a campaign player who
    // never opens the hub would keep every proof queued forever. The proof is NEVER dropped, and it
    // is paid to the identity this device now holds.
    const store = storage();
    store.set(IDENTITY_STORAGE_KEY, JSON.stringify(account));
    queueSeedProof(store, proof);
    answer = (call) => {
      if (call.path.endsWith('/v1/guests')) {
        return { status: 201, body: { token: guest.token, player: { id: guest.playerId, displayName: guest.displayName, kind: 'guest' } } };
      }
      if (call.path.endsWith('/v1/seeds/campaign')) {
        if (call.token === account.token) return { status: 401, body: { ok: false, code: 'UNAUTHORIZED', message: 'That device token is not valid.' } };
        return {
          status: 200,
          body: { ok: true, reward: { awarded: 20, reason: null, replayed: false, wallet: { balance: 20, lifetimeEarned: 20, lifetimeSpent: 0, worldInvitationSeen: false } } },
        };
      }
      return { status: 404, body: { ok: false, code: 'NOT_FOUND', message: 'no route' } };
    };

    const result = await settle(store);

    expect(result.awards.map((entry) => entry.key)).toEqual(['campaign:c4-33']);
    expect(calls.filter((call) => call.path.endsWith('/v1/guests'))).toHaveLength(1);
    expect(calls.filter((call) => call.path.endsWith('/v1/seeds/campaign')).map((call) => call.token))
      .toEqual([account.token, guest.token]);
    expect(pendingSeedProofCount(store)).toBe(0);
    expect(JSON.parse(store.get(IDENTITY_STORAGE_KEY) ?? '{}').playerId).toBe(guest.playerId);
  });

  it('a rejected token with no replacement keeps the proof queued and never drops it', async () => {
    const store = storage();
    store.set(IDENTITY_STORAGE_KEY, JSON.stringify(account));
    queueSeedProof(store, proof);
    answer = (call) => {
      if (call.path.endsWith('/v1/guests')) return { status: 503, body: { ok: false, code: 'UNAVAILABLE', message: 'down' } };
      return { status: 401, body: { ok: false, code: 'UNAUTHORIZED', message: 'That device token is not valid.' } };
    };

    const result = await settle(store);

    expect(result.awards).toEqual([]);
    expect(pendingSeedProofCount(store)).toBe(1);
    // One replacement attempt, not one per queued proof.
    expect(calls.filter((call) => call.path.endsWith('/v1/guests'))).toHaveLength(1);
  });

  it('reads the SAME storage key as the hub, so the two can never pick different players', () => {
    // The production connector, not the test one: `browserStorage()` is the channel-prefixed
    // localStorage the lobby and the accounts screen write, and `createIdentityStore` reads
    // `severgrow.duel.identity.v1` on it. There is no second key for a payout to hide on.
    const settleSource = readFileSync(fileURLToPath(new URL('../src/online/seed-settle.ts', import.meta.url)), 'utf8');
    expect(settleSource).toMatch(/const storage = browserStorage\(\);/);
    expect(settleSource).toMatch(/createIdentityStore\(\{ client, storage \}\)/);
    expect(settleSource).not.toMatch(/IDENTITY_STORAGE_KEY\s*[:=]\s*['"]/);
  });

  it('the app start really drains the queue, so a stranded proof is paid on the next visit', () => {
    // The wiring that makes the recovery real: without this line nothing moves a proof left behind
    // by a finish card that could not reach the server, until the player wins another game.
    const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
    // (Name by name, so a later import from the same module never breaks the check.)
    const settleImport = /import \{([^}]*)\} from '\.\/online\/seed-settle\.js';/.exec(main)?.[1] ?? '';
    // (OWNER RULE CHANGE 2026-11-16: the Practice tap no longer waits on a ticket, so the wait-budget
    // helpers seedIdentityWarm / trainingTicketWaitMs are no longer wired into the start.)
    for (const name of ['requestTrainingTicket', 'settleQueuedSeedsOnBoot', 'warmSeedIdentity', 'settleSeedProof']) {
      expect(settleImport, name).toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(main).toMatch(/void settleQueuedSeedsOnBoot\(\);/);
    // The boot warm-up, and the tier's ticket chained behind it: an identity is warmed for the NEXT
    // Practice match, and the shelf fill is requested only once that identity exists.
    expect(main).toMatch(/void warmSeedIdentity\(\)[\s\S]{0,200}warmTicketShelfAtBoot\(\)/);
  });

  // OWNER RULE CHANGE (2026-11-16: Practice "should be nearly instant"; asked, he chose the campaign's
  // random-deal method). This replaces "a Training start waits long enough for a cold guest mint": the
  // tap waited up to 3 s (8 s on a new device) for a ticket, measured at 3.3 s / 9.4 s on /test. Now a
  // tap with no ticket on the shelf deals at once and the proof names its deal; nothing waits.
  it('a Practice start never waits on the network: with no ticket, the phone deals and the proof names the deal', () => {
    const settle = readFileSync(fileURLToPath(new URL('../src/online/seed-settle.ts', import.meta.url)), 'utf8');
    const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
    expect(settle).toMatch(/export const warmSeedIdentity/);
    expect(main, 'no ticket on the shelf: this game is the deal').toMatch(/const deal = !ready && difficulty && onlineBuildEnabled\(\) && !IS_TEST \? \{ seed, botLevel: level \} : null;/);
    expect(main, 'the tap does not wait for a ticket').not.toMatch(/trainingTicketWaitMs\(|await ticketP|ensureShelfTicket\(/);
    expect(main, 'the finished game sends its deal').toMatch(/kind: 'training' as const, deal: trainingRewardDeal/);
    expect(main, 'a resumed dealt game keeps its deal').toMatch(/trainingRewardDeal = gameDifficulty && !trainingRewardTicketId && ticket\?\.seed === saved\.seed/);
  });

  it('only a cold guest mint gets the long wait; a warm identity starts Practice within 3 s (review, 0.84)', async () => {
    // The long wait covers minting a guest on a cold Edge. Once the boot warm-up has an identity,
    // the ticket is one request: a tap must not leave the player on a dead button for 8 s.
    const { trainingTicketWaitMs, TRAINING_TICKET_WAIT_MS, TRAINING_TICKET_WARM_WAIT_MS } = await import('../src/online/seed-settle.js');
    expect(TRAINING_TICKET_WARM_WAIT_MS).toBe(3_000);
    expect(trainingTicketWaitMs(true)).toBe(TRAINING_TICKET_WARM_WAIT_MS);
    expect(trainingTicketWaitMs(false)).toBe(TRAINING_TICKET_WAIT_MS);
  });
});

describe('a stranded proof drains on the next app start', () => {
  it('a device with nothing queued makes no request at all', async () => {
    const result = await boot(storage());
    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });

  it('a queued proof is paid on boot, before any game is played', async () => {
    const store = storage();
    store.set(IDENTITY_STORAGE_KEY, JSON.stringify(account));
    queueSeedProof(store, proof);
    expect(pendingSeedProofCount(store)).toBe(1);

    const result = await boot(store);

    expect(result?.awards.map((entry) => entry.key)).toEqual(['campaign:c4-33']);
    expect(pendingSeedProofCount(store)).toBe(0);
    expect(store.get(PENDING_SEED_PROOFS_KEY) ?? '[]').toBe('[]');
    expect(calls[0]!.token).toBe(account.token);
  });

  it('never throws when the boot pass fails, so first paint is never blocked', async () => {
    const store = storage();
    store.set(IDENTITY_STORAGE_KEY, JSON.stringify(account));
    queueSeedProof(store, proof);
    answer = () => { throw new Error('the network is gone'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await boot(store);

    expect(result?.awards).toEqual([]);
    expect(pendingSeedProofCount(store)).toBe(1);
    // A failed transport is not an exception at the top level; the queue keeps the proof.
    expect(warn).not.toHaveBeenCalled();
  });
});

// ONE GUEST PER DEVICE, EVEN WITH TWO IDENTITY STORES (2026-11-16, measured on /test against the live
// server: a fresh device sent TWO `POST /v1/guests` within 250 ms at boot, the Seeds settle's store and
// the lobby's store each minting its own; the second overwrote the first, and while the server held
// those requests the first Practice tap waited 9.3 s). A second store waits for the mint already on its
// way and takes the identity it stored.
describe('two identity stores on one device', () => {
  it('mint ONE guest between them, and both get it', async () => {
    const store = storage();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slowFetch: FetchLike = async (url, init) => { await gate; return fetchImpl(url, init); };
    const a = createIdentityStore({ client: new DuelClient({ baseUrl: API, storage: store, fetch: slowFetch, testTraffic: false }), storage: store });
    const b = createIdentityStore({ client: new DuelClient({ baseUrl: API, storage: store, fetch: slowFetch, testTraffic: false }), storage: store });
    const first = a.ensure(), second = b.ensure();
    release();
    const [ra, rb] = await Promise.all([first, second]);
    expect(calls.filter((c) => c.path.endsWith('/v1/guests')), 'one guest request for the device').toHaveLength(1);
    expect(ra.ok && rb.ok).toBe(true);
    if (ra.ok && rb.ok) expect(rb.identity.playerId).toBe(ra.identity.playerId);
  });
  it('a store on ANOTHER storage still mints its own (separate devices are not merged)', async () => {
    const a = createIdentityStore({ client: new DuelClient({ baseUrl: API, storage: storage(), fetch: fetchImpl, testTraffic: false }), storage: storage() });
    const b = createIdentityStore({ client: new DuelClient({ baseUrl: API, storage: storage(), fetch: fetchImpl, testTraffic: false }), storage: storage() });
    await Promise.all([a.ensure(), b.ensure()]);
    expect(calls.filter((c) => c.path.endsWith('/v1/guests'))).toHaveLength(2);
  });
});
