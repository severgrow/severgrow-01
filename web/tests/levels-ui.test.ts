import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/bots/levels.js';
import { LEVEL_INFO } from '../src/logic/levels-ui.js';
import { decodeSave, encodeSave } from '../src/logic/persist.js';
import { newGame } from '../../src/engine/index.js';

describe('the level screen', () => {
  it('every level has a short nature name and a one-line description', () => {
    for (const l of LEVELS) {
      expect(LEVEL_INFO[l].name.length).toBeGreaterThan(2);
      expect(LEVEL_INFO[l].name.length).toBeLessThanOrEqual(10);
      expect(LEVEL_INFO[l].line.length).toBeLessThanOrEqual(36);
    }
    expect(new Set(LEVELS.map((l) => LEVEL_INFO[l].name)).size).toBe(9);
  });

  it("a saved game keeps its bot level (an old save without one plays level 7)", () => {
    const s = newGame(1);
    expect(decodeSave(encodeSave({ state: s, coach: null, level: 4 }))!.level).toBe(4);
    expect(decodeSave(JSON.stringify({ state: s, coach: null }))!.level).toBe(7);
    expect(decodeSave(JSON.stringify({ state: s, coach: null, level: 12 }))!.level).toBe(7);
  });
});
