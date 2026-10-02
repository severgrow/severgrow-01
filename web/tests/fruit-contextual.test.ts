// UI polish pass 3, Part 2: Fruit is used from the tile card of an opponent tile, target first.
// The game suggests the 3 tiles to give up (the set that cuts off the fewest of mine, then the
// lowest total strength, then a fixed order); "Change" lets me pick another legal set; then a
// plain-words preview and Confirm. Written before the code.
import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { EMPTY_SEL, tapCard } from '../src/logic/interaction.js';
import {
  FRUIT_TOP_NOTE,
  bestSacrifice,
  fruitAction,
  fruitChange,
  fruitNext,
  fruitOffer,
  fruitPickable,
  fruitPreview,
  fruitUndo,
  hexTapIntent,
  showTopTip,
  startFruit,
  tapFruit,
} from '../src/logic/fruitflow.js';
import { fixture } from '../../tests/helpers.js';
import { playGame } from './ui-helpers.js';

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], config: Partial<RulesConfig> = {}, patch: Partial<State> = {}): State => {
  const g = newGame(5, config);
  const f = fixture({ tiles, config });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT', ...patch };
};
type Fruit = Extract<Action, { t: 'Fruit' }>;
const sorted = (keys: readonly string[]) => [...keys].sort();

// my chain root(-2,2) - (-1,1) - (0,1) - (0,0), and (1,1) hanging off (0,1);
// theirs (1,-1)=9 - (1,0)=9 - (2,0)=3 - (3,-1)=3
const tiles: Record<string, [Player, number]> = { '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], '1,1': [0, 2], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 3], '3,-1': [1, 3] };
const s = stateWith(tiles, [[0, 1], [0, 5]]);
const v = viewFor(s, 0);
const legal = legalActions(v);
const theirRoot = Object.keys(s.board).find((k) => s.board[k]?.owner === 1 && s.board[k]?.root)!;

describe('which tiles offer Fruit (the tile card)', () => {
  it('any opponent tile with a legal sacrifice set offers "Fruit this tile"; a top-rank one adds the note', () => {
    expect(fruitOffer(v, legal, '1,0')).toEqual({ kind: 'action', label: 'Fruit this tile', note: FRUIT_TOP_NOTE });
    expect(FRUIT_TOP_NOTE).toBe('No card can replace this. Fruit can.');
    expect(fruitOffer(v, legal, '2,0')).toEqual({ kind: 'action', label: 'Fruit this tile', note: null });
  });

  it('never for their root, my tiles, empty hexes, outside my Grow step, or when Fruit is used or off', () => {
    expect(fruitOffer(v, legal, theirRoot)).toBeNull();
    expect(fruitOffer(v, legal, '0,0')).toBeNull();
    expect(fruitOffer(v, legal, '-3,3')).toBeNull();
    const draw = viewFor({ ...s, phase: 'DRAW' }, 0);
    expect(fruitOffer(draw, legalActions(draw), '1,0')).toBeNull();
    const used = viewFor({ ...s, fruitUsed: [1, 0] }, 0);
    expect(fruitOffer(used, legalActions(used), '1,0')).toBeNull();
    const off = viewFor(stateWith(tiles, [[0, 1]], { fruitPerPlayer: 0 }), 0);
    expect(fruitOffer(off, legalActions(off), '1,0')).toBeNull();
    const theirs = viewFor({ ...s, actor: 1, turnPlayer: 1 }, 0);
    expect(fruitOffer(theirs, [], '1,0')).toBeNull();
  });

  it('possible later but not now: an information line, no button', () => {
    const few = stateWith({ '-1,1': [0, 2], '0,1': [0, 2], '1,0': [1, 9] }, [[0, 1]]);
    const fv = viewFor(few, 0);
    expect(fruitOffer(fv, legalActions(fv), '1,0')).toEqual({ kind: 'info', text: 'Fruit could remove this. You need 3 connected tiles next to it.' });
  });
});

describe('the suggested 3 tiles', () => {
  it('picks the set that cuts off the fewest of my tiles', () => {
    // giving up (-1,1),(0,1),(0,0) would cut off (1,1); giving up (0,1),(0,0),(1,1) cuts nothing
    expect(sorted(bestSacrifice(v, legal, '1,0')!)).toEqual(['0,0', '0,1', '1,1']);
  });

  it('is deterministic and always a legal set; matches the rule (fewest cut, then lowest strength, then a fixed order) in real games', () => {
    let checked = 0;
    for (const seed of [2, 9]) {
      playGame(seed, ({ after }) => {
        if (checked > 40 || after.phase !== 'ACT') return;
        const pv = viewFor(after, after.actor);
        const lg = legalActions(pv);
        const fruits = lg.filter((a): a is Fruit => a.t === 'Fruit');
        for (const target of new Set(fruits.map((a) => coordKey(a.target)))) {
          const best = bestSacrifice(pv, lg, target)!;
          expect(bestSacrifice(pv, lg, target)).toEqual(best);
          const mine = fruits.filter((a) => coordKey(a.target) === target);
          const score = (a: Fruit) => {
            const k = a.sacrifice.map(coordKey);
            return [fruitPreview(pv, a).ownCut.length, k.reduce((n, x) => n + pv.board[x]!.strength, 0), sorted(k).join(' ')] as const;
          };
          const want = mine.map(score).sort((x, y) => x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0))[0]!;
          expect(sorted(best).join(' ')).toBe(want[2]);
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe('the flow: target first, suggested tiles (or Change), preview, confirm', () => {
  it('step 1 shows the suggestion; Next previews in plain words; Undo steps back; the action is legal', () => {
    let f = startFruit(v, legal, '1,0');
    expect(f).toMatchObject({ target: '1,0', step: 1, changing: false });
    expect(sorted(f.picks)).toEqual(['0,0', '0,1', '1,1']);
    f = fruitNext(legal, f);
    expect(f.step).toBe(2);
    const a = fruitAction(legal, f)!;
    expect(a.t).toBe('Fruit');
    expect(() => apply(s, a)).not.toThrow();
    const pv = fruitPreview(v, a);
    expect(pv.chip).toBe('You give up 3. They lose 1, plus 2 cut off. Net: -3 for you, -3 for them.');
    expect(pv.warnings).toEqual([]);
    expect(fruitUndo(f).step).toBe(1);
  });

  it('Change: valid tiles glow, wrong taps get a one-line reason, the root is refused, 3 good taps make the new set', () => {
    let f = fruitChange(startFruit(v, legal, '1,0'));
    expect(f.changing).toBe(true);
    expect(f.picks).toEqual([]);
    expect(fruitPickable(v, legal, f)).toEqual(new Set(['-1,1', '0,1', '0,0', '1,1']));
    expect(tapFruit(v, legal, f, '-2,2').refused).toBe("Your root can't be given up");
    expect(tapFruit(v, legal, f, '2,0').refused).toBe('Pick 3 of your own tiles');
    f = tapFruit(v, legal, f, '-1,1').flow;
    f = tapFruit(v, legal, f, '0,0').flow;
    expect(tapFruit(v, legal, f, '1,1').refused).toBe('Pick tiles that touch each other');
    expect(fruitUndo(f).picks).toEqual(['-1,1']);
    f = tapFruit(v, legal, f, '0,1').flow;
    expect(f.changing).toBe(false);
    expect(sorted(f.picks)).toEqual(['-1,1', '0,0', '0,1']);
    const pv = fruitPreview(v, fruitAction(legal, fruitNext(legal, f))!);
    expect(pv.chip).toBe('You give up 3, plus 1 cut off. They lose 1, plus 2 cut off. Net: -4 for you, -3 for them.');
    expect(pv.warnings).toContain('Careful: this cuts off 1 of your tiles');
  });

  it('Undo in Change with nothing picked goes back to the suggestion', () => {
    const start = startFruit(v, legal, '1,0');
    const back = fruitUndo(fruitChange(start));
    expect(back.changing).toBe(false);
    expect(back.picks).toEqual(start.picks);
  });
});

describe('a tap on the board: Sprout preview or tile card', () => {
  it('a legal target for the picked card previews the Sprout; an opponent tile it cannot take opens the tile card', () => {
    const one = v.hand.find((c) => c.rank === 1)!.id;
    const five = v.hand.find((c) => c.rank === 5)!.id;
    expect(hexTapIntent(v, legal, tapCard(v, legal, EMPTY_SEL, one), '1,0')).toBe('tilecard');
    expect(hexTapIntent(v, legal, tapCard(v, legal, EMPTY_SEL, five), '2,0')).toBe('sprout');
    expect(hexTapIntent(v, legal, EMPTY_SEL, '1,0')).toBe('tilecard');
    expect(hexTapIntent(v, legal, EMPTY_SEL, '-3,3')).toBe('default');
  });
});

describe('the one-time top-rank tip', () => {
  it('shows when the opponent has a top-rank tile and my Fruit is still unused, until seen', () => {
    expect(showTopTip(v, false)).toBe(true);
    expect(showTopTip(v, true)).toBe(false);
    expect(showTopTip(viewFor({ ...s, fruitUsed: [1, 0] }, 0), false)).toBe(false);
    const low = viewFor(stateWith({ '-1,1': [0, 2], '1,0': [1, 5] }, [[0, 1]]), 0);
    expect(showTopTip(low, false)).toBe(false);
    expect(showTopTip(viewFor(stateWith(tiles, [[0, 1]], { fruitPerPlayer: 0 }), 0), false)).toBe(false);
  });
});
