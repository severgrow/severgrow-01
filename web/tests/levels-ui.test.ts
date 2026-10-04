import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/bots/levels.js';
import { LEVEL_INFO } from '../src/logic/levels-ui.js';
import { LEVEL_ICONS } from '../src/ui/levelIcons.js';
import { decodeSave, encodeSave } from '../src/logic/persist.js';
import { newGame } from '../../src/engine/index.js';

describe('the level screen', () => {
  it('every level has a short nature name and its own icon (no descriptions)', () => {
    for (const l of LEVELS) {
      expect(LEVEL_INFO[l].name.length).toBeGreaterThan(2);
      expect(LEVEL_INFO[l].name.length).toBeLessThanOrEqual(10);
      expect(LEVEL_INFO[l]).not.toHaveProperty('line');
      expect(LEVEL_ICONS[l]).toMatch(/^<svg[^>]*viewBox="0 0 32 32"/);
      expect(LEVEL_ICONS[l]).toContain('aria-hidden="true"');
    }
    expect(new Set(LEVELS.map((l) => LEVEL_INFO[l].name)).size).toBe(9);
    expect(new Set(LEVELS.map((l) => LEVEL_ICONS[l])).size).toBe(9);
  });

  it("a saved game keeps its bot level (a save without a valid one plays level 7)", () => {
    const s = newGame(1);
    const raw = JSON.parse(encodeSave({ seed: s.seed, actions: [], coach: null, level: 4 }));
    expect(decodeSave(JSON.stringify(raw))!.level).toBe(4);
    expect(decodeSave(JSON.stringify({ ...raw, level: undefined }))!.level).toBe(7);
    expect(decodeSave(JSON.stringify({ ...raw, level: 12 }))!.level).toBe(7);
  });
});
