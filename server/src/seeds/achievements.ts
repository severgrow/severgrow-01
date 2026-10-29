import { worldNeighbours } from '../world.js';
import type { WorldChallenge } from './types.js';

/**
 * TERRITORY ACHIEVEMENTS (owner, 2026-10-29: "turn it into achievements and pay seeds for those —
 * for beta we want quick easy engagement in territory").
 *
 * Each achievement is a one-time Seeds payment for a step into Territory: grow your first tile, meet
 * a neighbour, send or accept a challenge, win one, reach the podium. They are deliberately EASY and
 * GENEROUS for the beta: the first one pays back the tile it asks for, and the whole set is worth 900
 * Seeds (nine tiles).
 *
 * THE SERVER DECIDES. Progress is computed here from what the server already stores (the map's claims
 * and the player's challenge rows), the client only ever shows it, and a claim pays through the
 * ordinary Seeds settlement with the receipt key `achievement:<id>`: one receipt per player per
 * achievement, so a retried or doubled CLAIM replays the first payment instead of paying twice. No
 * table or migration is involved. Amounts are fixed (not multiplied by the beta payout), so the
 * number on the card is the number paid.
 *
 * This file is pure and shared: the server uses it to verify, the page uses the same ids and goals to
 * draw progress, so the two can never disagree about what an achievement asks for.
 */
export type AchievementId = 'roots' | 'neighbours' | 'holding' | 'throw-down' | 'stand-ground' | 'conqueror' | 'podium' | 'estate';

export type AchievementFacts = {
  /** Tiles the player holds right now. */
  tiles: number;
  /** One of the player's tiles shares a side with another player's tile. */
  neighbour: boolean;
  /** Challenges the player has sent (any outcome). */
  sent: number;
  /** Challenges the player accepted as the defender (the duel was played or is running). */
  accepted: number;
  /** Challenges the player won: a duel they won, or a challenge they sent that was never answered. */
  won: number;
  /** The player's place in the tile ranking (1 = most tiles), or null with no tiles. */
  rank: number | null;
};

export type AchievementDef = { id: AchievementId; seeds: number; goal: number; progress: (f: AchievementFacts) => number };

/** In the order the page lists them: the first steps first. */
export const ACHIEVEMENTS: readonly AchievementDef[] = Object.freeze([
  { id: 'roots', seeds: 100, goal: 1, progress: (f) => f.tiles },
  { id: 'neighbours', seeds: 50, goal: 1, progress: (f) => (f.neighbour ? 1 : 0) },
  { id: 'throw-down', seeds: 75, goal: 1, progress: (f) => f.sent },
  { id: 'stand-ground', seeds: 75, goal: 1, progress: (f) => f.accepted },
  { id: 'holding', seeds: 100, goal: 3, progress: (f) => f.tiles },
  { id: 'conqueror', seeds: 150, goal: 1, progress: (f) => f.won },
  { id: 'podium', seeds: 100, goal: 1, progress: (f) => (f.rank !== null && f.rank <= 3 ? 1 : 0) },
  { id: 'estate', seeds: 250, goal: 10, progress: (f) => f.tiles },
]);

export const achievementById = (id: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.id === id);
export const achievementSourceKey = (id: AchievementId): string => `achievement:${id}`;

/** What the page receives for one achievement. */
export type AchievementView = { id: AchievementId; seeds: number; goal: number; progress: number; done: boolean; claimed: boolean };

export type ClaimView = { cellId: string; ownerId: string };

/** The facts, from the public claims and the player's own challenge rows. */
export const achievementFacts = (
  playerId: string,
  claims: readonly ClaimView[],
  challenges: readonly Pick<WorldChallenge, 'challengerId' | 'defenderId' | 'status' | 'matchId' | 'winnerId'>[],
): AchievementFacts => {
  const owner = new Map(claims.map((c) => [c.cellId, c.ownerId]));
  const mine = claims.filter((c) => c.ownerId === playerId);
  const neighbour = mine.some((c) => worldNeighbours(c.cellId).some((id) => {
    const other = owner.get(id);
    return other !== undefined && other !== playerId;
  }));
  const counts = new Map<string, number>();
  for (const c of claims) counts.set(c.ownerId, (counts.get(c.ownerId) ?? 0) + 1);
  const rank = mine.length ? 1 + [...counts.values()].filter((n) => n > mine.length).length : null;
  return {
    tiles: mine.length,
    neighbour,
    sent: challenges.filter((c) => c.challengerId === playerId).length,
    accepted: challenges.filter((c) => c.defenderId === playerId && c.matchId !== null).length,
    won: challenges.filter((c) =>
      (c.status === 'resolved' && c.winnerId === playerId) ||
      (c.status === 'expired' && c.challengerId === playerId)).length,
    rank,
  };
};

export const achievementViews = (facts: AchievementFacts, claimed: ReadonlySet<string>): AchievementView[] =>
  ACHIEVEMENTS.map((a) => {
    const progress = Math.max(0, Math.min(a.goal, a.progress(facts)));
    return { id: a.id, seeds: a.seeds, goal: a.goal, progress, done: progress >= a.goal, claimed: claimed.has(achievementSourceKey(a.id)) };
  });
