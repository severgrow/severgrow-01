import { describe, expect, it } from 'vitest';
import { WORLD_IDS, WORLDS, duelWorlds, parseWorldId, worldPreference } from '../src/worlds/worlds.js';

describe('cosmetic worlds are independent of ownership and rules', () => {
  // Owner rejected the four experimental materials. Their stored ids must become classic safely.
  it('keeps the independent-owner seam but retires every experimental world', () => {
    expect(WORLD_IDS).toEqual(['futasaku']);
    for(const id of ['ocean','forest','magic-fields','volcanic'])expect(parseWorldId(id)).toBe('futasaku');
    expect(parseWorldId('future-world')).toBe('futasaku');
    expect(parseWorldId(null)).toBe('futasaku');
    expect(Object.keys(WORLDS)).toEqual(['futasaku']);
  });
  it('supports every mixed pairing without changing the remote or shared settings', () => {
    for (const a of WORLD_IDS) for (const b of WORLD_IDS) {
      const appearance = duelWorlds(a, b);
      expect(appearance.environment).toBe(a);
      expect(appearance.owners).toEqual([a, b]);
      expect(duelWorlds(b, a).owners).toEqual([b, a]);
    }
  });
  it('persists only a versioned cosmetic id, including reverting to default', () => {
    const data = new Map<string, string>();
    const store = { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => { data.set(k, v); } };
    const pref = worldPreference(store);
    expect(pref.get()).toBe('futasaku');
    data.set('severgrow.world-style.v1',JSON.stringify('forest'));
    expect(worldPreference(store).get()).toBe('futasaku');
    pref.set('futasaku');
    expect(worldPreference(store).get()).toBe('futasaku');
    expect([...data.keys()]).toEqual(['severgrow.world-style.v1']);
  });
  it('stays usable with blocked or corrupt storage', () => {
    const pref = worldPreference({ get: () => { throw Error('blocked'); }, set: () => { throw Error('blocked'); } });
    expect(pref.get()).toBe('futasaku');
    pref.set('futasaku'); expect(pref.get()).toBe('futasaku');
    expect(worldPreference({ get: () => '{oops', set: () => {} }).get()).toBe('futasaku');
  });
});
