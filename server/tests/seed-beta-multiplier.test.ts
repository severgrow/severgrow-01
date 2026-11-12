// THE BETA PAYOUT DOUBLING (owner, 2026-10-26): "temporarily until i say to revert - lets keep the
// same seeds payout system we have already, but make it pay double - twice as much as currently -
// so all beta testers are encouraged more to get involved properly in the territory side of the
// game. including bonuses and all".
//
// These tests exist because a multiplier applied at ONE decision point is easy to lose in a later
// refactor: an amount added somewhere else, or a cap left behind, would quietly take the doubling
// back on the paths nobody re-checked. They pin four things:
//   * every paying path is doubled (campaign first clear, chapter bonus, level 10, duel, training);
//   * the DAILY CEILING doubled with them, or the doubling is reclaimed at the top end;
//   * the COUNT limits did NOT double - those guard how many matches may pay at all (anti-farming),
//     not how much each one pays;
//   * prices did NOT move, which is the whole point: the payout rises and Territory stays affordable.
import { describe, expect, it } from 'vitest';
import {
  BETA_PAYOUT_MULTIPLIER,
  LESSON_SEED_REWARD,
  SEED_ECONOMY,
  campaignSeedReward,
} from '../src/seeds/config.js';
import { planSeedReward } from '../src/seeds/rewards.js';
import type { RewardInput } from '../src/seeds/types.js';

const clean = { modePaid: 0, pairPaid: 0, totalEarned: 0 };

const duel = (mode: 'queue' | 'friend' | 'training', outcome: 'win' | 'loss' | 'draw'): RewardInput => ({
  playerId: 'p1',
  sourceKey: `${mode}:x`,
  mode,
  outcome,
  opponentId: 'opponent',
  now: 0,
});

describe('the beta payout doubling', () => {
  it('is exactly 2, and is one constant so it can be reverted alone', () => {
    expect(BETA_PAYOUT_MULTIPLIER).toBe(2);
  });

  it('doubles every duel and training outcome', () => {
    for (const mode of ['queue', 'friend', 'training'] as const) {
      for (const outcome of ['win', 'loss', 'draw'] as const) {
        const base = SEED_ECONOMY.online[mode][outcome];
        const planned = planSeedReward(duel(mode, outcome), clean).amount;
        expect(planned, `${mode} ${outcome}`).toBe(base * BETA_PAYOUT_MULTIPLIER);
      }
    }
  });

  it('doubles a campaign first clear INCLUDING its chapter bonus', () => {
    // Level 20 pays 15 for the clear plus a 60 chapter bonus: the doubling covers the sum, not
    // just the first-clear figure - "including bonuses and all".
    const reward = campaignSeedReward(20)!;
    expect(reward.firstWin).toBe(15);
    expect(reward.chapter).toBe(60);
    const planned = planSeedReward(
      { playerId: 'p1', sourceKey: 'campaign:c2-20', mode: 'campaign', outcome: 'win', opponentId: null, now: 0, campaignLevel: 20 },
      clean,
    );
    expect(planned.amount).toBe((reward.firstWin + reward.chapter) * BETA_PAYOUT_MULTIPLIER);
  });

  it('doubles level 10, the final lesson', () => {
    const planned = planSeedReward(
      { playerId: 'p1', sourceKey: 'lesson:10', mode: 'campaign', outcome: 'win', opponentId: null, now: 0, lessonLevel: 10 },
      clean,
    );
    expect(planned.amount).toBe(LESSON_SEED_REWARD.seeds * BETA_PAYOUT_MULTIPLIER);
  });

  it('moves the daily ceiling with the awards, or the doubling is taken back at the top', () => {
    // Exactly the BASE ceiling already earned: with the ceiling doubled there is still room, so a
    // win still pays in full. Before the ceiling moved, this was the `global_daily_limit` case.
    const atBaseCeiling = planSeedReward(duel('friend', 'win'), {
      modePaid: 0,
      pairPaid: 0,
      totalEarned: SEED_ECONOMY.utcDailyRepeatableCap,
    });
    expect(atBaseCeiling.reason).toBeNull();
    expect(atBaseCeiling.amount).toBe(SEED_ECONOMY.online.friend.win * BETA_PAYOUT_MULTIPLIER);

    // At the DOUBLED ceiling the day really is closed.
    const atDoubledCeiling = planSeedReward(duel('friend', 'win'), {
      modePaid: 0,
      pairPaid: 0,
      totalEarned: SEED_ECONOMY.utcDailyRepeatableCap * BETA_PAYOUT_MULTIPLIER,
    });
    expect(atDoubledCeiling).toEqual({ amount: 0, reason: 'global_daily_limit' });
  });

  it('never pays past the doubled ceiling, even when a single award would overshoot it', () => {
    // One Seed short of the new ceiling: the award is trimmed to fit rather than refused.
    const ceiling = SEED_ECONOMY.utcDailyRepeatableCap * BETA_PAYOUT_MULTIPLIER;
    const planned = planSeedReward(duel('queue', 'win'), { modePaid: 0, pairPaid: 0, totalEarned: ceiling - 1 });
    expect(planned).toEqual({ amount: 1, reason: null });
  });

  it('does NOT double the count limits: they guard how many matches pay, not how much', () => {
    // `dailyMatches` is an anti-farming count, so doubling payouts must not let twice as many
    // matches pay. The Nth+1 match is still refused.
    const limit = SEED_ECONOMY.online.friend.dailyMatches;
    expect(limit).toBe(10);
    const refused = planSeedReward(duel('friend', 'win'), { modePaid: limit, pairPaid: 0, totalEarned: 0 });
    expect(refused).toEqual({ amount: 0, reason: 'mode_daily_limit' });
    // ...and the last allowed one still pays, doubled.
    const allowed = planSeedReward(duel('friend', 'win'), { modePaid: limit - 1, pairPaid: 0, totalEarned: 0 });
    expect(allowed.amount).toBe(SEED_ECONOMY.online.friend.win * BETA_PAYOUT_MULTIPLIER);
  });

  it('does NOT touch prices - a tile still costs 100, and a challenge costs nothing', () => {
    // The encouragement is "you earn more", never "things got cheaper", so the tile price must not
    // move with the multiplier (it is a price, not a payout). A CHALLENGE stopped being a price on
    // 2026-10-29: it is free, and the challenger stakes a tile instead.
    expect(SEED_ECONOMY.tileCost).toBe(100);
    expect('challengeStake' in SEED_ECONOMY).toBe(false);
  });
});
