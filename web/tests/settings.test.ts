import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, EFFECTS, parseSettings, speedFactor } from '../src/logic/settings.js';

describe('settings (saved in the browser)', () => {
  it('has every setting from the brief, with sensible defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      level: 7,
      sound: true,
      music: false,
      vibration: true,
      reduceMotion: false,
      speed: 'normal',
      weakSpots: false,
      largeText: false,
      coach: true,
      palette: 'soil',
      weakPulse: true,
      effects: 'normal',
      materialDetail: 'normal',
      topGlow: 'subtle', // polish pass 3: the slight top-rank glow
      confirmPolicy: 'smart', // UI overhaul item 8: "Confirm moves": Smart asks only for risky moves (replaces the old device-based draw confirm)
      placementList: false, // polish pass 3: opt-in list of placements while drawing
      handSort: 'suit', // UI overhaul: the hand is sorted by suit (Sort switches to by number)
      eyeCandy: true, // UI overhaul Part 3: the decorations, on by default (Settings can switch them off)
    });
  });

  it('Material detail (Low, Normal) is remembered; anything else falls back to Normal', () => {
    expect(parseSettings(JSON.stringify({ materialDetail: 'low' })).materialDetail).toBe('low');
    expect(parseSettings(JSON.stringify({ materialDetail: 'ultra' })).materialDetail).toBe('normal');
  });

  it('palette, weak-link pulse and effects intensity are remembered; bad values fall back', () => {
    expect(parseSettings(JSON.stringify({ palette: 'ink', weakPulse: false, effects: 'high' }))).toMatchObject({ palette: 'ink', weakPulse: false, effects: 'high' });
    expect(parseSettings(JSON.stringify({ palette: 'moss', effects: 'low' }))).toMatchObject({ palette: 'moss', effects: 'low' });
    expect(parseSettings(JSON.stringify({ palette: 'neon', effects: 'max', weakPulse: 1 }))).toMatchObject({ palette: 'soil', effects: 'normal', weakPulse: true });
    expect(EFFECTS).toEqual(['low', 'normal', 'high']);
  });

  it('nothing saved: defaults, with reduce motion following the system', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null, true).reduceMotion).toBe(true);
  });

  it('keeps valid saved values and repairs broken ones', () => {
    const s = parseSettings(JSON.stringify({ theme: 'tabletop', sound: false, speed: 'fast', confirmMoves: true, largeText: true }));
    expect(s).not.toHaveProperty('theme'); // an old saved theme choice is ignored
    expect(parseSettings(JSON.stringify({ level: 4 })).level).toBe(4);
    expect(parseSettings(JSON.stringify({ level: 10 })).level).toBe(7);
    expect(parseSettings(JSON.stringify({ level: 2.5 })).level).toBe(7);
    // The old Easy / Normal / Hard choice carries over.
    expect(parseSettings(JSON.stringify({ level: 'easy' })).level).toBe(3);
    expect(parseSettings(JSON.stringify({ level: 'normal' })).level).toBe(7);
    expect(parseSettings(JSON.stringify({ level: 'hard' })).level).toBe(8);
    expect(s).toMatchObject({ sound: false, speed: 'fast', largeText: true, music: false });
    expect(s).not.toHaveProperty('confirmMoves'); // the old Confirm setting is gone: clear choices play at once
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

describe('UI overhaul: the hand sort is remembered', () => {
  it('defaults to by suit; keeps "number"; ignores anything else', () => {
    expect(parseSettings(null).handSort).toBe('suit');
    expect(parseSettings(JSON.stringify({ handSort: 'number' })).handSort).toBe('number');
    expect(parseSettings(JSON.stringify({ handSort: 'colour' })).handSort).toBe('suit');
  });
});

describe('UI overhaul item 8: "Confirm moves: Smart / Always / Never"', () => {
  it('defaults to Smart; keeps a saved choice; ignores anything else', () => {
    expect(parseSettings(null).confirmPolicy).toBe('smart');
    expect(parseSettings(JSON.stringify({ confirmPolicy: 'always' })).confirmPolicy).toBe('always');
    expect(parseSettings(JSON.stringify({ confirmPolicy: 'never' })).confirmPolicy).toBe('never');
    expect(parseSettings(JSON.stringify({ confirmPolicy: 'sometimes' })).confirmPolicy).toBe('smart');
  });
  it('an old "Confirm drawn moves: On" carries over as Always; Off and Auto become Smart', () => {
    expect(parseSettings(JSON.stringify({ confirmDraw: true })).confirmPolicy).toBe('always');
    expect(parseSettings(JSON.stringify({ confirmDraw: false })).confirmPolicy).toBe('smart');
    expect(parseSettings(JSON.stringify({ confirmDraw: null })).confirmPolicy).toBe('smart');
    expect(parseSettings(JSON.stringify({ confirmDraw: true }))).not.toHaveProperty('confirmDraw');
    // a new saved choice wins over the old one
    expect(parseSettings(JSON.stringify({ confirmDraw: true, confirmPolicy: 'never' })).confirmPolicy).toBe('never');
  });
});

describe('UI overhaul Part 3: "Eye candy" can be switched off and is remembered', () => {
  it('on by default; a saved Off stays off; junk falls back to On', () => {
    expect(parseSettings(null).eyeCandy).toBe(true);
    expect(parseSettings(JSON.stringify({ eyeCandy: false })).eyeCandy).toBe(false);
    expect(parseSettings(JSON.stringify({ eyeCandy: 'no' })).eyeCandy).toBe(true);
  });
});
