import type { Level } from '../../../src/bots/levels.js';

/**
 * The three TRAINING tiers (owner direction, 2026-10-15). Each tier is a RANGE of existing bot
 * levels, and its first game starts at the bottom of that range:
 *
 *   Easy    bot 3 → 4
 *   Medium  bot 5 → 6 → 7
 *   Hard    bot 8 → 9
 *
 * The only movement is the one-game carry-over below: a WIN steps the tier's next game one level
 * UP, a LOSS steps it one DOWN, and neither ever leaves the tier's own range. Nothing else moves:
 * there is no per-match seed choice any more, so a tier's next level is decided by the last result
 * alone — which is what makes "always changing with the progress" honest and testable.
 *
 * The machinery is the one built for the small-map pass (`d282dfd`) and recovered here: one browser
 * key, written by a finished game and spent by the tier's very next game.
 */
export type DifficultyId = 'easy' | 'medium' | 'hard';

/** How the level of a finished game is scored for the carry-over. */
export type Outcome = 'win' | 'loss' | 'draw';

export type Difficulty = {
  id: DifficultyId;
  label: string;
  note: string;
  /** The bot level the tier's first game uses (the bottom of `levels`). */
  level: Level;
  /** Every level this tier can ever play, lowest first: the carry-over never leaves this range. */
  levels: readonly Level[];
};

export const DIFFICULTIES = [
  { id: 'easy', label: 'EASY', note: 'A gentle challenge', level: 3, levels: [3, 4] },
  { id: 'medium', label: 'MEDIUM', note: 'A thoughtful rival', level: 5, levels: [5, 6, 7] },
  { id: 'hard', label: 'HARD', note: 'Every turn matters', level: 8, levels: [8, 9] },
] as const satisfies readonly Difficulty[];

export const difficultyById = (id: string): Difficulty | undefined => DIFFICULTIES.find((tier) => tier.id === id);

/**
 * Where the carry-over lives: the level the tier's NEXT game starts at, written only by a finished
 * game that earned it and cleared the moment that tier's next game starts. One tier at a time.
 */
export const DIFFICULTY_STEP_KEY = 'severgrow.step.v1';
export type DifficultyStep = { id: DifficultyId; level: Level };

export const parseDifficultyStep = (raw: string | null): DifficultyStep | null => {
  try {
    const value = JSON.parse(raw ?? 'null') as { id?: unknown; level?: unknown };
    const tier = typeof value?.id === 'string' ? difficultyById(value.id) : undefined;
    return tier && tier.levels.includes(value.level as Level) ? { id: tier.id, level: value.level as Level } : null;
  } catch {
    return null;
  }
};

/** The level a tier's next game uses: the pending carry-over for THAT tier, else the tier's own. */
export const stepLevelFor = (step: DifficultyStep | null, id: DifficultyId): Level | null =>
  step && step.id === id ? step.level : null;

/**
 * The level a finished game earns for its tier's next game, or null when nothing moves. A win walks
 * one step UP the tier's range, a loss one step DOWN; at either end of the range the level stays
 * put (null), so the carry-over can never leave the tier. A draw never moves it.
 */
export const stepAfterGame = (id: DifficultyId, level: Level, outcome: Outcome): Level | null => {
  const tier = difficultyById(id);
  if (!tier || outcome === 'draw') return null;
  const index = tier.levels.indexOf(level);
  if (index < 0) return null; // a level outside the tier (an older save) earns nothing
  return (outcome === 'win' ? tier.levels[index + 1] : tier.levels[index - 1]) ?? null;
};

/**
 * The tier that labels a saved exact bot level (a save made before the tiers were re-pointed, or one
 * started outside the tiers). The ranges meet at their ends, so the level's own range wins.
 */
export const defaultDifficultyForLevel = (level: Level): DifficultyId =>
  level <= 4 ? 'easy' : level <= 7 ? 'medium' : 'hard';
