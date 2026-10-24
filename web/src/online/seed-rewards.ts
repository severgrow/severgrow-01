import type { Action } from '../../../src/engine/index.js';
import { CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { DuelError } from '../../../server/src/client.js';
import type { DuelClient, KeyValue } from '../../../server/src/client.js';
import type { RewardResult } from '../../../server/src/seeds/types.js';

export const PENDING_SEED_PROOFS_KEY = 'severgrow.seeds.pending.v1';
export type PendingSeedProof =
  | { kind: 'campaign'; levelId: string; actions: readonly Action[]; botVersion: string }
  | { kind: 'training'; ticketId: string; actions: readonly Action[]; botVersion: string };

const proofKey = (p: PendingSeedProof) => p.kind === 'campaign' ? `campaign:${p.levelId}` : `training:${p.ticketId}`;
const isPendingProof = (value: unknown): value is PendingSeedProof => {
  if (!value || typeof value !== 'object') return false;
  const proof = value as Record<string, unknown>;
  if (!Array.isArray(proof.actions)) return false;
  return (proof.kind === 'campaign' && typeof proof.levelId === 'string' && proof.levelId.length > 0)
    || (proof.kind === 'training' && typeof proof.ticketId === 'string' && proof.ticketId.length > 0);
};
const read = (storage: KeyValue): PendingSeedProof[] => {
  try {
    const data: unknown = JSON.parse(storage.get(PENDING_SEED_PROOFS_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(isPendingProof) : [];
  } catch { return []; }
};
const write = (storage: KeyValue, pending: PendingSeedProof[]) => storage.set(PENDING_SEED_PROOFS_KEY, JSON.stringify(pending));

/** Pending is never spendable; only the server wallet can report earned Seeds. */
export const queueSeedProof = (storage: KeyValue, input: PendingSeedProof): void => {
  const proof = { ...input, botVersion: input.botVersion || CURRENT_BOT_VERSION } as PendingSeedProof;
  const pending = read(storage).filter((v) => proofKey(v) !== proofKey(proof));
  pending.push(proof);
  // First clears are irreplaceable while offline. A queue limit must never silently erase one.
  write(storage, pending);
};

type Awards = { key: string; reward: RewardResult }[];
const flushes = new WeakMap<KeyValue, Map<string, Promise<Awards>>>();
const removeSettledProof = (storage: KeyValue, proof: PendingSeedProof) => {
  // A player may finish a newer replay of the same level while this request is in flight.
  const sent = JSON.stringify(proof);
  write(storage, read(storage).filter((current) => JSON.stringify(current) !== sent));
};
export const flushSeedProofs = (storage: KeyValue, client: DuelClient, token: string) => {
  let accounts = flushes.get(storage);
  if (!accounts) { accounts = new Map(); flushes.set(storage, accounts); }
  const existing = accounts.get(token);
  if (existing) return existing;
  const flushing = (async () => {
    const awarded: Awards = [];
    /**
     * The queue is DRAINED, not snapshotted (owner report, 2026-10-24: "seeds pending"). A player can
     * win the next level while this very flush is still in flight; a snapshot taken once at the top
     * left that proof queued, and the caller's `.find(key)` then found nothing, so the finish card
     * sat on "Seeds pending verification" for a reward that was already safe. Re-reading the queue
     * each pass pays whatever arrived meanwhile, and the promise only resolves once it is empty (or
     * transiently blocked), so every caller sees its own key in the answer.
     *
     * `tried` is the run's memory of proofs it must NOT re-attempt: a kept-but-unpayable one (the
     * final lesson on a server without its verifier) would otherwise be resubmitted forever. New
     * replays are different objects, so they are still picked up.
     */
    const tried = new Set<string>();
    for (;;) {
      const next = read(storage).find((proof) => !tried.has(JSON.stringify(proof)));
      if (!next) break;
      tried.add(JSON.stringify(next));
      try {
        const source = next.kind === 'campaign' ? { levelId: next.levelId } : { ticketId: next.ticketId };
        const reward = await client.submitSeedProof(token, source, next.actions, next.botVersion);
        awarded.push({ key: proofKey(next), reward });
        removeSettledProof(storage, next);
      } catch (error) {
        // Invalid/expired proofs cannot become valid later; transient network errors keep the
        // locally queued replay so the next menu visit can retry it.
        // The final lesson's proof (`lesson-10`) can reach a server not yet redeployed with its
        // verifier: that server answers "not available". Keep it, so the 100 Seeds land once the
        // server knows the lesson (owner, 2026-10-24); any other refusal is final.
        const unknownLesson = error instanceof DuelError && error.status === 400 && next.kind === 'campaign'
          && next.levelId.startsWith('lesson-') && /not available/i.test(error.message);
        if (unknownLesson) continue;
        if (error instanceof DuelError && error.status === 400) removeSettledProof(storage, next);
        // A transient failure stops THIS run: retrying down a queue on a dead network only stacks
        // failures. Everything stays queued for the next visit.
        else break;
      }
    }
    return awarded;
  })().finally(() => { accounts.delete(token); });
  accounts.set(token, flushing);
  return flushing;
};
