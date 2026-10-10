// The drag layer as an extra path on top of the taps: every decision is pure and reads only
// the engine's already-legal actions, so the thresholds and phase rules are tested here
// without a browser. The page wires these decisions to Pointer Events in ui/drag-layer.ts.
import { describe, expect, it } from 'vitest';
import { apply, boardCoords, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { DRAG_LED_WORDS, resolveDrag } from '../src/logic/drag.js';
import type { DragSource } from '../src/logic/drag.js';
import { EMPTY_SEL, kindOf } from '../src/logic/interaction.js';
import type { Sel } from '../src/logic/interaction.js';
import { tutorialChapter } from '../src/logic/tutorial-script.js';

type Opts = {
  distance?: number;
  boardKey?: string | null;
  overDiscardPile?: boolean;
  shape?: readonly string[];
  upSpeed?: number;
  upperBoard?: boolean;
  sel?: Sel;
};

const run = (state: State, source: DragSource, o: Opts = {}) =>
  resolveDrag({
    view: viewFor(state, 0),
    legal: legalActions(viewFor(state, 0)),
    sel: o.sel ?? EMPTY_SEL,
    source,
    distance: o.distance ?? 40,
    boardKey: o.boardKey ?? null,
    overDiscardPile: !!o.overDiscardPile,
    shape: o.shape ?? [],
    upSpeed: o.upSpeed ?? 0,
    upperBoard: !!o.upperBoard,
  });

const legalOf = (state: State, t: Action['t']) => legalActions(viewFor(state, 0)).filter((a) => a.t === t);
const sameAction = (a: Action | null, b: Action) => JSON.stringify(a) === JSON.stringify(b);
const discardPhase = (state: State): State => ({ ...state, phase: 'DISCARD' });

describe('drag thresholds and phase gates', () => {
  it('never shows FAST, only the five allowed words', () => {
    expect(DRAG_LED_WORDS).toEqual(['DRAW', 'PLACE', 'THROW', 'BLOOM', 'MEGA']);
    expect(DRAG_LED_WORDS).not.toContain('FAST');
  });

  it('a move under 10px stays a tap', () => {
    const s = tutorialChapter(0); // DRAW
    expect(run(s, { kind: 'deck' }, { distance: 9 }).active).toBe(false);
    expect(run(s, { kind: 'deck' }, { distance: 9 }).commit).toBeNull();
    expect(run(s, { kind: 'deck' }, { distance: 10 }).active).toBe(true);
  });

  it('draw-from-deck commits only in DRAW', () => {
    const deck = run(tutorialChapter(0), { kind: 'deck' });
    expect(deck.mode).toBe('draw-deck');
    expect(deck.commit).toEqual({ t: 'Draw', from: 'deck' });
    expect(deck.led).toBe('DRAW');

    const outside = run(tutorialChapter(1), { kind: 'deck' });
    expect(outside.active).toBe(true);
    expect(outside.mode).toBe('none');
    expect(outside.commit).toBeNull();
  });

  it('draw-from-discard commits only in DRAW and never shows THROW', () => {
    const take = run(tutorialChapter(0), { kind: 'discard' });
    expect(take.mode).toBe('draw-discard');
    expect(take.commit).toEqual({ t: 'Draw', from: 'discard' });
    expect(take.led).toBe('DRAW');
    expect(take.led).not.toBe('THROW');

    expect(run(tutorialChapter(1), { kind: 'discard' }).commit).toBeNull();
  });

  it('a discard-phase drag does not draw', () => {
    const st = discardPhase(tutorialChapter(1));
    const res = run(st, { kind: 'hand', cardId: st.hands[0][0]!.id });
    expect(res.mode.startsWith('draw')).toBe(false);
    expect(res.mode).toBe('discard');
    expect(res.commit).toBeNull();
  });
});

describe('place and throw', () => {
  it('release on a legal hex commits Sprout, Strengthen and Fruit', () => {
    const st = tutorialChapter(1);
    const view = viewFor(st, 0);
    const sprouts = legalOf(st, 'Sprout');
    const grow = sprouts.find((a) => a.t === 'Sprout' && !view.board[coordKey(a.coord)]);
    const strengthen = sprouts.find((a) => a.t === 'Sprout' && view.board[coordKey(a.coord)]?.owner === 0);
    expect(grow, 'a Sprout on an empty hex').toBeDefined();
    expect(strengthen, 'a Strengthen on my own tile').toBeDefined();
    for (const a of [grow!, strengthen!]) {
      if (a.t !== 'Sprout') continue;
      const res = run(st, { kind: 'hand', cardId: a.card }, { boardKey: coordKey(a.coord) });
      expect(res.mode).toBe('place');
      expect(res.led).toBe('PLACE');
      expect(sameAction(res.commit, a)).toBe(true);
    }

    // A Fruit card: chapter 5 holds one Bomb beside an enemy tile.
    const fruitState = tutorialChapter(5);
    const fruit = legalOf(fruitState, 'PlayFruit')[0]!;
    if (fruit.t === 'PlayFruit') {
      const res = run(fruitState, { kind: 'hand', cardId: fruit.card }, { boardKey: coordKey(fruit.target) });
      expect(res.mode).toBe('place');
      expect(sameAction(res.commit, fruit)).toBe(true);
    }
  });

  it('release on empty space commits nothing', () => {
    const st = tutorialChapter(1);
    const sprout = legalOf(st, 'Sprout')[0]!;
    const cardId = sprout.t === 'Sprout' ? sprout.card : st.hands[0][0]!.id;
    const res = run(st, { kind: 'hand', cardId }, { boardKey: null });
    expect(res.commit).toBeNull();
    expect(res.hover).toBe('none');
  });

  it('drag onto the pile discards, a slow drag across the board does not', () => {
    const st = discardPhase(tutorialChapter(1));
    const card = st.hands[0][0]!;
    const onPile = run(st, { kind: 'hand', cardId: card.id }, { overDiscardPile: true });
    expect(onPile.mode).toBe('discard');
    expect(onPile.hover).toBe('pile');
    expect(onPile.led).toBe('THROW');
    expect(onPile.commit?.t).toBe('Discard');

    const across = run(st, { kind: 'hand', cardId: card.id }, { overDiscardPile: false });
    expect(across.commit).toBeNull();
    expect(across.led).toBeNull();
  });

  it('a fast upward release in the upper board is a flick, a slow one is not', () => {
    const st = discardPhase(tutorialChapter(1));
    const card = st.hands[0][0]!;
    const flick = run(st, { kind: 'hand', cardId: card.id }, { upSpeed: 0.9, upperBoard: true });
    expect(flick.mode).toBe('flick');
    expect(flick.led).toBe('THROW');
    expect(flick.commit?.t).toBe('Discard');

    const slow = run(st, { kind: 'hand', cardId: card.id }, { upSpeed: 0.2, upperBoard: true });
    expect(slow.mode).toBe('discard');
    expect(slow.commit).toBeNull();
  });
});

describe('bloom and Mega Bomb', () => {
  it('bloom paint uses the already-selected group and rejects a disconnected hex', () => {
    const st = tutorialChapter(4);
    const bloom = legalOf(st, 'Bloom')[0]!;
    if (bloom.t !== 'Bloom') throw new Error('no legal Bloom');
    const sel: Sel = { card: bloom.cards[0]!, hex: null, kind: kindOf(bloom), option: 0 };
    const src: DragSource = { kind: 'hand', cardId: bloom.cards[0]! };
    const first = coordKey(bloom.hexes[0]!);

    const started = run(st, src, { sel, boardKey: first });
    expect(started.mode).toBe('bloom');
    expect(started.shape).toEqual([first]);
    expect(started.led).toBe('BLOOM');

    // A hex far from the shape can never continue it (connected + within the bloom rules).
    const view = viewFor(st, 0);
    const far = boardCoords(view.config).map(coordKey).find((k) => k !== first && !adjacent(first, k));
    if (far) {
      const rejected = run(st, src, { sel, boardKey: far, shape: [first] });
      expect(rejected.shape).toEqual([first]);
      expect(rejected.commit).toBeNull();
    }

    // Painting the whole group commits exactly the selected Bloom.
    let shape: string[] = [];
    for (const h of bloom.hexes) {
      const r = run(st, src, { sel, boardKey: coordKey(h), shape });
      shape = r.shape;
      if (r.commit) {
        expect(sameAction(r.commit, bloom)).toBe(true);
        return;
      }
    }
    throw new Error('the painted shape never committed');
  });

  it('two Bombs commit Mega Bomb only on a legal target', () => {
    const st = tutorialChapter(6);
    const mega = legalOf(st, 'MegaBomb')[0]!;
    if (mega.t !== 'MegaBomb') throw new Error('no legal MegaBomb');
    const bomb = st.hands[0].find((c) => c.id === mega.cards[0])!;
    const onTarget = run(st, { kind: 'hand', cardId: bomb.id }, { boardKey: coordKey(mega.target) });
    expect(onTarget.mode).toBe('mega');
    expect(sameAction(onTarget.commit, mega)).toBe(true);
    expect(onTarget.led).toBe('MEGA');

    const elsewhere = run(st, { kind: 'hand', cardId: bomb.id }, { boardKey: null });
    expect(elsewhere.mode).toBe('mega');
    expect(elsewhere.commit).toBeNull();
  });
});

function adjacent(a: string, b: string): boolean {
  const [aq, ar] = a.split(',').map(Number) as [number, number];
  const [bq, br] = b.split(',').map(Number) as [number, number];
  const dq = bq - aq;
  const dr = br - ar;
  return (dq === 0 && Math.abs(dr) === 1) || (dr === 0 && Math.abs(dq) === 1) || (dq === -dr && Math.abs(dq) === 1);
}

describe('a drag can only ever commit a move that is legal right now', () => {
  it('holds across many random positions, sources and pointer inputs', () => {
    // A small deterministic LCG: the walk is the same every run (no Math.random).
    let rng = 0x1234abcd;
    const next = () => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 2 ** 32;
    };
    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!;

    let sawDraw = false;
    let sawPlace = false;
    let sawDiscard = false;
    for (let game = 0; game < 40; game++) {
      let state: State = newGame(1000 + game, { rockCount: 2, richCount: 3 });
      for (let step = 0; step < 40 && state.phase !== 'GAME_OVER'; step++) {
        const view = viewFor(state, 0);
        const legal = legalActions(view);
        if (state.actor === 0) {
          const keys = boardCoords(view.config).map(coordKey);
          const sources: DragSource[] = [
            { kind: 'deck' },
            { kind: 'discard' },
            ...state.hands[0].map((c) => ({ kind: 'hand' as const, cardId: c.id })),
          ];
          for (const source of sources) {
            for (let k = 0; k < 6; k++) {
              const res = resolveDrag({
                view,
                legal,
                sel: EMPTY_SEL,
                source,
                distance: next() < 0.15 ? 9 : 40,
                boardKey: next() < 0.2 ? null : pick(keys),
                overDiscardPile: next() < 0.3,
                shape: next() < 0.3 ? [pick(keys), pick(keys)] : [],
                upSpeed: next() < 0.3 ? 0.9 : 0,
                upperBoard: next() < 0.5,
              });
              if (res.commit) {
                const ok = legal.some((a) => JSON.stringify(a) === JSON.stringify(res.commit));
                expect(ok, `commit must be legal in ${state.phase}: ${JSON.stringify(res.commit)}`).toBe(true);
                if (res.commit.t === 'Draw') sawDraw = true;
                if (res.commit.t === 'Sprout' || res.commit.t === 'PlayFruit') sawPlace = true;
                if (res.commit.t === 'Discard') sawDiscard = true;
              }
              if (res.led) expect(DRAG_LED_WORDS).toContain(res.led);
            }
          }
        }
        if (!legal.length) break;
        state = apply(state, pick(legal));
      }
    }
    // The random walk actually reached the interesting commits, so the invariant was tested.
    expect(sawDraw).toBe(true);
    expect(sawPlace).toBe(true);
    expect(sawDiscard).toBe(true);
  });
});
