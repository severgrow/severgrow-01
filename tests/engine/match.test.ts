// The engine-owned starting-player contract. One lottery, used by the browser and by
// server-core verification, so a match's first seat is never interpreted twice.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_RULES_VERSION,
  PREVIOUS_RULES_VERSION,
  apply,
  matchSetup,
  newGame,
  newMatch,
  rulesConfig,
  startingPlayerFor,
  stateFromSetup,
} from '../../src/engine/index.js';
import type { Player, State } from '../../src/engine/index.js';

const firstSeedWith = (seat: Player): number => {
  for (let seed = 0; seed < 512; seed++) if (startingPlayerFor(seed) === seat) return seed;
  throw new Error(`no seed starts with seat ${seat}`);
};

const SEED_SEAT_0 = firstSeedWith(0);
const SEED_SEAT_1 = firstSeedWith(1);

describe('starting-player contract (engine-owned)', () => {
  it('the lottery is deterministic and reaches both seats', () => {
    expect(startingPlayerFor(SEED_SEAT_0)).toBe(0);
    expect(startingPlayerFor(SEED_SEAT_1)).toBe(1);
    // The known browser seed still starts with player 0 (no behaviour change for existing games).
    expect(startingPlayerFor(219682080)).toBe(0);
    for (let seed = 0; seed < 16; seed++) expect(startingPlayerFor(seed)).toBe(startingPlayerFor(seed));
  });

  it('newMatch applies the lottery; newGame stays the neutral player-0 deal', () => {
    expect(newGame(1).startingPlayer).toBe(0);
    expect(newGame(1).turnPlayer).toBe(0);
    expect(newGame(1).actor).toBe(0);

    const one = newMatch(SEED_SEAT_1);
    expect([one.startingPlayer, one.turnPlayer, one.actor]).toEqual([1, 1, 1]);
    const zero = newMatch(SEED_SEAT_0);
    expect([zero.startingPlayer, zero.turnPlayer, zero.actor]).toEqual([0, 0, 0]);
  });

  it('the same setup gives the same opening; only the seat order differs from the neutral deal', () => {
    expect(newMatch(SEED_SEAT_1)).toEqual(newMatch(SEED_SEAT_1));
    const { startingPlayer, turnPlayer, actor, ...played } = newMatch(SEED_SEAT_1);
    const { startingPlayer: n0, turnPlayer: n1, actor: n2, ...neutral } = newGame(SEED_SEAT_1);
    expect(startingPlayer).toBe(1);
    expect(played).toEqual(neutral);
  });

  it('archived rules always start with player 0, so old saves and replays still verify', () => {
    const archived = rulesConfig(PREVIOUS_RULES_VERSION)!;
    expect(archived.startingPlayerLottery).toBe(false);
    for (const seed of [1, SEED_SEAT_1, SEED_SEAT_0, 12345]) {
      const s = newMatch(seed, archived);
      expect([s.startingPlayer, s.turnPlayer, s.actor]).toEqual([0, 0, 0]);
    }
  });

  it('matchSetup records the rules version and starting seat, and rebuilds the same state', () => {
    const setup = matchSetup(7, CURRENT_RULES_VERSION);
    expect(setup.rulesVersion).toBe(CURRENT_RULES_VERSION);
    expect(setup.startingPlayer).toBe(startingPlayerFor(7));
    expect(stateFromSetup(setup)).toEqual(newMatch(7));
  });

  it('rejects an unknown rules version and a non-integer seed', () => {
    expect(() => matchSetup(1, 'no-such-rules')).toThrow(/unknown rules version/);
    expect(() => matchSetup(1.5, CURRENT_RULES_VERSION)).toThrow(/seed/);
  });

  it('deck-end final turns are fair for either lottery starting seat', () => {
    const exhausted = (s: State): State => ({
      ...s,
      deck: [],
      phase: 'ACT',
      hands: [[{ id: 9001, suit: 0, rank: 3 }], [{ id: 9002, suit: 0, rank: 3 }]],
    });
    const endTurn = (s: State): State => {
      const act = apply(s, { t: 'EndAct' });
      return apply(act, { t: 'Discard', card: act.hands[act.turnPlayer][0]!.id });
    };
    for (const seed of [SEED_SEAT_0, SEED_SEAT_1]) {
      const starter = newMatch(seed).startingPlayer;
      const other: Player = starter === 0 ? 1 : 0;
      // Deck empties on the other seat's turn: the starting seat gets the two-turn equaliser.
      const onOther = endTurn(exhausted({ ...newMatch(seed), turnPlayer: other, actor: other }));
      expect(onOther.deckFinal).toEqual({ first: starter, remaining: 2 });
      // Deck empties on the starting seat's own turn: the other seat gets one final turn.
      const onStarter = endTurn(exhausted(newMatch(seed)));
      expect(onStarter.deckFinal).toEqual({ first: other, remaining: 1 });
    }
  });
});
