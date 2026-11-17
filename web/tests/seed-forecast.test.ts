// SEEDS ON THE CARD THE MOMENT THE GAME ENDS (owner, 2026-11-16/17: "seeds at the end of the game are
// coming kinda late ... make the planet and seeds payout as instant as possible"; asked, he left the
// method to us). The award is worked out on the device with the server's OWN rule (`planSeedReward`)
// and this device's tally of today's paid games; the server still verifies the replay, and its
// receipt corrects the card in the rare case they differ. See logic/seed-forecast.ts.
import { describe, expect, it } from 'vitest';
import { planSeedReward } from '../../server/src/seeds/rewards.js';
import { SEED_ECONOMY } from '../../server/src/seeds/config.js';
import { SEED_DAY_KEY, forecastSeeds, noteSeedsPaid } from '../src/logic/seed-forecast.js';

const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, remove: (k: string) => { m.delete(k); } };
};
const NOW = Date.UTC(2026, 10, 17, 12);
const DAY = 86_400_000;

describe('the forecast is the server rule', () => {
  it('a Practice win, loss and draw forecast exactly what the server would pay on a fresh day', () => {
    const store = memory();
    for (const outcome of ['win', 'loss', 'draw'] as const) {
      const server = planSeedReward({ playerId: 'p', sourceKey: 's', mode: 'training', outcome, opponentId: null, now: NOW }, { modePaid: 0, pairPaid: 0, totalEarned: 0 }).amount;
      expect(forecastSeeds(store, { kind: 'training', outcome }, NOW)).toBe(server);
    }
  });

  it('a Campaign first clear forecasts the level\'s own payment', () => {
    const store = memory();
    for (const level of [1, 10, 47, 91, 100]) {
      const server = planSeedReward({ playerId: 'p', sourceKey: 's', mode: 'campaign', outcome: 'win', opponentId: null, now: NOW, campaignLevel: level }, { modePaid: 0, pairPaid: 0, totalEarned: 0 }).amount;
      expect(forecastSeeds(store, { kind: 'campaign', level }, NOW)).toBe(server);
    }
  });
});

describe('the day\'s limits, from this device\'s own tally', () => {
  it(`after ${SEED_ECONOMY.online.training.dailyMatches} paid Practice games today, the next forecasts nothing`, () => {
    const store = memory();
    for (let i = 0; i < SEED_ECONOMY.online.training.dailyMatches; i++) noteSeedsPaid(store, `training:${i}`, 'training', 20, NOW);
    expect(forecastSeeds(store, { kind: 'training', outcome: 'win' }, NOW)).toBe(0);
  });

  it('the same receipt is counted once', () => {
    const store = memory();
    for (let i = 0; i < 10; i++) noteSeedsPaid(store, 'training:same', 'training', 20, NOW);
    expect(forecastSeeds(store, { kind: 'training', outcome: 'win' }, NOW)).toBeGreaterThan(0);
  });

  it('a new UTC day starts a fresh tally', () => {
    const store = memory();
    for (let i = 0; i < 6; i++) noteSeedsPaid(store, `training:${i}`, 'training', 20, NOW);
    expect(forecastSeeds(store, { kind: 'training', outcome: 'win' }, NOW + DAY)).toBeGreaterThan(0);
  });

  it('duel payouts count toward the daily ceiling', () => {
    const store = memory();
    for (let i = 0; i < 40; i++) noteSeedsPaid(store, `duel:${i}`, 'queue', 60, NOW);
    expect(forecastSeeds(store, { kind: 'training', outcome: 'win' }, NOW)).toBe(0);
  });

  it('a corrupt or foreign tally is ignored, never a crash', () => {
    const store = memory();
    store.set(SEED_DAY_KEY, '{nonsense');
    expect(forecastSeeds(store, { kind: 'training', outcome: 'win' }, NOW)).toBeGreaterThan(0);
    store.set(SEED_DAY_KEY, JSON.stringify({ day: 'x', keys: 5 }));
    expect(forecastSeeds(store, { kind: 'training', outcome: 'win' }, NOW)).toBeGreaterThan(0);
  });
});
