// Multiplayer information-leak audit (engine view). Every piece of engine state is classified:
//
//   PUBLIC        board, terrain, discard, deckCount, hands counts, turn/phase, scores, result,
//                 lastResolution, fruitPlayed, strengthenUsed, finalTurn, rotPick, turnNumber,
//                 drawnFromDiscard, sproutsThisTurn, config
//   PLAYER-PRIVATE  the viewer's own hand and their deadwood
//   SERVER-ONLY   seed, deck contents/order, both hands, fruitKnown, reshuffles, RNG state,
//                 full history, opponent deadwood
//
// `viewFor(state, player)` must contain every PUBLIC field, the viewer's PRIVATE fields, and
// NOTHING from SERVER-ONLY. These tests fail if hidden opponent/deck information leaks.
import { describe, expect, it } from 'vitest';
import { deadwood, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { State, View } from '../../src/engine/index.js';
import { randomPlay } from '../helpers.js';

const json = (v: unknown) => JSON.stringify(v);
const idsIn = (s: string): Set<number> => new Set([...s.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1])));

const PUBLIC_KEYS = [
  'actor', 'board', 'config', 'deckCount', 'discard', 'drawnFromDiscard', 'finalTurn',
  'fruitPlayed', 'fruitUnseen', 'lastResolution', 'opponentHandCount', 'opponentScore',
  'phase', 'player', 'result', 'rotPick', 'score', 'sproutsThisTurn', 'strengthenUsed',
  'terrain', 'turnNumber', 'turnPlayer',
] as const;
const PRIVATE_KEYS = ['hand', 'myDeadwood'] as const;
const SERVER_ONLY_KEYS = ['seed', 'deck', 'hands', 'fruitKnown', 'reshuffles', 'history', 'rng', 'random', 'state'] as const;

describe('view leak audit: PUBLIC / PLAYER-PRIVATE / SERVER-ONLY', () => {
  const s = newGame(11);
  const view = viewFor(s, 0);

  it('exposes exactly the public fields plus the viewer’s own private fields', () => {
    expect(Object.keys(view).sort()).toEqual([...PUBLIC_KEYS, ...PRIVATE_KEYS].sort());
    for (const k of SERVER_ONLY_KEYS) expect(k in view, `${k} must not be in the view`).toBe(false);
  });

  it('never carries the seed, the deck, the opponent’s hand or any RNG/history', () => {
    const text = json(view);
    expect(text).not.toContain('"seed"');
    expect(text).not.toContain('"deck"');
    expect(text).not.toContain('"hands"');
    expect(text).not.toContain('"fruitKnown"');
    expect(text).not.toContain('"reshuffles"');
    expect(text).not.toContain('"history"');
    // None of the raw hidden card ids (opponent hand or deck) appear anywhere in the view.
    const seen = idsIn(text);
    for (const c of s.hands[1]) expect(seen.has(c.id)).toBe(false);
    for (const c of s.deck) expect(seen.has(c.id)).toBe(false);
  });

  it('the viewer’s own hand is present and their deadwood is their own', () => {
    expect(view.hand).toEqual(s.hands[0]);
    // The opponent's hand count is exposed, but not the cards or their deadwood.
    expect(view.opponentHandCount).toBe(s.hands[1].length);
    expect(view.myDeadwood).toBe(deadwood(s.hands[0]));
  });

  it('both players agree on every public field; only private fields differ', () => {
    const a = viewFor(s, 0);
    const b = viewFor(s, 1);
    for (const k of PUBLIC_KEYS) {
      if (k === 'player' || k === 'score' || k === 'opponentScore' || k === 'fruitUnseen') continue;
      expect(json(a[k]), k).toBe(json(b[k]));
    }
    expect(a.hand).toEqual(s.hands[0]);
    expect(b.hand).toEqual(s.hands[1]);
    expect(a.hand).not.toEqual(b.hand);
  });

  it('across random play: no opponent/deck card, and every legal action only uses my cards', () => {
    for (let seed = 1; seed <= 30; seed++) {
      randomPlay(seed, 200, (st: State) => {
        for (const p of [0, 1] as const) {
          const v: View = viewFor(st, p);
          const seen = idsIn(json(v));
          for (const c of st.hands[p === 0 ? 1 : 0]) expect(seen.has(c.id)).toBe(false);
          for (const c of st.deck) expect(seen.has(c.id)).toBe(false);
          // Legal actions are built from the view: they can only name cards in my own hand.
          const mine = new Set(v.hand.map((c) => c.id));
          for (const action of legalActions(v)) {
            if ('card' in action) expect(mine.has(action.card)).toBe(true);
            if (action.t === 'Bloom' || action.t === 'MegaBomb') for (const id of action.cards) expect(mine.has(id)).toBe(true);
          }
        }
      });
    }
  }, 120_000);

  it('the Rot-pick view only exposes public board candidates', () => {
    // A pending Rot pick carries coordinates only — never hidden cards.
    const withPick: State = { ...newGame(3), rotPick: { remaining: 1, candidates: [{ q: 0, r: 1 }, { q: -1, r: 0 }] } };
    const v = viewFor(withPick, 0);
    expect(v.rotPick).toEqual({ remaining: 1, candidates: [{ q: 0, r: 1 }, { q: -1, r: 0 }] });
    expect(idsIn(json(v.rotPick)).size).toBe(0);
  });
});
