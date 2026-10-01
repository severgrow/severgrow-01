// The level screen's names for each bot level (1-9). Level 7 is the classic bot.
import type { Level } from '../../../src/bots/levels.js';

export const LEVEL_INFO: Record<Level, { name: string }> = {
  1: { name: 'Seedling' },
  2: { name: 'Sprig' },
  3: { name: 'Clover' },
  4: { name: 'Moss' },
  5: { name: 'Fern' },
  6: { name: 'Ivy' },
  7: { name: 'Oak' },
  8: { name: 'Elder' },
  9: { name: 'Ancient' },
};
