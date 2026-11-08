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
  playsStarterRitual,
  RITUAL_DECK_SIZE,
  RITUAL_FROM_CAMPAIGN_LEVEL,
  starterRitualCards,
  starterRitualDeck,
  starterRitualView,
} from '../src/logic/starter-ritual.js';
import { lessonFor, lessonIsFree, lessonOpening } from '../src/lessons/lessons.js';

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

describe('the outcome is readable (owner, 2026-10-23)', () => {
  it('"You start" / "Opponent starts" is held for one second before the deck gathers', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { RESULT_HOLD_MS } = await import('../src/player/starter-ritual.js');
    expect(RESULT_HOLD_MS).toBe(1000);
    const src = readFileSync(fileURLToPath(new URL('../src/player/starter-ritual.ts', import.meta.url)), 'utf8');
    expect(src).toMatch(/this\.showOutcome\(\);\s*\/\/[^\n]*\n\s*await this\.sleep\(this\.ms\(RESULT_HOLD_MS\)\);/);
  });
});

describe('the gathered emblem sits on the middle tile (owner, 2026-11-08)', () => {
  it('seats the deck on the centre hex before the cards meet, then blooms the plain kanji', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/player/starter-ritual.ts', import.meta.url)), 'utf8');
    const exit = src.slice(src.indexOf('private async exit'), src.indexOf('private baseOffsets'));
    const fast = exit.indexOf('if (fast)');
    const seat = exit.indexOf('this.seatDeckOnCenter()');
    const measure = exit.indexOf('const deckC = centerOfRect');
    const bloom = exit.indexOf('await this.bloomKanji(deckC)');
    const pile = exit.indexOf('const toPile');
    // A short fade (reduced motion, or a skip) leaves before any of this. The full exit seats the
    // emblem, measures that point, blooms the kanji, and only then streams the cards to the pile.
    expect(fast).toBeGreaterThan(-1);
    expect(seat).toBeGreaterThan(fast);
    expect(measure).toBeGreaterThan(seat);
    expect(bloom).toBeGreaterThan(measure);
    expect(pile).toBeGreaterThan(bloom);
    expect(src).toContain("WORDMARK_URL as plainMarkUrl");
    expect(src).toContain("from './branding.js'");
    expect(src).not.toContain("plain-wordmark.svg?url");
    expect(src).not.toContain('EASE.spring');
    expect(src).toMatch(/private layout\(\): void \{[\s\S]*?if \(this\.exiting\) return;/);
    const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
    expect(main).toContain('centerTile: centerTileRect');
    expect(main).toContain('[data-key="0,0"]');
  });
});

describe('the kanji is ready before it blooms (review, 0.84)', () => {
  it('decodes the mark when the ritual starts, and skips the bloom rather than show it half-drawn', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/player/starter-ritual.ts', import.meta.url)), 'utf8');
    const full = src.slice(src.indexOf('private async fullTimeline'), src.indexOf('private async reducedTimeline'));
    expect(full.indexOf('this.warmKanji()')).toBeGreaterThan(-1);
    expect(full.indexOf('this.warmKanji()')).toBeLessThan(full.indexOf('await this.arrival()'));
    const bloom = src.slice(src.indexOf('private async bloomKanji'), src.indexOf('private clearKanji'));
    expect(bloom).toContain('if (!ready) return;');
  });
});

describe('the emblem is on the middle tile the whole time (owner, 2026-11-08)', () => {
  // "the emblem logo on back card in middle should always be exactly in the middle of the middle tile
  // - it's below on your vid". The deck waited on the midpoint of the two dealt cards (18 px below the
  // tile on a 390 x 844 phone) and only moved onto the tile at the gather.
  it('lays the deck out on the middle tile from the first frame, the dealt-card midpoint only as a fallback', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/player/starter-ritual.ts', import.meta.url)), 'utf8');
    const layout = src.slice(src.indexOf('private layout(): void {'), src.indexOf('private onResize'));
    expect(layout).toContain('this.centerPoint()');
    expect(layout.indexOf('this.centerPoint()')).toBeLessThan(layout.indexOf('r.deckAnchor.style.left'));
  });
  it('follows the tile while the board settles into place, then stops (measured: the board rises 23 px during arrival)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/player/starter-ritual.ts', import.meta.url)), 'utf8');
    const full = src.slice(src.indexOf('private async fullTimeline'), src.indexOf('private async reducedTimeline'));
    expect(full.indexOf('this.followTile()')).toBeLessThan(full.indexOf('await this.arrival()'));
    const follow = src.slice(src.indexOf('private followTile(): void {'), src.indexOf('private followTile(): void {') + 1400);
    expect(follow).toContain('requestAnimationFrame');
    // finite: it stops once the tile has been still, and never outlives the ritual or the exit
    expect(follow).toMatch(/still >= /);
    expect(follow).toMatch(/this\.exiting|this\.finished/);
    // starts from where the deck is: a NaN start never counts as a move, and the follow gave up at once
    expect(follow).not.toContain('NaN');
  });
});

describe('the kanji comes out of the card, then leaves quickly (owner, 2026-11-08)', () => {
  // "make it look like it's actually coming from the card, in a smooth interesting but cheap way.
  // make it fade out disappear but quickly when game starts"
  it('lights on the emblem at the emblem size, lifts off the card face toward the viewer, the card gives under it', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../src/player/starter-ritual.ts', import.meta.url)), 'utf8');
    const bloom = src.slice(src.indexOf('private async bloomKanji'), src.indexOf('private clearKanji'));
    // starts lying in the card (tilted back) at the emblem's own size, lights there, then stands up
    expect(bloom).toContain("rotateX(${KANJI.tiltDeg}deg)");
    expect(bloom).toContain('scale(${start');
    // the card presses as the mark leaves it
    expect(bloom).toMatch(/this\.animate\(this\.refs\.deck, \[/);
    // only transform / opacity: cheap, no filter or blur on a moving layer
    expect(bloom).not.toMatch(/filter|blur|box-shadow/);
    // the exit is NOT awaited: the cards head for the pile while the mark is already leaving
    expect(bloom).toMatch(/const leave = img\.animate\(/);
    expect(bloom).not.toMatch(/await\s+leave/);
  });
  it('the leave is quick and the whole moment stays short', async () => {
    const { KANJI } = await import('../src/player/starter-ritual.js');
    expect(KANJI.leaveMs).toBeLessThanOrEqual(200);
    expect(KANJI.liftMs + KANJI.holdMs).toBeLessThanOrEqual(640);
    expect(KANJI.peak).toBeLessThan(1); // not a full-screen slam
    expect(KANJI.tiltDeg).toBeGreaterThan(20);
  });
});

describe('which matches open with the ritual (owner, 2026-10-24)', () => {
  it('plays on a practice match and on every campaign level from 9 on', () => {
    expect(RITUAL_FROM_CAMPAIGN_LEVEL).toBe(9);
    expect(playsStarterRitual(true, null), 'practice').toBe(true);
    for (const n of [9, 10, 11, 12, 13, 31, 70]) expect(playsStarterRitual(true, n), `level ${n}`).toBe(true);
  });

  it('never plays on the hand-held lessons 1-8', () => {
    // Those eight openings are authored and deliberately skip the draw (their first sentence is
    // about the board, not about who starts). Level 9 is a real game from scratch (owner,
    // 2026-11-01), so the same ceremony as practice and online belongs there.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) expect(playsStarterRitual(true, n), `level ${n}`).toBe(false);
    const l9 = lessonFor(9);
    expect(l9, 'level 9 is the first real game').not.toBeNull();
    expect(lessonIsFree(l9!), 'level 9 is a free lesson').toBe(true);
    expect(lessonIsFree(lessonFor(8)!), 'level 8 is still hand-held').toBe(false);
  });

  it('is a product-channel rule, exactly like the ritual itself', () => {
    expect(playsStarterRitual(false, null)).toBe(false);
    for (const n of [1, 10, 11, 70]) expect(playsStarterRitual(false, n), `level ${n}`).toBe(false);
  });
});

describe('the campaign opening decides the starter; the ritual only presents it', () => {
  it('level 10 opens on your turn, and dealing its two cards changes nothing', () => {
    const l10 = lessonFor(10)!;
    const opening = lessonOpening(l10);
    expect(opening.startingPlayer, 'the authored opening is the engine\'s decision').toBe(0);
    expect(opening.actor).toBe(0);
    expect(opening.phase).toBe('DRAW');
    const snapshot = structuredClone(opening);
    const starter = opening.startingPlayer ?? opening.turnPlayer;
    const view = starterRitualView(offlineRitualKey(opening.seed), starter, 0);
    expect(view.starter).toBe('you');
    expect(view.you.rank).toBeGreaterThan(view.opponent.rank);
    // The match is byte-identical: the ritual drew from its own stream and touched nothing.
    expect(opening).toEqual(snapshot);
    expect(lessonOpening(l10)).toEqual(snapshot);
  });

  it('a campaign match from 11 on names the seat newMatch decided, for any seed', () => {
    for (let i = 0; i < 300; i++) {
      const seed = 96_010 + i;
      const state = newMatch(seed);
      const starter = state.startingPlayer!;
      expect(starter).toBe(startingPlayerFor(seed));
      const view = starterRitualView(offlineRitualKey(seed), starter, 0);
      expect(view.starter, `seed ${seed}`).toBe(starter === 0 ? 'you' : 'opponent');
      // The higher card belongs to whoever the engine says starts, never the other way round.
      expect(view.starter === 'you' ? view.you.rank > view.opponent.rank : view.opponent.rank > view.you.rank).toBe(true);
    }
  });
});
