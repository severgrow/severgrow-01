import { describe, expect, it } from 'vitest';
import { shouldReloadForStaleBuild, STALE_RELOAD_KEY, STALE_RELOAD_WINDOW_MS } from '../src/logic/stale-build.js';

const store = () => { const data = new Map<string, string>(); return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; };

describe('a page left open across a deploy recovers by reloading once', () => {
  it('the first failed lazy load reloads, and records when', () => {
    const s = store();
    expect(shouldReloadForStaleBuild(s, 1_000_000)).toBe(true);
    expect(s.data.get(STALE_RELOAD_KEY)).toBe('1000000');
  });
  it('a second failure right after that reload does not loop', () => {
    const s = store();
    shouldReloadForStaleBuild(s, 1_000_000);
    expect(shouldReloadForStaleBuild(s, 1_000_000 + STALE_RELOAD_WINDOW_MS - 1)).toBe(false);
  });
  it('a later deploy may reload again', () => {
    const s = store();
    shouldReloadForStaleBuild(s, 1_000_000);
    expect(shouldReloadForStaleBuild(s, 1_000_000 + STALE_RELOAD_WINDOW_MS + 1)).toBe(true);
  });
  it('blocked or missing storage never reloads (it could loop)', () => {
    expect(shouldReloadForStaleBuild({ getItem: () => { throw Error('blocked'); }, setItem: () => undefined }, 1)).toBe(false);
    expect(shouldReloadForStaleBuild(null, 1)).toBe(false);
  });
});

it('the module recovery reloads through the fresh address too (the worker answers it from the network)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/logic/stale-build.ts', import.meta.url), 'utf8');
  expect(src).toContain("searchParams.set('_fresh'");
  expect(src).not.toMatch(/location\.reload\(\)/);
});
