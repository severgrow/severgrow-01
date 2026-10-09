import type { Level } from '../../../src/bots/levels.js';

/** A player-facing choice selects one existing bot level once per new match. */
export const DIFFICULTIES = [
  { id:'beginner', label:'BEGINNER', levels:[2,3], note:'Learn the rhythm' },
  { id:'easy', label:'EASY', levels:[3,4], note:'A gentle challenge' },
  { id:'medium', label:'MEDIUM', levels:[5,6,7], note:'A thoughtful rival' },
  { id:'hard', label:'HARD', levels:[8], note:'Every turn matters' },
  { id:'pro', label:'PRO', levels:[9], note:'No easy ground' },
] as const satisfies readonly { id:string; label:string; levels:readonly Level[]; note:string }[];
export type DifficultyId = (typeof DIFFICULTIES)[number]['id'];
export const difficultyById = (id: string) => DIFFICULTIES.find(choice=>choice.id===id);
export const chooseDifficultyLevel = (id: DifficultyId, seed: number): Level => {
  const choices = difficultyById(id)!.levels;
  return choices[seed % choices.length]!;
};
export const defaultDifficultyForLevel = (level: Level): DifficultyId =>
  level >= 9 ? 'pro' : level >= 8 ? 'hard' : level >= 5 ? 'medium' : level >= 4 ? 'easy' : 'beginner';
