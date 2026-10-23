// PLAYER STATS (owner, 2026-10-23: "we have player profiles already so this can live there"). The
// profile shows the player's record against the computer: games, win rate, streak, best score, favourite move
// and longest Bloom. The win/loss record already exists (logic/stats.ts); the moves are a separate
// small record, so nothing already saved changes shape. Every value is a fact or an em dash.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Event } from '../../src/engine/index.js';
import { BLAST, BLOOM, FRUIT, PROFILE, SPROUT } from '../../src/strings.js';
import { EMPTY_PLAY, PLAY_KEY, parsePlay, playRows, recordPlay } from '../src/logic/play-record.js';
import { EMPTY_STATS, recordResult } from '../src/logic/stats.js';

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

describe('the profile lines', () => {
  it('a player who has not finished a game sees em dashes, never a made-up 0%', () => {
    const rows = playRows(EMPTY_STATS, EMPTY_PLAY);
    expect(rows.map((r) => r.label)).toEqual([PROFILE.games, PROFILE.winRate, PROFILE.streak, PROFILE.bestScore, PROFILE.favourite, PROFILE.longestBloom]);
    expect(rows[0]!.value).toBe('0');
    for (const r of rows.slice(1)) expect(r.value, r.label).toBe(PROFILE.unknown);
    expect(rows).toHaveLength(6);
  });

  it('a real record reads as facts', () => {
    const res = (winner: 0 | 1 | null) => ({ winner, reason: 'turn_limit' as const, scores: [10, 5] as [number, number] });
    let s = EMPTY_STATS;
    for (const w of [0, 0, 1, 0] as const) s = recordResult(s, res(w), 0, 5);
    const rows = playRows(s, recordPlay(EMPTY_PLAY, game, 0));
    expect(rows.map((r) => r.value)).toEqual(['4', '75%', '1', '10', SPROUT.Name, PROFILE.tilesCount(3)]);
    expect(rows[2]!.label).toBe(PROFILE.streakBest(2));
  });

  it('the favourite move uses the player names, and a tie goes to the bigger move', () => {
    const tie = { ...EMPTY_PLAY, grow: 2, bloom: 2, bomb: 2, blast: 2 };
    expect(playRows(EMPTY_STATS, tie)[4]!.value).toBe(BLAST.Name);
    expect(playRows(EMPTY_STATS, { ...tie, blast: 0 })[4]!.value).toBe(BLOOM.Name);
    expect(playRows(EMPTY_STATS, { ...tie, blast: 0, bloom: 0 })[4]!.value).toBe(FRUIT.card);
  });
});

describe('where it is wired', () => {
  const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
  it('every finished game against the computer adds its moves, beside the win/loss record', () => {
    expect(main).toMatch(/stats = recordResult\(stats, p\.after\.result, HUMAN, gameLevel\);\s*store\.set\(STATS_KEY, JSON\.stringify\(stats\)\);[\s\S]{0,800}store\.set\(PLAY_KEY, JSON\.stringify\(recordPlay\(parsePlay\(store\.get\(PLAY_KEY\)\), p\.after\.history \?\? \[\], HUMAN\)\)\);/);
  });
});

describe('the profile shows them', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const mount = readFileSync(fileURLToPath(new URL('../src/accounts/mount.ts', import.meta.url)), 'utf8');
  it('as their own block under the five identity lines (which stay five)', () => {
    const profile = html.slice(html.indexOf('<section id="sheet-profile"'), html.indexOf('</section>', html.indexOf('<section id="sheet-profile"')));
    expect(profile).toMatch(/<\/dl>\s*<!--[\s\S]*?-->\s*<div class="sp-play">\s*<h3 id="profile-play-title"/);
    expect(profile).toContain('<dl id="profile-play" class="sp-play-grid"');
    expect(profile.match(/class="sp-row"/g) ?? []).toHaveLength(5);
  });
  it('read from this device\'s own record, the same keys the game writes', () => {
    expect(mount).toMatch(/play: playRows\(parseStats\(readLocal\(STATS_KEY\)\), parsePlay\(readLocal\(PLAY_KEY\)\)\)/);
  });
});
