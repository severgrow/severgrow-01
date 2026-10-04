// Saving the current game in the browser, so a reload (or a phone rotation that
// reloads the page) continues the same game against the same bot level.
import type { State } from '../../../src/engine/index.js';
import { LEVELS } from '../../../src/bots/levels.js';
import type { Level } from '../../../src/bots/levels.js';

export const SAVE_KEY = 'severgrow.save.v6';
export type Saved<C> = { state: State; coach: C | null; level: Level };

export const encodeSave = <C>(s: Saved<C>): string => JSON.stringify(s);

export const decodeSave = <C>(raw: string | null): Saved<C> | null => {
  try {
    const s = JSON.parse(raw ?? '') as Partial<Saved<C>>;
    if (!s?.state?.board || !s.state.hands || !s.state.config || typeof s.state.phase !== 'string') return null;
    // games from older rules (before Fruit cards) are not supported: start fresh
    if (typeof s.state.config.fruitCardCount !== 'number' || !Array.isArray(s.state.fruitKnown)) return null;
    const level = LEVELS.includes(s.level as Level) ? (s.level as Level) : 7;
    return { state: s.state, coach: s.coach ?? null, level };
  } catch {
    return null;
  }
};
