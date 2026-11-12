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

/**
 * THE HARD OPPONENT'S CEILING — the strongest bot the Hard tier can reach. ONE place: Practice
 * "Hard" (the top of `HARD_LEVELS` below) and Blitz's persisted ladder (`logic/blitz.ts`) both take
 * their top from here, so the next change (a seed-based rotation) moves exactly this function.
 *
 * It is a CEILING, not a replacement level: the tier still starts at the bottom of its range and the
 * one-game carry-over still steps up and down inside it. Today it answers 9 for every seed — the top
 * both ladders already had — so clamping to it is provably a no-op for every current value.
 *
 * `_seed` is deliberately part of the signature although nothing reads it yet: the rotation that
 * comes next needs the game seed, and it belongs here rather than at each caller.
 */
export const hardOpponent = (_seed: number): number => 9;

/**
 * The Hard tier's range: its bottom, then the ceiling `hardOpponent` names. The tier table is static
 * (one range for the whole game), so it asks the ceiling with a fixed seed of 0; a per-game rotation
 * will ask with the game's own seed. The cast holds while the `Level` union tops out at 9 — widening
 * that union is the next step, not this one.
 */
const HARD_LEVELS: readonly Level[] = [8, hardOpponent(0) as Level];

export const DIFFICULTIES = [
  { id: 'easy', label: 'EASY', note: 'A gentle challenge', level: 3, levels: [3, 4] },
  { id: 'medium', label: 'MEDIUM', note: 'A thoughtful rival', level: 5, levels: [5, 6, 7] },
  { id: 'hard', label: 'HARD', note: 'Every turn matters', level: 8, levels: HARD_LEVELS },
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

/**
 * How a match is named to the player. Bot levels 1-9 are internal only (owner, 2026-10-20): a
 * practice match is its difficulty (Easy / Medium / Hard), a campaign match is its level number.
 */
export const matchLabel = (m: { campaign: number | null; difficulty: DifficultyId | null; botLevel: Level }): string => {
  if (m.campaign !== null) return `Level ${m.campaign}`;
  const label = difficultyById(m.difficulty ?? defaultDifficultyForLevel(m.botLevel))!.label;
  return label[0] + label.slice(1).toLowerCase();
};
