import { describe, expect, it } from 'vitest';
import {
  IllegalActionError,
  allCoords,
  apply,
  coordKey,
  hexDistance,
  isValidRun,
  isValidSet,
  legalActions,
  legalActionsForState,
  newGame,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Coord, State } from '../../src/engine/index.js';
import { randomPlay } from '../helpers.js';
import { LEGACY_V03 } from '../legacy.js';

/** Canonical key: identical card copies and hex order do not matter. */
const canon = (s: State, a: Action): string => {
  const hand = s.hands[s.turnPlayer];
  const cardKey = (ids: number[]) =>
    ids
      .map((id) => {
        const c = hand.find((x) => x.id === id)!;
        return `${c.suit}:${c.rank}`;
      })
      .sort()
      .join(',');
  const hexKey = (cs: Coord[]) => cs.map(coordKey).sort().join('|');
  switch (a.t) {
    case 'Bloom': {
      // a set: which suit lands where does not matter; a run: each number's hex does
      const cs = a.cards.map((id) => hand.find((x) => x.id === id)!);
      if (cs.every((c) => c.rank === cs[0]!.rank)) return `S ${cardKey(a.cards)} ${hexKey(a.hexes)}`;
      return `R ${cs.map((c, i) => `${c.suit}:${c.rank}@${coordKey(a.hexes[i]!)}`).sort().join(',')}`;
    }
    case 'PlayFruit':
      // Fruit cards are all alike: only the target matters
      return `F ${coordKey(a.target)}`;
    case 'MegaBomb':
      return `M ${coordKey(a.target)}`;
    case 'Sprout':
      return `T ${cardKey([a.card])} ${coordKey(a.coord)}`;
    case 'Discard': {
      const c = hand.find((x) => x.id === a.card)!;
      return `D ${c.suit}:${c.rank}`;
    }
    case 'RotPick':
      return `P ${coordKey(a.coord)}`;
    case 'Draw':
      return `W ${a.from}`;
    default:
      return a.t;
  }
};

const accepts = (s: State, a: Action): boolean => {
  try {
    apply(s, a);
    return true;
  } catch (e) {
    if (e instanceof IllegalActionError) return false;
    throw e;
  }
};

const subsets = <T>(xs: T[], k: number): T[][] => {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [h, ...t] = xs as [T, ...T[]];
  return [...subsets(t, k - 1).map((r) => [h, ...r]), ...subsets(t, k)];
};

/** True when the hexes form one cluster (checked here independently of the engine). */
const connected = (hexes: Coord[]): boolean => {
  const seen = new Set([0]);
  const todo = [0];
  while (todo.length) {
    const i = todo.pop()!;
    hexes.forEach((h, j) => {
      if (!seen.has(j) && hexDistance(h, hexes[i]!) === 1) {
        seen.add(j);
        todo.push(j);
      }
    });
  }
  return seen.size === hexes.length;
};

const permutations = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));

/** Independent brute force over a superset of plausible actions, filtered by apply. */
const bruteForce = (s: State): Set<string> => {
  const out = new Set<string>();
  const add = (a: Action) => {
    if (accepts(s, a)) out.add(canon(s, a));
  };
  const p = s.turnPlayer;
  const radius = s.config.boardRadius;
  const board = allCoords(radius);
  const own = board.filter((c) => s.board[coordKey(c)]?.owner === p);
  switch (s.phase) {
    case 'DRAW':
      add({ t: 'Draw', from: 'deck' });
      add({ t: 'Draw', from: 'discard' });
      break;
    case 'DISCARD':
      for (const c of s.hands[p]) add({ t: 'Discard', card: c.id });
      break;
    case 'KNOCK':
      add({ t: 'Knock' });
      add({ t: 'Continue' });
      break;
    case 'ROT_PICK':
      for (const c of board) add({ t: 'RotPick', coord: c });
      break;
    case 'ACT': {
      add({ t: 'EndAct' });
      const hand = s.hands[p];
      const seenCards = new Set<string>();
      for (let k = 3; k <= hand.length; k++) {
        for (const cards of subsets<Card>(hand, k)) {
          // Only card groups that are melds can be placed. Copies are equivalent, except the
          // copy just taken from the discard pile (which may not be stranded, v0.3.1).
          const ck =
            cards.map((c) => `${c.suit}:${c.rank}`).sort().join(',') + (cards.some((c) => c.id === s.drawnFromDiscard) ? '*' : '');
          if (seenCards.has(ck)) continue;
          seenCards.add(ck);
          const ids = cards.map((c) => c.id);
          // v0.7 Bloom: a set or a run of 3-4 cards on any connected cluster near my tiles;
          // a run in every assignment of its cards to the hexes (apply decides)
          if (k <= 4 && (isValidRun(cards) || isValidSet(cards))) {
            const near = board.filter((c) => own.some((o) => hexDistance(o, c) <= k));
            const asc = [...cards].sort((x, y) => x.rank - y.rank || x.id - y.id).map((c) => c.id);
            for (const hexes of subsets(near, k)) {
              if (!connected(hexes)) continue;
              if (isValidSet(cards)) add({ t: 'Bloom', cards: ids, hexes });
              else for (const perm of permutations(hexes)) add({ t: 'Bloom', cards: asc, hexes: perm });
            }
          }
        }
      }
      for (const card of hand) for (const coord of board) add({ t: 'Sprout', card: card.id, coord });
      const mine = own.filter((c) => !s.board[coordKey(c)]!.root);
      const enemy = board.filter((c) => {
        const t = s.board[coordKey(c)];
        return t && t.owner !== p;
      });
      void mine;
      for (const card of hand) for (const target of enemy) add({ t: 'PlayFruit', card: card.id, target });
      const bombs=hand.filter(card=>card.suit===null).sort((a,b)=>a.id-b.id);
      if (bombs.length>=2) for (const target of enemy) add({t:'MegaBomb',cards:[bombs[0]!.id,bombs[1]!.id],target});
      break;
    }
  }
  return out;
};

/** States from random play, preferring ACT states with several cards and tiles. */
const sampleStates = (count: number, pick: (s: State) => boolean, config = {}): State[] => {
  const out: State[] = [];
  for (let seed = 1; out.length < count && seed < 5000; seed++) {
    randomPlay(
      seed,
      300,
      (s) => {
        if (out.length < count && pick(s)) out.push(s);
      },
      config,
    );
  }
  return out;
};

describe('legalActions (spec 5, 13, 14.13)', () => {
  it('a non-actor view and a finished game have no actions', () => {
    const s = newGame(3);
    expect(legalActions(viewFor(s, 1))).toEqual([]);
    const over: State = { ...s, phase: 'GAME_OVER', result: { winner: 0, reason: 'strangle', scores: [0, 0] } };
    expect(legalActions(viewFor(over, 0))).toEqual([]);
  });

  it('opening: both draws are legal', () => {
    expect(legalActions(viewFor(newGame(3), 0))).toEqual([
      { t: 'Draw', from: 'deck' },
      { t: 'Draw', from: 'discard' },
    ]);
  });

  it('every listed action is accepted by apply, with no canonical duplicates (random play)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      randomPlay(seed, 300, (s) => {
        const acts = legalActionsForState(s);
        if (s.phase !== 'GAME_OVER') expect(acts.length).toBeGreaterThan(0);
        const keys = acts.map((a) => canon(s, a));
        expect(new Set(keys).size).toBe(keys.length);
        for (const a of acts) expect(accepts(s, a)).toBe(true);
      });
    }
  }, 120_000);

  it('matches an independent brute force on ACT states', () => {
    const states = sampleStates(12, (s) => s.phase === 'ACT' && s.hands[s.turnPlayer].length >= 6);
    expect(states.length).toBe(12);
    for (const s of states) {
      const listed = new Set(legalActionsForState(s).map((a) => canon(s, a)));
      expect(listed).toEqual(bruteForce(s));
    }
  }, 300_000);

  it('matches brute force on ACT states with a Fruit card playable and many tiles', () => {
    // States where at least one Fruit card is legal; the full list must still match brute force.
    const states = sampleStates(4, (s) => s.phase === 'ACT' && legalActionsForState(s).some((a) => a.t === 'PlayFruit'), LEGACY_V03);
    expect(states.length).toBe(4);
    for (const s of states) {
      const listed = new Set(legalActionsForState(s).map((a) => canon(s, a)));
      expect(listed).toEqual(bruteForce(s));
    }
  }, 300_000);

  it('matches brute force in DRAW, DISCARD, KNOCK and ROT_PICK', () => {
    for (const phase of ['DRAW', 'DISCARD', 'KNOCK', 'ROT_PICK'] as const) {
      // KNOCK and ROT_PICK only happen with the parked rules on.
      const states = sampleStates(5, (s) => s.phase === phase, phase === 'KNOCK' || phase === 'ROT_PICK' ? LEGACY_V03 : {});
      expect(states.length).toBeGreaterThan(0);
      for (const s of states) {
        expect(new Set(legalActionsForState(s).map((a) => canon(s, a)))).toEqual(bruteForce(s));
      }
    }
  }, 120_000);

  it('dedupes identical copies using the lowest ids', () => {
    const s0 = newGame(3);
    const hand: Card[] = [
      { id: 50, suit: 0, rank: 5 },
      { id: 51, suit: 0, rank: 5 },
      { id: 60, suit: 1, rank: 2 },
      { id: 61, suit: 1, rank: 2 },
    ];
    const s: State = { ...s0, phase: 'DISCARD', hands: [hand, s0.hands[1]] };
    expect(legalActions(viewFor(s, 0))).toEqual([
      { t: 'Discard', card: 50 },
      { t: 'Discard', card: 60 },
    ]);
    // The forbidden redundant copy is skipped in favour of its twin.
    const r: State = { ...s, drawnFromDiscard: 50 };
    expect(legalActions(viewFor(r, 0))).toEqual([
      { t: 'Discard', card: 51 },
      { t: 'Discard', card: 60 },
    ]);
  });

  it('with two copies, the lowest id stands for both; leaving the taken copy alone is fine (v0.4 rule 2b)', () => {
    const s0 = newGame(3);
    // Moss 3 (id 10) and its copy (id 50, just taken from the discard pile), Moss 4, Moss 5.
    const hand: Card[] = [
      { id: 10, suit: 0, rank: 3 },
      { id: 50, suit: 0, rank: 3 },
      { id: 60, suit: 0, rank: 4 },
      { id: 70, suit: 0, rank: 5 },
    ];
    const s: State = { ...s0, phase: 'ACT', hands: [hand, s0.hands[1]], drawnFromDiscard: 50 };
    const runs = legalActionsForState(s).filter((a) => a.t === 'Bloom');
    expect(runs.length).toBeGreaterThan(0);
    for (const a of runs) {
      expect(a.t === 'Bloom' && a.cards).toContain(10);
      const after = apply(apply(s, a), { t: 'EndAct' });
      expect(legalActionsForState(after)).toEqual([{ t: 'Discard', card: 50 }]);
    }
    expect(new Set(runs.map((a) => canon(s, a)))).toEqual(new Set([...bruteForce(s)].filter((k) => k.startsWith('R '))));
  });

  it('legalActions reads only the view (no hidden state needed)', () => {
    // Same view from different hidden states gives the same actions.
    randomPlay(7, 120, (s) => {
      if (s.phase === 'GAME_OVER') return;
      const other: State = { ...s, deck: [...s.deck].reverse(), hands: s.hands };
      const opp = s.actor === 0 ? 1 : 0;
      const swapped: State = { ...other };
      swapped.hands = [...s.hands];
      swapped.hands[opp] = [...s.hands[opp]].reverse();
      expect(legalActions(viewFor(swapped, s.actor))).toEqual(legalActions(viewFor(s, s.actor)));
    });
  });
});
