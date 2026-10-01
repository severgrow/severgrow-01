import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, View } from '../../src/engine/index.js';
import { GreedyBot, createGreedyBot, rankActions } from '../../src/bots/GreedyBot.js';
import { fixture, randomPlay } from '../helpers.js';

const key = (a: Action) => JSON.stringify(a);

const stateWith = (o: {
  tiles?: Record<string, [Player, number]>;
  rich?: string[];
  rock?: string[];
  hand: Card[];
  phase: State['phase'];
  discard?: Card[];
}): State => {
  const f = fixture({ ...(o.tiles ? { tiles: o.tiles } : {}), ...(o.rich ? { rich: o.rich } : {}), ...(o.rock ? { rock: o.rock } : {}) });
  const base = newGame(1);
  return { ...base, board: f.board, terrain: f.terrain, hands: [o.hand, base.hands[1]], phase: o.phase, ...(o.discard ? { discard: o.discard } : {}) };
};
const card = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });

describe('GreedyBot (spec 16)', () => {
  it('ranks every legal action exactly once, best first, and chooses the top one', () => {
    let checked = 0;
    for (let seed = 1; seed <= 15; seed++) {
      randomPlay(seed, 200, (s) => {
        if (s.phase === 'GAME_OVER') return;
        const v = viewFor(s, s.actor);
        const ranked = rankActions(v);
        expect(ranked.map((r) => key(r.action)).sort()).toEqual(legalActions(v).map(key).sort());
        for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
        expect(GreedyBot.chooseAction(v)).toEqual(ranked[0]!.action);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(500);
  }, 120_000);

  it('allowKnock: false never ranks Knock', () => {
    const s = stateWith({ hand: [], phase: 'KNOCK' });
    const v = viewFor(s, 0);
    expect(legalActions(v).some((a) => a.t === 'Knock')).toBe(true);
    expect(rankActions(v, { allowKnock: false }).map((r) => r.action.t)).toEqual(['Continue']);
    expect(createGreedyBot({ allowKnock: false }).chooseAction(v)).toEqual({ t: 'Continue' });
  });

  it('is deterministic and ignores hidden cards (opponent hand, deck order)', () => {
    randomPlay(9, 150, (s) => {
      if (s.phase === 'GAME_OVER') return;
      const opp: Player = s.actor === 0 ? 1 : 0;
      const hidden: State = { ...s, deck: [...s.deck].reverse(), hands: [...s.hands] as [Card[], Card[]] };
      hidden.hands[opp] = [...s.hands[opp]].reverse().map((c) => ({ ...c, rank: 10 - c.rank }));
      const a = rankActions(viewFor(s, s.actor));
      expect(rankActions(viewFor(s, s.actor))).toEqual(a);
      expect(rankActions(viewFor(hidden, s.actor))).toEqual(a);
    });
  });

  it('bot-vs-bot games finish', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let s = newGame(seed);
      for (let i = 0; i < 3000 && s.phase !== 'GAME_OVER'; i++) s = apply(s, GreedyBot.chooseAction(viewFor(s, s.actor)));
      expect(s.phase).toBe('GAME_OVER');
    }
  }, 120_000);

  it('draw: takes the discard only when it completes a combo', () => {
    const hand = [card(1, 0, 5), card(2, 0, 6), card(3, 2, 9), card(4, 3, 1)];
    const fits = stateWith({ hand, phase: 'DRAW', discard: [card(9, 0, 7)] });
    expect(GreedyBot.chooseAction(viewFor(fits, 0))).toEqual({ t: 'Draw', from: 'discard' });
    const loose = stateWith({ hand, phase: 'DRAW', discard: [card(9, 1, 3)] });
    expect(GreedyBot.chooseAction(viewFor(loose, 0))).toEqual({ t: 'Draw', from: 'deck' });
  });

  it('discard: throws away the card that leaves the lowest leftover total', () => {
    // Moss 3-4-5 is a combo; Ember 9 and Dew 2 are loose. Throw the 9.
    const hand = [card(1, 0, 3), card(2, 0, 4), card(3, 0, 5), card(4, 3, 9), card(5, 2, 2)];
    expect(GreedyBot.chooseAction(viewFor(stateWith({ hand, phase: 'DISCARD' }), 0))).toEqual({ t: 'Discard', card: 4 });
  });

  it('prefers a winning strangle above everything', () => {
    const set = [card(1, 0, 6), card(2, 1, 6), card(3, 2, 6), card(4, 3, 1)];
    const s = stateWith({
      phase: 'ACT',
      hand: set,
      rock: ['3,-2', '3,-3', '2,-3', '2,-1'],
      tiles: { '-1,1': [0, 1], '0,0': [0, 1], '1,-1': [0, 1] },
    });
    // P2's root (2,-2): four rock neighbours, P1 on (1,-1); only (1,-2) is open.
    // A Bloom on (1,-2), (0,-1), (0,-2) closes the ring and wins.
    const best = rankActions(viewFor(s, 0))[0]!;
    expect(best.facts.kind).toBe('meld');
    expect(best.facts.kind === 'meld' && best.facts.move.wins).toBe(true);
  });

  it('meld facts: points, gold hexes, takeovers and cut-offs', () => {
    const run = [card(1, 0, 3), card(2, 0, 4), card(3, 0, 5), card(4, 1, 1)];
    const s = stateWith({ phase: 'ACT', hand: run, rich: ['0,0'], tiles: { '0,0': [1, 1], '1,-1': [1, 1], '-1,0': [1, 1] } });
    const v = viewFor(s, 0);
    const r = rankActions(v).find((x) => key(x.action) === key({ t: 'MeldRun', cards: [1, 2, 3], start: { q: -1, r: 1 }, dir: 1 }))!;
    expect(r.facts.kind).toBe('meld');
    if (r.facts.kind !== 'meld') return;
    expect(r.facts.move).toMatchObject({ placed: 3, onRich: 1, taken: 2, botCut: 1, points: 4, toward: true, wins: false });
  });

  it('EndAct is chosen when there is nothing to play', () => {
    const s = stateWith({ phase: 'ACT', hand: [card(1, 0, 1), card(2, 1, 5)] });
    expect(GreedyBot.chooseAction(viewFor(s, 0) as View)).toEqual({ t: 'EndAct' });
  });
});
