import { describe, expect, it } from 'vitest';
import { DuelError } from '../../server/src/client.js';
import type { DuelClient, KeyValue } from '../../server/src/client.js';
import { flushSeedProofs, PENDING_SEED_PROOFS_KEY, queueSeedProof } from '../src/online/seed-rewards.js';

const memory = (): KeyValue => {
  const values = new Map<string, string>();
  return { get: key => values.get(key) ?? null, set: (key, value) => { values.set(key, value); }, remove: key => { values.delete(key); } };
};

describe('queued Seeds proofs across level-opening revisions', () => {
  it('keeps a new opening replay if an older server cannot verify it yet', async () => {
    const storage = memory();
    queueSeedProof(storage, { kind: 'campaign', levelId: 'c1-01', openingVersion: 2, actions: [{ t: 'EndAct' }], botVersion: 'v1' });
    const client = { submitSeedProof: async () => { throw new DuelError('INVALID_REQUEST', 'Unknown opening', 400); } } as unknown as DuelClient;
    await flushSeedProofs(storage, client, 'token');
    const pending = JSON.parse(storage.get(PENDING_SEED_PROOFS_KEY) ?? '[]') as { openingVersion?: number }[];
    expect(pending).toHaveLength(1);
    expect(pending[0]?.openingVersion).toBe(2);
  });

  it('continues to discard an invalid old-format replay', async () => {
    const storage = memory();
    queueSeedProof(storage, { kind: 'campaign', levelId: 'c1-01', actions: [{ t: 'EndAct' }], botVersion: 'v1' });
    const client = { submitSeedProof: async () => { throw new DuelError('INVALID_REQUEST', 'Invalid replay', 400); } } as unknown as DuelClient;
    await flushSeedProofs(storage, client, 'token');
    expect(JSON.parse(storage.get(PENDING_SEED_PROOFS_KEY) ?? '[]')).toEqual([]);
  });
});
