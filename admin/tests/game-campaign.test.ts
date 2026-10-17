import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_SUFFIXES,
  IDENTITY_SUFFIX,
  campaignKeysOnDevice,
  clearCampaignOnDevice,
  devicePlayer,
} from '../src/game-campaign.js';
import type { Store } from '../src/game-campaign.js';

/** An in-memory Storage stand-in, so the rules can be tested without a browser. */
class MemoryStore implements Store {
  readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const identity = (playerId: string, displayName: string | null = 'RYK'): string =>
  JSON.stringify({ token: 't'.repeat(24), playerId, displayName, kind: 'account' });

const progress = JSON.stringify({ version: 1, unlocked: 4, completed: ['c1-01'], best: {} });

describe('the browser identity the reset depends on', () => {
  it('reads the published channel first', () => {
    const store = new MemoryStore();
    store.setItem(`futa05:${IDENTITY_SUFFIX}`, identity('p-1'));
    store.setItem(`main2:${IDENTITY_SUFFIX}`, identity('p-2'));
    expect(devicePlayer(store)).toMatchObject({ playerId: 'p-1', prefix: 'futa05:', displayName: 'RYK' });
  });

  it('reads an older channel when the published one is absent', () => {
    const store = new MemoryStore();
    store.setItem(`main2:${IDENTITY_SUFFIX}`, identity('p-2', null));
    expect(devicePlayer(store)).toMatchObject({ playerId: 'p-2', prefix: 'main2:', displayName: null });
  });

  it('treats a malformed identity as absent, never as a match', () => {
    const store = new MemoryStore();
    store.setItem(`futa05:${IDENTITY_SUFFIX}`, '{"token":"abc"}');
    expect(devicePlayer(store)).toBeNull();
  });

  it('reports no player when the browser has never played online', () => {
    expect(devicePlayer(new MemoryStore())).toBeNull();
  });
});

describe('what a campaign reset may touch', () => {
  it('finds every campaign record whatever channel wrote it', () => {
    const store = new MemoryStore();
    store.setItem(`futa05:${CAMPAIGN_SUFFIXES[0]}`, progress);
    store.setItem(`main2:${CAMPAIGN_SUFFIXES[1]}`, '{}');
    store.setItem(CAMPAIGN_SUFFIXES[2], 'campaign');
    expect(campaignKeysOnDevice(store)).toEqual([
      `futa05:${CAMPAIGN_SUFFIXES[0]}`,
      `main2:${CAMPAIGN_SUFFIXES[1]}`,
      CAMPAIGN_SUFFIXES[2],
    ].sort());
  });

  it('ignores settings, the identity and the classic save', () => {
    const store = new MemoryStore();
    store.setItem(`futa05:${IDENTITY_SUFFIX}`, identity('p-1'));
    store.setItem('futa05:severgrow.settings.v1', '{}');
    store.setItem('futa05:severgrow.save.v7', '{}');
    expect(campaignKeysOnDevice(store)).toEqual([]);
  });

  it('clears exactly the campaign record and leaves everything else in place', () => {
    const store = new MemoryStore();
    store.setItem(`futa05:${CAMPAIGN_SUFFIXES[0]}`, progress);
    store.setItem(`futa05:${CAMPAIGN_SUFFIXES[2]}`, 'campaign');
    store.setItem(`futa05:${IDENTITY_SUFFIX}`, identity('p-1'));
    store.setItem('futa05:severgrow.settings.v1', '{"sound":true}');
    store.setItem('futa05:severgrow.save.v7', 'classic');

    const { removed } = clearCampaignOnDevice(store);

    expect(removed.length).toBe(2);
    expect(campaignKeysOnDevice(store)).toEqual([]);
    expect(store.getItem(`futa05:${IDENTITY_SUFFIX}`)).not.toBeNull();
    expect(store.getItem('futa05:severgrow.settings.v1')).toBe('{"sound":true}');
    expect(store.getItem('futa05:severgrow.save.v7')).toBe('classic');
  });

  it('is a no-op on a browser with no campaign record', () => {
    const store = new MemoryStore();
    store.setItem(`futa05:${IDENTITY_SUFFIX}`, identity('p-1'));
    expect(clearCampaignOnDevice(store).removed).toEqual([]);
    expect(store.getItem(`futa05:${IDENTITY_SUFFIX}`)).not.toBeNull();
  });
});
