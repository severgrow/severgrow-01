// Your record against the bot, saved in this browser only.
import type { GameResult, Player } from '../../../src/engine/index.js';

export type Stats = { played: number; wins: number; losses: number; draws: number; best: number; streak: number; bestStreak: number };
export const EMPTY_STATS: Stats = Object.freeze({ played: 0, wins: 0, losses: 0, draws: 0, best: 0, streak: 0, bestStreak: 0 }) as Stats;
export const STATS_KEY = 'severgrow.stats.v1';

export const parseStats = (raw: string | null): Stats => {
  let saved: unknown = null;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  const out: Stats = { ...EMPTY_STATS };
  if (!saved || typeof saved !== 'object') return out;
  for (const k of Object.keys(EMPTY_STATS) as (keyof Stats)[]) {
    const v = (saved as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[k] = v;
  }
  return out;
};

/** The record after one more finished game (never changes `s`). */
export const recordResult = (s: Stats, r: GameResult, me: Player): Stats => {
  const won = r.winner === me;
  const streak = won ? s.streak + 1 : 0;
  return {
    played: s.played + 1,
    wins: s.wins + (won ? 1 : 0),
    losses: s.losses + (r.winner !== null && !won ? 1 : 0),
    draws: s.draws + (r.winner === null ? 1 : 0),
    best: Math.max(s.best, r.scores[me]),
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
  };
};

const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;

/** e.g. "3 wins, 2 losses · best score 21 · 2 wins in a row" ('' before the first game). */
export const statsLine = (s: Stats): string => {
  if (s.played === 0) return '';
  const parts = [`${plural(s.wins, 'win')}, ${plural(s.losses, 'loss', 'losses')}${s.draws ? `, ${plural(s.draws, 'draw')}` : ''}`, `best score ${s.best}`];
  if (s.streak >= 2) parts.push(`${s.streak} wins in a row`);
  return parts.join(' · ');
};
