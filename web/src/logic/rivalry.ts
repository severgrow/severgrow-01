/**
 * PERSONAL HEAD-TO-HEAD (owner, v0.84). One quiet scoreline such as "YOU 4 — 3 MAPLEFOX", built only
 * from FINISHED authoritative duels the server already decided. Pure: no I/O, no clocks, no random.
 */
import type { HeadToHead } from '../../../server/src/protocol.js';

export type RivalryDuel = Readonly<{
  matchId: string;
  mySeat: 0 | 1;
  winner: 0 | 1 | null;
}>;

/** The opponent's public display name on the line — never a #tag or an id. */
export const rivalryDisplayName = (displayName: string | null | undefined): string | null => {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  return name ? name.toUpperCase() : null;
};

/**
 * Fold many finished duels into one record. Duplicates (same match id twice) are dropped so a replayed
 * read cannot inflate the score.
 */
export const aggregateRivalry = (duels: readonly RivalryDuel[]): HeadToHead => {
  const seen = new Set<string>();
  let games = 0;
  let youWins = 0;
  let themWins = 0;
  let draws = 0;
  for (const duel of duels) {
    if (seen.has(duel.matchId)) continue;
    seen.add(duel.matchId);
    games += 1;
    if (duel.winner === null) draws += 1;
    else if (duel.winner === duel.mySeat) youWins += 1;
    else themWins += 1;
  }
  return { games, youWins, themWins, draws };
};

/** `null` when there is nothing honest to say yet (no games, or no name to print). */
export const formatRivalryLine = (
  record: HeadToHead,
  opponentDisplayName: string | null | undefined,
): string | null => {
  if (record.games <= 0) return null;
  const name = rivalryDisplayName(opponentDisplayName);
  if (!name) return null;
  const draws = record.draws > 0 ? ` · ${record.draws} DRAW${record.draws === 1 ? '' : 'S'}` : '';
  return `YOU ${record.youWins} — ${record.themWins} ${name}${draws}`;
};
