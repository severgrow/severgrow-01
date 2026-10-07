// Saving the current game in the browser, so a reload (or a phone rotation that reloads the
// page) continues the same game against the same level. v0.7: only the seed, the action list
// and the rules version are kept; resuming replays them (the engine is deterministic), so a
// save is small. A game started from a set position (the browser tests, the lab) also keeps
// that position as its `base`; the game itself never writes one for an ordinary game.
import { CURRENT_RULES_VERSION, PREVIOUS_RULES_VERSION, apply, replay, rulesConfig } from '../../../src/engine/index.js';
import type { Action, State } from '../../../src/engine/index.js';
import { LEVELS } from '../../../src/bots/levels.js';
import type { Level } from '../../../src/bots/levels.js';

export const SAVE_KEY = 'severgrow.save.v7';
export type Saved<C> = { seed: number; actions: readonly Action[]; coach: C | null; level: Level; base?: State | null };
export type Loaded<C> = Saved<C> & { state: State };

export const encodeSave = <C>(s: Saved<C>): string => JSON.stringify({ v: 7, rules: CURRENT_RULES_VERSION, seed: s.seed, actions: s.actions, coach: s.coach, level: s.level, ...(s.base ? { base: s.base } : {}) });

/** The saved game, replayed; Test2 saves are validated under their original rules before
 * continuing with unlimited Strengthen. The action log and board are preserved. */
export const decodeSave = <C>(raw: string | null): Loaded<C> | null => {
  try {
    const s = JSON.parse(raw ?? '') as { v?: number; rules?: string; seed?: number; actions?: Action[]; coach?: C | null; level?: number; base?: State };
    const legacy = s?.rules === PREVIOUS_RULES_VERSION;
    if (s?.v !== 7 || (!legacy && s.rules !== CURRENT_RULES_VERSION) || !Number.isSafeInteger(s.seed) || !Array.isArray(s.actions)) return null;
    const originalBase = s.base ?? null;
    if (originalBase && (!originalBase.board || !originalBase.hands || !originalBase.config || typeof originalBase.phase !== 'string' || !Array.isArray(originalBase.fruitKnown))) return null;
    if (legacy) {
      if (originalBase) s.actions.reduce<State>((st, a) => apply(st, a), originalBase);
      else replay(s.seed!, s.actions, rulesConfig(PREVIOUS_RULES_VERSION)!);
    }
    const base = legacy && originalBase ? { ...originalBase, config: { ...originalBase.config, strengthenLimitPerGame: -1 } } : originalBase;
    const state = base ? s.actions.reduce<State>((st, a) => apply(st, a), base) : replay(s.seed!, s.actions);
    const level = LEVELS.includes(s.level as Level) ? (s.level as Level) : 7;
    return { seed: s.seed!, actions: s.actions, coach: s.coach ?? null, level, base, state };
  } catch {
    return null;
  }
};
