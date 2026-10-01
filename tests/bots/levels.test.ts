import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { LEVELS, botFor } from '../../src/bots/levels.js';

describe('bot levels', () => {
  it('there are three levels, and Normal is the original GreedyBot', () => {
    expect(LEVELS).toEqual(['easy', 'normal', 'hard']);
    let s = newGame(3);
    for (let i = 0; i < 40 && s.phase !== 'GAME_OVER'; i++) {
      const v = viewFor(s, s.actor);
      expect(botFor('normal').chooseAction(v)).toEqual(GreedyBot.chooseAction(v));
      s = apply(s, GreedyBot.chooseAction(v));
    }
  });

  for (const level of ['easy', 'hard'] as const) {
    it(`${level}: plays only legal moves, finishes games, and is deterministic`, () => {
      for (const seed of [1, 2, 3]) {
        const play = () => {
          let s = newGame(seed);
          const moves: string[] = [];
          while (s.phase !== 'GAME_OVER') {
            const v = viewFor(s, s.actor);
            const a = (s.actor === 1 ? botFor(level) : GreedyBot).chooseAction(v);
            expect(legalActions(v)).toContainEqual(a);
            moves.push(JSON.stringify(a));
            s = apply(s, a);
          }
          return moves;
        };
        expect(play()).toEqual(play());
      }
    });
  }

  it('easy really is easier: it loses to Normal most of the time', () => {
    let easyWins = 0;
    let games = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const easySeat of [0, 1] as const) {
        let s = newGame(seed + 900);
        while (s.phase !== 'GAME_OVER') {
          const v = viewFor(s, s.actor);
          s = apply(s, (s.actor === easySeat ? botFor('easy') : GreedyBot).chooseAction(v));
        }
        games++;
        if (s.result!.winner === easySeat) easyWins++;
      }
    }
    expect(easyWins / games).toBeLessThan(0.4);
  }, 300_000);
  it('hard really is harder: it outscores Normal over fixed games', () => {
    // Deterministic games (same seeds every run), so this never flakes. In the full
    // 400-game check Hard won 55% against Normal (docs/SPEC.md 11.2).
    let diff = 0;
    for (let seed = 5001; seed <= 5015; seed++) {
      for (const hardSeat of [0, 1] as const) {
        let s = newGame(seed);
        while (s.phase !== 'GAME_OVER') {
          const v = viewFor(s, s.actor);
          s = apply(s, (s.actor === hardSeat ? botFor('hard') : GreedyBot).chooseAction(v));
        }
        diff += s.result!.scores[hardSeat] - s.result!.scores[hardSeat === 0 ? 1 : 0];
      }
    }
    expect(diff).toBeGreaterThan(0);
  }, 300_000);
});
