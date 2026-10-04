// Step 7: audio buses (effects, music) with their own volume sliders and a limiter on the master.
import { describe, expect, it } from 'vitest';
import { LIMITER, busGains } from '../src/logic/audio.js';
import { DEFAULT_SETTINGS, parseSettings } from '../src/logic/settings.js';

describe('audio buses', () => {
  it('each bus follows its own slider on a perceptual curve; the toggles still switch them off', () => {
    const g = busGains({ sound: true, music: true, sfxVolume: 100, musicVolume: 100 });
    expect(g).toEqual({ sfx: 1, music: 1 });
    const half = busGains({ sound: true, music: true, sfxVolume: 50, musicVolume: 50 });
    expect(half.sfx).toBeCloseTo(0.25);
    expect(busGains({ sound: false, music: true, sfxVolume: 80, musicVolume: 80 }).sfx).toBe(0);
    expect(busGains({ sound: true, music: false, sfxVolume: 80, musicVolume: 80 }).music).toBe(0);
    expect(busGains({ sound: true, music: true, sfxVolume: 0, musicVolume: 30 }).sfx).toBe(0);
  });
  it('slider values out of range are clamped', () => {
    expect(busGains({ sound: true, music: true, sfxVolume: 180, musicVolume: -4 })).toEqual({ sfx: 1, music: 0 });
  });
  it('the limiter catches peaks hard and quickly (never pumping the quiet bed)', () => {
    expect(LIMITER.threshold).toBeLessThanOrEqual(-3);
    expect(LIMITER.ratio).toBeGreaterThanOrEqual(12);
    expect(LIMITER.attack).toBeLessThanOrEqual(0.005);
  });
  it('the sliders are saved settings with sensible defaults; junk falls back', () => {
    expect(DEFAULT_SETTINGS.sfxVolume).toBe(80);
    expect(DEFAULT_SETTINGS.musicVolume).toBe(60);
    expect(parseSettings(JSON.stringify({ sfxVolume: 35, musicVolume: 'loud' })).sfxVolume).toBe(35);
    expect(parseSettings(JSON.stringify({ sfxVolume: 35, musicVolume: 'loud' })).musicVolume).toBe(60);
    expect(parseSettings(JSON.stringify({ sfxVolume: 900 })).sfxVolume).toBe(100);
  });
});
