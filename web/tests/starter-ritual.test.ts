// The pre-game ritual's fairness contract.
//
// The engine owns who starts; the ritual is only a presentation of that result. These tests pin the
// two things that must never drift apart:
//   1. the engine's starting seat stays an unbiased 50/50 lottery;
//   2. the ritual deck is exactly nine cards, one of every strength 1..9, so the two dealt numbers
//      can never tie — and the higher one always belongs to the seat that actually starts, from
//      either client's point of view.
//
// They also prove the presentation stream is deterministic (both online clients agree), varies
// between matches, and does not touch gameplay state.
import { describe, expect, it } from 'vitest';
import { newMatch, startingPlayerFor } from '../../src/engine/index.js';
import type { Player } from '../../src/engine/index.js';
import {
  offlineRitualKey,
  onlineRitualKey,
  RITUAL_DECK_SIZE,
  starterRitualCards,
  starterRitualDeck,
  starterRitualView,
} from '../src/logic/starter-ritual.js';

const other = (p: Player): Player => (p === 0 ? 1 : 0);

describe('starting-player lottery stays fair', () => {
  it('is an unbiased 50/50 over many seeds', () => {
    const N = 40_000;
    let ones = 0;
    for (let seed = 0; seed < N; seed++) if (startingPlayerFor(seed) === 1) ones++;
    const share = ones / N;
    // A finite sample will not sit at exactly 0.5; this window is far wider than the noise and
    // still narrow enough to catch a stuck or biased lottery.
    expect(share).toBeGreaterThan(0.48);
    expect(share).toBeLessThan(0.52);
  });
});

describe('the ritual deck is nine cards, one of every strength', () => {
  it('holds each number 1..9 exactly once', () => {
    for (let i = 0; i < 2_000; i++) {
      for (const key of [offlineRitualKey(i), onlineRitualKey(`match-${i}`)]) {
        const deck = starterRitualDeck(key);
        expect(deck).toHaveLength(RITUAL_DECK_SIZE);
        expect(deck.map((c) => c.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      }
    }
  });

  it('gives every card a real colour, chosen independently', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      for (const card of starterRitualDeck(offlineRitualKey(i))) {
        expect(card.suit === 0 || card.suit === 1 || card.suit === 2 || card.suit === 3).toBe(true);
        seen.add(card.suit);
      }
    }
    // All four colours actually appear, rather than every card being the same back.
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('is deterministic for the same key and differs between matches', () => {
    const key = offlineRitualKey(4242);
    expect(starterRitualDeck(key)).toEqual(starterRitualDeck(key));
    const orders = new Set<string>();
    for (let i = 0; i < 200; i++) orders.add(starterRitualDeck(offlineRitualKey(i)).map((c) => c.rank).join(''));
    expect(orders.size).toBeGreaterThan(150);
  });
});

describe('presentation cards', () => {
  it('deals two cards off the top of the deck, so a tie on numbers is impossible', () => {
    for (let i = 0; i < 8_000; i++) {
      const starter = (i % 2) as Player;
      const key = offlineRitualKey(i);
      const deck = starterRitualDeck(key);
      const cards = starterRitualCards(key, starter);
      const winner = cards[starter];
      const loser = cards[other(starter)];
      expect(winner.rank).toBeGreaterThan(loser.rank);
      expect(winner.rank).toBeGreaterThanOrEqual(1);
      expect(winner.rank).toBeLessThanOrEqual(9);
      expect(loser.rank).toBeGreaterThanOrEqual(1);
      expect(loser.rank).toBeLessThanOrEqual(9);
      expect(winner.rank).not.toBe(loser.rank);
      for (const card of cards) {
        // Both cards are the deck's own cards — same number AND same colour — not faces that were
        // invented on top of it.
        expect(deck).toContainEqual(card);
      }
      // They are the two cards actually taken off the top.
      expect([deck[deck.length - 1], deck[deck.length - 2]]).toEqual(expect.arrayContaining([...cards]));
    }
  });

  it('is deterministic for the same key and starter', () => {
    for (const key of [offlineRitualKey(1), offlineRitualKey(219682080), onlineRitualKey('match-abc')]) {
      for (const starter of [0, 1] as const) {
        expect(starterRitualCards(key, starter)).toEqual(starterRitualCards(key, starter));
      }
    }
  });

  it('varies naturally between matches', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const cards = starterRitualCards(offlineRitualKey(i), (i % 2) as Player);
      seen.add(`${cards[0].suit}:${cards[0].rank}|${cards[1].suit}:${cards[1].rank}`);
    }
    expect(seen.size).toBeGreaterThan(300);
  });

  it('agrees across both online perspectives and maps each seat to the right side', () => {
    for (let i = 0; i < 1_000; i++) {
      const starter = (i % 2) as Player;
      const key = onlineRitualKey(`match-${i}`);
      const seat0 = starterRitualView(key, starter, 0);
      const seat1 = starterRitualView(key, starter, 1);
      expect(seat0.you).toEqual(seat1.opponent);
      expect(seat0.opponent).toEqual(seat1.you);
      expect(seat0.deck).toEqual(seat1.deck);
      expect(seat0.starter).toBe(starter === 0 ? 'you' : 'opponent');
      expect(seat1.starter).toBe(starter === 1 ? 'you' : 'opponent');
      const startingView = seat0.starter === 'you' ? seat0 : seat1;
      const waitingView = seat0.starter === 'you' ? seat1 : seat0;
      expect(startingView.you.rank).toBeGreaterThan(waitingView.you.rank);
      // The faces are the deck's own cards, by identity, not copies that could drift.
      expect(startingView.deck).toContain(startingView.you);
      expect(waitingView.deck).toContain(waitingView.you);
    }
  });

  it('never mutates the authoritative match state or the deck', () => {
    const state = newMatch(219682080);
    const before = structuredClone(state);
    const starter = state.startingPlayer ?? state.turnPlayer;
    const key = offlineRitualKey(state.seed);
    const first = starterRitualView(key, starter, 0);
    starterRitualView(key, starter, 1);
    expect(state).toEqual(before);
    // Each call hands out its own array: a caller cannot corrupt the next deal by editing it.
    expect(first.deck).not.toBe(starterRitualDeck(key));
  });

  it('rejects an empty key instead of inventing a result', () => {
    expect(() => starterRitualCards('', 0)).toThrow(/key/);
    expect(() => starterRitualDeck('')).toThrow(/key/);
  });
});
