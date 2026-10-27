// THE DAILY PUZZLE's tile (owner, 2026-10-27): a solve is REPLAYED by the server through the real
// rules from the shipped puzzle's start, and pays exactly one tile's price once per puzzle — only for
// today's puzzle (yesterday's is accepted as a grace for a solve sent just after midnight UTC).
import { describe, expect, it } from 'vitest';
import { legalActions, viewFor } from '../../src/engine/index.js';
import { prove } from '../../src/daily/core.js';
import { dailyPuzzle } from '../../src/daily/puzzles.js';
import { DAILY_EPOCH } from '../../src/daily/schedule.js';
import { BETA_PAYOUT_MULTIPLIER, SEED_ECONOMY } from '../src/seeds/config.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { planSeedReward } from '../src/seeds/rewards.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import type { PlayerRecord, Storage } from '../src/storage/types.js';

const DAY = 86_400_000;
const dayStart = (no: number) => Date.parse(`${DAILY_EPOCH}T00:00:00Z`) + (no - 1) * DAY;
const player = { id: '00000000-0000-4000-8000-000000000042' } as PlayerRecord;
const matches = { hitRateLimit: async () => ({ ok: true }) } as unknown as Storage;
const economy = (now: number) => new WorldEconomyService(new MemoryWorldEconomyStore(), matches, () => now);
const answer = (no: number) => {
  const proof = prove(dailyPuzzle(no)!, 50_000, 6);
  if (!proof.ok) throw new Error('unproven puzzle');
  return proof.solution;
};

describe('the daily puzzle pays one tile', () => {
  it('a real solve of today\'s puzzle pays exactly one tile, once', async () => {
    const e = economy(dayStart(2) + 3_600_000);
    const first = await e.daily(player, 2, answer(2));
    expect(first.awarded).toBe(SEED_ECONOMY.tileCost);
    expect(first.wallet.balance).toBe(SEED_ECONOMY.tileCost);
    const again = await e.daily(player, 2, answer(2));
    expect(again.replayed).toBe(true);
    expect(again.wallet.balance).toBe(SEED_ECONOMY.tileCost);
  });

  it('is never doubled by the beta payout: the reward is one tile', () => {
    expect(BETA_PAYOUT_MULTIPLIER).toBeGreaterThanOrEqual(1);
    const base = { playerId: player.id, sourceKey: 'daily:3', mode: 'campaign' as const, outcome: 'win' as const, opponentId: null, now: 0 };
    expect(planSeedReward({ ...base, dailyPuzzle: 3 }, { modePaid: 99, pairPaid: 99, totalEarned: 99_999 }).amount).toBe(SEED_ECONOMY.tileCost);
    expect(planSeedReward({ ...base, outcome: 'loss', dailyPuzzle: 3 }, { modePaid: 0, pairPaid: 0, totalEarned: 0 }).amount).toBe(0);
  });

  it('yesterday\'s puzzle is still accepted; older and future ones are not', async () => {
    const e = economy(dayStart(3) + 60_000);
    await expect(e.daily(player, 2, answer(2))).resolves.toMatchObject({ awarded: SEED_ECONOMY.tileCost });
    await expect(e.daily(player, 1, answer(1))).rejects.toThrow(/not open/);
    await expect(e.daily(player, 4, answer(4))).rejects.toThrow(/not open/);
    await expect(economy(dayStart(1) - 1).daily(player, 1, answer(1))).rejects.toThrow(/not open/);
  });

  it('a turn that does not meet the goal, or is not a legal finished turn, is refused', async () => {
    const e = economy(dayStart(5));
    const p = dailyPuzzle(5)!;
    const end = legalActions(viewFor(p.start, 0)).find((a) => a.t === 'EndAct')!;
    await expect(e.daily(player, 5, [end])).rejects.toThrow(/could not be verified/);
    await expect(e.daily(player, 5, [])).rejects.toThrow(/could not be verified/);
    await expect(e.daily(player, 5, [{ t: 'Draw', from: 'deck' }, ...answer(5)])).rejects.toThrow(/could not be verified/);
    // another day's answer is not this day's
    await expect(e.daily(player, 5, answer(4))).rejects.toThrow(/could not be verified/);
    await expect(e.daily(player, 99_999, answer(5))).rejects.toThrow(/not open/);
  });
});
