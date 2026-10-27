import { BETA_PAYOUT_MULTIPLIER, LESSON_SEED_REWARD, SEED_ECONOMY, campaignSeedReward } from './config.js';
import type { RewardInput } from './types.js';

/**
 * Every award is multiplied by `BETA_PAYOUT_MULTIPLIER` HERE, at the one place an amount is
 * decided, so no paying path can be forgotten and reverting the beta is one constant (see its note
 * in `config.ts`). `Math.round` keeps a future fractional multiplier from producing a fraction of a
 * Seed; with the current 2 it is a no-op.
 */
const pay = (seeds: number): number => Math.round(seeds * BETA_PAYOUT_MULTIPLIER);

/** Called inside a locked settlement transaction using server-owned completed match facts. */
export const planSeedReward = (input: RewardInput, day: {
  modePaid: number;
  pairPaid: number;
  totalEarned: number;
}): { amount: number; reason: string | null } => {
  // THE DAILY PUZZLE (owner, 2026-10-27): the reward is ONE Territory tile, not Seeds — so it pays
  // exactly a tile's price, which the PLACE IT step spends at once. Never multiplied by the beta
  // payout (a doubled tile would be two tiles), and outside the daily cap like a campaign clear.
  if (input.mode === 'campaign' && input.dailyPuzzle !== undefined) {
    return input.outcome === 'win' && Number.isInteger(input.dailyPuzzle) && input.dailyPuzzle >= 1
      ? { amount: SEED_ECONOMY.tileCost, reason: null }
      : { amount: 0, reason: 'not_a_solve' };
  }
  if (input.mode === 'campaign' && input.lessonLevel !== undefined) {
    return input.lessonLevel === LESSON_SEED_REWARD.level && input.outcome === 'win'
      ? { amount: pay(LESSON_SEED_REWARD.seeds), reason: null }
      : { amount: 0, reason: 'not_a_first_clear' };
  }
  if (input.mode === 'campaign') {
    const reward = campaignSeedReward(input.campaignLevel ?? 0);
    return reward && input.outcome === 'win'
      ? { amount: pay(reward.firstWin + reward.chapter), reason: null }
      : { amount: 0, reason: 'not_a_first_clear' };
  }
  const rules = SEED_ECONOMY.online[input.mode];
  if (day.modePaid >= rules.dailyMatches) return { amount: 0, reason: 'mode_daily_limit' };
  if (rules.pairDailyMatches > 0 && input.opponentId && day.pairPaid >= rules.pairDailyMatches) {
    return { amount: 0, reason: 'opponent_daily_limit' };
  }
  const amount = pay(rules[input.outcome]);
  if (!amount) return { amount: 0, reason: 'no_draw_reward' };
  // The ceiling moves with the awards, or the doubling is taken back at the top end.
  const available = Math.max(0, pay(SEED_ECONOMY.utcDailyRepeatableCap) - day.totalEarned);
  return available > 0
    ? { amount: Math.min(amount, available), reason: null }
    : { amount: 0, reason: 'global_daily_limit' };
};
