// The guide's server copy (agreed design, 2026-11-10): every Play Online player keeps it, guests too,
// so "opened a guide lesson -> finished a game" can be measured. No identity: nothing is sent.
import { describe, expect, it } from 'vitest';
import { guideAccount } from '../src/logic/account-guide-sync';
import { IDENTITY_STORAGE_KEY } from '../src/online/identity';

const kv = (identity: unknown) => {
  const m = new Map<string, string>();
  if (identity) m.set(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
const fakeClient = () => {
  const calls: string[] = [];
  return {
    calls,
    client: {
      accountGuide: async (t: string) => { calls.push(`get ${t}`); return { seen: ['grow'], games: 1 }; },
      putAccountGuide: async (t: string, w: { seen: readonly string[]; games: number }) => { calls.push(`put ${t}`); return { seen: [...w.seen], games: w.games }; },
    },
  };
};
const features = async () => ['account-guide'];

describe('guide progress on the server', () => {
  it('a guest keeps it too', async () => {
    const f = fakeClient();
    const acc = guideAccount(kv({ token: 'g1', playerId: 'p1', kind: 'guest' }), { client: f.client, features })!;
    expect(acc).not.toBeNull();
    expect((await acc.load())?.games).toBe(1);
    await acc.save({ seen: ['bloom'], games: 2 });
    expect(f.calls).toEqual(['get g1', 'put g1']);
  });

  it('an identity made later (a first duel link) is picked up', async () => {
    const f = fakeClient();
    const storage = kv(null);
    const acc = guideAccount(storage, { client: f.client, features })!;
    expect(await acc.load()).toBeNull();
    expect(f.calls).toEqual([]);
    storage.set(IDENTITY_STORAGE_KEY, JSON.stringify({ token: 'g2', playerId: 'p2', kind: 'guest' }));
    await acc.save({ seen: ['grow'], games: 1 });
    expect(f.calls).toEqual(['put g2']);
  });
});
