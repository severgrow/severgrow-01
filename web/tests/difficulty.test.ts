import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine/index.js';
import { DIFFICULTIES, chooseDifficultyLevel, defaultDifficultyForLevel } from '../src/logic/difficulty.js';

describe('new game difficulty choices', () => {
  it('uses the intended existing bot levels and stays deterministic for a match seed', () => {
    expect(DIFFICULTIES.map(choice => [choice.label, choice.levels])).toEqual([
      ['BEGINNER',[1,2]], ['EASY',[3,4]], ['MEDIUM',[5,6,7]],
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
      .toEqual(['beginner','beginner','easy','easy','medium','medium','medium','hard','pro']);
  });
  it('picks the level independently of who starts (owner decision 2026-10-11)', () => {
    for (const id of ['beginner','easy','medium'] as const) {
      const seen = new Map<string, number>();
      const seeds = 3000;
      for (let seed = 1; seed <= seeds; seed++) {
        const key = `${chooseDifficultyLevel(id,seed)}:${newGame(seed).startingPlayer}`;
        seen.set(key,(seen.get(key) ?? 0)+1);
      }
      const levels = DIFFICULTIES.find(choice=>choice.id===id)!.levels.length;
      expect(seen.size).toBe(levels*2);
      for (const count of seen.values()) expect(Math.abs(count/seeds - 1/(levels*2))).toBeLessThan(0.03);
    }
  });
});
