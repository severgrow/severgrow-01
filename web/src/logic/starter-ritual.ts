// The pre-game card ritual's PRESENTATION layer.
//
// Who starts is decided by the engine (`startingPlayerFor` / `newMatch`, and by the server for an
// online duel). This module never decides it. It only chooses two distinct playing-card faces that
// represent that already-decided result: the starter's card is always the higher one.
//
// Consequences that matter:
//   * it is pure and deterministic (same key -> same faces), so a replay or a refreshed online
//     client can never disagree with the board it is about to show;
//   * it draws from its own hash stream and never touches `State`, the deck, hands, seeds or the
//     engine's random streams;
//   * the key is public (an offline seed, an online match id). It reveals nothing hidden: the
//     faces are presentation-only and have no gameplay meaning.
//
// The offline client keys the ritual by its seed. The online client has no seed in its payload
// (deliberately), so it keys by the match id — the one value both seats already share. Both seats
// therefore see the same card for a given seat, and each maps it to "you" / "opponent" locally.
import { mulberry32 } from '../../../src/engine/prng.js';
import type { Player, Suit } from '../../../src/engine/index.js';

export type RitualCard = { readonly suit: Suit; readonly rank: number };

export type StarterRitualView = {
  /** The card this device's player drew. */
  readonly you: RitualCard;
  /** The card the other seat drew. */
  readonly opponent: RitualCard;
  /** Which side the engine (or server) says starts; never inferred from the cards. */
  readonly starter: 'you' | 'opponent';
};

/** A stable string key for the offline ritual. One key per match seed. */
export const offlineRitualKey = (seed: number): string => `offline:${seed}`;

/** A stable string key for the online ritual. One key per server match. */
export const onlineRitualKey = (matchId: string): string => `online:${matchId}`;

/** FNV-1a + an avalanche step: tiny, stable and good enough to seed the presentation stream. */
const hashKey = (key: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
};

const TWO32 = 4294967296;

/** An exactly uniform integer in [0, n), with the same reject-don't-bias rule as the engine. */
const boundedInt = (next: () => number, n: number): number => {
  const limit = TWO32 - (TWO32 % n);
  for (;;) {
    const x = Math.floor(next() * TWO32);
    if (x < limit) return x % n;
  }
};

/**
 * Two distinct faces, assigned to the two seats. The starter's rank is strictly higher, so a tie is
 * impossible and the reveal can never contradict who actually moves first.
 */
export const starterRitualCards = (key: string, starter: Player): readonly [RitualCard, RitualCard] => {
  if (!key) throw new Error('starter ritual key must not be empty');
  const next = mulberry32(hashKey(key));

  // Two distinct ranks from 1..9, uniform over ordered pairs. The pair is then sorted: the higher
  // rank is the starter's. Doing it this way keeps every rank pair equally likely, while the
  // assignment of "high" to the starter is fixed by the engine's result, not by chance here.
  const first = 1 + boundedInt(next, 9);
  // Map 0..7 onto 1..9 without landing on `first`: 1..8 shifted up by one from `first` onwards.
  const secondBase = boundedInt(next, 8) + 1;
  const second = secondBase >= first ? secondBase + 1 : secondBase;
  const high = Math.max(first, second);
  const low = Math.min(first, second);

  const suit0 = boundedInt(next, 4) as Suit;
  const suit1 = boundedInt(next, 4) as Suit;
  const other: Player = starter === 0 ? 1 : 0;

  const cards: [RitualCard, RitualCard] = [
    { suit: suit0, rank: starter === 0 ? high : low },
    { suit: suit1, rank: starter === 1 ? high : low },
  ];
  // A belt-and-braces invariant: this module's whole job is that the higher card belongs to the
  // starter. If a future edit ever breaks it, fail loudly instead of showing a lie.
  if (!(cards[starter].rank > cards[other].rank)) {
    throw new Error('starter ritual cards must put the higher rank on the starting seat');
  }
  return cards;
};

/** The same two cards, from one seat's point of view. */
export const starterRitualView = (key: string, starter: Player, me: Player): StarterRitualView => {
  const cards = starterRitualCards(key, starter);
  const them: Player = me === 0 ? 1 : 0;
  return {
    you: cards[me],
    opponent: cards[them],
    starter: starter === me ? 'you' : 'opponent',
  };
};
