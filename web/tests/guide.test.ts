import { describe, expect, it } from 'vitest';
import { coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { guideTarget } from '../src/logic/guide.js';
import type { GuideTarget } from '../src/logic/guide.js';
import { EMPTY_SEL, isBoardAction, kindOf, pendingAction, tapCard, tapHex, tapKind } from '../src/logic/interaction.js';
import type { Sel } from '../src/logic/interaction.js';
import { playGame } from './ui-helpers.js';

/** Follows the arrows like a player would; returns the pending move after at most 12 taps. */
const follow = (s: State, goal: Action): { sel: Sel; taps: number; done: boolean } => {
  let preset: Action | null = null;
  const v = viewFor(s, 0);
  const legal = legalActions(v);
  let sel: Sel = EMPTY_SEL;
  let applied = 0;
  for (let taps = 0; taps < 12 && applied < 3; taps++) {
    const t: GuideTarget = guideTarget(v, legal, sel, goal, preset ?? pendingAction(v, legal, sel))!;
    if (t.kind === 'confirm') return { sel, taps, done: JSON.stringify(preset ?? pendingAction(v, legal, sel)) === JSON.stringify(goal) };
    if (t.kind === 'card') sel = tapCard(v, legal, sel, t.id);
    else if (t.kind === 'hex') sel = tapHex(v, legal, sel, t.key);
    else if (t.kind === 'preset') {
      preset = goal; // the page shows the coach's placement itself, not a tap
      taps--;
      applied++;
    }
    else if (t.kind === 'kind') sel = tapKind(sel, t.move);
    else if (t.kind === 'cancel') {
      sel = EMPTY_SEL;
      preset = null;
    }
    else return { sel, taps, done: false };
  }
  return { sel, taps: 12, done: false };
};

const positions = (): State[] => {
  const out: State[] = [];
  for (const seed of [2, 7, 13]) playGame(seed, ({ after }) => {
    if (after.actor === 0 && (after.phase === 'ACT' || after.phase === 'DISCARD') && out.length < 40) out.push(after);
  });
  return out;
};

describe('coach arrows (show where to tap)', () => {
  const states = positions();

  it('following the arrows always reaches exactly the suggested move, then points at Confirm', () => {
    let checked = 0;
    for (const s of states) {
      const v = viewFor(s, 0);
      for (const goal of legalActions(v).filter((a) => isBoardAction(a) || a.t === 'Discard')) {
        const r = follow(s, goal);
        expect(r.done, JSON.stringify(goal)).toBe(true);
        // Sprout or Fruit card: card, then hex. Line or clump: its button (then the coach shows the placement). Throw: the card.
        expect(r.taps).toBeLessThanOrEqual(!isBoardAction(goal) ? 1 : kindOf(goal) === 'sprout' || kindOf(goal) === 'fruit' ? 2 : 1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  }, 300_000);

  it('the first arrow points at a card for a sprout, and at the Bloom button for a Bloom', () => {
    let both = 0;
    for (const s of states.filter((x) => x.phase === 'ACT')) {
      const v = viewFor(s, 0);
      const legal = legalActions(v);
      const sprout = legal.find((a) => a.t === 'Sprout');
      const combo = legal.find((a) => a.t === 'Bloom');
      if (!sprout || !combo) continue;
      expect(guideTarget(v, legal, EMPTY_SEL, sprout)!.kind).toBe('card');
      expect(guideTarget(v, legal, EMPTY_SEL, combo)).toEqual({ kind: 'kind', move: kindOf(combo) });
      both++;
    }
    expect(both).toBeGreaterThan(0);
  });

  it('simple moves point at their button or pile', () => {
    const s = states.find((x) => x.phase === 'ACT')!;
    const v = viewFor(s, 0);
    const legal = legalActions(v);
    expect(guideTarget(v, legal, EMPTY_SEL, { t: 'EndAct' })).toEqual({ kind: 'end' });
    expect(guideTarget(v, [{ t: 'Draw', from: 'deck' }, { t: 'Draw', from: 'discard' }], EMPTY_SEL, { t: 'Draw', from: 'discard' })).toEqual({ kind: 'discard' });
    expect(guideTarget(v, [{ t: 'Draw', from: 'deck' }], EMPTY_SEL, { t: 'Draw', from: 'deck' })).toEqual({ kind: 'deck' });
  });

  it('no arrow for a move that is not legal now', () => {
    const s = states[0]!;
    const v = viewFor(s, 0);
    expect(guideTarget(v, legalActions(v), EMPTY_SEL, { t: 'Draw', from: 'deck' })).toBeNull();
  });
});

describe('coach arrow for a Fruit card (v0.6)', () => {
  it('points at the Fruit card first, then at its target; another picked card is cleared first', () => {
    // a position where my tile touches theirs, with a Fruit card in my hand
    const st = findStateWithTouch();
    const v = { ...viewFor(st, 0), hand: [{ id: 900, suit: null, rank: 0 }, ...viewFor(st, 0).hand] };
    const legal = legalActions(v);
    const goal = legal.find((a) => a.t === 'PlayFruit') as Extract<Action, { t: 'PlayFruit' }>;
    expect(goal).toBeTruthy();
    expect(guideTarget(v, legal, EMPTY_SEL, goal)).toEqual({ kind: 'card', id: goal.card });
    const picked = tapCard(v, legal, EMPTY_SEL, goal.card);
    expect(guideTarget(v, legal, picked, goal)).toEqual({ kind: 'hex', key: coordKey((goal as Extract<Action, { t: 'PlayFruit' }>).target) });
    const other = v.hand.find((c) => c.suit !== null)!.id;
    expect(guideTarget(v, legal, tapCard(v, legal, EMPTY_SEL, other), goal)).toEqual({ kind: 'cancel' });
  });
});

/** A Grow step of mine where one of my tiles touches an opponent non-root tile. */
const findStateWithTouch = (): State => {
  for (let seed = 1; seed < 60; seed++) {
    let found: State | null = null;
    playGame(seed, ({ after }) => {
      if (found || after.phase !== 'ACT' || after.actor !== 0) return;
      const v = viewFor({ ...after, hands: [[{ id: 900, suit: null, rank: 0 }, ...after.hands[0]], after.hands[1]] }, 0);
      if (legalActions(v).some((a) => a.t === 'PlayFruit')) found = after;
    });
    if (found) return found;
  }
  throw new Error('no position found');
};
