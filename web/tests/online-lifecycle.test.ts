import { describe, expect, it } from 'vitest';
import { DuelClient, type KeyValue } from '../../server/src/client.js';
import { createIdentityStore, isIdentityStorageEvent, subscribeIdentityChanges } from '../src/online/identity.js';
import { setOnlineSession, subscribeOnlineSession } from '../src/online/duel-runtime.js';

describe('online lifecycle notifications', () => {
  it('only reacts to its own channel identity or a full storage clear', () => {
    expect(isIdentityStorageEvent('futa05:severgrow.duel.identity.v1','futa05:')).toBe(true);
    expect(isIdentityStorageEvent(null,'futa05:')).toBe(true);
    expect(isIdentityStorageEvent('futa05-test:severgrow.duel.identity.v1','futa05:')).toBe(false);
    expect(isIdentityStorageEvent('__severgrow_probe__','futa05:')).toBe(false);
    expect(isIdentityStorageEvent('futa05:severgrow.settings.v1','futa05:')).toBe(false);
  });

  it('announces a successfully stored identity immediately and unsubscribes cleanly', () => {
    const values = new Map<string,string>();
    const storage: KeyValue = { get:k=>values.get(k)??null, set:(k,v)=>{values.set(k,v);}, remove:k=>{values.delete(k);} };
    const store = createIdentityStore({ client: new DuelClient({baseUrl:'https://unused.invalid',storage}), storage });
    const seen: string[] = [];
    const stop = subscribeIdentityChanges(identity=>{seen.push(identity?.playerId??'none');});
    const identity = {token:'token',playerId:'guest',displayName:null,kind:'guest' as const};
    expect(store.adopt(identity).ok).toBe(true);
    expect(seen).toEqual(['guest']);
    stop();store.adopt({...identity,playerId:'account'});
    expect(seen).toEqual(['guest']);
  });

  it('does not announce an identity when storage failed', () => {
    const store = createIdentityStore({client:new DuelClient({baseUrl:'https://unused.invalid',storage:null}),storage:null});
    const seen: unknown[]=[];
    const stop=subscribeIdentityChanges(identity=>{seen.push(identity);});
    expect(store.adopt({token:'x',playerId:'guest',displayName:null,kind:'guest'}).ok).toBe(false);
    expect(seen).toEqual([]);stop();
  });

  it('announces session entry/exit without duplicate events for the same session', () => {
    setOnlineSession(null);
    const seen: unknown[]=[];
    const stop=subscribeOnlineSession(session=>{seen.push(session);});
    // A structural session stand-in: this boundary publishes handles without reading game state.
    const session={} as NonNullable<Parameters<typeof setOnlineSession>[0]>;
    setOnlineSession(session);setOnlineSession(session);setOnlineSession(null);
    expect(seen).toEqual([session,null]);
    stop();setOnlineSession(session);setOnlineSession(null);
    expect(seen).toHaveLength(2);
  });
});
