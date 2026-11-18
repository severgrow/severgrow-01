// GET /v1/players/me/streaks  ·  POST /v1/players/me/streaks {games: [{id, tier, result}]}
// (owner, 2026-11-18: practice streaks on the four Practice keys, the best online Blitz streak on the
// profile). The page counts a finished game at once on the device and sends it here; the account
// keeps it once (by game id). The online Blitz streak is never sent by a page: it is folded from the
// server's own match results.
import { ApiError } from '../errors.js';
import type { PlayerRecord } from '../storage/types.js';
import { createMemoryLimiter } from '../memory-limit.js';
import type { PracticeTier, StreakResult } from './rules.js';
import { isPracticeTier, isStreakResult } from './rules.js';
import type { PracticeGame, StreakStore } from './store.js';

/** A page reports how ITS game ended; forfeit and timeout belong to online results only. */
const PAGE_RESULTS: readonly StreakResult[] = ['win', 'loss', 'draw', 'resign', 'abandon'];
const GAME_ID = /^[A-Za-z0-9:_.-]{1,80}$/;
export const MAX_GAMES_PER_POST = 50;

/** Postgres "undefined table": the server code arrived before migration 0028. */
const missingTable = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === '42P01';

/** A player id as the map and the profile route use it (any case). */
const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createStreakRouter = (deps: {
  store: StreakStore;
  authenticate: (token: string | null) => Promise<PlayerRecord>;
  now: () => number;
  /**
   * The achievements a player has unlocked, out of all of them (owner, 2026-11-18: "add to profiles
   * x/x achievements unlocked"). Null when that player does not exist.
   */
  achievementsOf?: (playerId: string) => Promise<{ done: number; total: number } | null>;
}) => {
  const writes = createMemoryLimiter({ max: 60, windowMs: 60_000, now: deps.now });
  return async (req: Request, path: string): Promise<{ status: number; body: unknown } | null> => {
    // A PROFILE'S RECORD (owner, 2026-11-18): the best online Blitz streak ("the competitive number")
    // and achievements unlocked, for the player's own profile and for a visitor. Signed-in viewers
    // only; an unknown and a malformed id are the same 404.
    const record = /^\/v1\/players\/([^/]+)\/record$/.exec(path);
    if (record && req.method === 'GET') {
      await deps.authenticate(req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null);
      const id = record[1]!.toLowerCase();
      if (!PLAYER_ID.test(id)) throw new ApiError('NOT_FOUND', 'No such player.');
      try {
        const achievements = deps.achievementsOf ? await deps.achievementsOf(id) : null;
        if (deps.achievementsOf && achievements === null) throw new ApiError('NOT_FOUND', 'No such player.');
        const blitz = await deps.store.onlineBlitz(id, deps.now());
        return { status: 200, body: { ok: true, onlineBlitzBest: blitz.best, achievements } };
      } catch (error) {
        if (missingTable(error)) throw new ApiError('NOT_FOUND', 'Not available yet.');
        throw error;
      }
    }
    if (path !== '/v1/players/me/streaks') return null;
    const player = await deps.authenticate(req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null);
    const now = deps.now();
    try {
      if (req.method === 'GET') {
        const practice = await deps.store.practice(player.id);
        const onlineBlitz = await deps.store.onlineBlitz(player.id, now);
        return { status: 200, body: { ok: true, practice, onlineBlitz } };
      }
      if (req.method !== 'POST') throw new ApiError('NOT_FOUND', 'Not found.');
      if (!writes.hit(player.id)) throw new ApiError('RATE_LIMITED', 'Please wait a moment.');
      let body: { games?: unknown };
      try { body = (await req.json()) as { games?: unknown }; } catch { throw new ApiError('INVALID_REQUEST', 'Invalid JSON.'); }
      if (!Array.isArray(body?.games) || body.games.length > MAX_GAMES_PER_POST) throw new ApiError('INVALID_REQUEST', 'Send up to 50 games.');
      const games: PracticeGame[] = body.games.map((g: unknown) => {
        const game = g as { id?: unknown; tier?: unknown; result?: unknown } | null;
        if (!game || typeof game.id !== 'string' || !GAME_ID.test(game.id) || !isPracticeTier(game.tier)
          || !isStreakResult(game.result) || !PAGE_RESULTS.includes(game.result)) {
          throw new ApiError('INVALID_REQUEST', 'A game needs an id, a Practice key and a result.');
        }
        return { id: game.id, tier: game.tier as PracticeTier, result: game.result };
      });
      const practice = await deps.store.recordPractice(player.id, games, now);
      return { status: 200, body: { ok: true, practice } };
    } catch (error) {
      if (missingTable(error)) throw new ApiError('NOT_FOUND', 'Streaks are not available yet.');
      throw error;
    }
  };
};

/** Achievements unlocked out of all, for the record route: the same views the player's own pane reads. */
export const achievementsCount = (
  storage: { playerById(id: string): Promise<PlayerRecord | null> },
  economy: { achievements(player: PlayerRecord): Promise<readonly { done: boolean }[]> },
) => async (playerId: string): Promise<{ done: number; total: number } | null> => {
  const player = await storage.playerById(playerId);
  if (!player) return null;
  const views = await economy.achievements(player);
  return { done: views.filter((view) => view.done).length, total: views.length };
};
