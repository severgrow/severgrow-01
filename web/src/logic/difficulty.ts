import type { Level } from '../../../src/bots/levels.js';
import { boardChoiceConfig } from '../../../src/engine/index.js';
import type { BoardChoice, RulesConfig } from '../../../src/engine/index.js';

/**
 * The five difficulty tiers (owner request, 2026-10-14). The player-facing names are unchanged;
 * each tier now RE-POINTS to its own map and bot level:
 *
 *   Beginner  small map (radius 2)  level 2   → level 3 for the next game after a WIN
 *   Easy      small map (radius 2)  level 5
 *   Medium    small map (radius 2)  level 8
 *   Hard      classic  (radius 3)   level 8   → level 7 for the next game after a LOSS
 *   Pro       classic  (radius 3)   level 9
 *
 * Every tier's level is FIXED (no randomness): the only movement is the one-game carry-over in
 * `step`, and it needs a finished game to have happened.
 */
export type DifficultyId = 'beginner' | 'easy' | 'medium' | 'hard' | 'pro';

/** How the level of a finished game is scored for the carry-over. */
export type Outcome = 'win' | 'loss' | 'draw';

/** The one-game carry-over: this level after `after` happened at the tier's own level. */
export type Step = { after: Exclude<Outcome, 'draw'>; level: Level };

export type Difficulty = {
  id: DifficultyId;
  label: string;
  note: string;
  map: BoardChoice;
  /** The bot level the tier's next game uses, before any carry-over. */
  level: Level;
  /** Every level this tier can ever start at (its own level first). */
  levels: readonly Level[];
  step?: Step;
};

export const DIFFICULTIES = [
  { id: 'beginner', label: 'BEGINNER', note: 'Learn the rhythm', map: 'small', level: 2, levels: [2, 3], step: { after: 'win', level: 3 } },
  { id: 'easy', label: 'EASY', note: 'A gentle challenge', map: 'small', level: 5, levels: [5] },
  { id: 'medium', label: 'MEDIUM', note: 'A thoughtful rival', map: 'small', level: 8, levels: [8] },
  { id: 'hard', label: 'HARD', note: 'Every turn matters', map: 'classic', level: 8, levels: [8, 7], step: { after: 'loss', level: 7 } },
  { id: 'pro', label: 'PRO', note: 'No easy ground', map: 'classic', level: 9, levels: [9] },
] as const satisfies readonly Difficulty[];

export const difficultyById = (id: string): Difficulty | undefined => DIFFICULTIES.find((choice) => choice.id === id);

/** The map's config overrides for a tier ('classic' changes nothing). */
export const difficultyConfig = (id: DifficultyId): Partial<RulesConfig> => boardChoiceConfig(difficultyById(id)!.map);

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

/** The level a finished game earns for its tier's next game, or null when nothing changes. */
export const stepAfterGame = (id: DifficultyId, level: Level, outcome: Outcome): Level | null => {
  const tier = difficultyById(id);
  if (!tier?.step || tier.step.after !== outcome || level !== tier.level) return null;
  return tier.step.level;
};

/**
 * The tier that labels an older saved exact level (a save made before the tiers were re-pointed).
 * The tier that starts at that level wins; otherwise the nearest tier by its own level. Two tiers
 * share level 8 (Medium on the small map, Hard on the classic one), so 8 labels as Medium.
 */
export const defaultDifficultyForLevel = (level: Level): DifficultyId =>
  DIFFICULTIES.find((tier) => tier.level === level)?.id ?? (level >= 9 ? 'pro' : level >= 8 ? 'hard' : level >= 5 ? 'medium' : 'beginner');
