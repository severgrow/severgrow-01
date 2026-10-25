// The drag layer as an extra path on top of the taps: every decision is pure and reads only
// the engine's already-legal actions, so the thresholds and phase rules are tested here
// without a browser. The page wires these decisions to Pointer Events in ui/drag-layer.ts.
import { describe, expect, it } from 'vitest';
import { apply, boardCoords, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { DRAG_LED_WORDS, SWIPE_MIN_UP_PX, SWIPE_TAP_PX, SWIPE_UP_DOMINANCE, resolveDrag } from '../src/logic/drag.js';
import type { DragSource } from '../src/logic/drag.js';
import { EMPTY_SEL, kindOf } from '../src/logic/interaction.js';
import type { Sel } from '../src/logic/interaction.js';
import { tutorialChapterById } from '../src/logic/tutorial-script.js';
const tutorialChapter = (id: 'goal' | 'turn' | 'strengthen' | 'bloom' | 'bomb' | 'blast') => tutorialChapterById(id);

type Opts = {
  distance?: number;
  boardKey?: string | null;
  overDiscardPile?: boolean;
  shape?: readonly string[];
  upSpeed?: number;
  upTravel?: number;
  reverse?: boolean;
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
    upTravel: o.upTravel ?? 0,
    ...(o.reverse !== undefined ? { reverse: o.reverse } : {}),
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
    const s = tutorialChapter('turn'); // DRAW
    expect(run(s, { kind: 'deck' }, { distance: 9 }).active).toBe(false);
    expect(run(s, { kind: 'deck' }, { distance: 9 }).commit).toBeNull();
    expect(run(s, { kind: 'deck' }, { distance: 10 }).active).toBe(true);
  });

  it('draw-from-deck commits only in DRAW', () => {
    const deck = run(tutorialChapter('turn'), { kind: 'deck' });
    expect(deck.mode).toBe('draw-deck');
    expect(deck.commit).toEqual({ t: 'Draw', from: 'deck' });
    expect(deck.led).toBe('DRAW');

    const outside = run(tutorialChapter('strengthen'), { kind: 'deck' });
    expect(outside.active).toBe(true);
    expect(outside.mode).toBe('none');
    expect(outside.commit).toBeNull();
  });

  it('draw-from-discard commits only in DRAW and never shows THROW', () => {
    const take = run(tutorialChapter('turn'), { kind: 'discard' });
    expect(take.mode).toBe('draw-discard');
    expect(take.commit).toEqual({ t: 'Draw', from: 'discard' });
    expect(take.led).toBe('DRAW');
    expect(take.led).not.toBe('THROW');

    expect(run(tutorialChapter('strengthen'), { kind: 'discard' }).commit).toBeNull();
  });

  it('a discard-phase drag does not draw', () => {
    const st = discardPhase(tutorialChapter('strengthen'));
    const res = run(st, { kind: 'hand', cardId: st.hands[0][0]!.id });
    expect(res.mode.startsWith('draw')).toBe(false);
    expect(res.mode).toBe('discard');
    expect(res.commit).toBeNull();
  });
});

describe('place and throw', () => {
  it('release on a legal hex commits Sprout, Strengthen and Fruit', () => {
    const st = tutorialChapter('strengthen');
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
    const fruitState = tutorialChapter('bomb');
    const fruit = legalOf(fruitState, 'PlayFruit')[0]!;
    if (fruit.t === 'PlayFruit') {
      const res = run(fruitState, { kind: 'hand', cardId: fruit.card }, { boardKey: coordKey(fruit.target) });
      expect(res.mode).toBe('place');
      expect(sameAction(res.commit, fruit)).toBe(true);
    }
  });

  it('release on empty space commits nothing', () => {
    const st = tutorialChapter('strengthen');
    const sprout = legalOf(st, 'Sprout')[0]!;
    const cardId = sprout.t === 'Sprout' ? sprout.card : st.hands[0][0]!.id;
    const res = run(st, { kind: 'hand', cardId }, { boardKey: null });
    expect(res.commit).toBeNull();
    expect(res.hover).toBe('none');
  });

  it('drag onto the pile discards, a slow drag across the board does not', () => {
    const st = discardPhase(tutorialChapter('strengthen'));
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

  it('a fast upward swipe is a flick wherever it is released (the release region is not the gesture)', () => {
    const st = discardPhase(tutorialChapter('strengthen'));
    const card = st.hands[0][0]!;
    // The swipe starts in the hand and is released in the hand on a phone: 52px is a clear
    // upward swipe even though it never reaches the upper board.
    const flick = run(st, { kind: 'hand', cardId: card.id }, { distance: 52, upSpeed: 0.9, upTravel: 52 });
    expect(flick.mode).toBe('flick');
    expect(flick.led).toBe('THROW');
    expect(flick.commit?.t).toBe('Discard');
    expect(flick.asTap).toBe(false);
  });

  it('a deliberate upward carry still throws even when the release slows down', () => {
    const st = discardPhase(tutorialChapter('strengthen'));
    const card = st.hands[0][0]!;
    const travel = run(st, { kind: 'hand', cardId: card.id }, { distance: 80, upSpeed: 0.2, upTravel: 80 });
    expect(travel.mode).toBe('flick');
    expect(travel.commit?.t).toBe('Discard');
  });

  it('a short or ambiguous move is still a tap, never a throw', () => {
    const st = discardPhase(tutorialChapter('strengthen'));
    const card = st.hands[0][0]!;
    const slop = run(st, { kind: 'hand', cardId: card.id }, { distance: SWIPE_TAP_PX - 1, upSpeed: 0.9, upTravel: SWIPE_TAP_PX - 1 });
    expect(slop.commit).toBeNull();
    expect(slop.asTap).toBe(true);

    // A sloppy tap that drifts toward the pile must not throw either.
    const nearPile = run(st, { kind: 'hand', cardId: card.id }, { distance: 12, overDiscardPile: true, upTravel: 12 });
    expect(nearPile.commit).toBeNull();
    expect(nearPile.asTap).toBe(true);

    // At the tap-slop boundary a pile drop is a real drag again.
    const dropped = run(st, { kind: 'hand', cardId: card.id }, { distance: SWIPE_TAP_PX, overDiscardPile: true });
    expect(dropped.mode).toBe('discard');
    expect(dropped.commit?.t).toBe('Discard');
    expect(dropped.asTap).toBe(false);
  });

  it('the swipe must be clearly upward and long enough to throw', () => {
    const st = discardPhase(tutorialChapter('strengthen'));
    const card = st.hands[0][0]!;
    // Too short vertically, however fast: no flick.
    const short = run(st, { kind: 'hand', cardId: card.id }, { distance: SWIPE_MIN_UP_PX - 1, upSpeed: 0.9, upTravel: SWIPE_MIN_UP_PX - 1 });
    expect(short.commit).toBeNull();
    expect(short.asTap).toBe(false);

    // Upward travel below the dominance test is a sideways drag, not a swipe up.
    const sideways = run(st, { kind: 'hand', cardId: card.id }, { distance: 120, upSpeed: 0.9, upTravel: 60 });
    expect(60).toBeLessThan(SWIPE_UP_DOMINANCE * 120);
    expect(sideways.commit).toBeNull();
    expect(sideways.mode).toBe('discard');

    const upright = run(st, { kind: 'hand', cardId: card.id }, { distance: 60, upSpeed: 0.9, upTravel: 60 });
    expect(upright.commit?.t).toBe('Discard');
  });

  it("a gesture that starts on one card belongs to that card, wherever it ends", () => {
    const st = discardPhase(tutorialChapter('strengthen'));
    const [first, second] = st.hands[0];
    if (!first || !second) return;
    // The pointer may finish over another card; the source is fixed at pointerdown.
    const res = run(st, { kind: 'hand', cardId: first.id }, { distance: 90, upSpeed: 0.9, upTravel: 90, boardKey: null });
    expect(res.commit).toEqual({ t: 'Discard', card: first.id });
    const other = run(st, { kind: 'hand', cardId: second.id }, { distance: 90, upSpeed: 0.9, upTravel: 90, boardKey: null });
    expect(other.commit).toEqual({ t: 'Discard', card: second.id });
  });
});

describe('bloom and Mega Bomb', () => {
  it('bloom paint uses the already-selected group and rejects a disconnected hex', () => {
    const st = tutorialChapter('bloom');
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
    const st = tutorialChapter('blast');
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
                upTravel: next() < 0.3 ? 80 : 0,
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

describe('dragging off the Draw pile (owner, 2026-10-24)', () => {
  it('the dragged card shows the real card back, not a copy of the pile', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/ui/drag-layer.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/g\.className = fromDeck \? 'drag-ghost card back drag-from-deck'/);
    expect(src).toMatch(/g\.innerHTML = fromDeck \? '' : a\.faceEl\.innerHTML;/);
    const cards = readFileSync(new URL('../src/player/cards.ts', import.meta.url), 'utf8');
    expect(cards).toMatch(/\.futa04-cards \.card\.back,[\s\S]{0,200}background-image:url\('\$\{backArt\}'\)/);
  });
});
