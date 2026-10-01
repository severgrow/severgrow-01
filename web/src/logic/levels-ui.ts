// What the level screen says about each bot level (1-9). Level 7 is the classic bot.
import type { Level } from '../../../src/bots/levels.js';

export const LEVEL_INFO: Record<Level, { name: string; line: string }> = {
  1: { name: 'Seedling', line: 'Still learning to grow.' },
  2: { name: 'Sprig', line: 'Careless. Often skips growing.' },
  3: { name: 'Clover', line: 'Grows a bit, then stops.' },
  4: { name: 'Moss', line: 'Sensible, but slips a lot.' },
  5: { name: 'Fern', line: 'Steady, sometimes sloppy.' },
  6: { name: 'Ivy', line: 'Rarely makes a mistake.' },
  7: { name: 'Oak', line: 'The classic bot. Solid.' },
  8: { name: 'Elder', line: 'Keeps its strong cards.' },
  9: { name: 'Ancient', line: 'Plans ahead. Guesses your hand.' },
};
