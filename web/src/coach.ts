// The guided first turn: draw, play, discard.
import type { State } from '../../src/engine/index.js';

export type CoachStep = { id: 'draw' | 'play' | 'discard' | 'end' | 'done'; title: string; text: string };

/** Which tip to show, or null once the tutorial is finished. */
export const coachStep = (s: State, finished: boolean): CoachStep | null => {
  if (finished || s.phase === 'GAME_OVER') return null;
  if (s.turnNumber >= 2) {
    return { id: 'done', title: 'Nice!', text: 'Now the bot plays. Keep growing, stay linked to your root, and cut the bot off.' };
  }
  if (s.actor !== 0) return null;
  switch (s.phase) {
    case 'DRAW':
      return { id: 'draw', title: 'Step 1 of 3: Draw', text: 'Every turn starts with one new card. Tap “Draw a card from the deck”.' };
    case 'ACT':
      return {
        id: 'play',
        title: 'Step 2 of 3: Play',
        text: 'Matching cards grow tiles. Tap a glowing move to see it on the board, then “Play it”. Or tap “I’m done”.',
      };
    case 'DISCARD':
      return { id: 'discard', title: 'Step 3 of 3: Throw one away', text: 'Pick a card you don’t need. Then the bot takes its turn.' };
    case 'KNOCK':
      return { id: 'end', title: 'Last step', text: 'Tap “End my turn”.' };
    default:
      return null;
  }
};
