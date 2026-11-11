// Real positions for the art: two of the game's own bots play a whole match from a seed, and every
// position is kept so the lab can scrub from the first move to the end ("seed 4821, move 37").
// Pure and deterministic (the engine and the bots are), so a seed always replays the same game.
import { apply, newMatch, viewFor } from '../../../src/engine/index.js';
import type { Action, State } from '../../../src/engine/index.js';
import { GreedyBot } from '../../../src/bots/GreedyBot.js';
import { createRandomBot } from '../../../src/bots/RandomBot.js';
import { SMALL_BOARD_RADIUS } from '../../../src/campaign/small-board.js';

export type BoardSize = 'standard' | 'small';
export const BOARD_SIZES: Record<BoardSize, { label: string; radius: number }> = {
  standard: { label: 'Standard board', radius: 3 },
  small: { label: 'Small campaign board', radius: SMALL_BOARD_RADIUS },
};

export type Step = { state: State; action: Action | null; actor: 0 | 1 | null };
export type Game = { seed: number; size: BoardSize; steps: Step[] };

/** A whole bot game. Player 2 mixes in a few random moves so games differ in shape, not only in deal. */
export const playGame = (seed: number, size: BoardSize = 'standard', maxSteps = 600): Game => {
  let state = newMatch(seed, { boardRadius: BOARD_SIZES[size].radius });
  const random = createRandomBot(seed ^ 0x5eed);
  const steps: Step[] = [{ state, action: null, actor: null }];
  for (let i = 0; i < maxSteps && state.phase !== 'GAME_OVER'; i++) {
    const actor = state.actor as 0 | 1;
    const view = viewFor(state, actor);
    const action = actor === 1 && i % 7 === 3 ? random.chooseAction(view) : GreedyBot.chooseAction(view);
    state = apply(state, action);
    steps.push({ state, action, actor });
  }
  return { seed, size, steps };
};

/** Moves are the steps that change the board (draws and throws only move cards). */
export const isBoardMove = (a: Action | null) => !!a && a.t !== 'Draw' && a.t !== 'Discard' && a.t !== 'EndAct';

/** Step indexes where the board changed: the scrubber's "move N". */
export const boardMoves = (g: Game): number[] => g.steps.flatMap((s, i) => (isBoardMove(s.action) ? [i] : []));

/** "seed 4821 · move 37" in the address (#seed=4821&move=37&board=small), and back. */
export const positionHash = (seed: number, move: number, size: BoardSize) => `#seed=${seed}&move=${move}${size === 'small' ? '&board=small' : ''}`;
export const readPositionHash = (hash: string): { seed: number; move: number; size: BoardSize } | null => {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const seed = Number(p.get('seed')), move = Number(p.get('move') ?? 0);
  if (!Number.isSafeInteger(seed) || seed <= 0 || !Number.isInteger(move) || move < 0) return null;
  return { seed, move, size: p.get('board') === 'small' ? 'small' : 'standard' };
};
