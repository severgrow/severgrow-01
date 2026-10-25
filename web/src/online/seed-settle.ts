// WHERE A FINISHED GAME'S SEEDS ARE ACTUALLY SETTLED (owner report, 2026-10-25: "on my account RYK
// after finishing level says 'Seeds pending verification' — that should never happen").
//
// This module exists because the settle path used to hang off the ONLINE LOBBY CONTROLLER
// (`onlineLobbyCtl?.syncSeedRewards()` in web/src/main.ts). The lobby is a dynamic import that only
// mounts after boot, so:
//
//   * `onlineLobbyCtl` was null whenever that import was slow or failed (a first visit on a poor
//     connection, or a chunk 404 after a deploy) — the optional chaining then did NOTHING, silently,
//     and the proof sat queued with the card still saying "pending";
//   * a player who never opened the online hub never triggered a settle from that surface either.
//
// The settle no longer depends on any screen being mounted: it builds its own client + identity on
// the same storage keys the lobby uses, and runs from the finish of a game. It also gives every
// attempt a DEADLINE and a small bounded retry, so a dead request becomes "try again in a moment",
// never a permanent wedge (the mechanism behind the report — see SEED_SETTLE_TIMEOUT_MS).
import { DuelClient, browserStorage } from '../../../server/src/client.js';
import type { KeyValue } from '../../../server/src/client.js';
import type { RewardResult } from '../../../server/src/seeds/types.js';
import { duelApiUrl, duelRegion } from './config.js';
import { createIdentityStore } from './identity.js';
import type { IdentityStore } from './identity.js';
import { flushSeedProofs, pendingSeedProofCount, SEED_SETTLE_TIMEOUT_MS } from './seed-rewards.js';
import type { SeedFlushResult } from './seed-rewards.js';

/**
 * Backoff between settle attempts, while the finish card is still open. `0` means the first attempt
 * happens at once; then three more, ending about 3 s later (plus at most one deadline each). A short
 * blip is absorbed here; anything longer leaves the line EMPTY and the proof queued, which is the
 * next honest thing — the menu settles it the moment the connection returns.
 */
export const SEED_RETRY_DELAYS_MS: readonly number[] = Object.freeze([700, 2_200]);

/** What a proof's settle came to, in the terms the finish card can honestly paint. */
export type SeedSettleReport =
  | { kind: 'settled'; reward: RewardResult }
  | { kind: 'refused'; message: string }
  /**
   * There is no usable identity on this device (a blocked store, a failed guest creation, or a token
   * the server rejected and could not be replaced). Nothing was sent and the proof is still queued —
   * but this is NOT "wait forever": the card says so, and the next pass (a sign-in, a reload) retries.
   */
  | { kind: 'unverified'; message: string }
  | { kind: 'deferred' };

export type SeedSettleDeps = {
  flush: (timeoutMs: number) => Promise<SeedFlushResult>;
  sleep?: (ms: number) => Promise<void>;
  delays?: readonly number[];
  onAttempt?: (attempt: number) => void;
  onError?: (error: unknown) => void;
};

/**
 * Settle ONE queued proof, retrying a bounded number of times.
 *
 * Pure apart from its injected deps, so the whole unhappy path is pinned without a browser: a dead
 * connection reports `deferred` (paint nothing), a refusal reports its reason (paint the calm line),
 * and a later attempt that works reports the award. Never throws, and never waits forever.
 */
export const settleQueuedProof = async (key: string, deps: SeedSettleDeps): Promise<SeedSettleReport> => {
  const delays = deps.delays ?? SEED_RETRY_DELAYS_MS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let unverified: string | null = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    deps.onAttempt?.(attempt);
    try {
      const result = await deps.flush(SEED_SETTLE_TIMEOUT_MS);
      const award = result.awards.find((entry) => entry.key === key);
      if (award) return { kind: 'settled', reward: award.reward };
      const refused = result.refused.find((entry) => entry.key === key);
      if (refused) return { kind: 'refused', message: refused.message };
      // A missing identity is retried (a guest creation can be a blip, and the next attempt is a fresh
      // one) but it must NOT end as a silent "deferred": if it is still missing after the bounded
      // retries, the card is told, and the proof is left queued for the next pass.
      unverified = result.unavailable?.message ?? null;
    } catch (error) {
      // A rejected pass is retryable: the queue still holds the proof, and the next call is fresh
      // (the single-flight entry is cleared when a pass settles).
      deps.onError?.(error);
      unverified = null;
    }
    if (attempt < delays.length) await sleep(delays[attempt] ?? 0);
  }
  return unverified ? { kind: 'unverified', message: unverified } : { kind: 'deferred' };
};

export type SeedConnection = { api: string; storage: KeyValue; client: DuelClient; identity: IdentityStore };
/** How a settle gets its client + identity. Test seam only; production always uses `seedConnection`. */
export type SeedConnector = () => SeedConnection | null;

let connection: SeedConnection | null = null;

/**
 * The one client + identity this module settles with. It reuses the lobby's storage keys, so an
 * identity the hub already minted (or recovered after a 401) is the one used here; a returning
 * player's queued proof is always paid to the account the device is actually signed in as.
 *
 * There is no per-request `onUnauthorized` hook: a hook would mint a fresh guest for EVERY proof in
 * the queue as each one hits the same dead token. `settlePendingSeeds` instead recovers ONCE, at the
 * pass level, exactly the way the hub does, and retries the whole queue with the replacement token.
 */
const seedConnection = (): SeedConnection | null => {
  const api = duelApiUrl();
  if (!api) return null;
  if (connection?.api === api) return connection;
  const storage = browserStorage();
  if (!storage) return null;
  const client = new DuelClient({ baseUrl: api, storage, ...(duelRegion() ? { region: duelRegion()! } : {}) });
  connection = { api, storage, client, identity: createIdentityStore({ client, storage }) };
  return connection;
};

/** One pass over every queued proof for this device's account. Empty result = nothing to do. */
export const settlePendingSeeds = async (
  timeoutMs = SEED_SETTLE_TIMEOUT_MS,
  connect: SeedConnector = seedConnection,
): Promise<SeedFlushResult> => {
  const seeds = connect();
  if (!seeds) {
    return {
      awards: [],
      refused: [],
      unavailable: { reason: 'storage', message: 'Seeds cannot be settled in this build.' },
    };
  }
  const status = await seeds.identity.ensure();
  if (!status.ok) {
    // No identity at all (storage blocked, or a guest could not be created). Say so instead of
    // returning an empty pass that the card would paint as NOTHING, which is the silent deferral
    // this module exists to end.
    return {
      awards: [],
      refused: [],
      unavailable: {
        reason: status.reason === 'storage_blocked' ? 'storage' : 'identity',
        message: status.message,
      },
    };
  }
  const first = await flushSeedProofs(seeds.storage, seeds.client, status.identity.token, { timeoutMs });
  if (!first.identityRejected) return first;
  // The stored token was rejected (401). The online hub recovers exactly this way — mint a fresh
  // guest on this device and write the shared identity key — so the settle must do the same, or a
  // stale token strands every queued proof forever while the hub quietly plays on a new identity.
  const recovered = await seeds.identity.recover();
  if (!recovered.ok) {
    return {
      ...first,
      unavailable: { reason: 'identity', message: recovered.message },
    };
  }
  // Retry the SAME queue with the replacement identity: nothing was paid, nothing was dropped.
  const second = await flushSeedProofs(seeds.storage, seeds.client, recovered.identity.token, { timeoutMs });
  // A pass could have paid an earlier proof before the token went bad; never lose that award from
  // the answer the finish card reads.
  return {
    awards: [...first.awards, ...second.awards],
    refused: [...first.refused, ...second.refused],
    ...(second.identityRejected ? { identityRejected: true as const } : {}),
    ...(second.unavailable ? { unavailable: second.unavailable } : {}),
  };
};

/**
 * Drain whatever this device is still owed, the moment the app is up (owner ask, 2026-10-25: "every
 * level of campaign and any other game should pay out seeds immediately").
 *
 * Until now the queue only moved on a FINISHED game or when the online hub mounted. A player whose
 * proofs were stranded by the old wedge (or by the Edge function refusing one replay) could close the
 * tab and never see a penny of them until they happened to win again. Paying them on the next visit
 * IS "immediately" from the player's side: the wallet is right the next time they look at it.
 *
 * Deliberately silent and fire-and-forget: it must never block the first paint, never throw, and
 * never mint an identity for a device with nothing queued (a first visit makes no network call).
 */
export const settleQueuedSeedsOnBoot = async (
  connect: SeedConnector = seedConnection,
): Promise<SeedFlushResult | null> => {
  try {
    const seeds = connect();
    if (!seeds || pendingSeedProofCount(seeds.storage) === 0) return null;
    return await settlePendingSeeds(SEED_SETTLE_TIMEOUT_MS, connect);
  } catch (error) {
    // The proof stays queued; the next finish, hub visit or reload tries again.
    console.warn('[FUTASAKU] could not settle the queued Seeds on boot:', error);
    return null;
  }
};

/**
 * A server-issued ticket makes a Training result verifiable (and therefore payable). Issued through
 * this module rather than the lobby, for the same reason the settle is: a training game started
 * before the hub finished mounting used to begin with no ticket at all, which meant no proof and no
 * payment for a game the player had already won.
 */
export const requestTrainingTicket = async (botLevel: number): Promise<{ id: string; seed: number } | null> => {
  const seeds = seedConnection();
  if (!seeds) return null;
  const status = await seeds.identity.ensure();
  if (!status.ok) return null;
  try {
    const ticket = await seeds.client.issueTrainingTicket(status.identity.token, botLevel);
    return { id: ticket.id, seed: ticket.seed };
  } catch {
    return null;
  }
};

/** Settle one proof from a finish card, reporting what to paint. Logs anything the player cannot see. */
export const settleSeedProof = (key: string): Promise<SeedSettleReport> =>
  settleQueuedProof(key, {
    flush: (timeoutMs) => settlePendingSeeds(timeoutMs),
    onError: (error) => {
      console.warn('[FUTASAKU] Seeds settle attempt failed, the proof stays queued:', error);
    },
  });
