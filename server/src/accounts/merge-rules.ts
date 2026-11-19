// GUEST → EXISTING ACCOUNT: KEEP THE BEST OF BOTH (owner decision, 2026-11-18, accounts pass).
// The pure rules the merge transaction (merge.ts) applies. Every rule is a union or a maximum, so
// the result is the same in either order and merging twice changes nothing.
import type { AccountCampaignBest, AccountCampaignProgressWire } from '../account-campaign-progress.js';

/** The better of two attempts at one level: a win beats a loss, then the higher score, then fewer turns. */
export const betterBest = (a: AccountCampaignBest, b: AccountCampaignBest): AccountCampaignBest => {
  if (a.won !== b.won) return a.won ? a : b;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  if (a.turns !== b.turns) return a.turns < b.turns ? a : b;
  return a;
};

/** Every level either cleared, and the better result per level. */
export const unionCampaignProgress = (
  a: AccountCampaignProgressWire,
  b: AccountCampaignProgressWire,
): AccountCampaignProgressWire => {
  const completed = [...new Set([...a.completed, ...b.completed])].sort();
  const best: Record<string, AccountCampaignBest> = {};
  for (const id of [...new Set([...Object.keys(a.best), ...Object.keys(b.best)])].sort()) {
    const x = a.best[id];
    const y = b.best[id];
    best[id] = x && y ? betterBest(x, y) : (x ?? y)!;
  }
  return { completed, best };
};

export type StreakPair = { current: number; best: number };

/** One Practice key: the higher best; the account's current streak (the guest's only if the account never played it). */
export const mergePracticeStreak = (account: StreakPair | null, guest: StreakPair): StreakPair =>
  account ? { current: account.current, best: Math.max(account.best, guest.best) } : { ...guest };

/** Online Blitz: the higher best; the current streak stays the account's own (0 if it has none). */
export const mergeBlitzStreak = (account: StreakPair | null, guest: StreakPair): StreakPair => ({
  current: account?.current ?? 0,
  best: Math.max(account?.best ?? 0, guest.best),
});
