// THE ACCOUNT'S PLACE IS THE SERVER'S (owner report, 2026-10-25): "on my RYK account - im at
// level 35 and i see it on mobile when playing mobile - but if im on my account on dekstop it shows
// level 1 ---- for accounts it should always now what level you are on on your acccount".
//
// Campaign progress lived ONLY in the browser, so a second device started at level 1 even though
// the signed-in account had already paid for a long run of levels. The server already knows the
// furthest level the account has a verified first-clear receipt for; the client now RAISES a local
// record to match it on load. The rule these tests pin:
//
//   * the read is one-way and additive: server ahead RAISES, never lowers;
//   * local ahead (or equal) keeps the local record untouched, object and all;
//   * a guest, or a failed read, is exactly today's local-only game;
//   * the Tutorial's levels 1-9 stay replayable whatever the synced place is.
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LEVELS,
  currentLevel,
  isUnlocked,
  reconcileProgress,
} from '../../src/campaign/index.js';
import type { CampaignProgress } from '../../src/campaign/index.js';
import {
  readAccountIdentity,
  syncAccountProgress,
} from '../src/logic/account-progress.js';
import { tutorialLevel, tutorialLevels } from '../src/logic/campaign.js';
import { IDENTITY_STORAGE_KEY } from '../src/online/identity.js';
import type { KeyValue } from '../../server/src/client.js';

/** A player who has won every level below `n`; `n` itself is the place they are working on. */
const placeAt = (n: number): CampaignProgress => ({
  version: 1,
  unlocked: n,
  completed: CAMPAIGN_LEVELS.slice(0, n - 1).map((level) => level.id),
  best: {},
});
const lvl = (n: number) => CAMPAIGN_LEVELS[n - 1]!;

/** The account's own storage, without a browser: one plain map per test. */
const kv = (initial: Record<string, string> = {}): KeyValue => {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => { map.set(key, value); },
    remove: (key) => { map.delete(key); },
  };
};
const accountIdentity = (kind: 'guest' | 'account') => JSON.stringify({
  token: `token-${kind}`, playerId: 'player-1', displayName: null, kind,
});

describe("the server's known place raises a local record, never lowers it", () => {
  it('a fresh desktop record is raised to the account: level 37 is the place after cleared 36', () => {
    const local: CampaignProgress = { version: 1, unlocked: 1, completed: [], best: {} };
    const after = reconcileProgress(local, 36);

    // The server says level 36 was CLEARED (a paid first clear is a verified win), so the next
    // level to play is 37. Crucially, it is no longer level 1: nothing has to be replayed.
    expect(currentLevel(after).number).toBe(37);
    expect(after.completed).toHaveLength(36);
    expect(after.completed).toEqual(CAMPAIGN_LEVELS.slice(0, 36).map((level) => level.id));
    expect(after.unlocked).toBe(37);
    // The original record is not mutated (the caller decides what to persist).
    expect(local.completed).toEqual([]);
    expect(local.unlocked).toBe(1);
  });

  it('a gap in the local record is filled in BUILT LEVEL ORDER, not guessed', () => {
    // The account paid for level 5 and 6 but the local record only remembers 1-2 (the old browser
    // was wiped): every level up to the server's highest is known cleared, so the place is 7.
    const local: CampaignProgress = {
      version: 1, unlocked: 3,
      completed: CAMPAIGN_LEVELS.slice(0, 2).map((level) => level.id), best: {},
    };
    const after = reconcileProgress(local, 6);
    expect(currentLevel(after).number).toBe(7);
    expect(after.completed).toEqual(CAMPAIGN_LEVELS.slice(0, 6).map((level) => level.id));
  });

  it('a local record further along is kept exactly as it is', () => {
    const local = placeAt(40);
    expect(reconcileProgress(local, 36)).toBe(local);
  });

  it('an equal record is left untouched (same object, no rewrite)', () => {
    const local = placeAt(37); // cleared 1-36
    expect(reconcileProgress(local, 36)).toBe(local);
  });

  it('an unknown or unreachable server value changes nothing', () => {
    const local = placeAt(12);
    for (const value of [null, undefined, 0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reconcileProgress(local, value)).toBe(local);
    }
  });

  it('a best-attempt map already on the device survives the raise', () => {
    const local: CampaignProgress = {
      version: 1, unlocked: 1, completed: [], best: { [lvl(1).id]: { won: false, score: 4, turns: 9 } },
    };
    const after = reconcileProgress(local, 2);
    expect(after.best[lvl(1).id]).toEqual({ won: false, score: 4, turns: 9 });
    expect(currentLevel(after).number).toBe(3);
  });

  it('the Tutorial is untouched: levels 1-9 stay replayable from a synced-ahead place', () => {
    const after = reconcileProgress(placeAt(1), 36);
    expect(tutorialLevels()).toHaveLength(9);
    expect(tutorialLevel(1)).not.toBeNull();
    expect(tutorialLevel(9)).not.toBeNull();
    // A tutorial replay writes nothing (pinned in campaign-flow.test.ts); the place stays the
    // account's place even if an old tutorial tile is opened.
    expect(isUnlocked(after, lvl(1))).toBe(true);
    expect(currentLevel(after).number).toBe(37);
  });
});

describe('only a signed-in ACCOUNT is synced', () => {
  const account = (kind: 'guest' | 'account') => kv({ [IDENTITY_STORAGE_KEY]: accountIdentity(kind) });

  it('a guest never asks the server and keeps its local record', async () => {
    const local = placeAt(5);
    let asked = 0;
    const after = await syncAccountProgress(local, {
      storage: account('guest'),
      fetchHighest: async () => { asked += 1; return 36; },
    });
    expect(asked).toBe(0);
    expect(after).toBe(local);
  });

  it('no identity on the device is the same local-only game', async () => {
    const local = placeAt(5);
    let asked = 0;
    const after = await syncAccountProgress(local, {
      storage: kv(),
      fetchHighest: async () => { asked += 1; return 36; },
    });
    expect(asked).toBe(0);
    expect(after).toBe(local);
  });

  it('a signed-in account is raised from the server', async () => {
    const local = placeAt(1);
    const after = await syncAccountProgress(local, {
      storage: account('account'),
      fetchHighest: async (token) => {
        expect(token).toBe('token-account');
        return 36;
      },
    });
    expect(currentLevel(after).number).toBe(37);
  });

  it('a failed read changes nothing and never throws at the caller', async () => {
    const local = placeAt(5);
    const after = await syncAccountProgress(local, {
      storage: account('account'),
      fetchHighest: async () => { throw new Error('network down'); },
    });
    expect(after).toBe(local);
  });

  it('reads only the stored identity, and tolerates a malformed one', () => {
    expect(readAccountIdentity(null)).toBeNull();
    expect(readAccountIdentity(kv({ [IDENTITY_STORAGE_KEY]: '{not json' }))).toBeNull();
    expect(readAccountIdentity(kv({ [IDENTITY_STORAGE_KEY]: JSON.stringify({ token: 't' }) }))).toBeNull();
    expect(readAccountIdentity(account('account'))).toMatchObject({ token: 'token-account', kind: 'account' });
  });
});
