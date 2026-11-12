import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES, DIFFICULTY_STEP_KEY, defaultDifficultyForLevel, matchLabel, parseDifficultyStep, stepAfterGame, stepLevelFor,
} from '../src/logic/difficulty.js';

describe('training difficulty tiers', () => {
  it('is the three training tiers, each with its own bot-level range', () => {
    expect(DIFFICULTIES.map((tier) => [tier.id, tier.label, tier.level, tier.levels])).toEqual([
      ['easy', 'EASY', 3, [3, 4]],
      ['medium', 'MEDIUM', 5, [5, 6, 7]],
      ['hard', 'HARD', 8, [8, 9]],
    ]);
  });

  it('steps the next game up on a win and down on a loss, and never leaves the tier', () => {
    // Easy (3–4)
    expect(stepAfterGame('easy', 3, 'win')).toBe(4);
    expect(stepAfterGame('easy', 4, 'win')).toBeNull(); // top of the range: stays put
    expect(stepAfterGame('easy', 3, 'loss')).toBeNull(); // bottom: stays put
    expect(stepAfterGame('easy', 4, 'loss')).toBe(3);
    // Medium (5–7): both directions reach the middle of the range
    expect(stepAfterGame('medium', 5, 'win')).toBe(6);
    expect(stepAfterGame('medium', 6, 'win')).toBe(7);
    expect(stepAfterGame('medium', 7, 'win')).toBeNull();
    expect(stepAfterGame('medium', 7, 'loss')).toBe(6);
    expect(stepAfterGame('medium', 6, 'loss')).toBe(5);
    expect(stepAfterGame('medium', 5, 'loss')).toBeNull();
    // Hard (8–9)
    expect(stepAfterGame('hard', 8, 'win')).toBe(9);
    expect(stepAfterGame('hard', 9, 'win')).toBeNull();
    expect(stepAfterGame('hard', 9, 'loss')).toBe(8);
    expect(stepAfterGame('hard', 8, 'loss')).toBeNull();
    // A draw never moves it, and a level outside the tier earns nothing.
    expect(stepAfterGame('easy', 3, 'draw')).toBeNull();
    expect(stepAfterGame('easy', 7, 'win')).toBeNull();
  });

  it('reads back only a pending step that names one of the tiers and a level in its range', () => {
    expect(parseDifficultyStep(null)).toBeNull();
    expect(parseDifficultyStep('not json')).toBeNull();
    expect(parseDifficultyStep(JSON.stringify({ id: 'medium', level: 6 }))).toEqual({ id: 'medium', level: 6 });
    expect(parseDifficultyStep(JSON.stringify({ id: 'medium', level: 9 }))).toBeNull(); // outside Medium
    expect(parseDifficultyStep(JSON.stringify({ id: 'pro', level: 9 }))).toBeNull(); // no such tier
    const pending = parseDifficultyStep(JSON.stringify({ id: 'medium', level: 6 }))!;
    expect(stepLevelFor(pending, 'medium')).toBe(6);
    expect(stepLevelFor(pending, 'hard')).toBeNull(); // read by the tier that earned it, only
    expect(stepLevelFor(null, 'medium')).toBeNull();
    expect(DIFFICULTY_STEP_KEY).toBe('severgrow.step.v1');
  });

  it('can label an older saved exact level without modifying it', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => defaultDifficultyForLevel(level as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9)))
      .toEqual(['easy', 'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']);
  });
});

describe('what the player is told about the opponent', () => {
  it('a practice match is named by its difficulty, never by the internal opponent level 1-9', () => {
    for (const botLevel of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
      for (const difficulty of [null, 'easy', 'medium', 'hard'] as const) {
        const label = matchLabel({ campaign: null, difficulty, botLevel });
        expect(['Easy', 'Medium', 'Hard']).toContain(label);
      }
    }
    expect(matchLabel({ campaign: null, difficulty: 'medium', botLevel: 7 })).toBe('Medium');
    expect(matchLabel({ campaign: null, difficulty: null, botLevel: 8 })).toBe('Hard');
  });
  it('a campaign match is named by its campaign level', () => {
    expect(matchLabel({ campaign: 12, difficulty: null, botLevel: 4 })).toBe('Level 12');
  });
});
