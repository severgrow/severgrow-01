// A revealed tile must carry its REAL number the instant it appears.
//
// Owner's report: "when seeing animation of opps move, the tiles first show up all as '1' strenght
// and then change to the actual strenght of the card that was used - wrong - show the correct
// number on the tile as soon as it shows up".
//
// The reveal steps are built from the server's public events, and `eventsOf` writes a Bloom's cards
// and hexes as PAIRS (`hexes[i]` receives `cards[i]`). The step builder drew every new tile as a
// hard-coded `1`, and only the turn-ending `sync` step corrected it — one visible moment of the
// wrong number. The offline game never flashed because it reads the value off the state the action
// produced; the online reveal now derives the same value from the played card's rank.
//
// This test asserts the step's tile strength directly — Grow (Sprout), a Bloom set, a Bloom run and
// Strengthen, on BOTH seats — plus a whole-position sweep, so no placeholder can survive.
import { describe, expect, it } from 'vitest';
import { applyAs, coordKey, createCards, legalActions, newGame, resolveConfig, viewFor } from '../../src/engine/index.js';
import type { Card, Coord, Event, Player, State, View } from '../../src/engine/index.js';
import { onlinePerspective } from '../src/online/perspective.js';
import { stepContextFor, stepsFromEvent, stepsFromEvents } from '../src/online/steps-from-events.js';
import type { Step } from '../src/logic/anim.js';

const CONFIG = resolveConfig();
const DECK = createCards(CONFIG);
const cardsOfRank = (rank: number): Card[] => DECK.filter((c) => c.suit !== null && c.rank === rank);
/** The real card-id → rank map, built from the resolved config exactly as the app builds it. */
const CTX = stepContextFor({ config: CONFIG, board: {} } as View);

type GrowStep = Extract<Step, { k: 'grow' }>;
const growStepOf = (steps: readonly Step[]): GrowStep | undefined =>
  steps.find((s): s is GrowStep => s.k === 'grow');

/** Advance to seat 0's Grow step (a Draw committed). */
const toAct = (seed: number): State => {
  let s = newGame(seed, CONFIG);
  for (let i = 0; i < 160; i++) {
    if (s.phase === 'ACT' && s.actor === 0) return s;
    const legal = legalActions(viewFor(s, s.actor));
    const a = legal.find((x) => x.t === 'Draw') ?? legal.find((x) => x.t === 'EndAct') ?? legal[0];
    if (!a) break;
    s = applyAs(s, s.actor, a);
  }
  throw new Error(`seed ${seed} never reached seat 0 ACT`);
};

describe('a revealed tile shows its real number from its first frame', () => {
  for (const seat of [0, 1] as const) {
    it(`seat ${seat}: a Sprout's tile carries the card's number, never a placeholder`, () => {
      const p = onlinePerspective(seat);
      for (const rank of [2, 4, 6, 9]) {
        const card = cardsOfRank(rank)[0]!;
        const event: Event = { t: 'Sprout', player: seat, card: card.id, coord: { q: 1, r: -1 } };
        expect(growStepOf(stepsFromEvent(event, p, CTX))?.tiles[0]?.strength, `rank ${rank}`).toBe(rank);
      }
    });

    it(`seat ${seat}: a Bloom SET's tiles each carry their card's number`, () => {
      const p = onlinePerspective(seat);
      for (const rank of [3, 5, 8]) {
        const cards = cardsOfRank(rank).slice(0, 3).map((c) => c.id);
        const hexes: Coord[] = [
          { q: 1, r: -1 },
          { q: 2, r: -1 },
          { q: 1, r: 0 },
        ];
        const step = growStepOf(stepsFromEvent({ t: 'Bloom', player: seat, cards, hexes }, p, CTX));
        expect(step?.tiles.map((t) => t.strength), `rank ${rank}`).toEqual([rank, rank, rank]);
      }
    });

    it(`seat ${seat}: a Bloom RUN's tiles carry the number of the card played on each`, () => {
      const p = onlinePerspective(seat);
      const run = [4, 5, 6].map((r) => cardsOfRank(r)[0]!.id);
      const hexes: Coord[] = [
        { q: 0, r: -1 },
        { q: 0, r: 0 },
        { q: 1, r: -1 },
      ];
      const step = growStepOf(stepsFromEvent({ t: 'Bloom', player: seat, cards: run, hexes }, p, CTX));
      expect(step?.tiles.map((t) => t.strength)).toEqual([4, 5, 6]);
    });

    it(`seat ${seat}: the numbers survive the seat's own mirroring`, () => {
      const p = onlinePerspective(seat);
      const run = [7, 8, 9].map((r) => cardsOfRank(r)[0]!.id);
      const hexes: Coord[] = [
        { q: 1, r: 1 },
        { q: 1, r: 2 },
        { q: 2, r: 1 },
      ];
      const step = growStepOf(stepsFromEvent({ t: 'Bloom', player: seat, cards: run, hexes }, p, CTX));
      // The KEY is mirrored for seat 1; the NUMBER never rotates.
      expect(step?.tiles.map((t) => t.strength)).toEqual([7, 8, 9]);
      expect(step?.tiles[0]?.key).toBe(coordKey(p.mapCoord(hexes[0]!)));
    });
  }

  it('a Strengthen step carries the from and to values the event reported', () => {
    const event: Event = { t: 'Strengthen', player: 0, card: 1, coord: { q: 1, r: -1 }, oldStrength: 3, newStrength: 8 };
    expect(stepsFromEvent(event, null, CTX).find((s) => s.k === 'strengthen')).toMatchObject({ k: 'strengthen', from: 3, to: 8 });
  });

  it('an Overgrow (a Bloom taking an enemy tile) carries the new strength', () => {
    const event: Event = { t: 'Overgrow', player: 0, coord: { q: 2, r: -1 }, oldOwner: 1, oldStrength: 6, newStrength: 6 };
    expect(growStepOf(stepsFromEvent(event, null, CTX))?.tiles[0]).toMatchObject({ strength: 6, replaced: true });
  });

  it('every legal Grow of several real positions reveals its true number', () => {
    let checked = 0;
    for (const seed of [3, 7, 11, 19, 23, 29, 31, 37]) {
      let state: State;
      try {
        state = toAct(seed);
      } catch {
        continue;
      }
      const view = viewFor(state, 0);
      for (const action of legalActions(view)) {
        if (action.t === 'Sprout') {
          const card = view.hand.find((c) => c.id === action.card);
          if (!card || card.suit === null) continue;
          const step = growStepOf(stepsFromEvents([{ t: 'Sprout', player: 0, card: action.card, coord: action.coord }], null, view));
          expect(step?.tiles[0]?.strength, `sprout of ${card.rank}`).toBe(card.rank);
          checked++;
        } else if (action.t === 'Bloom') {
          const ranks = action.cards.map((id) => view.hand.find((c) => c.id === id)?.rank ?? -1);
          if (ranks.some((r) => r < 1)) continue;
          const step = growStepOf(stepsFromEvents([{ t: 'Bloom', player: 0, cards: action.cards, hexes: action.hexes }], null, view));
          expect(step?.tiles.map((t) => t.strength), `bloom ${ranks.join('.')}`).toEqual(ranks);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('an unresolvable card id falls back to the board, never to a flash of 1', () => {
    // The board the reveal ends on is the last resort — and it is exactly what the sync step lands
    // on, so even the fallback cannot produce a visible correction.
    const view = { config: CONFIG, board: { '5,5': { owner: 1 as Player, strength: 7 } } } as unknown as View;
    const context = stepContextFor(view);
    expect(context.board?.['5,5']?.strength).toBe(7);
    const step = growStepOf(
      stepsFromEvent({ t: 'Sprout', player: 1, card: 999_999, coord: { q: 5, r: 5 } }, onlinePerspective(0), context),
    );
    expect(step?.tiles[0]?.strength).toBe(7);
  });
});
