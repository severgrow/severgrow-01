// SLICED CHECKS, the page's side (owner report, 2026-11-12: Seeds for levels 80 and 81 never arrived).
// A long or rival game is checked by the server in slices: until it is done the server answers with a
// resume token, and the page sends the SAME proof back with it, each round with its own deadline.
import { describe, expect, it, vi } from 'vitest';
import type { DuelClient, KeyValue } from '../../server/src/client.js';
import { flushSeedProofs, MAX_PROOF_ROUNDS, PENDING_SEED_PROOFS_KEY, queueSeedProof } from '../src/online/seed-rewards.js';

const storage = (): KeyValue => {
  const data = new Map<string, string>();
  return { get: (key) => data.get(key) ?? null, set: (key, value) => { data.set(key, value); }, remove: (key) => { data.delete(key); } };
};
const reward = { awarded: 30, reason: null, replayed: false, wallet: { balance: 30, lifetimeEarned: 30, lifetimeSpent: 0, worldInvitationSeen: false } };

describe('a proof checked in slices', () => {
  it('asks for slices, sends the token back with the same proof, and settles on the reward', async () => {
    const store = storage();
    queueSeedProof(store, { kind: 'campaign', levelId: 'c8-80', actions: [], botVersion: 'audit', dealSeed: 123 });
    const answers = [{ resume: 'one' }, { resume: 'two' }, reward];
    const submit = vi.fn(async () => answers.shift());
    const result = await flushSeedProofs(store, { submitSeedProof: submit } as unknown as DuelClient, 'tok');
    expect(result.awards).toHaveLength(1);
    expect(submit.mock.calls).toHaveLength(3);
    const options = submit.mock.calls.map((call) => (call as unknown[])[4] as { resumable?: boolean; resume?: string });
    expect(options.map((o) => o.resumable)).toEqual([true, true, true]);
    expect(options.map((o) => o.resume)).toEqual([undefined, 'one', 'two']);
    expect(store.get(PENDING_SEED_PROOFS_KEY) ?? '[]').toBe('[]');
  });

  it('a check that never finishes stops after the round limit and keeps the proof queued', async () => {
    const store = storage();
    queueSeedProof(store, { kind: 'campaign', levelId: 'c8-80', actions: [], botVersion: 'audit' });
    const submit = vi.fn(async () => ({ resume: 'again' }));
    const result = await flushSeedProofs(store, { submitSeedProof: submit } as unknown as DuelClient, 'tok');
    expect(result.awards).toHaveLength(0);
    expect(submit.mock.calls.length).toBe(MAX_PROOF_ROUNDS);
    expect(JSON.parse(store.get(PENDING_SEED_PROOFS_KEY) ?? '[]')).toHaveLength(1);
  });
});
