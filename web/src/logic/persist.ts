// Saving the current game in the browser, so a reload (or a phone rotation that reloads the
// page) continues the same game against the same level. v0.7: only the seed, the action list
// and the rules version are kept; resuming replays them (the engine is deterministic), so a
// save is small. A game started from a set position (the browser tests, the lab) also keeps
// that position as its `base`; the game itself never writes one for an ordinary game.
import { CURRENT_RULES_VERSION, apply, replay } from '../../../src/engine/index.js';
import type { Action, State } from '../../../src/engine/index.js';
import { LEVELS } from '../../../src/bots/levels.js';
import type { Level } from '../../../src/bots/levels.js';

export const SAVE_KEY = 'severgrow.save.v7';
export type Saved<C> = { seed: number; actions: readonly Action[]; coach: C | null; level: Level; base?: State | null };
export type Loaded<C> = Saved<C> & { state: State };

export const encodeSave = <C>(s: Saved<C>): string => JSON.stringify({ v: 7, rules: CURRENT_RULES_VERSION, seed: s.seed, actions: s.actions, coach: s.coach, level: s.level, ...(s.base ? { base: s.base } : {}) });

/** The saved game, replayed; null for a save from other rules, a broken log or junk. */
export const decodeSave = <C>(raw: string | null): Loaded<C> | null => {
  try {
    const s = JSON.parse(raw ?? '') as { v?: number; rules?: string; seed?: number; actions?: Action[]; coach?: C | null; level?: number; base?: State };
    if (s?.v !== 7 || s.rules !== CURRENT_RULES_VERSION || !Number.isSafeInteger(s.seed) || !Array.isArray(s.actions)) return null;
    const base = s.base ?? null;
    if (base && (!base.board || !base.hands || !base.config || typeof base.phase !== 'string' || !Array.isArray(base.fruitKnown))) return null;
    const state = base ? s.actions.reduce<State>((st, a) => apply(st, a), base) : replay(s.seed!, s.actions);
    const level = LEVELS.includes(s.level as Level) ? (s.level as Level) : 7;
    return { seed: s.seed!, actions: s.actions, coach: s.coach ?? null, level, base, state };
  } catch {
    return null;
  }
};
