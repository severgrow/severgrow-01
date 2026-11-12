// THE STORAGE PREFIX CONTRACT (hygiene pass, 2026-10-26).
//
// `web/src/channel.ts` patches `Storage.prototype` so every getItem/setItem/removeItem on
// localStorage AND sessionStorage is silently prefixed per release channel. That is how the live
// game, its previews and its test copies keep separate saves on one origin, and every player's
// progress is stored under those prefixed names. `channel-policy.test.ts` pins the prefix per
// channel; this file pins the rest of the observable contract, so whoever replaces the patch with an
// explicit storage adapter (docs/ARCHITECTURE.md, "Storage") can prove the replacement is identical:
//
//   - the futa04 prefix on each kind of host (preview paths vs the released root);
//   - the `live` channel leaves the prototype completely untouched;
//   - ONLY the three item methods are prefixed — `key()`, `length` and `clear()` still see the raw
//     store (nothing in the app uses them today; an adapter must not quietly start to);
//   - the patch is applied once per evaluation of channel.ts, and a second evaluation would prefix
//     twice — which is why channel.ts must stay one module instance and must never be re-imported
//     under a second URL or bundle.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

const source = transformSync(readFileSync(new URL('../src/channel.ts', import.meta.url), 'utf8'), {
  loader: 'ts',
  format: 'cjs',
}).code;

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
}

/** Evaluate channel.ts once (or `times` times) against a fresh Storage class and an optional location. */
const boot = (channel: string, location?: { hostname: string; pathname: string }, times = 1) => {
  class Storage extends FakeStorage {}
  const original = {
    getItem: Storage.prototype.getItem,
    setItem: Storage.prototype.setItem,
    removeItem: Storage.prototype.removeItem,
  };
  let policy: Record<string, unknown> = {};
  for (let i = 0; i < times; i++) {
    const module = { exports: {} as Record<string, unknown> };
    runInNewContext(source, { __CHANNEL__: channel, Storage, exports: module.exports, module, ...(location ? { location } : {}) });
    policy = module.exports;
  }
  return { policy, Storage, original };
};

describe('the storage prefix contract', () => {
  it('futa04 keeps "futa04:" on every preview host and "main2:" on the released root', () => {
    const prefix = (hostname: string, pathname: string) => boot('futa04', { hostname, pathname }).policy.STORAGE_PREFIX;
    expect(prefix('futasaku.com', '/futa0.4/')).toBe('futa04:');
    expect(prefix('futasaku.com', '/futa0.5/')).toBe('futa04:');
    expect(prefix('futasaku.com', '/futa-test/')).toBe('futa04:');
    expect(prefix('anything.chatgpt.site', '/')).toBe('futa04:');
    expect(prefix('futasaku.com', '/')).toBe('main2:');
    expect(prefix('www.futasaku.com', '/index.html')).toBe('main2:');
    // no location at all (a worker, a test): the released root's prefix
    expect(boot('futa04').policy.STORAGE_PREFIX).toBe('main2:');
  });

  it('the live channel has no prefix and leaves the prototype exactly as it was', () => {
    const { policy, Storage, original } = boot('live');
    expect(policy.STORAGE_PREFIX).toBe('');
    expect(Storage.prototype.getItem).toBe(original.getItem);
    expect(Storage.prototype.setItem).toBe(original.setItem);
    expect(Storage.prototype.removeItem).toBe(original.removeItem);
  });

  it.each(['test', 'futa04', 'futa-test', 'futa05'])('%s: only the three item methods are prefixed', (channel) => {
    const { policy, Storage } = boot(channel);
    const prefix = String(policy.STORAGE_PREFIX);
    expect(prefix.length).toBeGreaterThan(0);
    const store = new Storage();
    store.setItem('a', '1');
    store.setItem('b', '2');
    // key() and length see the RAW names, prefix included
    expect(store.length).toBe(2);
    expect([store.key(0), store.key(1)]).toEqual([`${prefix}a`, `${prefix}b`]);
    // reading a raw name back through getItem prefixes it again — it is not found
    expect(store.getItem(store.key(0)!)).toBeNull();
    // clear() empties the whole store, every channel's keys with it
    store.data.set('other-channel:x', 'kept until clear');
    store.clear();
    expect(store.length).toBe(0);
  });

  it('is applied once per evaluation; evaluating channel.ts twice would prefix twice', () => {
    const once = boot('futa05');
    const s1 = new once.Storage();
    s1.setItem('save', 'v');
    expect([...s1.data.keys()]).toEqual(['futa05:save']);

    const twice = boot('futa05', undefined, 2);
    const s2 = new twice.Storage();
    s2.setItem('save', 'v');
    // the hazard this pins: a second copy of channel.ts in the page would move every save
    expect([...s2.data.keys()]).toEqual(['futa05:futa05:save']);
  });
});
