// UI overhaul item 20: "Replay the biggest cut" remembers the biggest cut of the game (by
// either player) with the board just before it, and forgets a cut that was taken back.
import { describe, expect, it } from 'vitest';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { newGame, viewFor } from '../../src/engine/index.js';
import { Session } from '../src/logic/session.js';

const cutSize = (steps: { k: string; keys?: string[] }[]) => steps.filter((s) => s.k === 'sever').reduce((n, s) => n + (s.keys?.length ?? 0), 0);

describe('the biggest cut of the game', () => {
  it('is the play with the most tiles cut off, with the board before it', () => {
    for (const seed of [3, 5, 12]) {
      const s = new Session(newGame(seed), 0);
      let best = 0;
      for (let i = 0; i < 4000 && s.state.phase !== 'GAME_OVER'; i++) {
        const who = s.state.actor;
        const p = s.play(GreedyBot.chooseAction(viewFor(s.state, who)), who)!;
        best = Math.max(best, cutSize(p.steps));
      }
      const b = s.biggestCut;
      if (best === 0) expect(b).toBeNull();
      else {
        expect(b).not.toBeNull();
        expect(cutSize(b!.steps)).toBe(best);
        expect(b!.before.board).toBeTruthy();
      }
    }
  });
});
