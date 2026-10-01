// Player settings, saved in the browser. Parsing is forgiving: anything missing or
// broken falls back to the default, so an old or damaged save never breaks the page.
import { THEME_IDS } from './themes.js';
import type { ThemeId } from './themes.js';

export const SPEEDS = ['slow', 'normal', 'fast', 'skip'] as const;
export type Speed = (typeof SPEEDS)[number];

export type Settings = {
  theme: ThemeId;
  sound: boolean;
  music: boolean;
  vibration: boolean;
  reduceMotion: boolean;
  speed: Speed;
  confirmMoves: boolean;
  weakSpots: boolean;
  largeText: boolean;
  coach: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'ink',
  sound: true,
  music: false,
  vibration: true,
  reduceMotion: false,
  speed: 'normal',
  confirmMoves: true,
  weakSpots: false,
  largeText: false,
  coach: true,
};

export const SETTINGS_KEY = 'severgrow.settings.v1';

/** Settings from a saved string; `systemReduce` is the device's reduce-motion wish. */
export const parseSettings = (raw: string | null, systemReduce = false): Settings => {
  const out: Settings = { ...DEFAULT_SETTINGS, reduceMotion: systemReduce };
  let saved: unknown;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
  const s = saved as Record<string, unknown>;
  if (THEME_IDS.includes(s.theme as ThemeId)) out.theme = s.theme as ThemeId;
  if (SPEEDS.includes(s.speed as Speed)) out.speed = s.speed as Speed;
  for (const k of ['sound', 'music', 'vibration', 'reduceMotion', 'confirmMoves', 'weakSpots', 'largeText', 'coach'] as const) {
    if (typeof s[k] === 'boolean') out[k] = s[k] as boolean;
  }
  return out;
};

/** How long animations take relative to normal (0 = skip them). */
export const speedFactor = (s: Speed): number => ({ slow: 1.6, normal: 1, fast: 0.5, skip: 0 })[s];
