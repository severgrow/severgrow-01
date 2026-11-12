// How you play against the computer, saved in this browser only (owner, 2026-10-23: player stats in
// the profile). The win/loss record lives in stats.ts and keeps its shape; this is the small record
// of MOVES beside it: how often each move was played, and the longest Bloom.
//
// Owner, 2026-11-01: the profile now shows three numbers per half (games, win rate, longest streak),
// so the move record is still COLLECTED but no longer printed. It stays written on purpose — the
// history it holds cannot be recovered from anywhere else, and dropping the writer would throw away
// every game played so far. Pure.
import type { Event, Player } from '../../../src/engine/index.js';

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
