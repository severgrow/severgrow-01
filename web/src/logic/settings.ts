import { CONFIRM_MODES, type ConfirmMode } from './forecast.js';
import { HAND_SORTS } from './hand.js';
import type { HandSort } from './hand.js';
// Player settings, saved in the browser. Parsing is forgiving: anything missing or
// broken falls back to the default, so an old or damaged save never breaks the page.

import { LEVELS } from '../../../src/bots/levels.js';
import type { Level } from '../../../src/bots/levels.js';
import { DEFAULT_THEME, THEME_IDS } from './themes.js';
import type { ThemeId } from './themes.js';
import { DETAILS } from './materials.js';
import type { Detail } from './materials.js';
import { GLOW_SETTINGS } from './topglow.js';
import type { GlowSetting } from './topglow.js';

/** The old Easy / Normal / Hard choice, mapped to the 1-9 levels. */
const OLD_LEVELS: Record<string, Level> = { easy: 3, normal: 7, hard: 8 };

export const SPEEDS = ['slow', 'normal', 'fast', 'skip'] as const;
export type Speed = (typeof SPEEDS)[number];

export const EFFECTS = ['low', 'normal', 'high'] as const;
export type Effects = (typeof EFFECTS)[number];

export type Settings = {
  level: Level;
  sound: boolean;
  music: boolean;
  vibration: boolean;
  reduceMotion: boolean;
  speed: Speed;
  weakSpots: boolean;
  largeText: boolean;
  coach: boolean;
  palette: ThemeId;
  weakPulse: boolean; // pulse my most dangerous weak link with its "-4"
  effects: Effects; // how big the satisfying effects are
  materialDetail: Detail; // Low: flat shapes with only the rim and shadow
  topGlow: GlowSetting; // the slight glow on top-rank tiles
  /** overhaul item 8, "Confirm moves": Smart asks only for risky moves, Always for every board move, Never for none */
  confirmPolicy: ConfirmMode;
  /** overhaul Part 3: the decorations (splash, root heartbeat, terrarium menu, spores, last-card moment) */
  eyeCandy: boolean;
  /** an opt-in step-through list of the legal placements while drawing (accessibility) */
  placementList: boolean;
  /** overhaul item 3: how the hand is sorted (it always is; the Sort button switches) */
  handSort: HandSort;
};

export const DEFAULT_SETTINGS: Settings = {
  level: 7,
  sound: true,
  music: false,
  vibration: true,
  reduceMotion: false,
  speed: 'normal',
  weakSpots: false,
  largeText: false,
  coach: true,
  palette: DEFAULT_THEME,
  weakPulse: true,
  effects: 'normal',
  materialDetail: 'normal',
  topGlow: 'subtle',
  confirmPolicy: 'smart',
  eyeCandy: true,
  placementList: false,
  handSort: 'suit',
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
  if (SPEEDS.includes(s.speed as Speed)) out.speed = s.speed as Speed;
  if (THEME_IDS.includes(s.palette as ThemeId)) out.palette = s.palette as ThemeId;
  if (EFFECTS.includes(s.effects as Effects)) out.effects = s.effects as Effects;
  if (DETAILS.includes(s.materialDetail as Detail)) out.materialDetail = s.materialDetail as Detail;
  if (GLOW_SETTINGS.includes(s.topGlow as GlowSetting)) out.topGlow = s.topGlow as GlowSetting;
  if (LEVELS.includes(s.level as Level)) out.level = s.level as Level;
  else if (typeof s.level === 'string' && OLD_LEVELS[s.level]) out.level = OLD_LEVELS[s.level]!;
  if (HAND_SORTS.includes(s.handSort as HandSort)) out.handSort = s.handSort as HandSort;
  // the old device-based "Confirm drawn moves" setting: On carries over as Always
  if (s.confirmDraw === true) out.confirmPolicy = 'always';
  if (CONFIRM_MODES.includes(s.confirmPolicy as ConfirmMode)) out.confirmPolicy = s.confirmPolicy as ConfirmMode;
  for (const k of ['sound', 'music', 'vibration', 'reduceMotion', 'weakSpots', 'largeText', 'coach', 'weakPulse', 'placementList', 'eyeCandy'] as const) {
    if (typeof s[k] === 'boolean') out[k] = s[k] as boolean;
  }
  return out;
};

/** How long animations take relative to normal (0 = skip them). */
export const speedFactor = (s: Speed): number => ({ slow: 1.6, normal: 1, fast: 0.5, skip: 0 })[s];
