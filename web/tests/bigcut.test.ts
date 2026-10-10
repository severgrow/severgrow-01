// UI overhaul item 20: "Replay the biggest cut" remembers the biggest cut of the game (by
// either player) with the board just before it, and forgets a cut that was taken back.
import { describe, expect, it } from 'vitest';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { legalActions, newGame, viewFor } from '../../src/engine/index.js';
import { Session } from '../src/logic/session.js';
import { CUT_CAP_MS, SHAKE_MAX_HUGE, cutPlan } from '../src/logic/cut.js';

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

describe('the biggest cut plays as one gesture', () => {
  it('a real biggest cut respects the cap, the shake ceiling and the single payoff', () => {
    let checked = 0;
    for (const seed of [3, 5, 12]) {
      const s = new Session(newGame(seed), 0);
      for (let i = 0; i < 4000 && s.state.phase !== 'GAME_OVER'; i++) {
        s.play(GreedyBot.chooseAction(viewFor(s.state, s.state.actor)), s.state.actor);
      }
      const b = s.biggestCut;
      if (!b) continue;
      for (const step of b.steps) {
        if (step.k !== 'sever') continue;
        const victimTiles = Object.values(b.before.board).filter((t) => t && t.owner === step.player && !t.root).length;
        const plan = cutPlan({ origin: step.origin, keys: step.keys, victimTiles, mine: step.player === 0 }, { speed: 1, reduceMotion: false, effects: 'normal' });
        expect(plan.total).toBeLessThanOrEqual(CUT_CAP_MS);
        // one floating payoff for the whole cut, never one per tile
        expect(plan.float).toBe(`−${step.keys.length}`);
        expect(plan.shakePx).toBeLessThanOrEqual(SHAKE_MAX_HUGE);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
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
          const moves = legalActions(viewFor(s.state, 0)).filter((a) => a.t === 'Sprout' || a.t === 'Bloom');
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
