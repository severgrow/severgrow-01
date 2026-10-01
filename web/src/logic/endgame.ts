// So the end of a game is never a surprise: short warnings near the end, and how the
// final score was made.
import type { BoardCtx, Player, View } from '../../../src/engine/index.js';

/** "3 turns left", "Last turn!", "Only 4 cards left"... or null when the end is far away. */
export const endgameNote = (v: View): string | null => {
  const max = v.config.maxTurnsPerPlayer;
  if (max > 0) {
    const left = max - Math.ceil(v.turnNumber / 2) + 1; // this turn included
    if (left <= 1) return 'Last turn!';
    if (left <= 3) return `${left} turns left`;
  }
  if (v.deckCount === 0) return 'Deck empty: last turn!';
  if (v.deckCount <= 6) return `Only ${v.deckCount} card${v.deckCount === 1 ? '' : 's'} left`;
  return null;
};

/** A player's tiles and how many of them sit on gold (each gold tile scores 2). */
export const scoreBreakdown = (ctx: BoardCtx, p: Player): { tiles: number; gold: number } => {
  let tiles = 0;
  let gold = 0;
  for (const [key, t] of Object.entries(ctx.board)) {
    if (!t || t.owner !== p || t.root) continue;
    tiles++;
    if (ctx.terrain[key] === 'rich') gold++;
  }
  return { tiles, gold };
};
