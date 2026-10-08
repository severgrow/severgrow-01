import type { Settings } from './settings.js';

/** Small, reversible recipes made only from settings the game already supports. */
export type LabCategory = 'surface' | 'tempo' | 'sound' | 'focus';
export type LabPreset = {
  id: string;
  category: LabCategory;
  title: string;
  note: string;
  readout: string;
  values: Partial<Settings>;
};

export const LAB_CATEGORIES: readonly { id: LabCategory; label: string }[] = [
  { id: 'surface', label: 'Surface' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'sound', label: 'Sound' },
  { id: 'focus', label: 'Focus' },
];

export const LAB_PRESETS: readonly LabPreset[] = [
  { id: 'night-garden', category: 'surface', title: 'Night Garden', note: 'Let the board settle into deep moss.', readout: 'MOSS NIGHT · FULL DETAIL', values: { palette: 'moss', materialDetail: 'normal' } },
  { id: 'ink-wash', category: 'surface', title: 'Ink Wash', note: 'A quieter, more graphic tabletop.', readout: 'INK · SOFT GLOW', values: { palette: 'ink', topGlow: 'subtle' } },
  { id: 'paper-cut', category: 'surface', title: 'Paper Cut', note: 'Reduce the board to its essential shapes.', readout: 'SOIL · LOW DETAIL · NO GLOW', values: { palette: 'soil', materialDetail: 'low', topGlow: 'off' } },
  { id: 'lantern-edge', category: 'surface', title: 'Lantern Edge', note: 'A little light on the strongest tiles.', readout: 'MOSS NIGHT · TOP GLOW', values: { palette: 'moss', topGlow: 'subtle', materialDetail: 'low' } },
  { id: 'living-surface', category: 'surface', title: 'Living Surface', note: 'Keep the material and the little reactions alive.', readout: 'FULL DETAIL · HIGH EFFECTS', values: { materialDetail: 'normal', topGlow: 'subtle', effects: 'high', eyeCandy: true } },

  { id: 'slow-orbit', category: 'tempo', title: 'Slow Orbit', note: 'Give each move room to breathe.', readout: 'SLOW · NORMAL EFFECTS', values: { speed: 'slow', effects: 'normal', reduceMotion: false } },
  { id: 'quick-hands', category: 'tempo', title: 'Quick Hands', note: 'A brisker rhythm with the motion intact.', readout: 'FAST · NORMAL EFFECTS', values: { speed: 'fast', effects: 'normal', reduceMotion: false } },
  { id: 'instant-cut', category: 'tempo', title: 'Instant Cut', note: 'Play at the speed of your decisions.', readout: 'ANIMATIONS OFF', values: { speed: 'skip', effects: 'low' } },
  { id: 'little-theatre', category: 'tempo', title: 'Little Theatre', note: 'Let the board perform its full response.', readout: 'HIGH EFFECTS · NORMAL SPEED', values: { speed: 'normal', effects: 'high', eyeCandy: true, reduceMotion: false } },
  { id: 'still-frame', category: 'tempo', title: 'Still Frame', note: 'Keep the board calm and settled.', readout: 'REDUCED MOTION · NO DECORATION', values: { reduceMotion: true, eyeCandy: false } },

  { id: 'velvet-silence', category: 'sound', title: 'Velvet Silence', note: 'Just cards, stone and thought.', readout: 'SOUND · MUSIC · HAPTICS OFF', values: { sound: false, music: false, vibration: false } },
  { id: 'small-clicks', category: 'sound', title: 'Small Clicks', note: 'Only the quiet mechanical feedback.', readout: 'SOUND 35 · MUSIC OFF', values: { sound: true, sfxVolume: 35, music: false } },
  { id: 'room-tone', category: 'sound', title: 'Room Tone', note: 'A soft hum under the table.', readout: 'MUSIC 35 · SOUND OFF', values: { music: true, musicVolume: 35, sound: false } },
  { id: 'pocket-synth', category: 'sound', title: 'Pocket Synth', note: 'The whole little instrument, tuned low.', readout: 'SOUND 70 · MUSIC 40', values: { sound: true, music: true, sfxVolume: 70, musicVolume: 40 } },
  { id: 'warm-chime', category: 'sound', title: 'Warm Chime', note: 'Let each sound mark land clearly, with no soundtrack.', readout: 'SOUND 90 · MUSIC OFF', values: { sound: true, sfxVolume: 90, music: false } },

  { id: 'number-order', category: 'focus', title: 'Number Order', note: 'Read the hand as a rising sequence.', readout: 'SORT BY NUMBER', values: { handSort: 'number' } },
  { id: 'big-print', category: 'focus', title: 'Big Print', note: 'Give the words a little more space.', readout: 'LARGE TEXT', values: { largeText: true } },
  { id: 'route-notes', category: 'focus', title: 'Route Notes', note: 'Keep the legal placement list close.', readout: 'PLACEMENT LIST ON', values: { placementList: true } },
  { id: 'deliberate-tap', category: 'focus', title: 'Deliberate Tap', note: 'Pause before each move; skip nothing for you.', readout: 'CONFIRM ALWAYS · AUTO-SKIP OFF', values: { confirmPolicy: 'always', autoSkip: false } },
  { id: 'freehand', category: 'focus', title: 'Freehand', note: 'Let safe moves happen as you choose them.', readout: 'CONFIRM NEVER · COACH OFF', values: { confirmPolicy: 'never', coach: false } },
];

export const withLabPreset = (base: Settings, preset: LabPreset): Settings => ({ ...base, ...preset.values });
