import { describe, expect, it } from 'vitest';
import { apply, deadwood, newGame, score, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { clone, randomPlay } from '../helpers.js';

const idsIn = (json: string): Set<number> => new Set([...json.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1])));

describe('viewFor (spec 4 hidden information)', () => {
  const s = newGame(11);

  it('has exactly the View fields', () => {
    expect(Object.keys(viewFor(s, 0)).sort()).toEqual(
      [
        'player',
        'config',
        'board',
        'terrain',
        'hand',
        'opponentHandCount',
        'discard',
        'deckCount',
        'turnPlayer',
        'actor',
        'phase',
        'drawnFromDiscard',
        'fruitUsed',
        'finalTurn',
        'rotPick',
        'turnNumber',
        'sproutsThisTurn',
        'strengthenUsed',
        'score',
        'opponentScore',
        'myDeadwood',
        'result',
        'lastResolution',
      ].sort(),
    );
  });

  it('shows my hand, counts for the rest, public discard', () => {
    const v = viewFor(s, 1);
    expect(v.player).toBe(1);
    expect(v.hand).toEqual(s.hands[1]);
    expect(v.opponentHandCount).toBe(s.hands[0].length);
    expect(v.deckCount).toBe(s.deck.length);
    expect(v.discard).toEqual(s.discard);
    expect(v.myDeadwood).toBe(deadwood(s.hands[1]));
    expect(v.score).toBe(score(s, 1));
    expect(v.opponentScore).toBe(score(s, 0));
  });

  it('never contains an opponent card or a deck card, across random play', () => {
    for (let seed = 1; seed <= 40; seed++) {
      randomPlay(seed, 200, (st: State) => {
        for (const p of [0, 1] as const) {
          const seen = idsIn(JSON.stringify(viewFor(st, p)));
          for (const c of st.hands[p === 0 ? 1 : 0]) expect(seen.has(c.id)).toBe(false);
          for (const c of st.deck) expect(seen.has(c.id)).toBe(false);
        }
      });
    }
  }, 120_000);

  it('does not share references with the state', () => {
    const v = viewFor(s, 0);
    const before = clone(s);
    v.hand.push({ id: 999, suit: 0, rank: 1 });
    v.board['0,0'] = { owner: 0, strength: 9 };
    v.discard.length = 0;
    v.config.handSize = 99;
    v.terrain['0,0'] = 'rock';
    expect(s).toEqual(before);
  });

  it('is plain JSON', () => {
    const v = viewFor(apply(s, { t: 'Draw', from: 'discard' }), 0);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});
