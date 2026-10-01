import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, resolveConfig, rotCount, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { chooseAction } from '../src/bot.js';
import { CLASSIC, LITE, modeOf, settle, visibleMoves } from '../src/presets.js';

describe('Lite preset (RulesConfig only)', () => {
  it('is a valid config: no Rot, no Fruit, Knock only at a perfect hand', () => {
    const c = resolveConfig(LITE);
    expect(c.fruitPerPlayer).toBe(0);
    expect(c.knockDeadwood).toBe(0);
    // The worst possible kept hand (all 9s) never rots.
    expect(rotCount(9 * (c.handSize + 1), c)).toBe(0);
    expect(newGame(1, LITE).config).toEqual(c);
  });

  it('Classic is the full default rules', () => {
    expect(resolveConfig(CLASSIC)).toEqual(resolveConfig());
  });

  it('modeOf reads the mode back from a game config', () => {
    expect(modeOf(newGame(1, LITE).config)).toBe('lite');
    expect(modeOf(newGame(1, CLASSIC).config)).toBe('classic');
  });

  it('Lite never offers Knock or Fruit; Classic offers everything legal', () => {
    const tiles: State = newGame(5, LITE);
    const knockState: State = { ...tiles, phase: 'KNOCK', hands: [[], tiles.hands[1]] };
    const v = viewFor(knockState, 0);
    expect(legalActions(v).map((a) => a.t)).toContain('Knock'); // the engine would allow it at deadwood 0
    expect(visibleMoves(v, 'lite').map((a) => a.t)).toEqual(['Continue']);
    expect(visibleMoves(v, 'classic')).toEqual(legalActions(v));
  });

  it('Lite: the game ends when the deck runs out (a turn starts with an empty deck)', () => {
    const s0 = newGame(2, LITE);
    const empty: State = { ...s0, deck: [], turnNumber: 9 };
    const ended = settle(empty, 'lite');
    expect(ended.phase).toBe('GAME_OVER');
    expect(ended.result).toMatchObject({ reason: 'deck_exhaustion', scores: [0, 0] });
    // Classic keeps the engine's own rule: an exactly-empty deck does not end the game.
    expect(settle(empty, 'classic')).toBe(empty);
    // Cards left, or mid-turn: nothing happens.
    expect(settle(s0, 'lite')).toBe(s0);
    expect(settle({ ...empty, phase: 'ACT' }, 'lite').phase).toBe('ACT');
  });

  it('bot-vs-bot Lite games always finish, by deck exhaustion or strangle, with no Knock, Fruit or Rot', () => {
    const reasons = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      let s: State = newGame(seed, LITE);
      for (let i = 0; i < 3000 && s.phase !== 'GAME_OVER'; i++) {
        const v = viewFor(s, s.actor);
        const a: Action = chooseAction(v, 'lite');
        expect(visibleMoves(v, 'lite')).toContainEqual(a);
        expect(['Knock', 'Fruit', 'RotPick']).not.toContain(a.t);
        s = settle(apply(s, a), 'lite');
        expect(s.lastResolution?.rotted ?? []).toEqual([]);
      }
      expect(s.phase).toBe('GAME_OVER');
      reasons.add(s.result!.reason);
    }
    expect([...reasons].every((r) => r === 'deck_exhaustion' || r === 'strangle')).toBe(true);
  }, 120_000);

  it('bot-vs-bot Classic games finish using only legal moves', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s: State = newGame(seed, CLASSIC);
      for (let i = 0; i < 3000 && s.phase !== 'GAME_OVER'; i++) {
        const v = viewFor(s, s.actor);
        const a = chooseAction(v, 'classic');
        expect(legalActions(v)).toContainEqual(a);
        s = apply(s, a);
      }
      expect(s.phase).toBe('GAME_OVER');
    }
  }, 120_000);
});
