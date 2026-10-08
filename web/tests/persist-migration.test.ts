import { describe, expect, it } from 'vitest';
import { PREVIOUS_03_RULES_VERSION, apply, newGame, rulesConfig } from '../../src/engine/index.js';
import { decodeSave, encodeSave } from '../src/logic/persist.js';

describe('Futasaku 0.3 save migration', () => {
  it('keeps an older active match as an exact snapshot before new rules continue', () => {
    const seed=782;
    const action={t:'Draw',from:'deck'} as const;
    const old=apply(newGame(seed,rulesConfig(PREVIOUS_03_RULES_VERSION)!),action);
    const raw=JSON.stringify({v:7,rules:PREVIOUS_03_RULES_VERSION,seed,actions:[action],coach:null,level:7});
    const migrated=decodeSave(raw);
    expect(migrated?.state.board).toEqual(old.board);
    expect(migrated?.state.hands).toEqual(old.hands);
    expect(migrated?.state.config.deckFinalTurns).toBe(true);
    expect(migrated?.actions).toEqual([]);
    const saved=encodeSave({seed,actions:migrated!.actions,coach:null,level:7,base:migrated!.base ?? null});
    expect(decodeSave(saved)?.state).toEqual(migrated?.state);
  });
});
