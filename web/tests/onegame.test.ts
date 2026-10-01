import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { chooseAction } from '../src/bot.js';

describe('the page plays one game (v0.4)', () => {
  it('bot-vs-bot games on the default rules finish with legal moves only, and use Sprout', () => {
    const used = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      let s: State = newGame(seed);
      for (let i = 0; i < 3000 && s.phase !== 'GAME_OVER'; i++) {
        const v = viewFor(s, s.actor);
        const a = chooseAction(v);
        expect(legalActions(v)).toContainEqual(a);
        used.add(a.t);
        s = apply(s, a);
      }
      expect(s.phase).toBe('GAME_OVER');
      expect(['deck_exhaustion', 'turn_limit', 'strangle']).toContain(s.result!.reason);
    }
    expect(used).toContain('Sprout');
    for (const t of ['Knock', 'Continue', 'Fruit', 'RotPick']) expect(used).not.toContain(t);
  }, 120_000);

  it('the parked rules never show up in the default game', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let s: State = newGame(seed);
      for (let i = 0; i < 200 && s.phase !== 'GAME_OVER'; i++) {
        const acts = legalActions(viewFor(s, s.actor));
        for (const a of acts) expect(['Knock', 'Continue', 'Fruit', 'RotPick']).not.toContain(a.t);
        expect(['KNOCK', 'ROT_PICK']).not.toContain(s.phase);
        s = apply(s, acts[0]!);
      }
    }
  });
});
