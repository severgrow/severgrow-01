// THE STORAGE PROBE RUNS ONCE PER PAGE (2026-11-16). `browserStorage()` wrote and removed a probe key
// on EVERY call, and it is called all over the app; each write fires a `storage` event in every OTHER
// open tab of the game (measured: ~20 events in 1.5 s in one tab while another started). Whether the
// browser lets this page write does not change call to call, so it is asked once.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const fakeLocalStorage = (blocked = false) => {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { if (blocked) throw new DOMException('blocked', 'QuotaExceededError'); writes.push(k); data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
};

describe('browserStorage', () => {
  it('probes the browser storage once, however often it is asked', async () => {
    const ls = fakeLocalStorage();
    vi.stubGlobal('localStorage', ls);
    const { browserStorage } = await import('../../server/src/client.js');
    for (let i = 0; i < 5; i++) expect(browserStorage()).not.toBeNull();
    expect(ls.writes.filter((k) => k === '__severgrow_probe__')).toHaveLength(1);
  });
  it('a blocked storage is still reported as unavailable', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage(true));
    const { browserStorage } = await import('../../server/src/client.js');
    expect(browserStorage()).toBeNull();
    expect(browserStorage()).toBeNull();
  });
  it('still reads and writes through to the real storage', async () => {
    const ls = fakeLocalStorage();
    vi.stubGlobal('localStorage', ls);
    const { browserStorage } = await import('../../server/src/client.js');
    browserStorage()!.set('k', 'v');
    expect(browserStorage()!.get('k')).toBe('v');
  });
});
