import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { moveCards, moveHexes, touchesHex } from '../src/names.js';
import { EMPTY_SEL, growControls, isBoardAction, moveButtons, options, playNow, selFor, tapCard, tapKind, kindLabel, kindOf, kindsAvailable, pendingAction, targetHexes, usableCards } from '../src/logic/interaction.js';
import { Session } from '../src/logic/session.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { findState } from './ui-helpers.js';

const isBoard = (a: Action) => a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout';
/** The first position from `seed` on (trying later seeds if needed) with two kinds of moves. */
const actState = (seed: number): State => {
  for (let k = seed; k < seed + 50; k++) {
    const s = findState(k, (x) => x.actor === 0 && x.phase === 'ACT' && x.turnNumber >= 5 && new Set(legalActions(viewFor(x, 0)).filter(isBoard).map(kindOf)).size >= 2);
    if (s) return s;
  }
  throw new Error('no position found');
};

describe('tap a card, then a hex', () => {
  const s = actState(3);
  const v = viewFor(s, 0);
  const legal = legalActions(v);
  const same = (id: number) => {
    const c = v.hand.find((h) => h.id === id)!;
    return (x: number) => {
      const d = v.hand.find((h) => h.id === x)!;
      return d.suit === c.suit && d.rank === c.rank;
    };
  };

  it('tapping a card highlights every hex it can be played on', () => {
    for (const card of v.hand) {
      const sel = { ...EMPTY_SEL, card: card.id };
      const want = new Set(legal.filter(isBoard).filter((a) => moveCards(a).some(same(card.id))).flatMap((a) => moveHexes(a).map(coordKey)));
      expect(targetHexes(v, legal, sel)).toEqual(want);
      expect(pendingAction(v, legal, sel)).toBeNull(); // no target yet
    }
  });

  it('tapping a target previews a legal move that uses that card and that hex; options cycle', () => {
    const card = v.hand.find((c) => targetHexes(v, legal, { ...EMPTY_SEL, card: c.id }).size > 0)!;
    const hex = [...targetHexes(v, legal, { ...EMPTY_SEL, card: card.id })][0]!;
    const sel = { ...EMPTY_SEL, card: card.id, hex };
    const a = pendingAction(v, legal, sel)!;
    expect(legal).toContainEqual(a);
    expect(touchesHex(a, hex)).toBe(true);
    expect(moveCards(a).some(same(card.id))).toBe(true);
    const n = legal.filter(isBoard).filter((x) => touchesHex(x, hex) && moveCards(x).some(same(card.id))).length;
    const seen = new Set(Array.from({ length: n }, (_, i) => JSON.stringify(pendingAction(v, legal, { ...sel, option: i }))));
    expect(seen.size).toBe(n);
  });

  it('tapping a hex first shows which cards and move kinds can use it', () => {
    const hex = coordKey(moveHexes(legal.find(isBoard)!)[0]!);
    const sel = { ...EMPTY_SEL, hex };
    const using = legal.filter(isBoard).filter((a) => touchesHex(a, hex));
    const cards = usableCards(v, legal, sel);
    for (const c of v.hand) expect(cards.has(c.id)).toBe(using.some((a) => moveCards(a).some(same(c.id))));
    expect(kindsAvailable(v, legal, sel).map((k) => k.kind).sort()).toEqual([...new Set(using.map(kindOf))].sort());
    expect(pendingAction(v, legal, sel)).not.toBeNull();
  });

  it('selFor picks exactly a given move (used by the coach\'s "Show me")', () => {
    for (const a of legal.filter(isBoard)) expect(pendingAction(v, legal, selFor(v, legal, a))).toEqual(a);
  });

  it('move kinds have plain names', () => {
    expect(kindLabel('line-3')).toBe('Grow a line of 3');
    expect(kindLabel('clump-4')).toBe('Grow a clump of 4');
    expect(kindLabel('sprout')).toBe('Sprout one tile');
  });

  it('choosing a kind highlights only its hexes', () => {
    const sel = { ...EMPTY_SEL, kind: 'sprout' };
    const want = new Set(legal.filter((a) => a.t === 'Sprout').flatMap((a) => moveHexes(a).map(coordKey)));
    expect(targetHexes(v, legal, sel)).toEqual(want);
  });
});

describe('the game session', () => {
  it('discard: tapping a card in the discard step makes "throw it away" the pending move', () => {
    const s = findState(4, (x) => x.actor === 0 && x.phase === 'DISCARD')!;
    const ses = new Session(s);
    const card = ses.view.hand.find((c) => ses.legal.some((a) => a.t === 'Discard' && ses.view.hand.find((h) => h.id === a.card)!.rank === c.rank && ses.view.hand.find((h) => h.id === a.card)!.suit === c.suit))!;
    ses.tapCard(card.id);
    const p = ses.pending!;
    expect(p.t).toBe('Discard');
    expect(ses.legal).toContainEqual(p);
  });

  it('ADVERSARIAL 1: tap a card, cancel, tap another: nothing from the first choice is left over', () => {
    const s = actState(11);
    const ses = new Session(s);
    const [c1, c2] = ses.view.hand.filter((c) => targetHexes(ses.view, ses.legal, { ...EMPTY_SEL, card: c.id }).size > 0);
    ses.tapCard(c1!.id);
    ses.tapHex([...targetHexes(ses.view, ses.legal, ses.sel)][0]!);
    expect(ses.pending).not.toBeNull();
    ses.cancel();
    expect(ses.sel).toEqual(EMPTY_SEL);
    expect(ses.pending).toBeNull();
    const other = c2 ?? ses.view.hand.find((c) => c.id !== c1!.id)!;
    ses.tapCard(other.id);
    const fresh = tapCard(ses.view, ses.legal, EMPTY_SEL, other.id); // exactly as if it were the first tap
    expect(ses.sel).toEqual(fresh);
    expect(targetHexes(ses.view, ses.legal, ses.sel)).toEqual(targetHexes(ses.view, ses.legal, fresh));
    expect(ses.state).toBe(s); // nothing was played
  });

  it('ADVERSARIAL 2: a double tap on Confirm plays the move once', () => {
    const s = actState(29);
    const ses = new Session(s);
    const card = ses.view.hand.find((c) => targetHexes(ses.view, ses.legal, { ...EMPTY_SEL, card: c.id }).size > 0)!;
    ses.tapCard(card.id);
    ses.tapHex([...targetHexes(ses.view, ses.legal, ses.sel)][0]!);
    const a = ses.pending!;
    const first = ses.confirm();
    const second = ses.confirm();
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(JSON.stringify(ses.state)).toBe(JSON.stringify(apply(s, a)));
  });

  it('refuses moves that are not legal right now, and moves when it is not your turn', () => {
    const s = actState(3);
    const ses = new Session(s);
    expect(ses.play({ t: 'Draw', from: 'deck' })).toBeNull();
    expect(ses.state).toBe(s);
    const botTurn: State = findState(3, (x) => x.actor === 1 && x.phase === 'DRAW')!;
    const b = new Session(botTurn);
    expect(b.legal).toEqual([]); // the player cannot act for the bot
    expect(b.confirm()).toBeNull();
    expect(b.play({ t: 'Draw', from: 'deck' }, 1)).not.toBeNull(); // the bot can
  });

  it('remembers every action of the latest bot turn, for "Replay last turn"', () => {
    const s = findState(6, (x) => x.actor === 1 && x.phase === 'DRAW')!;
    const ses = new Session(s);
    while (ses.state.actor === 1 && ses.state.phase !== 'GAME_OVER') ses.play(GreedyBot.chooseAction(viewFor(ses.state, 1)), 1);
    const turn = ses.lastTurnOf(1);
    expect(turn.length).toBeGreaterThan(1);
    expect(turn[0]!.before).toBe(s);
    expect(turn.at(-1)!.after).toBe(ses.state);
  });
});

import { optionsLabel } from '../src/logic/interaction.js';

describe('the "other option" button says what changes', () => {
  const S = (card: number, q = 0, r = 0): Action => ({ t: 'Sprout', card, coord: { q, r } });
  const set = (cards: number[], hexes: [number, number][]): Action => ({ t: 'MeldSet', cards, hexes: hexes.map(([q, r]) => ({ q, r })) });

  it('Sprout on one hex with different cards: "Change card"', () => {
    expect(optionsLabel([S(1), S(2), S(3)])).toBe('Change card');
  });
  it('same hexes, different cards (a clump): "Change cards"', () => {
    expect(optionsLabel([set([1, 2, 3], [[0, 0], [1, 0], [0, 1]]), set([4, 5, 6], [[0, 1], [1, 0], [0, 0]])])).toBe('Change cards');
  });
  it('tiles land in different places: "Other way"', () => {
    expect(optionsLabel([set([1, 2, 3], [[0, 0], [1, 0], [0, 1]]), set([1, 2, 3], [[0, 0], [-1, 0], [0, -1]])])).toBe('Other way');
    expect(optionsLabel([S(1, 0, 0), S(1, 1, 0)])).toBe('Other way');
  });
});

describe('undo (take back a move in your own turn)', () => {
  it('undoes board moves back to the start of the turn, but never past a draw', () => {
    const s = actState(3);
    const ses = new Session(s);
    const a = ses.legal.find(isBoard)!;
    ses.play(a);
    expect(ses.canUndo).toBe(true);
    expect(ses.undo()).toBe(true);
    expect(JSON.stringify(ses.state)).toBe(JSON.stringify(s));
    expect(ses.canUndo).toBe(false);
    expect(ses.undo()).toBe(false);
  });
  it('a draw, a discard or the bot moving makes earlier moves final', () => {
    const d = findState(4, (x) => x.actor === 0 && x.phase === 'DRAW')!;
    const ses = new Session(d);
    ses.play({ t: 'Draw', from: 'deck' });
    expect(ses.canUndo).toBe(false); // the new card has been seen
  });
});

describe('Grow step: a card tap picks Sprout by default (one tap, no "Sprout one tile" button)', () => {
  const s = actState(3);
  const v = viewFor(s, 0);
  const legal = legalActions(v);
  const canSprout = (id: number) => legal.some((a) => a.t === 'Sprout' && v.hand.some((c) => c.id === a.card && c.suit === v.hand.find((h) => h.id === id)!.suit && c.rank === v.hand.find((h) => h.id === id)!.rank));

  it('tapping a card that can sprout picks Sprout: only its sprout spots glow', () => {
    const card = v.hand.find((c) => canSprout(c.id))!;
    const sel = tapCard(v, legal, EMPTY_SEL, card.id);
    expect(sel.kind).toBe('sprout');
    const same = (id: number) => v.hand.find((c) => c.id === id)!;
    const sprouts = new Set(legal.filter((a) => a.t === 'Sprout' && same(a.card).suit === card.suit && same(a.card).rank === card.rank).flatMap((a) => moveHexes(a).map(coordKey)));
    expect(sprouts.size).toBeGreaterThan(0);
    expect(targetHexes(v, legal, sel)).toEqual(sprouts);
  });

  it('a chosen line or clump is kept; a hex picked first is kept (it shows the best move there)', () => {
    const kinds = kindsAvailable(v, legal, EMPTY_SEL).map((k) => k.kind).filter((k) => k !== 'sprout');
    expect(kinds.length).toBeGreaterThan(0);
    const withKind = tapKind(EMPTY_SEL, kinds[0]!);
    const line = legal.find((a) => kindOf(a) === kinds[0])!;
    expect(tapCard(v, legal, withKind, moveCards(line)[0]!).kind).toBe(kinds[0]);
    const hexFirst = { ...EMPTY_SEL, hex: coordKey(moveHexes(line)[0]!) };
    expect(tapCard(v, legal, hexFirst, moveCards(line)[0]!).kind).toBeNull();
  });

  it('tapping the same card again clears it, Sprout included', () => {
    const card = v.hand.find((c) => canSprout(c.id))!;
    const sel = tapCard(v, legal, tapCard(v, legal, EMPTY_SEL, card.id), card.id);
    expect(sel).toMatchObject({ card: null, kind: null });
  });

  it('the move buttons no longer offer "Sprout one tile" (lines and clumps stay)', () => {
    expect(kindsAvailable(v, legal, EMPTY_SEL).some((k) => k.kind === 'sprout')).toBe(true); // still a kind of move
    const shown = moveButtons(v, legal, EMPTY_SEL).map((k) => k.kind);
    expect(shown).not.toContain('sprout');
    expect(shown.length).toBeGreaterThan(0);
  });
});

describe('no Confirm for a clear choice (Undo can take it back)', () => {
  const s = actState(3);
  const v = viewFor(s, 0);
  const legal = legalActions(v);

  it('a card and a spot that allow exactly one move: it plays at once', () => {
    let checked = 0;
    for (const c of v.hand) {
      const sel = tapCard(v, legal, EMPTY_SEL, c.id);
      for (const hex of targetHexes(v, legal, sel)) {
        const picked = { ...sel, hex };
        const opts = options(v, legal, picked);
        if (opts.length === 1) {
          expect(playNow(v, legal, picked)).toEqual(opts[0]);
          checked++;
        } else expect(playNow(v, legal, picked)).toBeNull();
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('more than one different move on that spot: no auto-play, the preview offers "Other way"', () => {
    const multi = [...new Set(legal.filter(isBoardAction).flatMap((a) => moveHexes(a).map(coordKey)))].find((h) => options(v, legal, { ...EMPTY_SEL, hex: h }).length > 1)!;
    expect(multi).toBeDefined();
    expect(playNow(v, legal, { ...EMPTY_SEL, hex: multi })).toBeNull();
  });

  it('nothing plays without a spot', () => {
    for (const c of v.hand) expect(playNow(v, legal, tapCard(v, legal, EMPTY_SEL, c.id))).toBeNull();
  });

  it('ADVERSARIAL: a spot tapped with no card picked never plays (so a double tap cannot play twice)', () => {
    for (const h of new Set(legal.filter(isBoardAction).flatMap((a) => moveHexes(a).map(coordKey)))) {
      expect(playNow(v, legal, { ...EMPTY_SEL, hex: h })).toBeNull();
    }
  });
});

describe('Grow step: sprout first, then throw (a small "Skip sprout" link keeps the rules as they are)', () => {
  const sprout: Action = { t: 'Sprout', card: 1, coord: { q: 0, r: 0 } };
  const line: Action = { t: 'MeldRun', cards: [1, 2, 3], hexes: [] } as unknown as Action;
  const end: Action = { t: 'EndAct' };

  it('while a sprout is possible: "Pick a card to sprout", no Throw button, a small Skip link', () => {
    expect(growControls([sprout, end])).toEqual({ sproutNote: true, throwButton: false, skipLink: true });
    expect(growControls([sprout, line, end])).toEqual({ sproutNote: true, throwButton: false, skipLink: true });
  });

  it('after the sprout (only combos left): the Throw button is back as "done"', () => {
    expect(growControls([line, end])).toEqual({ sproutNote: false, throwButton: true, skipLink: false });
  });

  it('nothing to grow: no controls (the game moves to Throw by itself)', () => {
    expect(growControls([end])).toEqual({ sproutNote: false, throwButton: true, skipLink: false });
  });
});
