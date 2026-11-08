// THE ACCOUNT HALF OF THE MENU'S CAMPAIGN SUGGESTION (owner brief, 2026-11-01; the lamps it was
// written for were removed on 2026-11-02, and the account answer is still what the suggestion and the
// account-place rule read).
//
// The account answer is the UNION partner of this device's campaign progress. These tests pin the
// account half's promises without a browser:
//
//   1. the derivation is `campaignHighestLevel` → levels 1..N (levels unlock in order);
//   2. a guest / signed-out device is NEVER asked;
//   3. one bounded read per player per session, cached by player id (a second open costs nothing);
//   4. a failed read is `unavailable` — no cache write, no thrown error, no effect on the device;
//   5. no polling and no repeating timer. The single deadline around the request is not a loop;
//   6. the source is the account's furthest verified level, never `campaign_clears`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { KeyValue } from '../../server/src/client.js';
import { CAMPAIGN_LEVELS, currentLevel, reconcileProgress } from '../../src/campaign/index.js';
import {
  ACCOUNT_CLEARS_KEY,
  cachedAccountClearsForThisDevice,
  forgetAccountClears,
  levelsFromHighest,
  loadAccountClears,
  normaliseLevels,
  readCachedAccountClears,
  writeCachedAccountClears,
} from '../src/menu/account-clears.js';
import { IDENTITY_STORAGE_KEY } from '../src/online/identity.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const mainSource = read('../src/main.ts');
const moduleSource = read('../src/menu/account-clears.ts');
const clientSource = read('../../server/src/client.ts');
const postgresSource = read('../../server/src/seeds/postgres.ts');

/** The account's own storage, without a browser: one plain map per test. */
const kv = (initial: Record<string, string> = {}): KeyValue => {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => { map.set(key, value); },
    remove: (key) => { map.delete(key); },
  };
};
const identity = (kind: 'guest' | 'account', playerId = 'player-1', token = `token-${kind}`) => JSON.stringify({
  token, playerId, displayName: null, kind,
});
const signedIn = (playerId = 'player-1') => kv({ [IDENTITY_STORAGE_KEY]: identity('account', playerId) });

describe('the account answer is its furthest verified level, expanded in order', () => {
  it('derives chapter-1 levels 1..N, because the campaign unlocks in order', () => {
    // No receipt at all (or a malformed/absent answer) has cleared nothing.
    for (const none of [null, undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(levelsFromHighest(none)).toEqual([]);
    }
    expect(levelsFromHighest(1)).toEqual([1]);
    expect(levelsFromHighest(7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(levelsFromHighest(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // A player deeper in the campaign is simply complete for chapter 1.
    expect(levelsFromHighest(36).slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(levelsFromHighest(36)).toHaveLength(36);
    // A corrupt answer cannot allocate without bound.
    expect(levelsFromHighest(1_000_000)).toHaveLength(200);
  });

  it('normalises a cached list (positive integers, unique, sorted)', () => {
    expect(normaliseLevels([3, 1, 3, 0, -2, 1.5, '4', Number.NaN, 10])).toEqual([1, 3, 10]);
  });

  it('the same one answer also places the account on a new device', () => {
    // One read serves both consumers: this list is the suggestion's half, and `highest` is the
    // existing account-place rule's half. A level-36 account lands on level 37, with chapter 1
    // complete.
    const fresh = { version: 1 as const, unlocked: 1, completed: [], best: {} };
    const after = reconcileProgress(fresh, 36);
    expect(currentLevel(after).number).toBe(37);
    expect(after.completed).toEqual(CAMPAIGN_LEVELS.slice(0, 36).map((level) => level.id));
    expect(levelsFromHighest(36).filter((level) => level <= 10)).toHaveLength(10);
  });
});

describe('the cache is a per-player optimisation, never the truth', () => {
  it('reads a cache only for the SAME player, and drops malformed values', () => {
    const store = kv();
    writeCachedAccountClears(store, 'player-1', [1, 2, 10]);
    expect(readCachedAccountClears(store, 'player-1')).toEqual([1, 2, 10]);
    // Another account on the same device must not borrow it.
    expect(readCachedAccountClears(store, 'player-2')).toBeNull();
    store.set(ACCOUNT_CLEARS_KEY, '{not json');
    expect(readCachedAccountClears(store, 'player-1')).toBeNull();
    // v1 (an exact set from the old reward-proof read) is not read: its meaning is different.
    store.set(ACCOUNT_CLEARS_KEY, JSON.stringify({ version: 1, playerId: 'player-1', levels: [1, 3, 10] }));
    expect(readCachedAccountClears(store, 'player-1')).toBeNull();
    store.set(ACCOUNT_CLEARS_KEY, JSON.stringify({ version: 2, playerId: 'player-1', levels: 'nope' }));
    expect(readCachedAccountClears(store, 'player-1')).toBeNull();
  });

  it('exposes the cache only to the signed-in account on this device', () => {
    const account = signedIn();
    writeCachedAccountClears(account, 'player-1', [1, 2, 3]);
    expect(cachedAccountClearsForThisDevice(account)).toEqual([1, 2, 3]);
    // A guest identity never sees an account answer, even if a cache lingers.
    const guest = kv({ [IDENTITY_STORAGE_KEY]: identity('guest') });
    writeCachedAccountClears(guest, 'player-1', [1, 2, 3]);
    expect(cachedAccountClearsForThisDevice(guest)).toBeNull();
    expect(cachedAccountClearsForThisDevice(kv())).toBeNull();
  });

  it('forgetting the answer makes the next read ask again', async () => {
    const store = signedIn();
    writeCachedAccountClears(store, 'player-1', [1, 2, 3]);
    forgetAccountClears(store);
    let asked = 0;
    const result = await loadAccountClears({
      storage: store,
      attempted: new Set(),
      fetchHighest: async () => { asked += 1; return 4; },
    });
    expect(asked).toBe(1);
    expect(result).toEqual({ status: 'ok', highest: 4, levels: [1, 2, 3, 4] });
  });
});

describe('one bounded read, signed-in only, at most once per session', () => {
  it('a guest never asks, and answers signed-out', async () => {
    let asked = 0;
    const result = await loadAccountClears({
      storage: kv({ [IDENTITY_STORAGE_KEY]: identity('guest') }),
      attempted: new Set(),
      fetchHighest: async () => { asked += 1; return 7; },
    });
    expect(asked).toBe(0);
    expect(result).toEqual({ status: 'signed-out' });
  });

  it('no identity, or a blocked store, never asks either', async () => {
    let asked = 0;
    for (const storage of [kv(), null]) {
      const result = await loadAccountClears({
        storage,
        attempted: new Set(),
        fetchHighest: async () => { asked += 1; return 1; },
      });
      expect(result).toEqual({ status: 'signed-out' });
    }
    expect(asked).toBe(0);
  });

  it('a signed-in account is read ONCE, then the cache serves every later open', async () => {
    const store = signedIn();
    const attempted = new Set<string>();
    let asked = 0;
    const fetchHighest = async (token: string) => {
      expect(token).toBe('token-account');
      asked += 1;
      return 7;
    };
    const first = await loadAccountClears({ storage: store, attempted, fetchHighest });
    expect(first).toEqual({ status: 'ok', highest: 7, levels: [1, 2, 3, 4, 5, 6, 7] });
    expect(asked).toBe(1);
    // A second menu open (a reload, in effect) reads the cached value and makes NO request.
    const second = await loadAccountClears({ storage: store, attempted: new Set(), fetchHighest });
    expect(second).toEqual(first);
    expect(asked).toBe(1);
    expect(readCachedAccountClears(store, 'player-1')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('a genuine “nothing cleared” answer is cached, never retried in the session', async () => {
    const store = signedIn();
    const attempted = new Set<string>();
    let asked = 0;
    const fetchHighest = async () => { asked += 1; return null; };
    expect(await loadAccountClears({ storage: store, attempted, fetchHighest }))
      .toEqual({ status: 'ok', highest: null, levels: [] });
    expect(readCachedAccountClears(store, 'player-1')).toEqual([]);
    expect(await loadAccountClears({ storage: store, attempted, fetchHighest }))
      .toEqual({ status: 'ok', highest: null, levels: [] });
    expect(asked).toBe(1);
  });

  it('a FAILED read is unavailable, writes no cache, and is not retried in the session', async () => {
    const store = signedIn();
    const attempted = new Set<string>();
    let asked = 0;
    const fetchHighest = async (): Promise<number | null> => {
      asked += 1;
      throw new Error('network down');
    };
    expect(await loadAccountClears({ storage: store, attempted, fetchHighest })).toEqual({ status: 'unavailable' });
    // The device's truth is untouched: there is simply no account answer to union in.
    expect(readCachedAccountClears(store, 'player-1')).toBeNull();
    expect(await loadAccountClears({ storage: store, attempted, fetchHighest })).toEqual({ status: 'unavailable' });
    expect(asked).toBe(1);
  });

  it('two concurrent callers share the one request', async () => {
    const store = signedIn();
    let asked = 0;
    const fetchHighest = async () => {
      asked += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 3;
    };
    const attempted = new Set<string>();
    const [a, b] = await Promise.all([
      loadAccountClears({ storage: store, attempted, fetchHighest }),
      loadAccountClears({ storage: store, attempted, fetchHighest }),
    ]);
    expect(a).toEqual(b);
    expect(asked).toBe(1);
  });
});

describe('the source keeps the efficiency promises', () => {
  it('has no polling, no render loop, no repeating timer and no per-level request', () => {
    expect(moduleSource).not.toMatch(/setInterval|requestAnimationFrame/);
    // The one setTimeout is the short deadline around the single request, cleared in `finally`.
    expect(moduleSource.match(/setTimeout\(/g)).toHaveLength(1);
    expect(moduleSource).toMatch(/clearTimeout\(deadline\)/);
    // One endpoint, one client call.
    expect(moduleSource.match(/accountCampaignHighest\(/g)).toHaveLength(1);
  });

  it('reads the account’s furthest verified level, never campaign_clears', () => {
    // `campaignHighestLevel` is ONE indexed max over `campaign:cN-M` receipts. `campaign_clears`
    // only fills for a submitted reward proof, so ordinary wins are absent from it.
    expect(moduleSource).not.toMatch(/campaignClears\(|accountCampaignClears\(|recordCampaignClear/);
    expect(clientSource).toContain("'/v1/players/me/campaign'");
    expect(clientSource).toContain('async accountCampaignHighest');
    expect(postgresSource).toContain('async campaignHighestLevel');
    // The server route answers the highest level, derived from the authenticated player only.
    expect(read('../../server/src/fetch-app.ts')).toContain('campaignHighestLevel(player)');
  });

  it('raises stale campaign progress from the cache before the first menu paint', () => {
    const cachedAt = mainSource.indexOf('cachedAccountClearsForThisDevice(store)');
    const mergeAt = mainSource.indexOf('mergeFurtherAheadProgress(campaignProgress, accountClears)');
    expect(mergeAt).toBeGreaterThan(cachedAt);
    expect(mergeAt).toBeLessThan(mainSource.indexOf("else showScreen('menu')"));
  });

  it('is read synchronously at module scope, before the menu’s first paint', () => {
    const cachedAt = mainSource.indexOf('cachedAccountClearsForThisDevice(store)');
    // Boot's first menu paint (and the async account sync) are far below the module-scope read, so
    // a cache hit is already in `accountClears` when layoutMenu runs.
    const firstMenu = mainSource.indexOf("else showScreen('menu')");
    expect(cachedAt).toBeGreaterThan(0);
    expect(firstMenu).toBeGreaterThan(cachedAt);
    // The menu pass itself stays synchronous: the paint is only a function call on that pass.
    const layoutAt = mainSource.indexOf('function layoutMenu(');
    const body = mainSource.slice(layoutAt, mainSource.indexOf('\nfunction showScreen(', layoutAt));
    expect(body).toContain('menuSuggestion.paint(campaignProgress, accountClears)');
    expect(body).not.toMatch(/\bawait\b|fetch\(/);
  });

  it('asks once per menu open: no refresh path, and a clear only forgets the cache', () => {
    // The only caller is boot / a sign-in reload; there is no second request after a clear.
    expect(mainSource).toContain('void syncAccountLevel();');
    expect(mainSource).not.toContain('syncAccountLevel({ refresh: true })');
    // A new clear invalidates the cache, so the NEXT open reads once more; this session keeps the
    // device half and makes no extra request.
    expect(mainSource).toContain('forgetAccountClears(store)');
  });
});
