import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { chooseAction } from '../src/bot.js';
import { hexName, moveLabel } from '../src/names.js';

describe('web: bot', () => {
  it('plays full bot-vs-bot games using only legal actions', () => {
    let finished = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let s: State = newGame(seed);
      for (let i = 0; i < 2000 && s.phase !== 'GAME_OVER'; i++) {
        const v = viewFor(s, s.actor);
        const a = chooseAction(v);
        expect(legalActions(v)).toContainEqual(a);
        s = apply(s, a);
      }
      if (s.phase === 'GAME_OVER') finished++;
    }
    expect(finished).toBe(30);
  }, 120_000);
});

describe('web: names', () => {
  it('names every hex uniquely', () => {
    const names = new Set<string>();
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) if (Math.abs(q + r) <= 3) names.add(hexName({ q, r }, 3));
    }
    expect(names.size).toBe(37);
    expect(hexName({ q: 0, r: -3 }, 3)).toBe('A1');
    expect(hexName({ q: 0, r: 0 }, 3)).toBe('D4');
  });

  it('labels every legal move with text', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let s: State = newGame(seed);
      for (let i = 0; i < 300 && s.phase !== 'GAME_OVER'; i++) {
        const v = viewFor(s, s.actor);
        for (const a of legalActions(v)) expect(moveLabel(v, a).length).toBeGreaterThan(3);
        s = apply(s, chooseAction(v));
      }
    }
  }, 120_000);
});
