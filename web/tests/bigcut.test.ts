// UI overhaul item 20: "Replay the biggest cut" remembers the biggest cut of the game (by
// either player) with the board just before it, and forgets a cut that was taken back.
import { describe, expect, it } from 'vitest';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { legalActions, newGame, viewFor } from '../../src/engine/index.js';
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

describe('Undo, then play again (a bug found by the overhaul browser test)', () => {
  it('taking back the only move of a turn and playing another works, and Undo works again', () => {
    let checked = 0;
    for (const seed of [3, 5, 12, 21]) {
      const s = new Session(newGame(seed), 0);
      // play until it is my Grow step with a board move available
      for (let i = 0; i < 400 && s.state.phase !== 'GAME_OVER'; i++) {
        const who = s.state.actor;
        if (who === 0 && s.state.phase === 'ACT') {
          const moves = legalActions(viewFor(s.state, 0)).filter((a) => a.t === 'Sprout' || a.t === 'MeldRun' || a.t === 'MeldSet');
          if (moves.length >= 2) {
            // resume here, as after reloading the page mid-turn (no draw recorded for this turn)
            const r = new Session(s.state, 0);
            for (const t of [s, r]) {
            const s2 = t;
            const before = s2.state;
            expect(s2.play(moves[0]!, 0)).not.toBeNull();
            expect(s2.undo()).toBe(true);
            expect(s2.state).toBe(before);
            const p = s2.play(moves[1]!, 0);
            expect(p).not.toBeNull();
            expect(s2.canUndo).toBe(true);
            expect(s2.undo()).toBe(true);
            expect(s2.state).toBe(before);
            checked++;
            }
            break;
          }
        }
        s.play(GreedyBot.chooseAction(viewFor(s.state, who)), who);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
