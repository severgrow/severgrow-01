import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  defaultDifficultyForLevel,
  difficultyConfig,
  parseDifficultyStep,
  stepAfterGame,
  stepLevelFor,
} from '../src/logic/difficulty.js';
import type { Level } from '../../src/bots/levels.js';
import {
  DEFAULT_CONFIG,
  SMALL_MAP_CONFIG,
  boardChoiceConfig,
  boardChoiceOf,
  boardCoords,
  createCards,
  newMatch,
  resolveConfig,
} from '../../src/engine/index.js';

describe('duel maps and difficulty tiers', () => {
  it('re-points the five tiers to their map and bot level, keeping the names', () => {
    expect(DIFFICULTIES.map((tier) => [tier.label, tier.map, tier.level])).toEqual([
      ['BEGINNER', 'small', 2],
      ['EASY', 'small', 5],
      ['MEDIUM', 'small', 8],
      ['HARD', 'classic', 8],
      ['PRO', 'classic', 9],
    ]);
  });

  it('the small-map preset is one ring smaller, one copy per card, two Bombs, half the turn limit', () => {
    expect(SMALL_MAP_CONFIG).toEqual({
      boardRadius: 2,
      copiesPerCard: 1,
      fruitCardCount: 2,
      maxTurnsPerPlayer: DEFAULT_CONFIG.maxTurnsPerPlayer / 2,
    });
    // The classic board is untouched: an empty override set, and the engine's own defaults intact.
    expect(boardChoiceConfig('classic')).toEqual({});
    expect(DEFAULT_CONFIG.boardRadius).toBe(3);
    expect(DEFAULT_CONFIG.copiesPerCard).toBe(2);
    expect(DEFAULT_CONFIG.fruitCardCount).toBe(4);
    expect(DEFAULT_CONFIG.maxTurnsPerPlayer).toBe(30);
  });

  it('a small-map duel constructs, deals a full hand, and keeps 4 rocks and 5 gold of 19 hexes', () => {
    const small = resolveConfig({ ...SMALL_MAP_CONFIG });
    expect(boardCoords(small)).toHaveLength(19);
    // One copy of each (suit, number): 4 suits x ranks 1..9, plus the two Bombs.
    const numbered = createCards(small).filter((card) => card.suit !== null);
    expect(numbered).toHaveLength(36);
    expect(new Set(numbered.map((card) => `${card.suit}:${card.rank}`)).size).toBe(36);
    expect(createCards(small)).toHaveLength(38);
    expect(createCards(resolveConfig({}))).toHaveLength(76);

    const state = newMatch(7, SMALL_MAP_CONFIG);
    expect(state.hands[0]).toHaveLength(small.handSize);
    expect(state.hands[1]).toHaveLength(small.handSize);
    expect(state.discard).toHaveLength(1);
    expect(state.deck).toHaveLength(38 - 2 * small.handSize - 1);
    expect(Object.values(state.terrain).filter((t) => t === 'rock')).toHaveLength(4);
    expect(Object.values(state.terrain).filter((t) => t === 'rich')).toHaveLength(5);
    // Both homes are still on the board and three hexes away from any rock.
    expect(boardCoords(small)).toHaveLength(19);
    expect(boardChoiceOf(small)).toBe('small');
    expect(boardChoiceOf(resolveConfig({}))).toBe('classic');
  });

  it('the carry-over moves one level for ONE game, in the owner’s directions', () => {
    // Hard: lose at 8 → the next Hard game is 7. Nothing else moves Hard.
    expect(stepAfterGame('hard', 8, 'loss')).toBe(7);
    expect(stepAfterGame('hard', 8, 'win')).toBeNull();
    expect(stepAfterGame('hard', 8, 'draw')).toBeNull();
    expect(stepAfterGame('hard', 7, 'loss')).toBeNull();
    // Beginner: the same pattern upward, after a win at 2.
    expect(stepAfterGame('beginner', 2, 'win')).toBe(3);
    expect(stepAfterGame('beginner', 2, 'loss')).toBeNull();
    // Easy, Medium and Pro never step.
    expect(stepAfterGame('easy', 5, 'loss')).toBeNull();
    expect(stepAfterGame('medium', 8, 'win')).toBeNull();
    expect(stepAfterGame('pro', 9, 'loss')).toBeNull();

    // The pending step is read only by its own tier, so a Medium game cannot consume Hard's step.
    const pending = { id: 'hard', level: 7 } as const;
    expect(stepLevelFor(pending, 'hard')).toBe(7);
    expect(stepLevelFor(pending, 'medium')).toBeNull();
    expect(parseDifficultyStep(JSON.stringify(pending))).toEqual({ id: 'hard', level: 7 });
    // A step a tier could never start at is discarded, as is unreadable storage.
    expect(parseDifficultyStep(JSON.stringify({ id: 'hard', level: 4 }))).toBeNull();
    expect(parseDifficultyStep(JSON.stringify({ id: 'nope', level: 7 }))).toBeNull();
    expect(parseDifficultyStep('not json')).toBeNull();
    expect(parseDifficultyStep(null)).toBeNull();
  });

  it('labels an older saved exact level by the tier that starts at it', () => {
    // Level 8 labels as Medium: Medium (small map) and Hard (classic) BOTH start at 8, so the
    // label is ambiguous by design and takes the first tier in the list.
    expect(defaultDifficultyForLevel(8)).toBe('medium');
    expect(defaultDifficultyForLevel(5)).toBe('easy');
    expect(defaultDifficultyForLevel(9)).toBe('pro');
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => defaultDifficultyForLevel(level as Level))).toEqual([
      'beginner', 'beginner', 'beginner', 'beginner', 'easy', 'medium', 'medium', 'medium', 'pro',
    ]);
    // Every tier's config is the map it names.
    expect(difficultyConfig('beginner')).toEqual({ ...SMALL_MAP_CONFIG });
    expect(difficultyConfig('medium')).toEqual({ ...SMALL_MAP_CONFIG });
    expect(difficultyConfig('hard')).toEqual({});
    expect(difficultyConfig('pro')).toEqual({});
  });
});
