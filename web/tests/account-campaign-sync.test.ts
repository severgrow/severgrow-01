// ACCOUNT CAMPAIGN CONTINUITY (owner, 2026-11-08): campaign progress belongs to the account.
// When two devices disagree, keep the FURTHER-AHEAD snapshot. Seeds, Territory and achievement
// rewards stay server-authoritative — a local save must never raise them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LEVELS,
  currentLevel,
  furtherAheadProgress,
  mergeAccountProgress,
  progressRank,
  reconcileProgress,
} from '../../src/campaign/index.js';
import type { CampaignProgress } from '../../src/campaign/index.js';
import {
  ACCOUNT_CAMPAIGN_PROGRESS_PATHS,
  assertProgressSyncIsSafe,
  progressWireFromLocal,
  progressWireToLocal,
} from '../src/logic/account-campaign-sync.js';

const placeAt = (n: number, best: CampaignProgress['best'] = {}): CampaignProgress => ({
  version: 1,
  unlocked: n,
  completed: CAMPAIGN_LEVELS.slice(0, n - 1).map((level) => level.id),
  best,
});

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('further-ahead merge keeps the stronger campaign place', () => {
  it('an account snapshot further ahead raises a fresh device', () => {
    const local = placeAt(1);
    const account = placeAt(37);
    const merged = furtherAheadProgress(local, account);
    expect(currentLevel(merged).number).toBe(37);
    expect(merged.completed).toHaveLength(36);
    expect(local.completed).toEqual([]);
  });

  it('a local record further ahead is kept (same object) when the account lags', () => {
    const local = placeAt(40);
    const account = placeAt(12);
    expect(furtherAheadProgress(local, account)).toBe(local);
  });

  it('equal places keep the preferred (local) object — no rewrite', () => {
    const local = placeAt(20);
    const account = placeAt(20);
    expect(furtherAheadProgress(local, account)).toBe(local);
  });

  it('within the same unlocked place, an attempt on the open level is further ahead', () => {
    const open = CAMPAIGN_LEVELS[11]!; // unlocked 12 means level 12 is open
    const bare = placeAt(12);
    const attempted = placeAt(12, { [open.id]: { won: false, score: 3, turns: 8 } });
    expect(progressRank(attempted).attemptedCurrent).toBe(1);
    expect(furtherAheadProgress(bare, attempted)).toBe(attempted);
    expect(furtherAheadProgress(attempted, bare)).toBe(attempted);
  });

  it('mergeAccountProgress also applies verified receipt highest, then further-ahead', () => {
    // Desktop at 1; account snapshot empty; verified receipts say 36 cleared → place 37.
    const local = placeAt(1);
    expect(currentLevel(mergeAccountProgress(local, null, 36)).number).toBe(37);

    // Phone local at 40; account snapshot at 20; receipts at 36 → local still wins.
    const ahead = placeAt(40);
    expect(mergeAccountProgress(ahead, placeAt(20), 36)).toBe(ahead);

    // Desktop local at 5; account snapshot at 30; receipts at 10 → account snapshot wins.
    const desktop = placeAt(5);
    const account = placeAt(30);
    const merged = mergeAccountProgress(desktop, account, 10);
    expect(currentLevel(merged).number).toBe(30);
    expect(reconcileProgress(desktop, 10).unlocked).toBeLessThan(merged.unlocked);
  });
});

describe('wire round-trip and economy isolation', () => {
  it('round-trips a progress record without inventing a score', () => {
    const local = placeAt(8, { [CAMPAIGN_LEVELS[0]!.id]: { won: true, score: 12, turns: 4 } });
    const wire = progressWireFromLocal(local);
    expect(wire.completed).toEqual(local.completed);
    expect(wire.best).toEqual(local.best);
    const back = progressWireToLocal(wire);
    expect(back.completed).toEqual(local.completed);
    expect(back.best).toEqual(local.best);
    expect(back.unlocked).toBe(local.unlocked);
  });

  it('the sync module may only talk to campaign progress paths — never Seeds/Territory/achievements', () => {
    expect(ACCOUNT_CAMPAIGN_PROGRESS_PATHS).toEqual([
      '/v1/players/me/campaign/progress',
    ]);
    for (const path of ACCOUNT_CAMPAIGN_PROGRESS_PATHS) {
      expect(() => assertProgressSyncIsSafe(path)).not.toThrow();
    }
    for (const banned of [
      '/v1/seeds/wallet',
      '/v1/seeds/claim',
      '/v1/seeds/achievements',
      '/v1/world/claims',
      '/v1/world/sales',
      '/v1/players/me/offline',
    ]) {
      expect(() => assertProgressSyncIsSafe(banned)).toThrow(/must not/i);
    }

    const syncSource = read('../src/logic/account-campaign-sync.ts');
    expect(syncSource).not.toMatch(/seeds\/wallet|world\/claims|achievements|putOfflineStats|seed_wallets/);
    expect(syncSource).toContain('/v1/players/me/campaign/progress');
  });
});
