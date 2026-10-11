// Saving the current game in the browser, so a reload (or a phone rotation that reloads the
// page) continues the same game against the same level. v0.7: only the seed, the action list
// and the rules version are kept; resuming replays them (the engine is deterministic), so a
// save is small. A game started from a set position (the browser tests, the lab) also keeps
// that position as its `base`; the game itself never writes one for an ordinary game.
import { CURRENT_RULES_VERSION, DEFAULT_CONFIG, apply, replay, rulesConfig } from '../../../src/engine/index.js';
import type { Action, State } from '../../../src/engine/index.js';
import { LEVELS } from '../../../src/bots/levels.js';
import type { Level } from '../../../src/bots/levels.js';

export const SAVE_KEY = 'severgrow.save.v7';
export type Saved<C> = { seed: number; actions: readonly Action[]; coach: C | null; level: Level; base?: State | null };
export type Loaded<C> = Saved<C> & { state: State };

export const encodeSave = <C>(s: Saved<C>): string => JSON.stringify({ v: 7, rules: CURRENT_RULES_VERSION, seed: s.seed, actions: s.actions, coach: s.coach, level: s.level, ...(s.base ? { base: s.base } : {}) });

/** Replay older saves under their recorded rules, then snapshot active matches before
 * continuing with the current Futasaku rules. Their board, hands, event history and recorded
 * starting player are preserved. */
export const decodeSave = <C>(raw: string | null): Loaded<C> | null => {
  try {
    const s = JSON.parse(raw ?? '') as { v?: number; rules?: string; seed?: number; actions?: Action[]; coach?: C | null; level?: number; base?: State };
    const recorded = typeof s?.rules === 'string' ? rulesConfig(s.rules) : null;
    if (s?.v !== 7 || !recorded || !Number.isSafeInteger(s.seed) || !Array.isArray(s.actions)) return null;
    const originalBase = s.base ?? null;
    if (originalBase && (!originalBase.board || !originalBase.hands || !originalBase.config || typeof originalBase.phase !== 'string' || !Array.isArray(originalBase.fruitKnown))) return null;
    const oldConfig = s.rules !== CURRENT_RULES_VERSION ? recorded : null;
    // A base written by an older build lacks the newer rule keys: give it its version's values.
    const base = originalBase && oldConfig ? { ...originalBase, config:{ ...originalBase.config,
      deckFinalTurns:oldConfig.deckFinalTurns, expandedBloom:oldConfig.expandedBloom ?? false,
      randomStarter:false, strengthTieBreak:false } } : originalBase;
    const restored = base ? s.actions.reduce<State>((st, a) => apply(st, a), base) : replay(s.seed!, s.actions, oldConfig ?? {});
    const state = oldConfig && restored.phase !== 'GAME_OVER'
      ? { ...restored,config:{ ...restored.config, deckFinalTurns:true, strengthenLimitPerGame:DEFAULT_CONFIG.strengthenLimitPerGame,
          expandedBloom:true, randomStarter:true, strengthTieBreak:true },
        startingPlayer:restored.startingPlayer ?? (restored.turnNumber % 2 ? restored.turnPlayer : (1-restored.turnPlayer) as 0|1),
        deckFinal:restored.config.deckFinalTurns ? restored.deckFinal ?? null : null }
      : restored;
    const level = LEVELS.includes(s.level as Level) ? (s.level as Level) : 7;
    // A migrated match continues from one exact snapshot. Its earlier actions were
    // replayed under the recorded rules; replaying them under the new rules later
    // could otherwise change a deck-end position on the next reload.
    if (oldConfig && state.phase !== 'GAME_OVER') return { seed:s.seed!,actions:[],coach:s.coach ?? null,level,base:state,state };
    return { seed: s.seed!, actions: s.actions, coach: s.coach ?? null, level, base, state };
  } catch {
    return null;
  }
};
