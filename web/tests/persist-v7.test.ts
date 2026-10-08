// The autosave keeps a seed, action list and rules version. Test2 saves migrate to the
// unlimited Strengthen default; unknown versions and illegal logs still start fresh.
import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, PREVIOUS_RULES_VERSION, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { SAVE_KEY, decodeSave, encodeSave } from '../src/logic/persist.js';
import { Session } from '../src/logic/session.js';

/** A session several moves in, every move (both sides) through the session. */
const played = (seed: number, moves: number) => {
  const s = new Session(newGame(seed), 0);
  for (let i = 0; i < moves && s.state.phase !== 'GAME_OVER'; i++) {
    const who = s.state.actor;
    s.play(GreedyBot.chooseAction(viewFor(s.state, who)), who);
  }
  return s;
};

describe('autosave: seed + actions (v0.7)', () => {
  it('uses a new key, so a v0.6 whole-state save is never read', () => {
    expect(SAVE_KEY).toBe('severgrow.save.v7');
  });

  it('resuming replays the actions to exactly the same game', () => {
    const s = played(11, 40);
    const raw = encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 5 });
    const back = decodeSave(raw)!;
    expect(back.level).toBe(5);
    expect(back.actions).toEqual(s.log);
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(s.state));
  });

  it('is small: the seed and the moves, not the board', () => {
    const s = played(12, 80);
    expect(encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 7 }).length).toBeLessThan(JSON.stringify(s.state).length / 3);
  });

  it('undo takes the move out of the log too', () => {
    const s = new Session(newGame(13), 0);
    while (s.state.actor !== 0 || s.state.phase !== 'ACT') s.play(GreedyBot.chooseAction(viewFor(s.state, s.state.actor)), s.state.actor);
    const n = s.log.length;
    s.play(legalActions(s.view).find((a) => a.t === 'Sprout' || a.t === 'Bloom' || a.t === 'EndAct')!);
    expect(s.log.length).toBe(n + 1);
    expect(s.undo()).toBe(true);
    expect(s.log.length).toBe(n);
    const back = decodeSave(encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 7 }))!;
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(s.state));
  });

  it('a resumed session keeps logging from where it was', () => {
    const s = played(14, 20);
    const back = decodeSave(encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 7 }))!;
    const r = new Session(back.state, 0, back.actions);
    expect(r.log).toEqual(s.log);
  });

  it('refuses other rules versions, broken logs and junk', () => {
    const s = played(15, 10);
    const ok = JSON.parse(encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 7 }));
    expect(ok.rules).toBe(CURRENT_RULES_VERSION);
    expect(decodeSave(JSON.stringify({ ...ok, rules: 'v0.6-fruit-cards' }))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...ok, actions: [...ok.actions, { t: 'Discard', card: -1 }] }))).toBeNull();
    expect(decodeSave(JSON.stringify({ state: newGame(1), coach: null, level: 4 }))).toBeNull(); // a v0.6 save
    expect(decodeSave('nonsense')).toBeNull();
    expect(decodeSave(null)).toBeNull();
  });

  it('continues a Test2 save from an exact upgraded snapshot', () => {
    const s = played(19, 20);
    const raw = JSON.parse(encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 7 }));
    const loaded = decodeSave(JSON.stringify({ ...raw, rules: PREVIOUS_RULES_VERSION }))!;
    expect(loaded.actions).toEqual([]);
    expect(loaded.base).toEqual(loaded.state);
    expect(loaded.state.config.strengthenLimitPerGame).toBe(-1);
    expect(loaded.state.board).toEqual(s.state.board);
  });

  it('an unknown level becomes 7', () => {
    const s = played(16, 4);
    const ok = JSON.parse(encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 7 }));
    expect(decodeSave(JSON.stringify({ ...ok, level: 12 }))!.level).toBe(7);
  });
});

describe('autosave from a set position (tests, the lab)', () => {
  it('keeps the position and replays the actions from it', () => {
    const start = played(17, 30).state;
    const s = new Session(start, 0, [], start);
    for (let i = 0; i < 12 && s.state.phase !== 'GAME_OVER'; i++) s.play(GreedyBot.chooseAction(viewFor(s.state, s.state.actor)), s.state.actor);
    const back = decodeSave(encodeSave({ seed: start.seed, actions: s.log, coach: null, level: 7, base: s.base }))!;
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(s.state));
    expect(back.base).not.toBeNull();
  });
  it('an ordinary game never writes a position', () => {
    const s = played(18, 6);
    expect(JSON.parse(encodeSave({ seed: s.state.seed, actions: s.log, coach: null, level: 7, base: s.base }))).not.toHaveProperty('base');
  });
});
