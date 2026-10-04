import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine/index.js';
import { SAVE_KEY, decodeSave, encodeSave } from '../src/logic/persist.js';

describe('saved game (v0.6: no old saves)', () => {
  const state = newGame(7);
  it('uses a new key, so a v0.5 save is never read', () => {
    expect(SAVE_KEY).toBe('severgrow.save.v6');
  });
  it('keeps a current save', () => {
    expect(decodeSave(encodeSave({ state, coach: null, level: 4 }))?.level).toBe(4);
  });
  it('drops a save from older rules (no Fruit card fields)', () => {
    const { fruitPlayed: _a, fruitKnown: _b, ...old } = state;
    const config = { ...state.config } as Record<string, unknown>;
    delete config.fruitCardCount;
    expect(decodeSave(JSON.stringify({ state: { ...old, config }, coach: null, level: 4 }))).toBeNull();
  });
});
