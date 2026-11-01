// Owner decision, 2026-11-01: from level 11 up, every campaign attempt is a fresh, random deal —
// "as if you'd be playing a card game in real life". Difficulty comes from the level's authored
// board and its bot level only; the deal (hands, piles, who starts) is shuffled every time.
// Levels 1-10 are authored lessons and keep their one fixed opening.
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LEVELS,
  RANDOM_DEALS_FROM_LEVEL,
  campaignDeal,
  campaignOpening,
  dealsRandomly,
  isDealSeed,
} from '../../src/campaign/index.js';

const SEEDS = [1, 7, 12345, 99_999_999, 4_000_000_000, 0xffffffff] as const;

describe('which campaign levels deal randomly', () => {
  it('starts at level 11; the ten lessons keep their fixed openings', () => {
    expect(RANDOM_DEALS_FROM_LEVEL).toBe(11);
    for (const level of CAMPAIGN_LEVELS) expect(dealsRandomly(level)).toBe(level.number >= 11);
  });
});

describe('a deal seed', () => {
  it('is a whole 32-bit unsigned number and nothing else', () => {
    for (const ok of [0, 1, 123, 0xffffffff]) expect(isDealSeed(ok)).toBe(true);
    for (const bad of [-1, 1.5, 0x1_0000_0000, Number.NaN, Infinity, '12', null, undefined, {}]) {
      expect(isDealSeed(bad)).toBe(false);
    }
  });
});

describe('a random deal keeps the level and changes only the cards', () => {
  const late = CAMPAIGN_LEVELS.filter(dealsRandomly);

  it('every random-deal level has an authored board, so the terrain never depends on the deal', () => {
    for (const level of late) expect(level.config.board, level.id).toBeTruthy();
  });

  it('the board, rock and gold are identical for every seed; the hands are not', () => {
    for (const level of late) {
      const fixed = campaignOpening(level);
      const hands = new Set<string>();
      for (const seed of SEEDS) {
        const deal = campaignDeal(level, seed);
        expect(deal.terrain, `${level.id} seed ${seed}`).toEqual(fixed.terrain);
        expect(deal.phase).not.toBe('GAME_OVER');
        hands.add(JSON.stringify(deal.hands));
      }
      expect(hands.size, level.id).toBeGreaterThan(1);
    }
  });

  it('the same seed always gives the same deal (the server can rebuild it)', () => {
    const level = late[0]!;
    expect(campaignDeal(level, 4242)).toEqual(campaignDeal(level, 4242));
  });

  it('the level\'s own seed rebuilds exactly the fixed opening', () => {
    for (const level of CAMPAIGN_LEVELS) expect(campaignDeal(level, level.seed)).toEqual(campaignOpening(level));
  });
});
