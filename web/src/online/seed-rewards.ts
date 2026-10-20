import type { Action } from '../../../src/engine/index.js';
import { CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { DuelError } from '../../../server/src/client.js';
import type { DuelClient, KeyValue } from '../../../server/src/client.js';
import type { RewardResult } from '../../../server/src/seeds/types.js';

export const PENDING_SEED_PROOFS_KEY = 'severgrow.seeds.pending.v1';
export type PendingSeedProof =
  | { kind: 'campaign'; levelId: string; openingVersion?: 1 | 2; actions: readonly Action[]; botVersion: string }
  | { kind: 'training'; ticketId: string; actions: readonly Action[]; botVersion: string };

const proofKey = (p: PendingSeedProof) => p.kind === 'campaign' ? `campaign:${p.levelId}:v${p.openingVersion ?? 1}` : `training:${p.ticketId}`;
const read = (storage: KeyValue): PendingSeedProof[] => {
  try {
    const data = JSON.parse(storage.get(PENDING_SEED_PROOFS_KEY) ?? '[]') as unknown;
    return Array.isArray(data) ? data.filter((v): v is PendingSeedProof =>
      !!v && typeof v === 'object' && Array.isArray((v as PendingSeedProof).actions) &&
      ((v as PendingSeedProof).kind === 'campaign' || (v as PendingSeedProof).kind === 'training')) : [];
  } catch { return []; }
};
const write = (storage: KeyValue, pending: PendingSeedProof[]) => storage.set(PENDING_SEED_PROOFS_KEY, JSON.stringify(pending));

/** Pending is never spendable; only the server wallet can report earned Seeds. */
export const queueSeedProof = (storage: KeyValue, input: PendingSeedProof): void => {
  const proof = { ...input, botVersion: input.botVersion || CURRENT_BOT_VERSION } as PendingSeedProof;
  const pending = read(storage).filter((v) => proofKey(v) !== proofKey(proof));
  pending.push(proof);
  write(storage, pending.slice(-24));
};

let flushPromise: Promise<{ key: string; reward: RewardResult }[]> | null = null;
export const flushSeedProofs = (storage: KeyValue, client: DuelClient, token: string) => {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    const awarded: { key: string; reward: RewardResult }[] = [];
    for (const proof of read(storage)) {
      try {
        const source = proof.kind === 'campaign' ? { levelId: proof.levelId, openingVersion: proof.openingVersion ?? 1 } : { ticketId: proof.ticketId };
        const reward = await client.submitSeedProof(token, source, proof.actions, proof.botVersion);
        awarded.push({ key: proofKey(proof), reward });
        write(storage, read(storage).filter((v) => proofKey(v) !== proofKey(proof)));
      } catch (error) {
        // A v2 opening can briefly reach an older server during a staggered release. Keep its
        // replay until the verifier knows that opening; do not erase a legitimate first clear.
        if (error instanceof DuelError && error.status === 400 && proof.kind === 'campaign' && proof.openingVersion === 2) continue;
        // Other invalid/expired proofs cannot become valid later; transient errors retain the
        // replay so the next menu visit can retry it.
        if (error instanceof DuelError && error.status === 400) {
          write(storage, read(storage).filter((v) => proofKey(v) !== proofKey(proof)));
        } else break;
      }
    }
    return awarded;
  })().finally(() => { flushPromise = null; });
  return flushPromise;
};
