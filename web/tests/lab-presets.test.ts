import { describe, expect, it } from 'vitest';
import { LAB_CATEGORIES, LAB_PRESETS, withLabPreset } from '../src/logic/lab-presets.js';
import { DEFAULT_SETTINGS, parseSettings } from '../src/logic/settings.js';

describe('settings Lab recipes', () => {
  it('offers twenty distinct recipes in four small groups', () => {
    expect(LAB_PRESETS).toHaveLength(20);
    expect(new Set(LAB_PRESETS.map((preset) => preset.id)).size).toBe(20);
    for (const category of LAB_CATEGORIES) expect(LAB_PRESETS.filter((preset) => preset.category === category.id)).toHaveLength(5);
  });

  it('uses only saved setting values and always starts from the same setup', () => {
    const base = { ...DEFAULT_SETTINGS, musicVolume: 23, level: 5 as const };
    for (const preset of LAB_PRESETS) {
      const applied = withLabPreset(base, preset);
      expect(parseSettings(JSON.stringify(applied))).toEqual(applied);
      expect(applied.level).toBe(base.level);
      expect(base.musicVolume).toBe(23);
      expect(withLabPreset(base, preset)).toEqual(applied);
    }
  });
});
