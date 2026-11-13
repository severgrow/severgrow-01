// SIGNING OUT LEAVES THE ACCOUNT'S PLACE BEHIND (owner, 2026-11-13: "when I sign out, level still shows
// my level in campaign ... those should be locked to account only ... after sign out it should go back
// to level 1"). On a signed-in device the campaign record is raised to the account's verified clears
// (main.ts, account-clears.ts). Sign-out clears every key that carries that place, so the reloaded
// page is a fresh guest at level 1. Signing in again brings the account's place straight back.
import type { KeyValue } from '../../../server/src/client.js';

/**
 * The campaign record, the game in progress, the cached account clears, the remembered balance.
 * Written out (not imported) so the account code never pulls in the level data; the test pins each
 * one to its owning constant (CAMPAIGN_PROGRESS_KEY, CAMPAIGN_SAVE_KEY, ACCOUNT_CLEARS_KEY,
 * SEED_BALANCE_KEY).
 */
export const ACCOUNT_BOUND_KEYS: readonly string[] = Object.freeze([
  'severgrow.campaign.progress.v3',
  'severgrow.campaign.save.v3',
  'severgrow.campaign.account-clears.v1',
  'severgrow.seeds.balance.v1',
]);

export const clearAccountBoundProgress = (kv: KeyValue | null): void => {
  for (const key of ACCOUNT_BOUND_KEYS) {
    try { kv?.remove(key); } catch { /* storage blocked */ }
  }
};
