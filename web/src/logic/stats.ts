// Your record against the bot, saved in this browser only.
import type { GameResult, Player } from '../../../src/engine/index.js';

export type Stats = { played: number; wins: number; losses: number; draws: number; best: number; streak: number; bestStreak: number; winsByLevel: number[] };
export const EMPTY_STATS: Stats = Object.freeze({ played: 0, wins: 0, losses: 0, draws: 0, best: 0, streak: 0, bestStreak: 0, winsByLevel: Object.freeze(Array<number>(9).fill(0)) as number[] }) as Stats;
export const STATS_KEY = 'severgrow.stats.v1';

export const parseStats = (raw: string | null): Stats => {
  let saved: unknown = null;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  const out: Stats = { ...EMPTY_STATS, winsByLevel: [...EMPTY_STATS.winsByLevel] };
  if (!saved || typeof saved !== 'object') return out;
  const rec = saved as Record<string, unknown>;
  for (const k of ['played', 'wins', 'losses', 'draws', 'best', 'streak', 'bestStreak'] as const) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[k] = v;
  }
  if (Array.isArray(rec.winsByLevel)) {
    out.winsByLevel = out.winsByLevel.map((_, i) => {
      const v = (rec.winsByLevel as unknown[])[i];
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
    });
  }
  return out;
};

/** The record after one more finished game at bot `level` (1-9); never changes `s`. */
export const recordResult = (s: Stats, r: GameResult, me: Player, level: number): Stats => {
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
    winsByLevel: s.winsByLevel.map((n, i) => n + (won && i === level - 1 ? 1 : 0)),
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
