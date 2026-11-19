import type { Action } from '../../../src/engine/index.js';
import { BOT_VERSIONS, CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { DuelError } from '../../../server/src/client.js';
import type { DuelClient, KeyValue } from '../../../server/src/client.js';
import type { RewardResult } from '../../../server/src/seeds/types.js';

export const PENDING_SEED_PROOFS_KEY = 'severgrow.seeds.pending.v1';
export type PendingSeedProof =
  /** `dealSeed`: the random deal the win was played on (levels 11+, owner 2026-11-01); absent = the fixed deal. */
  | { kind: 'campaign'; levelId: string; dealSeed?: number; actions: readonly Action[]; botVersion: string }
  | { kind: 'training'; ticketId: string; actions: readonly Action[]; botVersion: string }
  /**
   * A Practice game the phone dealt with no ticket in hand (owner, 2026-11-16: instant Practice). The
   * server issues the matching ticket when this arrives (`deal`, server/src/seeds/service.ts
   * dealTicket); it is sent only to a server that lists TRAINING_DEALS in its health features.
   */
  | { kind: 'training'; deal: { seed: number; botLevel: number }; actions: readonly Action[]; botVersion: string };

/** The health feature a server lists when it accepts `deal` proofs (server/src/fetch-app.ts). */
export const TRAINING_DEALS = 'training-deals';

/**
 * How long ONE settle attempt may take before it is treated as a retryable failure.
 *
 * Owner report, 2026-10-25: the finish card sat on "Seeds pending verification" forever. The
 * mechanism was a fetch that never settles — mobile Safari does it when a tab is backgrounded
 * mid-request, and a dead/captive connection does it everywhere — combined with the single-flight
 * map below, whose entry was only cleared by `.finally`. A hung request never rejected, so the
 * entry never cleared, every later call got the same dead promise back, and no proof was ever
 * settled again for that session. The server took ~0.3 s for a real level-10 win, so five seconds
 * is generous for the honest path and short enough that a wedge is a retry, not a hang.
 */
export const SEED_SETTLE_TIMEOUT_MS = 5_000;

/**
 * A random deal's seed: a whole 32-bit unsigned number. The same rule as the campaign's `isDealSeed`,
 * written out because the online layer never imports the campaign module (campaign-seam.test.ts).
 */
const isDealSeed = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/**
 * WHO EARNED IT (owner, 2026-11-18, accounts pass: "queued wins belong to the account that earned
 * them ... never pays someone else"). A queued proof carries the player signed in when it was won;
 * a pass only sends the proofs of the player it is sending as. Signing out or switching accounts
 * leaves the others queued until their own player is back on this device. A proof queued before
 * this (no owner) goes to whoever is signed in, as it always did.
 */
type Owned = { owner?: string };
const IDENTITY_KEY = 'severgrow.duel.identity.v1';
const signedInPlayer = (storage: KeyValue): string | null => {
  try {
    const id = JSON.parse(storage.get(IDENTITY_KEY) ?? 'null') as { playerId?: unknown } | null;
    return typeof id?.playerId === 'string' ? id.playerId : null;
  } catch { return null; }
};
const ownerOf = (p: PendingSeedProof): string | null => {
  const o = (p as Owned).owner;
  return typeof o === 'string' && o.length > 0 ? o : null;
};
const belongsTo = (p: PendingSeedProof, owner: string | null | undefined): boolean => {
  const o = ownerOf(p);
  return !o || !owner || o === owner;
};

const proofKey = (p: PendingSeedProof) =>
  p.kind === 'campaign' ? `campaign:${p.levelId}`
    : 'ticketId' in p ? `training:${p.ticketId}` : `training-deal:${p.deal.seed}`;
/** The key a finished game's proof is settled under (the finish card asks for its own). */
export const seedProofKey = proofKey;
const isBotLevelNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;
const isPendingProof = (value: unknown): value is PendingSeedProof => {
  if (!value || typeof value !== 'object') return false;
  const proof = value as Record<string, unknown>;
  if (!Array.isArray(proof.actions)) return false;
  return (proof.kind === 'campaign' && typeof proof.levelId === 'string' && proof.levelId.length > 0
      && (proof.dealSeed === undefined || isDealSeed(proof.dealSeed)))
    || (proof.kind === 'training' && typeof proof.ticketId === 'string' && proof.ticketId.length > 0)
    || (proof.kind === 'training' && proof.ticketId === undefined && !!proof.deal && typeof proof.deal === 'object'
      && isDealSeed((proof.deal as Record<string, unknown>).seed) && isBotLevelNumber((proof.deal as Record<string, unknown>).botLevel));
};
const read = (storage: KeyValue): PendingSeedProof[] => {
  try {
    const data: unknown = JSON.parse(storage.get(PENDING_SEED_PROOFS_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(isPendingProof) : [];
  } catch { return []; }
};
const write = (storage: KeyValue, pending: PendingSeedProof[]) => storage.set(PENDING_SEED_PROOFS_KEY, JSON.stringify(pending));

/** Whether the proof with this key (`campaign:c1-4`…) is still waiting for the server. */
export const isSeedProofQueued = (storage: KeyValue, key: string): boolean => read(storage).some((p) => proofKey(p) === key);

/** How many real proofs this device is still owed. Zero means a boot has nothing to ask the server. */
export const pendingSeedProofCount = (storage: KeyValue): number => read(storage).length;

/**
 * How many proofs in a row may fail WITHOUT THE SERVER ANSWERING (offline, a deadline, a dropped
 * connection) before a pass gives up for this attempt.
 *
 * Owner report, 2026-10-25 ("I'm on level 33 and haven't been getting seeds"): the queue is drained
 * oldest-first, and the pass used to stop at the FIRST transient failure — so one proof the server
 * would not settle (measured here: a 5xx the Edge runtime answers, e.g. a 546 CPU limit, or a
 * timeout) was a permanent wall for every first clear queued behind it. No request, no receipt, no
 * Seeds for any of them.
 *
 * Only a DEAD LINE stops a pass now, and only after this many in a row: a connection that never
 * answers must not stack a 5 s deadline per proof (up to ~22 proofs), which is what the original
 * `break` protected. A server that ANSWERS — even with a 5xx — does not stop it; the loop steps over
 * that proof and tries the next one. The failed proof stays queued, so it is retried on the next pass.
 */
export const MAX_CONSECUTIVE_TRANSIENT = 2;

/** Pending is never spendable; only the server wallet can report earned Seeds. */
export const queueSeedProof = (storage: KeyValue, input: PendingSeedProof): void => {
  const owner = signedInPlayer(storage);
  const proof = { ...input, botVersion: input.botVersion || CURRENT_BOT_VERSION, ...(owner ? { owner } : {}) } as PendingSeedProof;
  const pending = read(storage).filter((v) => proofKey(v) !== proofKey(proof));
  pending.push(proof);
  // First clears are irreplaceable while offline. A queue limit must never silently erase one.
  write(storage, pending);
};

/**
 * The proofs `from` earned now belong to `to`: a guest merged into the account it signed into, or a
 * dead identity this device recovered. Nothing else ever changes an owner.
 */
export const retagSeedProofs = (storage: KeyValue, from: string, to: string): void => {
  if (!from || !to || from === to) return;
  const pending = read(storage);
  if (!pending.some((p) => ownerOf(p) === from)) return;
  write(storage, pending.map((p) => (ownerOf(p) === from ? ({ ...p, owner: to } as unknown as PendingSeedProof) : p)));
};

/** What ONE pass over the queue did — including the proofs it had to give up on. */
export type SeedFlushResult = {
  awards: { key: string; reward: RewardResult }[];
  /**
   * Proofs the server refused for good (HTTP 400). They are removed from the queue, so this is the
   * only trace they leave: the finish card must say so rather than let the Seeds vanish silently.
   */
  refused: { key: string; message: string }[];
  /**
   * The stored account token was REJECTED (401) and no replacement was available. Nothing was paid,
   * nothing was dropped; the proof is still queued. The settle reports this to the card instead of
   * calling it "try again later forever" (owner report, 2026-10-25).
   */
  identityRejected?: true;
  /**
   * Nothing could even be ATTEMPTED because this device has no usable identity (storage blocked, or
   * guest creation failed). Distinct from an offline line: retrying will not fix a blocked store, and
   * the card must say so rather than stay silent.
   */
  unavailable?: { reason: 'identity' | 'storage'; message: string };
};

export const emptyFlushResult = (): SeedFlushResult => ({ awards: [], refused: [] });

const removeSettledProof = (storage: KeyValue, proof: PendingSeedProof) => {
  // A player may finish a newer replay of the same level while this request is in flight.
  const sent = JSON.stringify(proof);
  write(storage, read(storage).filter((current) => JSON.stringify(current) !== sent));
};

/**
 * One submit, bounded in TIME. The abort is what frees the connection; the race is what makes the
 * promise settle even if the transport ignores the signal (a wedged fetch never rejects on its own).
 * Scoped to the seed proof on purpose: other game requests keep their own transport behaviour, and
 * a slow match read must still be allowed to finish.
 */
const submitWithDeadline = async (
  client: DuelClient,
  token: string,
  proof: PendingSeedProof,
  timeoutMs: number,
): Promise<RewardResult> => {
  const source = proof.kind === 'campaign'
    ? (proof.dealSeed === undefined ? { levelId: proof.levelId } : { levelId: proof.levelId, dealSeed: proof.dealSeed })
    : 'ticketId' in proof ? { ticketId: proof.ticketId } : { deal: { seed: proof.deal.seed, botLevel: proof.deal.botLevel } };
  // SLICED CHECKS (owner report, 2026-11-12: Seeds for levels 80 and 81 never arrived). The server
  // replays every bot move, and a long or rival game can take longer than one Edge request may run.
  // So the proof is sent `resumable`: the server answers with a resume token until it is done, and
  // each ROUND gets its own deadline (the whole check may take several), up to MAX_PROOF_ROUNDS.
  let resume: string | undefined;
  for (let round = 0; round < MAX_PROOF_ROUNDS; round++) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const submit = client.submitSeedProof(token, source, proof.actions, proof.botVersion, {
      ...(controller ? { signal: controller.signal } : {}), resumable: true, ...(resume ? { resume } : {}),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let answer: Awaited<typeof submit>;
    try {
      answer = await Promise.race([
        submit,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller?.abort();
            reject(new DuelError('TIMEOUT', 'The Seeds request did not answer in time.', 0));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      // Whatever lost the race must never surface as an unhandled rejection later.
      void submit.catch(() => undefined);
    }
    if (answer && typeof (answer as { resume?: unknown }).resume === 'string') {
      resume = (answer as { resume: string }).resume;
      continue;
    }
    return answer as RewardResult;
  }
  throw new DuelError('TIMEOUT', 'The Seeds check took too many rounds.', 0);
};

/** A proof check never takes more rounds than this (a slice is ~1.2 s of server time). */
export const MAX_PROOF_ROUNDS = 12;

/**
 * Single-flight per storage + account, WITHOUT the wedge. An entry remembers every proof its pass
 * has tried (`attempted`) and whether its drain loop has exited (`drained`), which is what makes
 * reuse safe:
 *
 *   * a proof queued after this pass started is not in that set, so the caller gets a fresh pass
 *     (chained behind the running one) instead of an answer that predates its proof;
 *   * a pass that has STOPPED draining can never be handed to a caller again, so the narrow
 *     "was queued between the last read and the promise resolving" race has nowhere to hide;
 *   * the entry is dropped when the pass settles, so a failed pass can never be reused;
 *   * a pass can no longer outlive a dead connection: each submit has `SEED_SETTLE_TIMEOUT_MS`.
 */
type FlushEntry = { promise: Promise<SeedFlushResult>; attempted: Set<string>; drained: boolean };
const flushes = new WeakMap<KeyValue, Map<string, FlushEntry>>();

const mergeResults = (first: SeedFlushResult, second: SeedFlushResult): SeedFlushResult => {
  const awards = new Map(first.awards.map((entry) => [entry.key, entry] as const));
  for (const entry of second.awards) awards.set(entry.key, entry);
  const refused = new Map(first.refused.map((entry) => [entry.key, entry] as const));
  for (const entry of second.refused) refused.set(entry.key, entry);
  return {
    awards: [...awards.values()],
    refused: [...refused.values()],
    ...(first.identityRejected || second.identityRejected ? { identityRejected: true as const } : {}),
    ...(first.unavailable || second.unavailable ? { unavailable: second.unavailable ?? first.unavailable } : {}),
  };
};

export const flushSeedProofs = (
  storage: KeyValue,
  client: DuelClient,
  token: string,
  /** `owner`: the player this pass sends as; only that player's proofs (and unowned ones) are sent. */
  options: { timeoutMs?: number; owner?: string | null } = {},
): Promise<SeedFlushResult> => {
  let accounts = flushes.get(storage);
  if (!accounts) { accounts = new Map(); flushes.set(storage, accounts); }
  const existing = accounts.get(token);
  if (existing && !existing.drained) {
    const queued = read(storage);
    // This pass is still draining, so it re-reads the queue after every submit: everything queued
    // when it started is covered. Anything it has not even seen is chained behind it.
    if (queued.every((proof) => !belongsTo(proof, options.owner) || existing.attempted.has(JSON.stringify(proof)))) return existing.promise;
    return existing.promise.then((first) => flushSeedProofs(storage, client, token, options)
      .then((next) => mergeResults(first, next)));
  }
  // No entry, or one whose loop has finished (it may not have seen a proof queued after its last
  // read). Both cases start a fresh pass, which replaces any stale entry.
  const attempted = new Set<string>();
  const entry: FlushEntry = { promise: Promise.resolve(emptyFlushResult()), attempted, drained: false };
  const timeoutMs = options.timeoutMs ?? SEED_SETTLE_TIMEOUT_MS;
  const promise = (async (): Promise<SeedFlushResult> => {
    const result = emptyFlushResult();
    /**
     * The queue is DRAINED, not snapshotted (owner report, 2026-10-24: "seeds pending"). A player can
     * win the next level while this very flush is still in flight; a snapshot taken once at the top
     * left that proof queued, and the caller's `.find(key)` then found nothing, so the finish card
     * sat on "Seeds pending verification" for a reward that was already safe. Re-reading the queue
     * each pass pays whatever arrived meanwhile, and the promise only resolves once it is empty (or
     * transiently blocked), so every caller sees its own key in the answer.
     *
     * `attempted` is the run's memory of proofs it must NOT re-attempt: a kept-but-unpayable one (the
     * final lesson on a server without its verifier, or a replay the server's runtime keeps failing)
     * would otherwise be resubmitted forever. New replays are different objects, so they are still
     * picked up.
     *
     * A failure where the server DID answer steps over that proof (`MAX_CONSECUTIVE_TRANSIENT`); only
     * a line that never answers stops the pass. Stopping at the first bad proof let one unpayable
     * entry withhold every first clear queued behind it (owner report, 2026-10-25: level 33).
     */
    let transient = 0;
    // A NEWER BOT WAITS FOR A SERVER THAT KNOWS IT (bots-v0.11, 2026-11-04). A server verifies a
    // replay by replaying the bot of the proof's version; one not yet redeployed would refuse a proof
    // against a newer bot with a final 400, and the Seeds would be gone. So such a proof is sent only
    // once the server lists that version in its health `features`; until then it stays queued.
    let features: Promise<readonly string[]> | null = null;
    const serverKnows = async (version: string): Promise<boolean> => {
      // Only the NEWEST bot can be one a server has not learned yet; every older version (v0.10, v0.11)
      // was live before it, so its proofs are sent as they always were. (Unknown names are sent too:
      // the server answers for them.)
      if (version !== CURRENT_BOT_VERSION || !Object.hasOwn(BOT_VERSIONS, version)) return true;
      features ??= (async () => {
        try {
          const ask = client.serverFeatures();
          const timeout = new Promise<readonly string[]>((resolve) => setTimeout(() => resolve([]), Math.min(timeoutMs, 5_000)));
          return await Promise.race([ask, timeout]);
        } catch { return []; }
      })();
      return (await features).includes(version);
    };
    /** A deal proof goes only to a server that accepts deals; until then it stays queued, unpaid, unlost. */
    const serverTakesDeals = async (): Promise<boolean> => {
      features ??= (async () => {
        try {
          const ask = client.serverFeatures();
          const timeout = new Promise<readonly string[]>((resolve) => setTimeout(() => resolve([]), Math.min(timeoutMs, 5_000)));
          return await Promise.race([ask, timeout]);
        } catch { return []; }
      })();
      return (await features).includes(TRAINING_DEALS);
    };
    for (;;) {
      const next = read(storage).find((proof) => belongsTo(proof, options.owner) && !attempted.has(JSON.stringify(proof)));
      if (!next) break;
      const sent = JSON.stringify(next);
      attempted.add(sent);
      if (!(await serverKnows(next.botVersion))) continue;
      if (next.kind === 'training' && !('ticketId' in next) && !(await serverTakesDeals())) continue;
      const key = proofKey(next);
      try {
        const reward = await submitWithDeadline(client, token, next, timeoutMs);
        result.awards.push({ key, reward });
        removeSettledProof(storage, next);
        transient = 0;
      } catch (error) {
        // Invalid/expired proofs cannot become valid later; transient network errors keep the
        // locally queued replay so the next menu visit can retry it.
        // The final lesson's proof (`lesson-10`) can reach a server not yet redeployed with its
        // verifier: that server answers "not available". Keep it, so the 100 Seeds land once the
        // server knows the lesson (owner, 2026-10-24); any other refusal is final.
        const unknownLesson = error instanceof DuelError && error.status === 400 && next.kind === 'campaign'
          && next.levelId.startsWith('lesson-') && /not available/i.test(error.message);
        if (unknownLesson) continue;
        // The ACCOUNT was rejected, not this replay. No identity means no proof can be settled, so
        // the pass stops at once and reports it: the caller recovers (or the card says so) instead of
        // retrying every queued proof against the same dead token and calling the result "deferred".
        if (error instanceof DuelError && (error.status === 401 || error.code === 'UNAUTHORIZED')) {
          result.identityRejected = true;
          break;
        }
        if (error instanceof DuelError && error.status === 400) {
          // Final: the server will never accept this replay. Drop it, and REPORT it — a proof that
          // disappears without a word is a player's Seeds disappearing without a word.
          removeSettledProof(storage, next);
          result.refused.push({ key, message: error.message });
          transient = 0; // the server answered: the line is alive, whatever it said about this proof
          continue;
        }
        // The server ANSWERED but did not settle this proof (a 5xx — including the Edge runtime's
        // 546 CPU limit — a 429, or any other refusal this build does not know). The proof stays
        // queued, and the line is alive, so the pass moves on to the NEXT one: one such proof must
        // never withhold every first clear behind it in the oldest-first queue.
        if (error instanceof DuelError && error.status > 0) {
          transient = 0;
          continue;
        }
        // No answer at all (offline, a deadline, a dropped connection): retrying down a queue on a
        // dead line only stacks a 5 s deadline per proof, so stop after a couple in a row. Everything
        // stays queued for the next attempt.
        transient += 1;
        if (transient >= MAX_CONSECUTIVE_TRANSIENT) break;
        continue;
      }
    }
    // The loop has exited: from this instant the pass can no longer see anything new, so no caller
    // may be handed it again (see `FlushEntry.drained`). Synchronous with the last read — nothing
    // can be queued in between.
    entry.drained = true;
    return result;
  })().finally(() => {
    // Only clear OUR entry: a newer pass (chained by a caller) may own this account by now.
    if (accounts!.get(token)?.attempted === attempted) accounts!.delete(token);
  });
  entry.promise = promise;
  accounts.set(token, entry);
  return promise;
};
