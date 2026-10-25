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
import { flushSeedProofs, SEED_SETTLE_TIMEOUT_MS } from './seed-rewards.js';
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
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    deps.onAttempt?.(attempt);
    try {
      const result = await deps.flush(SEED_SETTLE_TIMEOUT_MS);
      const award = result.awards.find((entry) => entry.key === key);
      if (award) return { kind: 'settled', reward: award.reward };
      const refused = result.refused.find((entry) => entry.key === key);
      if (refused) return { kind: 'refused', message: refused.message };
    } catch (error) {
      // A rejected pass is retryable: the queue still holds the proof, and the next call is fresh
      // (the single-flight entry is cleared when a pass settles).
      deps.onError?.(error);
    }
    if (attempt < delays.length) await sleep(delays[attempt] ?? 0);
  }
  return { kind: 'deferred' };
};

type SeedConnection = { api: string; storage: KeyValue; client: DuelClient; identity: IdentityStore };

let connection: SeedConnection | null = null;

/**
 * The one client + identity this module settles with. It reuses the lobby's storage keys, so an
 * identity the hub already minted (or recovered after a 401) is the one used here; a returning
 * player's queued proof is always paid to the account the device is actually signed in as.
 *
 * Deliberately NO `onUnauthorized` recovery: minting a fresh guest in the middle of a payout would
 * move the Seeds to a new player. A rejected token defers instead, and the lobby's own recovery
 * (which writes the same key) settles it on the next pass.
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
export const settlePendingSeeds = async (timeoutMs = SEED_SETTLE_TIMEOUT_MS): Promise<SeedFlushResult> => {
  const seeds = seedConnection();
  if (!seeds) return { awards: [], refused: [] };
  const status = await seeds.identity.ensure();
  if (!status.ok) return { awards: [], refused: [] };
  return flushSeedProofs(seeds.storage, seeds.client, status.identity.token, { timeoutMs });
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
