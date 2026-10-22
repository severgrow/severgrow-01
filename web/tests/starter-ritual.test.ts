// The pre-game ritual's fairness contract.
//
// The engine owns who starts; the ritual is only a presentation of that result. These tests pin the
// two things that must never drift apart:
//   1. the engine's starting seat stays an unbiased 50/50 lottery;
//   2. the two displayed ranks are always distinct, always 1..9, and the higher one always belongs
//      to the seat that actually starts — from either client's point of view.
//
// They also prove the presentation stream is deterministic (both online clients agree), varies
// between matches, and does not touch gameplay state.
import { describe, expect, it } from 'vitest';
import { newMatch, startingPlayerFor } from '../../src/engine/index.js';
import type { Player } from '../../src/engine/index.js';
import {
  offlineRitualKey,
  onlineRitualKey,
  starterRitualCards,
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

describe('presentation cards', () => {
  it('are two distinct ranks from 1..9, with the higher rank on the starting seat', () => {
    for (let i = 0; i < 8_000; i++) {
      const starter = (i % 2) as Player;
      const cards = starterRitualCards(offlineRitualKey(i), starter);
      const winner = cards[starter];
      const loser = cards[other(starter)];
      expect(winner.rank).toBeGreaterThan(loser.rank);
      expect(winner.rank).toBeGreaterThanOrEqual(1);
      expect(winner.rank).toBeLessThanOrEqual(9);
      expect(loser.rank).toBeGreaterThanOrEqual(1);
      expect(loser.rank).toBeLessThanOrEqual(9);
      expect(winner.rank).not.toBe(loser.rank);
      for (const card of cards) {
        expect(card.suit === 0 || card.suit === 1 || card.suit === 2 || card.suit === 3).toBe(true);
      }
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
      expect(seat0.starter).toBe(starter === 0 ? 'you' : 'opponent');
      expect(seat1.starter).toBe(starter === 1 ? 'you' : 'opponent');
      const startingView = seat0.starter === 'you' ? seat0 : seat1;
      const waitingView = seat0.starter === 'you' ? seat1 : seat0;
      expect(startingView.you.rank).toBeGreaterThan(waitingView.you.rank);
    }
  });

  it('never mutates the authoritative match state or the deck', () => {
    const state = newMatch(219682080);
    const before = structuredClone(state);
    const starter = state.startingPlayer ?? state.turnPlayer;
    starterRitualView(offlineRitualKey(state.seed), starter, 0);
    starterRitualView(offlineRitualKey(state.seed), starter, 1);
    expect(state).toEqual(before);
  });

  it('rejects an empty key instead of inventing a result', () => {
    expect(() => starterRitualCards('', 0)).toThrow(/key/);
  });
});
