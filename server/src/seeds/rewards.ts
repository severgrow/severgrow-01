import { LESSON_SEED_REWARD, SEED_ECONOMY, campaignSeedReward } from './config.js';
import type { RewardInput } from './types.js';

/** Called inside a locked settlement transaction using server-owned completed match facts. */
export const planSeedReward = (input: RewardInput, day: {
  modePaid: number;
  pairPaid: number;
  totalEarned: number;
}): { amount: number; reason: string | null } => {
  if (input.mode === 'campaign' && input.lessonLevel !== undefined) {
    return input.lessonLevel === LESSON_SEED_REWARD.level && input.outcome === 'win'
      ? { amount: LESSON_SEED_REWARD.seeds, reason: null }
      : { amount: 0, reason: 'not_a_first_clear' };
  }
  if (input.mode === 'campaign') {
    const reward = campaignSeedReward(input.campaignLevel ?? 0);
    return reward && input.outcome === 'win'
      ? { amount: reward.firstWin + reward.chapter, reason: null }
      : { amount: 0, reason: 'not_a_first_clear' };
  }
  const rules = SEED_ECONOMY.online[input.mode];
  if (day.modePaid >= rules.dailyMatches) return { amount: 0, reason: 'mode_daily_limit' };
  if (rules.pairDailyMatches > 0 && input.opponentId && day.pairPaid >= rules.pairDailyMatches) {
    return { amount: 0, reason: 'opponent_daily_limit' };
  }
  const amount = rules[input.outcome];
  if (!amount) return { amount: 0, reason: 'no_draw_reward' };
  const available = Math.max(0, SEED_ECONOMY.utcDailyRepeatableCap - day.totalEarned);
  return available > 0
    ? { amount: Math.min(amount, available), reason: null }
    : { amount: 0, reason: 'global_daily_limit' };
};
