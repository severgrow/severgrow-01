// THE MOVE RECORD (owner, 2026-10-23: "we have player profiles already so this can live there").
//
// Owner, 2026-11-01 narrowed the profile to three numbers per half (games, win rate, longest streak),
// so the move record is no longer PRINTED. It is still COLLECTED — the history it holds cannot be
// recovered from anywhere else — and these tests pin that it keeps being written and parsed.
// The printed lines now live in web/tests/match-record.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Event } from '../../src/engine/index.js';
import { EMPTY_PLAY, PLAY_KEY, parsePlay, recordPlay } from '../src/logic/play-record.js';

const c = (q: number, r: number) => ({ q, r });
const game: Event[] = [
  { t: 'Sprout', player: 0, card: 1, coord: c(0, 1) },
  { t: 'Sprout', player: 1, card: 2, coord: c(1, 1) },
  { t: 'Strengthen', player: 0, card: 3, coord: c(0, 1), oldStrength: 2, newStrength: 5 },
  { t: 'Bloom', player: 0, cards: [4, 5, 6], hexes: [c(0, 2), c(0, 3), c(0, 4)] },
  { t: 'Bloom', player: 1, cards: [7, 8, 9, 10, 11], hexes: [c(1, 2), c(1, 3), c(1, 4), c(1, 5), c(1, 6)] },
  { t: 'FruitCard', player: 0, card: 12, target: c(1, 1), strength: 3 },
  { t: 'MegaBomb', player: 1, cards: [13], target: c(0, 2), destroyed: [c(0, 2)] },
  { t: 'Sprout', player: 0, card: 14, coord: c(0, 5) },
];

describe('the play record', () => {
  it('counts only MY moves: Grow (Strengthen is a Grow), Bloom, Bomb, Blast, and my longest Bloom', () => {
    const p = recordPlay(EMPTY_PLAY, game, 0);
    expect(p).toEqual({ grow: 3, bloom: 1, bomb: 1, blast: 0, longestBloom: 3 });
    // The opponent's five-tile Bloom is not mine.
    expect(recordPlay(EMPTY_PLAY, game, 1)).toEqual({ grow: 1, bloom: 1, bomb: 0, blast: 1, longestBloom: 5 });
  });

  it('adds up across games and never changes the record passed in', () => {
    const one = recordPlay(EMPTY_PLAY, game, 0);
    const two = recordPlay(one, game, 0);
    expect(two).toEqual({ grow: 6, bloom: 2, bomb: 2, blast: 0, longestBloom: 3 });
    expect(one).toEqual({ grow: 3, bloom: 1, bomb: 1, blast: 0, longestBloom: 3 });
  });

  it('reads back what it saved, and anything broken as an empty record', () => {
    const p = recordPlay(EMPTY_PLAY, game, 0);
    expect(parsePlay(JSON.stringify(p))).toEqual(p);
    expect(parsePlay(null)).toEqual(EMPTY_PLAY);
    expect(parsePlay('{bad')).toEqual(EMPTY_PLAY);
    expect(parsePlay(JSON.stringify({ grow: -3, bloom: 1.5, bomb: 'x', longestBloom: 4 }))).toEqual({ ...EMPTY_PLAY, longestBloom: 4 });
    expect(PLAY_KEY).toBe('severgrow.play.v1');
  });
});

describe('where it is wired', () => {
  const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');

  it('every finished game against the computer still adds its moves, beside the win/loss record', () => {
    expect(main).toMatch(/stats = recordResult\(stats, p\.after\.result, HUMAN, gameLevel\);\s*store\.set\(STATS_KEY, JSON\.stringify\(stats\)\);[\s\S]{0,900}store\.set\(PLAY_KEY, JSON\.stringify\(recordPlay\(parsePlay\(store\.get\(PLAY_KEY\)\), p\.after\.history \?\? \[\], HUMAN\)\)\);/);
  });

  it('tells the account a finished offline game happened, so other devices can see it', () => {
    expect(main).toContain("window.dispatchEvent(new Event('futasaku:offline-game'))");
    // Exactly once, in the one place the record is written.
    expect(main.match(/futasaku:offline-game/g) ?? []).toHaveLength(1);
  });
});
