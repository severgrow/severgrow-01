import { describe, expect, it, vi } from 'vitest';
import { DuelError, type DuelClient, type KeyValue } from '../../server/src/client.js';
import { flushSeedProofs, PENDING_SEED_PROOFS_KEY, queueSeedProof } from '../src/online/seed-rewards.js';

const storage = (): KeyValue => {
  const data = new Map<string, string>();
  return { get: (key) => data.get(key) ?? null, set: (key, value) => { data.set(key, value); }, remove: (key) => { data.delete(key); } };
};
const proof = (levelId: string) => ({ kind: 'campaign' as const, levelId, actions: [], botVersion: 'audit' });
const pending = (store: KeyValue) => JSON.parse(store.get(PENDING_SEED_PROOFS_KEY) ?? '[]') as { levelId: string }[];
const clientOf = (submitSeedProof: ReturnType<typeof vi.fn>) => ({ submitSeedProof }) as unknown as DuelClient;

describe('unpaid Seeds proofs', () => {
  it('retains every unpaid first clear after a long offline campaign', () => {
    const store = storage();
    queueSeedProof(store, proof('lesson-10'));
    for (let n = 1; n <= 70; n++) queueSeedProof(store, proof(`c${Math.ceil(n / 10)}-${n}`));
    expect(pending(store)).toHaveLength(71);
    expect(pending(store)[0]!.levelId).toBe('lesson-10');
  });

  it('isolates overlapping accounts and coalesces retries for the same account', async () => {
    const a = storage(), b = storage();
    queueSeedProof(a, proof('lesson-10')); queueSeedProof(b, proof('c1-1'));
    let finish!: () => void;
    const wait = new Promise<void>((resolve) => { finish = resolve; });
    const submit = vi.fn(async () => { await wait; return { awarded: 100 }; });
    const client = clientOf(submit);
    const first = flushSeedProofs(a, client, 'account-a');
    const duplicate = flushSeedProofs(a, client, 'account-a');
    const second = flushSeedProofs(b, client, 'account-b');
    finish(); await Promise.all([first, duplicate, second]);
    expect(submit.mock.calls).toHaveLength(2);
    expect(pending(a)).toEqual([]); expect(pending(b)).toEqual([]);
  });

  it('does not drop a newer replay queued while an older replay is in flight', async () => {
    // Owner report 2026-10-24 ("seeds pending"): the queue is now DRAINED rather than snapshotted,
    // so a replay that arrives mid-flight is sent by the same run instead of waiting for the next
    // menu visit. The protective property is unchanged — the newer replay must reach the server, not
    // be clobbered by the older one's completion — so it is asserted on what was SUBMITTED.
    const store = storage(); queueSeedProof(store, proof('lesson-10'));
    const submits: string[] = [];
    // Resolves on a microtask, so the first submit is genuinely in flight when the second proof is
    // queued (the call below runs before any continuation of the flush).
    const submit = vi.fn(async (_token: string, _source: unknown, _actions: unknown, botVersion: string) => {
      submits.push(botVersion);
      return { awarded: 100 };
    });
    const flushing = flushSeedProofs(store, clientOf(submit), 'account');
    queueSeedProof(store, { ...proof('lesson-10'), botVersion: 'new-replay' });
    await flushing;
    // Both replays were sent, in queue order, and the queue is empty afterwards.
    expect(submits).toEqual(['audit', 'new-replay']);
    expect(pending(store)).toEqual([]);
  });

  it('ignores malformed saved entries without blocking a valid reward', async () => {
    const store = storage();
    store.set(PENDING_SEED_PROOFS_KEY, JSON.stringify([
      { kind: 'campaign', actions: [] }, { kind: 'training', ticketId: 12, actions: [] }, proof('lesson-10'),
    ]));
    const submit = vi.fn().mockResolvedValue({ awarded: 100 });
    await flushSeedProofs(store, clientOf(submit), 'account');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![1]).toEqual({ levelId: 'lesson-10' });
  });

  it('pays a proof that is queued while the flush is still in flight (same run)', async () => {
    // Owner report 2026-10-24 ("there was some issues with seeds pending"). The queue used to be
    // snapshotted once, so a win that landed mid-flight waited for the NEXT menu visit: the finish
    // card looked for its own key in the answer, found nothing, and sat on "Seeds pending
    // verification" for a reward that was already safe on the device. The queue is drained now.
    const store = storage();
    queueSeedProof(store, proof('lesson-10'));
    const submit = vi.fn(async () => ({ awarded: 100 }));
    const flushing = flushSeedProofs(store, clientOf(submit), 'account');
    queueSeedProof(store, proof('c1-1'));
    const awards = await flushing;
    expect(awards.map((a) => a.key).sort()).toEqual(['campaign:c1-1', 'campaign:lesson-10']);
    expect(pending(store)).toEqual([]);
  });

  it('keeps a proof on network failure and retries successfully', async () => {
    const store = storage(); queueSeedProof(store, proof('lesson-10'));
    const submit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ awarded: 100 });
    const client = clientOf(submit);
    expect(await flushSeedProofs(store, client, 'account')).toEqual([]);
    expect(pending(store)).toHaveLength(1);
    expect(await flushSeedProofs(store, client, 'account')).toHaveLength(1);
    expect(pending(store)).toEqual([]);
  });

  it('retains a final lesson until the server supports it, but removes an invalid proof', async () => {
    const store = storage(); queueSeedProof(store, proof('lesson-10')); queueSeedProof(store, proof('c1-1'));
    const submit = vi.fn().mockRejectedValueOnce(new DuelError('INVALID_REQUEST', 'Lesson not available', 400))
      .mockRejectedValueOnce(new DuelError('INVALID_REQUEST', 'Invalid replay', 400));
    await flushSeedProofs(store, clientOf(submit), 'account');
    expect(pending(store).map((p) => p.levelId)).toEqual(['lesson-10']);
  });
});
