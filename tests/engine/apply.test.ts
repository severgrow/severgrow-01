import { describe, expect, it } from 'vitest';
import { IllegalActionError, apply, applyAs, deadwood, newGame } from '../../src/engine/index.js';
import type { Action, Card, Phase, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { clone, fixture, tilesOf } from '../helpers.js';

const MOSS = 0;
const ASH = 1;
const DEW = 2;
const EMBER = 3;

let nextId = 1000;
const c = (suit: Suit, rank: number): Card => ({ id: nextId++, suit, rank });
const junk = (n: number): Card[] => Array.from({ length: n }, (_, i) => c(((i % 4) as Suit), 9 - (i % 3)));

/** A hand-built state on top of newGame's defaults. */
const makeState = (o: {
  tiles?: Record<string, [Player, number]>;
  rock?: string[];
  rich?: string[];
  config?: Partial<RulesConfig>;
  hands?: [Card[], Card[]];
  deck?: Card[];
  discard?: Card[];
  phase?: Phase;
  turnPlayer?: Player;
  patch?: Partial<State>;
}): State => {
  const f = fixture({
    ...(o.tiles ? { tiles: o.tiles } : {}),
    ...(o.rock ? { rock: o.rock } : {}),
    ...(o.rich ? { rich: o.rich } : {}),
    ...(o.config ? { config: o.config } : {}),
  });
  const base = newGame(1, o.config ?? {});
  const tp = o.turnPlayer ?? 0;
  return {
    ...base,
    board: f.board,
    terrain: f.terrain,
    hands: o.hands ?? [junk(7), junk(7)],
    deck: o.deck ?? junk(20),
    discard: o.discard ?? [c(EMBER, 9)],
    phase: o.phase ?? 'DRAW',
    turnPlayer: tp,
    actor: tp,
    ...o.patch,
  };
};

/** apply, asserting the input state is never mutated. */
const act = (s: State, a: Action): State => {
  const before = clone(s);
  try {
    return apply(s, a);
  } finally {
    expect(s).toEqual(before);
  }
};

/** Expect an IllegalActionError with the given code and no mutation. */
const illegal = (s: State, a: Action, code: string) => {
  const before = clone(s);
  let err: unknown;
  try {
    apply(s, a);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(IllegalActionError);
  expect((err as IllegalActionError).code).toBe(code);
  expect(s).toEqual(before);
};

const ids = (cs: Card[]) => cs.map((x) => x.id);

describe('DRAW', () => {
  it('from the deck: top card to hand, phase ACT', () => {
    const s = makeState({});
    const top = s.deck[0]!;
    const n = act(s, { t: 'Draw', from: 'deck' });
    expect(n.hands[0]).toHaveLength(8);
    expect(n.hands[0].at(-1)).toEqual(top);
    expect(n.deck).toHaveLength(19);
    expect(n.drawnFromDiscard).toBeNull();
    expect(n.phase).toBe('ACT');
  });

  it('from the discard pile: top card to hand, recorded', () => {
    const s = makeState({});
    const top = s.discard.at(-1)!;
    const n = act(s, { t: 'Draw', from: 'discard' });
    expect(n.hands[0].at(-1)).toEqual(top);
    expect(n.discard).toHaveLength(0);
    expect(n.drawnFromDiscard).toBe(top.id);
  });

  it('an empty deck allows only the discard draw', () => {
    const s = makeState({ deck: [] });
    illegal(s, { t: 'Draw', from: 'deck' }, 'DECK_EMPTY');
    expect(act(s, { t: 'Draw', from: 'discard' }).phase).toBe('ACT');
  });

  it('Draw during ACT is illegal', () => {
    illegal(makeState({ phase: 'ACT' }), { t: 'Draw', from: 'deck' }, 'WRONG_PHASE');
  });
});

describe('ACT: melds', () => {
  const run = () => [c(MOSS, 3), c(MOSS, 4), c(MOSS, 5)];

  it('MeldRun places the hypha, removes the cards, records the resolution', () => {
    const r = run();
    const s = makeState({ phase: 'ACT', rich: ['0,0'], hands: [[...r, ...junk(5)], junk(7)] });
    const n = act(s, { t: 'MeldRun', cards: ids(r), start: { q: -1, r: 1 }, dir: 1 });
    expect(n.board['0,0']).toEqual({ owner: 0, strength: 4 });
    expect(n.hands[0]).toHaveLength(5);
    expect(n.hands[0].some((x) => ids(r).includes(x.id))).toBe(false);
    expect(n.phase).toBe('ACT');
    expect(n.lastResolution).toEqual({
      placed: [{ q: -1, r: 1 }, { q: 0, r: 0 }, { q: 1, r: -1 }],
      overgrown: [],
      rotted: [],
      severed: [],
    });
  });

  it('MeldSet places a bloom; multiple melds per turn are allowed', () => {
    const set = [c(MOSS, 6), c(ASH, 6), c(DEW, 6)];
    const r = run();
    const s = makeState({ phase: 'ACT', hands: [[...set, ...r, ...junk(2)], junk(7)] });
    const a = act(s, { t: 'MeldSet', cards: ids(set), hexes: [{ q: -1, r: 1 }, { q: -1, r: 2 }, { q: 0, r: 1 }] });
    const b = act(a, { t: 'MeldRun', cards: ids(r), start: { q: -2, r: 1 }, dir: 2 });
    expect(tilesOf(b.board, 0)).toHaveLength(7);
    expect(b.hands[0]).toHaveLength(2);
  });

  it('an overgrow that cuts the enemy is followed by Sever', () => {
    const r = run();
    const s = makeState({
      phase: 'ACT',
      tiles: { '0,0': [1, 1], '1,-1': [1, 1], '-1,0': [1, 1] }, // P2 arm (1,-1)-(0,0)-(-1,0)
      hands: [[...r, ...junk(5)], junk(7)],
    });
    // Hypha from (-1,1) dir 1 overgrows (0,0) and (1,-1); (-1,0) is cut off.
    const n = act(s, { t: 'MeldRun', cards: ids(r), start: { q: -1, r: 1 }, dir: 1 });
    expect(n.lastResolution!.overgrown).toEqual([{ q: 0, r: 0 }, { q: 1, r: -1 }]);
    expect(n.lastResolution!.severed).toEqual([{ player: 1, coords: [{ q: -1, r: 0 }] }]);
    expect(n.board['-1,0']).toBeNull();
  });

  it('a meld may not leave the hand empty (the discard is mandatory)', () => {
    const r = run();
    const s = makeState({ phase: 'ACT', hands: [r, junk(7)] });
    illegal(s, { t: 'MeldRun', cards: ids(r), start: { q: -1, r: 1 }, dir: 1 }, 'HAND_WOULD_BE_EMPTY');
  });

  it('an illegal meld changes nothing (atomic)', () => {
    const r = run();
    const s = makeState({ phase: 'ACT', tiles: { '1,-1': [1, 5] }, hands: [[...r, ...junk(5)], junk(7)] });
    illegal(s, { t: 'MeldRun', cards: ids(r), start: { q: -1, r: 1 }, dir: 1 }, 'NOT_STRONGER');
  });

  it('a meld that strangles the enemy root ends the game', () => {
    // P2 already holds 5 of P1's root neighbours, chained to P2's root; rock on two.
    const set = [c(MOSS, 6), c(ASH, 6), c(DEW, 6)];
    const s = makeState({
      phase: 'ACT',
      turnPlayer: 1,
      rock: ['-3,2', '-3,3', '-2,3'],
      tiles: { '1,-1': [1, 1], '0,0': [1, 1], '-1,1': [1, 1], '-2,1': [1, 1] },
      hands: [junk(7), [...set, ...junk(5)]],
    });
    const n = act(s, { t: 'MeldSet', cards: ids(set), hexes: [{ q: -1, r: 2 }, { q: 0, r: 1 }, { q: 0, r: 2 }] });
    expect(n.phase).toBe('GAME_OVER');
    expect(n.result).toEqual({ winner: 1, reason: 'strangle', scores: [0, 7] });
    expect(n.lastResolution!.strangled).toBe(0);
    illegal(n, { t: 'EndAct' }, 'GAME_OVER');
  });

  it('EndAct moves to DISCARD', () => {
    expect(act(makeState({ phase: 'ACT' }), { t: 'EndAct' }).phase).toBe('DISCARD');
  });
});

describe('ACT: Fruit', () => {
  const tiles: Record<string, [Player, number]> = {
    '-1,1': [0, 3],
    '0,1': [0, 3],
    '0,0': [0, 3],
    '1,0': [1, 9],
    '1,-1': [1, 9],
    '2,0': [1, 4],
  };
  const fruit: Action = {
    t: 'Fruit',
    sacrifice: [{ q: -1, r: 1 }, { q: 0, r: 1 }, { q: 0, r: 0 }],
    target: { q: 1, r: 0 },
  };

  it('resolves, counts the use, and Severs', () => {
    const n = act(makeState({ phase: 'ACT', tiles }), fruit);
    expect(n.fruitUsed).toEqual([1, 0]);
    expect(n.board['1,0']).toBeNull();
    expect(n.board['2,0']).toBeNull(); // severed
    expect(n.lastResolution).toEqual({
      placed: [],
      overgrown: [],
      rotted: [],
      severed: [{ player: 1, coords: [{ q: 2, r: 0 }] }],
      fruit: { sacrifice: fruit.t === 'Fruit' ? fruit.sacrifice : [], target: { q: 1, r: 0 } },
    });
  });

  it('only once per player', () => {
    illegal(makeState({ phase: 'ACT', tiles, patch: { fruitUsed: [1, 0] } }), fruit, 'FRUIT_EXHAUSTED');
  });

  it('only in ACT', () => {
    illegal(makeState({ phase: 'DISCARD', tiles }), fruit, 'WRONG_PHASE');
  });
});

describe('DISCARD and the redundant-discard loophole (14.11)', () => {
  it('moves the card to the top of the pile and goes to KNOCK', () => {
    const s = makeState({ phase: 'DISCARD', hands: [junk(8), junk(7)] });
    const card = s.hands[0][2]!;
    const n = act(s, { t: 'Discard', card: card.id });
    expect(n.discard.at(-1)).toEqual(card);
    expect(n.hands[0]).toHaveLength(7);
    expect(n.phase).toBe('KNOCK');
  });

  it('a card not in hand is illegal', () => {
    illegal(makeState({ phase: 'DISCARD' }), { t: 'Discard', card: 99999 }, 'CARD_NOT_IN_HAND');
  });

  it('discarding the card just taken from the discard pile is illegal', () => {
    const s = act(makeState({}), { t: 'Draw', from: 'discard' });
    const taken = s.drawnFromDiscard!;
    const d = act(s, { t: 'EndAct' });
    illegal(d, { t: 'Discard', card: taken }, 'REDUNDANT_DISCARD');
    expect(act(d, { t: 'Discard', card: d.hands[0][0]!.id }).phase).toBe('KNOCK');
  });

  it('allowed when the card was drawn from the deck', () => {
    const s = act(act(makeState({}), { t: 'Draw', from: 'deck' }), { t: 'EndAct' });
    expect(act(s, { t: 'Discard', card: s.hands[0].at(-1)!.id }).phase).toBe('KNOCK');
  });

  it('allowed when forbidRedundantDiscard is off', () => {
    const s = act(makeState({ config: { forbidRedundantDiscard: false } }), { t: 'Draw', from: 'discard' });
    const d = act(s, { t: 'EndAct' });
    expect(act(d, { t: 'Discard', card: s.drawnFromDiscard! }).phase).toBe('KNOCK');
  });

  it('melding the taken card away then discarding another is fine', () => {
    const m4 = c(MOSS, 4);
    const s0 = makeState({ hands: [[c(MOSS, 3), c(MOSS, 5), ...junk(5)], junk(7)], discard: [m4] });
    const s = act(s0, { t: 'Draw', from: 'discard' });
    const hand = s.hands[0];
    const run = [hand[0]!, m4, hand[1]!];
    const melded = act(s, { t: 'MeldRun', cards: ids(run), start: { q: -1, r: 1 }, dir: 1 });
    const d = act(melded, { t: 'EndAct' });
    expect(act(d, { t: 'Discard', card: d.hands[0][0]!.id }).phase).toBe('KNOCK');
  });
});

describe('KNOCK and the final turn (14.10)', () => {
  // Kept hands: run Moss 1-5 + deadwood (Dew 9 + Ember 1 = 10) or (Dew 9 + Ember 2 = 11).
  const hand10 = () => [c(MOSS, 1), c(MOSS, 2), c(MOSS, 3), c(MOSS, 4), c(MOSS, 5), c(DEW, 9), c(EMBER, 1)];
  const hand11 = () => [c(MOSS, 1), c(MOSS, 2), c(MOSS, 3), c(MOSS, 4), c(MOSS, 5), c(DEW, 9), c(EMBER, 2)];

  it('Knock is legal at deadwood 10 and illegal at 11', () => {
    expect(deadwood(hand10())).toBe(10);
    expect(deadwood(hand11())).toBe(11);
    expect(act(makeState({ phase: 'KNOCK', hands: [hand10(), junk(7)] }), { t: 'Knock' }).finalTurn).toEqual({
      knocker: 0,
    });
    illegal(makeState({ phase: 'KNOCK', hands: [hand11(), junk(7)] }), { t: 'Knock' }, 'KNOCK_TOO_MUCH_DEADWOOD');
  });

  it('Knock skips Rot and Refill and hands the opponent a final turn', () => {
    const s = makeState({ phase: 'KNOCK', hands: [hand10().slice(0, 5), junk(7)], tiles: { '-1,1': [0, 1] } });
    const n = act(s, { t: 'Knock' });
    expect(n.hands[0]).toHaveLength(5); // no refill
    expect(n.deck).toEqual(s.deck);
    expect(n.board).toEqual(s.board); // no rot
    expect(n.turnPlayer).toBe(1);
    expect(n.actor).toBe(1);
    expect(n.phase).toBe('DRAW');
    expect(n.turnNumber).toBe(s.turnNumber + 1);
  });

  it('the final turn is DRAW-ACT-DISCARD and then the game ends (no Knock, Rot or Refill)', () => {
    const s = makeState({ phase: 'KNOCK', hands: [hand10(), junk(7)], tiles: { '-1,1': [0, 1], '-1,2': [0, 1] } });
    const k = act(s, { t: 'Knock' });
    const d = act(act(k, { t: 'Draw', from: 'deck' }), { t: 'EndAct' });
    const end = act(d, { t: 'Discard', card: d.hands[1][0]!.id });
    expect(end.phase).toBe('GAME_OVER');
    expect(end.hands[1]).toHaveLength(7);
    expect(end.deck).toHaveLength(s.deck.length - 1);
    expect(end.result).toEqual({
      winner: 0,
      reason: 'knock',
      undercut: false,
      scores: [2, 0],
      deadwood: [10, deadwood(end.hands[1])],
    });
  });

  it('equal scores after the final turn are an Undercut', () => {
    const s = makeState({ phase: 'KNOCK', hands: [hand10(), junk(7)], tiles: { '-1,1': [0, 1], '1,-1': [1, 1] } });
    const d = act(act(act(s, { t: 'Knock' }), { t: 'Draw', from: 'deck' }), { t: 'EndAct' });
    const end = act(d, { t: 'Discard', card: d.hands[1][0]!.id });
    expect(end.result).toMatchObject({ winner: 1, reason: 'knock', undercut: true, scores: [1, 1] });
  });

  it('knock reversal: the final turn overgrows and severs, flipping the result', () => {
    // P1 arm (-1,1)-(0,0)-(1,0)-(2,0) = 4 points; P2 has (1,-1) = 1 point.
    const fives = [c(MOSS, 5), c(ASH, 5), c(DEW, 5)];
    const s = makeState({
      phase: 'KNOCK',
      hands: [hand10(), [...fives, ...junk(4)]],
      tiles: { '-1,1': [0, 1], '0,0': [0, 1], '1,0': [0, 1], '2,0': [0, 1], '1,-1': [1, 5] },
    });
    const ft = act(act(s, { t: 'Knock' }), { t: 'Draw', from: 'deck' });
    const m = act(ft, { t: 'MeldSet', cards: ids(fives), hexes: [{ q: 0, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -2 }] });
    expect(m.lastResolution!.severed).toEqual([{ player: 0, coords: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }]);
    const d = act(m, { t: 'EndAct' });
    const end = act(d, { t: 'Discard', card: d.hands[1][0]!.id });
    expect(end.result).toMatchObject({ winner: 1, reason: 'knock', undercut: true, scores: [1, 4] });
  });

  it('a Strangle during the final turn wins for the opponent', () => {
    const set = [c(MOSS, 6), c(ASH, 6), c(DEW, 6)];
    const s = makeState({
      phase: 'KNOCK',
      rock: ['-3,2', '-3,3', '-2,3'],
      tiles: { '1,-1': [1, 1], '0,0': [1, 1], '-1,1': [1, 1], '-2,1': [1, 1] },
      hands: [hand10(), [...set, ...junk(4)]],
    });
    const ft = act(act(s, { t: 'Knock' }), { t: 'Draw', from: 'deck' });
    const n = act(ft, { t: 'MeldSet', cards: ids(set), hexes: [{ q: -1, r: 2 }, { q: 0, r: 1 }, { q: 0, r: 2 }] });
    expect(n.result).toMatchObject({ winner: 1, reason: 'strangle' });
  });

  it('knockGivesFinalTurn: false scores immediately', () => {
    const s = makeState({
      phase: 'KNOCK',
      config: { knockGivesFinalTurn: false },
      hands: [hand10(), junk(7)],
      tiles: { '-1,1': [0, 1] },
    });
    const n = act(s, { t: 'Knock' });
    expect(n.phase).toBe('GAME_OVER');
    expect(n.result).toMatchObject({ winner: 0, reason: 'knock', undercut: false, scores: [1, 0] });
  });
});

describe('Continue: Rot, Sever, Refill (14.8, 14.12)', () => {
  it('no rot at low deadwood: refill to handSize and pass the turn', () => {
    const s = makeState({ phase: 'KNOCK', hands: [[c(MOSS, 1), c(ASH, 2), c(DEW, 3)], junk(7)], tiles: { '-1,1': [0, 1] } });
    const n = act(s, { t: 'Continue' });
    expect(n.board).toEqual(s.board);
    expect(n.hands[0]).toHaveLength(7);
    expect(n.hands[0].slice(3)).toEqual(s.deck.slice(0, 4));
    expect(n.deck).toEqual(s.deck.slice(4));
    expect(n.turnPlayer).toBe(1);
    expect(n.actor).toBe(1);
    expect(n.phase).toBe('DRAW');
    expect(n.turnNumber).toBe(2);
    expect(n.drawnFromDiscard).toBeNull();
  });

  it('Rot is measured on the kept hand, not the refilled hand (rot fires)', () => {
    // Kept: Moss9 Ash8 Dew4 Ember4 = 25 -> rot 1. Refill would add Moss4 Ash4 Moss1 -> 18.
    const kept = [c(MOSS, 9), c(ASH, 8), c(DEW, 4), c(EMBER, 4)];
    const refill = [c(MOSS, 4), c(ASH, 4), c(MOSS, 1)];
    expect(deadwood([...kept, ...refill])).toBe(18);
    const s = makeState({ phase: 'KNOCK', hands: [kept, junk(7)], deck: [...refill, ...junk(5)], tiles: { '-1,1': [0, 2] } });
    const n = act(s, { t: 'Continue' });
    expect(n.board['-1,1']).toBeNull();
    expect(n.lastResolution!.rotted).toEqual([{ q: -1, r: 1 }]);
  });

  it('Rot is measured on the kept hand, not the refilled hand (no rot)', () => {
    const kept = [c(MOSS, 5), c(ASH, 5), c(DEW, 3), c(EMBER, 1)]; // 14
    const refill = [c(MOSS, 9), c(ASH, 9), c(DEW, 8)];
    const s = makeState({ phase: 'KNOCK', hands: [kept, junk(7)], deck: [...refill, ...junk(5)], tiles: { '-1,1': [0, 2] } });
    const n = act(s, { t: 'Continue' });
    expect(n.board['-1,1']).toEqual({ owner: 0, strength: 2 });
  });

  it('Rot cascades into Sever', () => {
    const kept = [c(MOSS, 9), c(ASH, 8), c(DEW, 4), c(EMBER, 4)]; // 25 -> 1
    const s = makeState({
      phase: 'KNOCK',
      hands: [kept, junk(7)],
      tiles: { '-1,1': [0, 1], '0,0': [0, 7], '1,0': [0, 8] },
    });
    const n = act(s, { t: 'Continue' });
    expect(n.lastResolution!.rotted).toEqual([{ q: -1, r: 1 }]);
    expect(n.lastResolution!.severed).toEqual([{ player: 0, coords: [{ q: 0, r: 0 }, { q: 1, r: 0 }] }]);
  });

  it('boundary ties go to ROT_PICK with the opponent as actor; sequential picks; then the turn resumes', () => {
    // Border [2,2,2,5]; kept deadwood 31 -> rot 2.
    const kept = [c(MOSS, 9), c(ASH, 9), c(DEW, 8), c(EMBER, 5)];
    const s = makeState({
      phase: 'KNOCK',
      hands: [kept, junk(7)],
      tiles: { '-1,1': [0, 2], '-1,2': [0, 2], '-2,1': [0, 2], '-3,2': [0, 5] },
    });
    const p = act(s, { t: 'Continue' });
    expect(p.phase).toBe('ROT_PICK');
    expect(p.turnPlayer).toBe(0);
    expect(p.actor).toBe(1);
    expect(p.rotPick!.remaining).toBe(2);
    expect(p.hands[0]).toHaveLength(4); // no refill yet
    illegal(p, { t: 'RotPick', coord: { q: -3, r: 2 } }, 'NOT_ROT_CANDIDATE'); // higher strength
    illegal(p, { t: 'RotPick', coord: { q: 0, r: 0 } }, 'NOT_ROT_CANDIDATE');
    const p1 = act(p, { t: 'RotPick', coord: { q: -1, r: 1 } });
    expect(p1.phase).toBe('ROT_PICK');
    expect(p1.rotPick).toEqual({ remaining: 1, candidates: [{ q: -2, r: 1 }, { q: -1, r: 2 }] });
    expect(p1.board['-1,1']).toBeNull();
    illegal(p1, { t: 'RotPick', coord: { q: -1, r: 1 } }, 'NOT_ROT_CANDIDATE'); // already picked
    const done = act(p1, { t: 'RotPick', coord: { q: -2, r: 1 } });
    expect(done.phase).toBe('DRAW');
    expect(done.turnPlayer).toBe(1);
    expect(done.actor).toBe(1);
    expect(done.rotPick).toBeNull();
    expect(done.hands[0]).toHaveLength(7);
    expect(tilesOf(done.board, 0)).toEqual(['-1,2', '-2,2', '-3,2']);
    expect(done.lastResolution!.rotted).toEqual([{ q: -1, r: 1 }, { q: -2, r: 1 }]);
  });

  it('a short refill ends the game by deck exhaustion', () => {
    const kept = [c(MOSS, 1), c(ASH, 2), c(DEW, 3), c(EMBER, 4)];
    const deck = [c(MOSS, 9), c(ASH, 9)];
    const s = makeState({ phase: 'KNOCK', hands: [kept, junk(7)], deck, tiles: { '-1,1': [0, 1] } });
    const n = act(s, { t: 'Continue' });
    expect(n.phase).toBe('GAME_OVER');
    expect(n.hands[0]).toHaveLength(6);
    expect(n.deck).toEqual([]);
    expect(n.result).toEqual({
      winner: 0,
      reason: 'deck_exhaustion',
      scores: [1, 0],
      deadwood: [10, deadwood(s.hands[1])],
    });
  });

  it('an exactly-empty deck after a full refill ends the game (v0.3.1)', () => {
    const kept = [c(MOSS, 1), c(ASH, 2), c(DEW, 3), c(EMBER, 4)];
    const deck = [c(MOSS, 9), c(ASH, 9), c(DEW, 7)];
    const s = makeState({ phase: 'KNOCK', hands: [kept, junk(7)], deck, tiles: { '-1,1': [0, 1] } });
    const n = act(s, { t: 'Continue' });
    expect(n.hands[0]).toHaveLength(7);
    expect(n.deck).toEqual([]);
    expect(n.phase).toBe('GAME_OVER');
    // Both hands are current here (the refill was full): deadwood of each current hand.
    expect(n.result).toEqual({
      winner: 0,
      reason: 'deck_exhaustion',
      scores: [1, 0],
      deadwood: [deadwood(n.hands[0]), deadwood(n.hands[1])],
    });
  });

  it('a deck with cards left after the refill keeps the game going', () => {
    const kept = [c(MOSS, 1), c(ASH, 2), c(DEW, 3), c(EMBER, 4)];
    const deck = [c(MOSS, 9), c(ASH, 9), c(DEW, 7), c(EMBER, 6)];
    const n = act(makeState({ phase: 'KNOCK', hands: [kept, junk(7)], deck }), { t: 'Continue' });
    expect(n.phase).toBe('DRAW');
    expect(n.deck).toHaveLength(1);
  });

  it('a final turn after a Knock can start with an empty deck: only the discard draw is legal', () => {
    const hand10 = [c(MOSS, 1), c(MOSS, 2), c(MOSS, 3), c(MOSS, 4), c(MOSS, 5), c(DEW, 9), c(EMBER, 1)];
    const k = act(makeState({ phase: 'KNOCK', hands: [hand10, junk(7)], deck: [] }), { t: 'Knock' });
    expect(k.phase).toBe('DRAW');
    illegal(k, { t: 'Draw', from: 'deck' }, 'DECK_EMPTY');
    expect(act(k, { t: 'Draw', from: 'discard' }).phase).toBe('ACT');
  });

  it('deck exhaustion tie-breaks on kept-hand deadwood, then P2', () => {
    const deck = [c(MOSS, 9)];
    const low = [c(MOSS, 1), c(ASH, 2)]; // 3
    const p2Hand = [c(MOSS, 7), c(ASH, 7), c(DEW, 7), c(EMBER, 2), c(MOSS, 1), c(ASH, 1), c(DEW, 1)]; // set 7s + set 1s + 2 = 2
    const n = act(makeState({ phase: 'KNOCK', hands: [low, p2Hand], deck }), { t: 'Continue' });
    expect(n.result).toMatchObject({ reason: 'deck_exhaustion', winner: 1, scores: [0, 0], deadwood: [3, 2] });
    const even = [c(MOSS, 1), c(ASH, 1)]; // 2
    const m = act(makeState({ phase: 'KNOCK', hands: [even, p2Hand], deck }), { t: 'Continue' });
    expect(m.result).toMatchObject({ winner: 1, deadwood: [2, 2] });
  });
});

describe('general legality', () => {
  it('a terminal state accepts no actions', () => {
    const s = makeState({ patch: { phase: 'GAME_OVER', result: { winner: 0, reason: 'strangle', scores: [0, 0] } } });
    for (const a of [{ t: 'Draw', from: 'deck' }, { t: 'EndAct' }, { t: 'Continue' }] as Action[]) {
      illegal(s, a, 'GAME_OVER');
    }
  });

  it('applyAs rejects actions by a non-actor', () => {
    const s = makeState({});
    expect(() => applyAs(s, 1, { t: 'Draw', from: 'deck' })).toThrow(IllegalActionError);
    expect(applyAs(s, 0, { t: 'Draw', from: 'deck' }).phase).toBe('ACT');
    try {
      applyAs(s, 1, { t: 'Draw', from: 'deck' });
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('NOT_ACTOR');
    }
  });

  it('malformed actions are rejected', () => {
    const s = makeState({});
    illegal(s, null as never, 'MALFORMED_ACTION');
    illegal(s, { t: 'Fly' } as never, 'MALFORMED_ACTION');
    illegal(s, { t: 'Draw', from: 'hat' } as never, 'MALFORMED_ACTION');
    illegal(makeState({ phase: 'DISCARD' }), { t: 'Discard', card: 'x' } as never, 'MALFORMED_ACTION');
  });

  it('actions in the wrong phase are rejected', () => {
    illegal(makeState({ phase: 'DRAW' }), { t: 'EndAct' }, 'WRONG_PHASE');
    illegal(makeState({ phase: 'ACT' }), { t: 'Discard', card: 1 }, 'WRONG_PHASE');
    illegal(makeState({ phase: 'DISCARD' }), { t: 'Knock' }, 'WRONG_PHASE');
    illegal(makeState({ phase: 'KNOCK' }), { t: 'RotPick', coord: { q: 0, r: 0 } }, 'WRONG_PHASE');
  });

  it('section 13 illegal melds via apply', () => {
    const s = (hand: Card[], tiles: Record<string, [Player, number]> = {}, rock: string[] = []) =>
      makeState({ phase: 'ACT', hands: [[...hand, ...junk(3)], junk(7)], tiles, rock });
    const run = [c(MOSS, 3), c(MOSS, 4), c(MOSS, 5)];
    const go = (cards: Card[], dir = 1) => ({ t: 'MeldRun' as const, cards: ids(cards), start: { q: -1, r: 1 }, dir });
    illegal(s(run), { ...go(run), cards: [...ids(run).slice(0, 2), 424242] }, 'CARD_NOT_IN_HAND');
    const wrap = [c(EMBER, 8), c(EMBER, 9), c(EMBER, 1)];
    illegal(s(wrap), go(wrap), 'RUN_NOT_CONSECUTIVE');
    const dupSuit = [c(MOSS, 6), c(MOSS, 6), c(DEW, 6)];
    illegal(
      s(dupSuit),
      { t: 'MeldSet', cards: ids(dupSuit), hexes: [{ q: -1, r: 1 }, { q: -1, r: 2 }, { q: 0, r: 1 }] },
      'SET_DUPLICATE_SUIT',
    );
    illegal(s(run, {}, ['0,0']), go(run), 'ROCK');
    illegal(s(run, { '0,0': [0, 1] }), go(run), 'OWN_TILE');
    illegal(s(run, { '0,0': [1, 4] }), go(run), 'NOT_STRONGER');
    illegal(s(run, { '0,0': [1, 9] }), go(run), 'NOT_STRONGER');
    illegal(s(run), { ...go(run), start: { q: 9, r: 9 } }, 'NOT_ADJACENT');
    illegal(s(run), { ...go(run), start: { q: -2, r: 1 }, dir: 3 }, 'OFF_BOARD');
  });

  it('fruit edge cases via apply', () => {
    const st = makeState({ phase: 'ACT', tiles: { '-1,1': [0, 3], '0,1': [0, 3], '-3,3': [0, 3], '0,0': [1, 1] } });
    illegal(
      st,
      { t: 'Fruit', sacrifice: [{ q: -1, r: 1 }, { q: 0, r: 1 }, { q: -3, r: 3 }], target: { q: 0, r: 0 } },
      'FRUIT_SACRIFICE_NOT_CONNECTED',
    );
    illegal(
      st,
      { t: 'Fruit', sacrifice: [{ q: -2, r: 2 }, { q: -1, r: 1 }, { q: 0, r: 1 }], target: { q: 0, r: 0 } },
      'FRUIT_SACRIFICE_ROOT',
    );
  });
});
