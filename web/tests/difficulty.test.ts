import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, chooseDifficultyLevel, defaultDifficultyForLevel } from '../src/logic/difficulty.js';

describe('new game difficulty choices', () => {
  it('uses the intended existing bot levels and stays deterministic for a match seed', () => {
    expect(DIFFICULTIES.map(choice => [choice.label, choice.levels])).toEqual([
      ['BEGINNER',[2,3]], ['EASY',[3,4]], ['MEDIUM',[5,6,7]],
      ['HARD',[8]], ['PRO',[9]],
    ]);
    for (const choice of DIFFICULTIES) for (let seed = 0; seed < 30; seed++) {
      const level = chooseDifficultyLevel(choice.id,seed);
      expect(choice.levels).toContain(level);
      expect(chooseDifficultyLevel(choice.id,seed)).toBe(level);
    }
  });
  it('can label an older saved exact level without modifying it', () => {
    expect([1,2,3,4,5,6,7,8,9].map(level => defaultDifficultyForLevel(level as 1|2|3|4|5|6|7|8|9)))
      .toEqual(['beginner','beginner','beginner','easy','medium','medium','medium','hard','pro']);
  });
});
