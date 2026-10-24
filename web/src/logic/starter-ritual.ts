// The pre-game card ritual's PRESENTATION layer.
//
// Who starts is decided by the engine (`startingPlayerFor` / `newMatch`, and by the server for an
// online duel). This module never decides it. It deals two cards from the ritual's own nine-card
// deck that represent that already-decided result: the starter's card is always the higher one.
//
// The deck holds exactly one card of each strength 1..9 (colours are random), so two drawn numbers
// are always different and a draw on numbers is impossible by construction, not by a check.
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

/** Nine cards: one of every strength 1..9. The deck's size is the ritual's whole fairness story. */
export const RITUAL_DECK_SIZE = 9;

export type StarterRitualView = {
  /** The card this device's player drew. */
  readonly you: RitualCard;
  /** The card the other seat drew. */
  readonly opponent: RitualCard;
  /** Which side the engine (or server) says starts; never inferred from the cards. */
  readonly starter: 'you' | 'opponent';
  /**
   * The ritual deck in stacking order, bottom first. The two dealt cards are its last two entries,
   * so the cards on the table are literally the top of this deck — and nine cards are accounted
   * for at every moment of the ritual.
   */
  readonly deck: readonly RitualCard[];
};

/** A stable string key for the offline ritual. One key per match seed. */
export const offlineRitualKey = (seed: number): string => `offline:${seed}`;

/** A stable string key for the online ritual. One key per server match. */
export const onlineRitualKey = (matchId: string): string => `online:${matchId}`;

/**
 * The first campaign level that opens with the ritual (owner, 2026-10-24: "from level 10 onwards
 * the ritual card for picking who starts the game should be visible").
 *
 * Levels 1-9 keep their hand-held, authored openings: their first sentence is about the board, and
 * a ceremony over it would be a second thing to read before the first lesson. Level 10 is the last
 * lesson and the first real game; from there every campaign level opens exactly like a practice
 * match or an online duel — the same component, timing, reveal and sound.
 */
export const RITUAL_FROM_CAMPAIGN_LEVEL = 10;

/**
 * Does this match open with the ritual? A presentation rule only: it never decides who starts
 * (the engine's `newMatch` / the server does, and the ritual presents that result).
 * `campaignLevel` is null for every non-campaign start (practice, rematch, a URL seed).
 */
export const playsStarterRitual = (productChannel: boolean, campaignLevel: number | null): boolean =>
  productChannel && (campaignLevel === null || campaignLevel >= RITUAL_FROM_CAMPAIGN_LEVEL);

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
 * The ritual's deck, shuffled deterministically from the match key.
 *
 * One card of every strength 1..9, each with a random colour. A strength never appears twice, so
 * the two cards dealt can never show the same number. The order is a Fisher–Yates shuffle over the
 * same stream, so the two seats see the same deal and a replay or a refreshed online client can
 * never disagree about it.
 */
export const starterRitualDeck = (key: string): readonly RitualCard[] => {
  if (!key) throw new Error('starter ritual key must not be empty');
  const next = mulberry32(hashKey(key));
  const deck: RitualCard[] = [];
  for (let rank = 1; rank <= RITUAL_DECK_SIZE; rank++) {
    deck.push({ suit: boundedInt(next, 4) as Suit, rank });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = boundedInt(next, i + 1);
    const swapped = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = swapped;
  }
  return deck;
};

/**
 * The two cards dealt off the top of the deck, assigned to the two seats. Both come from the deck
 * (so their colours and numbers are the deck's own), the numbers always differ, and the starter's
 * card is the higher of the two — the reveal can never contradict who actually moves first.
 */
const dealFrom = (deck: readonly RitualCard[], starter: Player): readonly [RitualCard, RitualCard] => {
  const first = deck[deck.length - 1]!;
  const second = deck[deck.length - 2]!;
  const high = first.rank > second.rank ? first : second;
  const low = first.rank > second.rank ? second : first;
  const other: Player = starter === 0 ? 1 : 0;

  const cards: [RitualCard, RitualCard] = [starter === 0 ? high : low, starter === 1 ? high : low];
  // A belt-and-braces invariant: this module's whole job is that the higher card belongs to the
  // starter, and that the two numbers differ. If a future edit ever breaks either, fail loudly
  // instead of showing a lie (or a draw).
  if (!(cards[starter].rank > cards[other].rank)) {
    throw new Error('starter ritual cards must put the higher rank on the starting seat');
  }
  return cards;
};

/** The two dealt cards for a match, without the rest of the deck. */
export const starterRitualCards = (key: string, starter: Player): readonly [RitualCard, RitualCard] =>
  dealFrom(starterRitualDeck(key), starter);

/** The same two cards, from one seat's point of view, with the deck they were taken from. */
export const starterRitualView = (key: string, starter: Player, me: Player): StarterRitualView => {
  const deck = starterRitualDeck(key);
  const cards = dealFrom(deck, starter);
  const them: Player = me === 0 ? 1 : 0;
  return {
    you: cards[me],
    opponent: cards[them],
    starter: starter === me ? 'you' : 'opponent',
    deck,
  };
};
