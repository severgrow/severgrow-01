// Saving the current game in the browser, so a reload (or a phone rotation that
// reloads the page) continues the same game.
import type { State } from '../../../src/engine/index.js';

export const SAVE_KEY = 'severgrow.save.v5';
export type Saved<C> = { state: State; coach: C | null };

export const encodeSave = <C>(s: Saved<C>): string => JSON.stringify(s);

export const decodeSave = <C>(raw: string | null): Saved<C> | null => {
  try {
    const s = JSON.parse(raw ?? '') as Saved<C>;
    if (!s?.state?.board || !s.state.hands || !s.state.config || typeof s.state.phase !== 'string') return null;
    return { state: s.state, coach: s.coach ?? null };
  } catch {
    return null;
  }
};
