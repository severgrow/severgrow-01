// How you play against the computer, saved in this browser only (owner, 2026-10-23: player stats in
// the profile). The win/loss record lives in stats.ts and keeps its shape; this is the small record
// of MOVES beside it: how often each move was played, and the longest Bloom. Pure.
import type { Event, Player } from '../../../src/engine/index.js';
import { BLAST, BLOOM, FRUIT, PROFILE, SPROUT } from '../../../src/strings.js';
import type { Stats } from './stats.js';

export type PlayRecord = { grow: number; bloom: number; bomb: number; blast: number; longestBloom: number };
export const EMPTY_PLAY: PlayRecord = Object.freeze({ grow: 0, bloom: 0, bomb: 0, blast: 0, longestBloom: 0 });
export const PLAY_KEY = 'severgrow.play.v1';

const FIELDS = ['grow', 'bloom', 'bomb', 'blast', 'longestBloom'] as const;

export const parsePlay = (raw: string | null): PlayRecord => {
  let saved: unknown = null;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  const out: PlayRecord = { ...EMPTY_PLAY };
  if (!saved || typeof saved !== 'object') return out;
  const rec = saved as Record<string, unknown>;
  for (const k of FIELDS) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[k] = v;
  }
  return out;
};

/** The record after one more finished game, from that game's events; never changes `p`. */
export const recordPlay = (p: PlayRecord, history: readonly Event[], me: Player): PlayRecord => {
  const out = { ...p };
  for (const e of history) {
    if (!('player' in e) || e.player !== me) continue;
    if (e.t === 'Sprout' || e.t === 'Strengthen') out.grow++;
    else if (e.t === 'Bloom') {
      out.bloom++;
      out.longestBloom = Math.max(out.longestBloom, e.hexes.length);
    } else if (e.t === 'FruitCard') out.bomb++;
    else if (e.t === 'MegaBomb') out.blast++;
  }
  return out;
};

export type PlayRow = Readonly<{ label: string; value: string }>;

/**
 * The profile's six play tiles. A value is a fact or the em dash: no game, no rate.
 * The favourite move is the most played; a tie goes to the bigger move (Blast, Bloom, Bomb, Grow).
 */
export const playRows = (s: Stats, p: PlayRecord): readonly PlayRow[] => {
  const moves: [string, number][] = [
    [BLAST.Name, p.blast],
    [BLOOM.Name, p.bloom],
    [FRUIT.card, p.bomb],
    [SPROUT.Name, p.grow],
  ];
  const top = moves.reduce((a, b) => (b[1] > a[1] ? b : a));
  return [
    { label: PROFILE.games, value: String(s.played) },
    { label: PROFILE.winRate, value: s.played ? `${Math.round((s.wins / s.played) * 100)}%` : PROFILE.unknown },
    { label: s.played ? PROFILE.streakBest(s.bestStreak) : PROFILE.streak, value: s.played ? String(s.streak) : PROFILE.unknown },
    { label: PROFILE.bestScore, value: s.played ? String(s.best) : PROFILE.unknown },
    { label: PROFILE.favourite, value: top[1] > 0 ? top[0] : PROFILE.unknown },
    { label: PROFILE.longestBloom, value: p.longestBloom > 0 ? PROFILE.tilesCount(p.longestBloom) : PROFILE.unknown },
  ];
};
