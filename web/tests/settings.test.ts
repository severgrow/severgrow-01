import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, speedFactor } from '../src/logic/settings.js';

describe('settings (saved in the browser)', () => {
  it('has every setting from the brief, with sensible defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      level: 'normal',
      sound: true,
      music: false,
      vibration: true,
      reduceMotion: false,
      speed: 'normal',
      confirmMoves: true,
      weakSpots: false,
      largeText: false,
      coach: true,
    });
  });

  it('nothing saved: defaults, with reduce motion following the system', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null, true).reduceMotion).toBe(true);
  });

  it('keeps valid saved values and repairs broken ones', () => {
    const s = parseSettings(JSON.stringify({ theme: 'tabletop', sound: false, speed: 'fast', confirmMoves: false, largeText: true }));
    expect(s).not.toHaveProperty('theme'); // an old saved theme choice is ignored
    expect(parseSettings(JSON.stringify({ level: 'hard' })).level).toBe('hard');
    expect(parseSettings(JSON.stringify({ level: 'brutal' })).level).toBe('normal');
    expect(s).toMatchObject({ sound: false, speed: 'fast', confirmMoves: false, largeText: true, music: false });
    const bad = parseSettings(JSON.stringify({ theme: 'neon', sound: 'yes', speed: 9, extra: 1 }));
    expect(bad).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
  });

  it('a saved reduce-motion choice beats the system default', () => {
    expect(parseSettings(JSON.stringify({ reduceMotion: false }), true).reduceMotion).toBe(false);
  });

  it('speed factors: slow is slower, skip is zero', () => {
    expect(speedFactor('slow')).toBeGreaterThan(speedFactor('normal'));
    expect(speedFactor('normal')).toBe(1);
    expect(speedFactor('fast')).toBeLessThan(1);
    expect(speedFactor('skip')).toBe(0);
  });
});
