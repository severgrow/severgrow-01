import { describe, expect, it, vi } from 'vitest';
import { DuelError, type DuelClient, type KeyValue } from '../../server/src/client.js';
import { flushSeedProofs, PENDING_SEED_PROOFS_KEY, queueSeedProof } from '../src/online/seed-rewards.js';
import { settleQueuedProof } from '../src/online/seed-settle.js';

const storage = (): KeyValue => {
  const data = new Map<string, string>();
  return { get: (key) => data.get(key) ?? null, set: (key, value) => { data.set(key, value); }, remove: (key) => { data.delete(key); } };
};
const proof = (levelId: string) => ({ kind: 'campaign' as const, levelId, actions: [], botVersion: 'audit' });
const pending = (store: KeyValue) => JSON.parse(store.get(PENDING_SEED_PROOFS_KEY) ?? '[]') as { levelId: string }[];
const clientOf = (submitSeedProof: ReturnType<typeof vi.fn>) => ({ submitSeedProof }) as unknown as DuelClient;
const reward = (awarded: number, extra: { reason?: string | null; replayed?: boolean } = {}) => ({
  awarded, reason: extra.reason ?? null, replayed: extra.replayed ?? false,
  wallet: { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: false },
});

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
    const result = await flushSeedProofs(store, clientOf(submit), 'account');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![1]).toEqual({ levelId: 'lesson-10' });
    expect(result.awards.map((entry) => entry.key)).toEqual(['campaign:lesson-10']);
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
    const awards = (await flushing).awards;
    expect(awards.map((a) => a.key).sort()).toEqual(['campaign:c1-1', 'campaign:lesson-10']);
    expect(pending(store)).toEqual([]);
  });

  it('a proof queued after a pass has already drained is settled by the very next call', async () => {
    // The narrow race the single-flight map had: a pass with nothing to do breaks out of its loop,
    // and a proof is queued before that promise resolves. The caller then asked for the settle and
    // was handed the dead pass's answer, which could not contain its key. The entry now remembers
    // what it tried, so a proof it never saw buys a fresh pass chained behind it.
    const store = storage();
    const submit = vi.fn().mockResolvedValue({ awarded: 100 });
    const client = clientOf(submit);
    const drained = flushSeedProofs(store, client, 'account'); // empty queue: nothing to do
    queueSeedProof(store, proof('lesson-10'));
    const joined = await flushSeedProofs(store, client, 'account'); // same tick, same entry
    expect(joined.awards.map((entry) => entry.key)).toEqual(['campaign:lesson-10']);
    await drained;
    expect(pending(store)).toEqual([]);
  });

  it('keeps a proof on network failure and retries successfully', async () => {
    const store = storage(); queueSeedProof(store, proof('lesson-10'));
    const submit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ awarded: 100 });
    const client = clientOf(submit);
    expect((await flushSeedProofs(store, client, 'account')).awards).toEqual([]);
    expect(pending(store)).toHaveLength(1);
    expect((await flushSeedProofs(store, client, 'account')).awards).toHaveLength(1);
    expect(pending(store)).toEqual([]);
  });

  it('retains a final lesson until the server supports it, but removes an invalid proof', async () => {
    const store = storage(); queueSeedProof(store, proof('lesson-10')); queueSeedProof(store, proof('c1-1'));
    const submit = vi.fn().mockRejectedValueOnce(new DuelError('INVALID_REQUEST', 'Lesson not available', 400))
      .mockRejectedValueOnce(new DuelError('INVALID_REQUEST', 'Invalid replay', 400));
    await flushSeedProofs(store, clientOf(submit), 'account');
    expect(pending(store).map((p) => p.levelId)).toEqual(['lesson-10']);
  });

  it('reports a proof the server refuses for good, instead of letting it vanish', async () => {
    // A 400 is final: the server will never accept that replay, and the proof is dropped from the
    // queue. Dropping it silently was how a player's Seeds could disappear with nobody told.
    const store = storage(); queueSeedProof(store, proof('c2-11'));
    const submit = vi.fn().mockRejectedValue(new DuelError('INVALID_REQUEST', 'That Campaign result could not be verified.', 400));
    const result = await flushSeedProofs(store, clientOf(submit), 'account');
    expect(result.awards).toEqual([]);
    expect(result.refused).toEqual([{ key: 'campaign:c2-11', message: 'That Campaign result could not be verified.' }]);
    expect(pending(store)).toEqual([]);
  });

  it('a deadline aborts the transport, so a wedged request cannot hold the account', async () => {
    const store = storage(); queueSeedProof(store, proof('lesson-10'));
    const submit = vi.fn((..._args: unknown[]) => new Promise<never>(() => undefined)); // never settles
    await flushSeedProofs(store, clientOf(submit), 'account', { timeoutMs: 20 });
    const options = submit.mock.calls[0]![4] as unknown as { signal?: AbortSignal };
    expect(options.signal?.aborted).toBe(true);
    expect(pending(store)).toHaveLength(1);
  });
});

describe('a request that never settles cannot wedge the account', () => {
  // Owner report, 2026-10-25: the finish card rested on "Seeds pending verification" forever. A
  // fetch that never settles (a backgrounded mobile tab, a captured connection) left the
  // single-flight promise pending, its `.finally` never ran, and every later settle for that account
  // was handed the same dead promise. No receipt was ever written.
  it('times out, releases the account, and the next pass pays the same proof', async () => {
    const store = storage();
    queueSeedProof(store, proof('lesson-10'));
    const submit = vi.fn()
      .mockImplementationOnce(() => new Promise<never>(() => undefined))
      .mockResolvedValue(reward(100));
    const client = clientOf(submit);
    const first = await flushSeedProofs(store, client, 'account', { timeoutMs: 20 });
    expect(first.awards).toEqual([]);
    // The Seeds are not lost: the proof is still queued on the device.
    expect(pending(store).map((entry) => entry.levelId)).toEqual(['lesson-10']);
    const again = await flushSeedProofs(store, client, 'account', { timeoutMs: 20 });
    expect(again.awards.map((entry) => entry.key)).toEqual(['campaign:lesson-10']);
    expect(pending(store)).toEqual([]);
  });

  it('tells the finish card "deferred" — never "pending" — and pays when the line comes back', async () => {
    const store = storage();
    queueSeedProof(store, proof('lesson-10'));
    let online = false;
    const submit = vi.fn(() => online ? Promise.resolve(reward(100)) : new Promise<never>(() => undefined));
    // A 20 ms deadline stands in for the product's `SEED_SETTLE_TIMEOUT_MS` (5 s): the rule under
    // test is that a pass ALWAYS ends, not how long it waits.
    const deps = {
      flush: () => flushSeedProofs(store, clientOf(submit), 'account', { timeoutMs: 20 }),
      sleep: async () => undefined,
      delays: [0, 0],
    };
    const dead = await settleQueuedProof('campaign:lesson-10', deps);
    // Nothing was claimed: the card paints NO line, which is the honest state while it is unknown.
    expect(dead).toEqual({ kind: 'deferred' });
    expect(pending(store)).toHaveLength(1);
    online = true;
    const settled = await settleQueuedProof('campaign:lesson-10', deps);
    expect(settled.kind).toBe('settled');
    expect(pending(store)).toEqual([]);
  });
});

describe('the settle loop paints the truth, and only the truth', () => {
  const store = () => { const s = storage(); queueSeedProof(s, proof('lesson-10')); return s; };
  const deps = (s: KeyValue, submit: ReturnType<typeof vi.fn>, delays: readonly number[] = [0, 0]) => {
    const sleeps: number[] = [];
    return {
      sleeps,
      run: () => settleQueuedProof('campaign:lesson-10', {
        // 20 ms stands in for the product deadline: the loop's rules are what is under test here.
        flush: () => flushSeedProofs(s, clientOf(submit), 'account', { timeoutMs: 20 }),
        sleep: async (ms: number) => { sleeps.push(ms); },
        delays,
      }),
    };
  };

  it('reports the award the server paid', async () => {
    const s = store();
    const submit = vi.fn().mockResolvedValue(reward(100));
    expect(await deps(s, submit).run()).toEqual({ kind: 'settled', reward: reward(100) });
  });

  it('a transient failure retries, then reports the award that landed', async () => {
    const s = store();
    const submit = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(reward(100));
    const { run, sleeps } = deps(s, submit, [5, 5]);
    const report = await run();
    expect(report.kind).toBe('settled');
    expect(submit).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([5]);
  });

  it('a refusal is reported with its reason, and is not retried', async () => {
    const s = store();
    const submit = vi.fn().mockRejectedValue(new DuelError('INVALID_REQUEST', 'That Campaign result could not be verified.', 400));
    const report = await deps(s, submit).run();
    expect(report).toEqual({ kind: 'refused', message: 'That Campaign result could not be verified.' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('a cap is still a settled answer, not a failure (the card says the limit in calm words)', async () => {
    const s = store();
    const submit = vi.fn().mockResolvedValue(reward(0, { reason: 'mode_daily_limit' }));
    expect(await deps(s, submit).run()).toEqual({ kind: 'settled', reward: reward(0, { reason: 'mode_daily_limit' }) });
  });
});
