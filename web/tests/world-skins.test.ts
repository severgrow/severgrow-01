import { describe, expect, it } from 'vitest';
import { WORLD_IDS, WORLDS, duelWorlds, parseWorldId, worldPreference } from '../src/worlds/worlds.js';

describe('cosmetic worlds are independent of ownership and rules', () => {
  it('has a stable default, four distinct materials, and safe unknown-version fallback', () => {
    expect(WORLD_IDS).toEqual(['futasaku', 'ocean', 'forest', 'magic-fields', 'volcanic']);
    expect(parseWorldId('future-world')).toBe('futasaku');
    expect(parseWorldId(null)).toBe('futasaku');
    expect(new Set(WORLD_IDS.map(id => WORLDS[id].base)).size).toBe(5);
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
    pref.set('forest');
    expect(worldPreference(store).get()).toBe('forest');
    pref.set('futasaku');
    expect(worldPreference(store).get()).toBe('futasaku');
    expect([...data.keys()]).toEqual(['severgrow.world-style.v1']);
  });
  it('stays usable with blocked or corrupt storage', () => {
    const pref = worldPreference({ get: () => { throw Error('blocked'); }, set: () => { throw Error('blocked'); } });
    expect(pref.get()).toBe('futasaku');
    pref.set('ocean'); expect(pref.get()).toBe('ocean');
    expect(worldPreference({ get: () => '{oops', set: () => {} }).get()).toBe('futasaku');
  });
});
