import { describe, expect, it } from 'vitest';
import {
  allCoords,
  apply,
  coordKey,
  createCards,
  eventsFor,
  legalActionsForState,
  mulberry32,
  newGame,
  replay,
} from '../../src/engine/index.js';
import type { Action, Event, RulesConfig, State, Tile } from '../../src/engine/index.js';
import { LEGACY_V03 } from '../legacy.js';

/** Seeded random legal play that also records the action log. */
const playLog = (seed: number, maxActions = 400, config: Partial<RulesConfig> = {}): { actions: Action[]; states: State[] } => {
  const rand = mulberry32(seed ^ 0xabc);
  let s = newGame(seed, config);
  const actions: Action[] = [];
  const states: State[] = [s];
  for (let i = 0; i < maxActions && s.phase !== 'GAME_OVER'; i++) {
    const acts = legalActionsForState(s);
    const a = acts[Math.floor(rand() * acts.length)]!;
    actions.push(a);
    s = apply(s, a);
    states.push(s);
  }
  return { actions, states };
};

const newEvents = (before: State, after: State): Event[] => after.history!.slice(before.history!.length);

describe('events (spec 12, step 18)', () => {
  it('a new game starts with an empty history', () => {
    expect(newGame(1).history).toEqual([]);
  });

  it('records draws, with deck cards hidden from the opponent', () => {
    const s0 = newGame(5);
    const top = s0.deck[0]!;
    const s1 = apply(s0, { t: 'Draw', from: 'deck' });
    expect(newEvents(s0, s1)).toEqual([{ t: 'Draw', player: 0, from: 'deck', card: top.id }]);
    expect(eventsFor(s1, 0)).toEqual([{ t: 'Draw', player: 0, from: 'deck', card: top.id }]);
    expect(eventsFor(s1, 1)).toEqual([{ t: 'Draw', player: 0, from: 'deck' }]);
    const d = newGame(5);
    const taken = d.discard.at(-1)!;
    const d1 = apply(d, { t: 'Draw', from: 'discard' });
    expect(eventsFor(d1, 1)).toEqual([{ t: 'Draw', player: 0, from: 'discard', card: taken.id }]);
  });

  it('every event type that random play produces has the spec shape (parked rules on)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const { states } = playLog(seed, 400, LEGACY_V03);
      for (const e of states.at(-1)!.history!) seen.add(e.t);
    }
    for (const t of ['Draw', 'Bloom', 'Overgrow', 'Discard', 'RotCount', 'Sever', 'GameEnd']) {
      expect(seen).toContain(t);
    }
  });

  it('the core game records Sprout events and never Rot or Knock events (Fruit is core since v0.5)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) for (const e of playLog(seed).states.at(-1)!.history!) seen.add(e.t);
    expect(seen).toContain('Sprout');
    for (const t of ['RotCount', 'Rot', 'RotPick', 'Knock', 'FinalTurnStart']) expect(seen).not.toContain(t);
  });

  it('a finished game ends with exactly one GameEnd event carrying the result', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const end = playLog(seed, 2000).states.at(-1)!;
      if (end.phase !== 'GAME_OVER') continue;
      const ends = end.history!.filter((e) => e.t === 'GameEnd');
      expect(ends).toEqual([{ t: 'GameEnd', result: end.result }]);
      expect(end.history!.at(-1)).toEqual({ t: 'GameEnd', result: end.result });
    }
  });

  it('Sever events list the mover’s opponent first', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { states } = playLog(seed);
      for (let i = 1; i < states.length; i++) {
        const sev = newEvents(states[i - 1]!, states[i]!).filter((e) => e.t === 'Sever');
        if (sev.length === 2) {
          const mover = states[i - 1]!.turnPlayer;
          expect(sev[0]!.t === 'Sever' && sev[0]!.player).toBe(mover === 0 ? 1 : 0);
        }
      }
    }
  });

  it('every board change can be explained from the events alone (gate 6)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      // Half the games on the core rules, half with the parked rules on.
      const config = seed % 2 ? {} : LEGACY_V03;
      const cards = new Map(createCards(newGame(1, config).config).map((c) => [c.id, c]));
      const { states } = playLog(seed, 400, config);
      const board: Record<string, Tile | null> = JSON.parse(JSON.stringify(states[0]!.board)) as Record<string, Tile | null>;
      for (let i = 1; i < states.length; i++) {
        const before = states[i - 1]!;
        const after = states[i]!;
        for (const e of newEvents(before, after)) {
          const p = 'player' in e ? e.player : 0;
          if (e.t === 'Bloom') {
            // v0.7: hexes[j] received cards[j], with that card's own number
            e.hexes.forEach((h, j) => (board[coordKey(h)] = { owner: p, strength: cards.get(e.cards[j]!)!.rank }));
          }
          if (e.t === 'Sprout') board[coordKey(e.coord)] = { owner: p, strength: cards.get(e.card)!.rank };
          if (e.t === 'Strengthen') board[coordKey(e.coord)] = { owner: p, strength: e.newStrength };
          if (e.t === 'FruitCard') board[coordKey(e.target)] = null;
          if (e.t === 'Rot' || e.t === 'Sever') for (const c of e.coords) board[coordKey(c)] = null;
          if (e.t === 'RotPick') board[coordKey(e.coord)] = null;
        }
        for (const c of allCoords(3)) expect(board[coordKey(c)]).toEqual(after.board[coordKey(c)]);
      }
    }
  }, 120_000);

  it('Overgrow events name the old owner and strengths', () => {
    let found = 0;
    for (let seed = 1; seed <= 60 && found < 5; seed++) {
      const { states } = playLog(seed);
      for (let i = 1; i < states.length; i++) {
        for (const e of newEvents(states[i - 1]!, states[i]!)) {
          if (e.t !== 'Overgrow') continue;
          const old = states[i - 1]!.board[coordKey(e.coord)]!;
          expect(e.oldOwner).toBe(old.owner);
          expect(e.oldStrength).toBe(old.strength);
          expect(e.newStrength).toBeGreaterThan(e.oldStrength);
          expect(e.player).not.toBe(e.oldOwner);
          found++;
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('refills are recorded as deck draws and hidden from the opponent', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { states, actions } = playLog(seed, 400, LEGACY_V03); // refill happens in Continue here
      for (let i = 0; i < actions.length; i++) {
        if (actions[i]!.t !== 'Continue' || states[i + 1]!.phase === 'ROT_PICK') continue;
        const before = states[i]!;
        const after = states[i + 1]!;
        const p = before.turnPlayer;
        if (after.phase === 'GAME_OVER' && after.result?.reason !== 'deck_exhaustion') continue;
        const draws = newEvents(before, after).filter((e) => e.t === 'Draw');
        const gained = after.hands[p].length - before.hands[p].length;
        expect(draws).toHaveLength(Math.max(0, gained));
      }
    }
    const { states } = playLog(3);
    const last = states.at(-1)!;
    for (const e of eventsFor(last, 1)) {
      if (e.t === 'Draw' && e.player === 0 && e.from === 'deck') expect(e.card).toBeUndefined();
    }
  });
});

describe('replay (spec 18)', () => {
  it('rebuilds the same game from seed + action log', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { actions, states } = playLog(seed);
      expect(replay(seed, actions)).toEqual(states.at(-1));
    }
  });

  it('is byte-identical across runs (state and events)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { actions } = playLog(seed);
      const a = JSON.stringify(replay(seed, actions));
      const b = JSON.stringify(replay(seed, actions));
      expect(a).toBe(b);
    }
  });

  it('passes the config through and rejects an illegal log entry', () => {
    const s = replay(4, [{ t: 'Draw', from: 'deck' }], { rootStyle: 'corner' });
    expect(s.config.rootStyle).toBe('corner');
    expect(() => replay(4, [{ t: 'EndAct' }])).toThrow(/WRONG_PHASE/);
  });
});
