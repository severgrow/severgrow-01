// A browser save made under the Futasaku 0.3 rules (player 1 always started, ties to player 2)
// replays exactly under those rules, then continues under the 0.4 rules from that position.
import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, PREVIOUS_SIX_CARD_RULES_VERSION, apply, legalActions, newGame, rulesConfig, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { decodeSave, encodeSave } from '../src/logic/persist.js';

const playSome = (s: State, n: number) => {
  const actions: Action[] = [];
  for (let i = 0; i < n && s.phase !== 'GAME_OVER'; i++) {
    const a = legalActions(viewFor(s, s.actor))[0]!;
    actions.push(a);
    s = apply(s, a);
  }
  return { s, actions };
};

describe('saves across the Futasaku 0.4 rules change', () => {
  it('a 0.3 save replays with player 1 starting, then continues on 0.4 rules from the same position', () => {
    const seed = 21;
    const old = newGame(seed, rulesConfig(PREVIOUS_SIX_CARD_RULES_VERSION)!);
    expect(old.startingPlayer).toBe(0);
    const { s, actions } = playSome(old, 12);
    const raw = JSON.stringify({ v: 7, rules: PREVIOUS_SIX_CARD_RULES_VERSION, seed, actions, coach: null, level: 5 });
    const loaded = decodeSave(raw)!;
    expect(loaded).not.toBeNull();
    expect(loaded.state.board).toEqual(s.board);
    expect(loaded.state.hands).toEqual(s.hands);
    expect(loaded.state.startingPlayer).toBe(0);
    expect(loaded.state.config.strengthTieBreak).toBe(true);
    // the migrated game is saved as a snapshot, so a later reload cannot replay it differently
    const again = decodeSave(encodeSave({ seed, actions: [], coach: null, level: 5, base: loaded.state }))!;
    expect(again.state).toEqual(loaded.state);
    expect(JSON.parse(encodeSave({ seed, actions: [], coach: null, level: 5 })).rules).toBe(CURRENT_RULES_VERSION);
  });

  it('a current save needs only the seed and actions: the starter replays from the seed', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { s, actions } = playSome(newGame(seed), 8);
      const loaded = decodeSave(encodeSave({ seed, actions, coach: null, level: 5 }))!;
      expect(loaded.state).toEqual(s);
    }
  });

  it('rejects an unknown rules version', () => {
    expect(decodeSave(JSON.stringify({ v: 7, rules: 'futasaku9', seed: 1, actions: [], coach: null, level: 5 }))).toBeNull();
  });
});
