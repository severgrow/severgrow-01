// Live duels — Postgres adapter. One `transact` = one database transaction. Row locks are taken in
// a fixed order (challenge → match → players) so two live steps can never deadlock, and the match
// row lock is the SAME lock the move pipeline takes, so a live step and a move are serialized.
import type { Player, State } from '../../../src/engine/index.js';
import type { MatchStatus, OnlineGameResult } from '../protocol.js';
import type { PgClient, PgPool, PgRow } from '../storage/postgres.js';
import type {
  Challenge,
  ChallengeKind,
  ChallengeStatus,
  LiveEndReason,
  LiveMatch,
  LivePlayer,
  LiveStore,
  LiveTx,
  PresenceStatus,
} from './types.js';
import { defaultLivePlayer } from './types.js';

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const seatOrNull = (v: unknown): Player | null => (v === null || v === undefined ? null : Number(v) === 1 ? 1 : 0);
const json = <T>(v: unknown): T => (typeof v === 'string' ? (JSON.parse(v) as T) : (v as T));

export const rowToLive = (row: PgRow): LiveMatch => ({
  matchId: String(row.id),
  liveSince: numOrNull(row.live_since),
  limitMs: numOrNull(row.live_limit_ms),
  leftBy: seatOrNull(row.live_left_by),
  tailRev: numOrNull(row.live_tail_rev),
  autoplayRev: numOrNull(row.live_autoplay_rev),
  normalTimeoutMs: numOrNull(row.live_normal_timeout_ms),
  endedReason: strOrNull(row.live_ended_reason) as LiveEndReason | null,
  endedAt: numOrNull(row.live_ended_at),
  endedBySeat: seatOrNull(row.live_ended_by_seat),
});

const rowToPlayer = (row: PgRow): LivePlayer => ({
  playerId: String(row.id),
  liveMatchId: strOrNull(row.live_match_id),
  challengesEnabled: row.live_challenges_enabled !== false && row.live_challenges_enabled !== 'f',
  presence: strOrNull(row.presence_status) as PresenceStatus | null,
  presenceAt: numOrNull(row.presence_at),
  presenceMatchId: strOrNull(row.presence_match_id),
});

const rowToChallenge = (row: PgRow): Challenge => ({
  id: String(row.id),
  matchId: String(row.match_id),
  fromPlayer: String(row.from_player),
  toPlayer: String(row.to_player),
  kind: String(row.kind) as ChallengeKind,
  limitMs: num(row.limit_ms),
  status: String(row.status) as ChallengeStatus,
  createdAt: num(row.created_at),
  expiresAt: num(row.expires_at),
  respondedAt: numOrNull(row.responded_at),
  newMatchId: strOrNull(row.new_match_id),
});

// The strikes / cooldown columns (migration 0006) are deliberately NOT written any more: the
// strike escape hatch and the leaver cooldown are gone. The columns stay in the schema so no risky
// migration is needed; existing values simply stop being read or updated.
const LIVE_UPDATE = `update matches set
  live_since = $2, live_limit_ms = $3, live_left_by = $4,
  live_tail_rev = $5, live_autoplay_rev = $6, live_normal_timeout_ms = $7,
  live_ended_reason = $8, live_ended_at = $9, live_ended_by_seat = $10
 where id = $1`;

const liveValues = (l: LiveMatch): unknown[] => [
  l.matchId,
  l.liveSince,
  l.limitMs,
  l.leftBy,
  l.tailRev,
  l.autoplayRev,
  l.normalTimeoutMs,
  l.endedReason,
  l.endedAt,
  l.endedBySeat,
];

const CHALLENGE_COLUMNS = 'id, match_id, from_player, to_player, kind, limit_ms, status, created_at, expires_at, responded_at, new_match_id';

const challengeValues = (c: Challenge): unknown[] => [
  c.id,
  c.matchId,
  c.fromPlayer,
  c.toPlayer,
  c.kind,
  c.limitMs,
  c.status,
  c.createdAt,
  c.expiresAt,
  c.respondedAt,
  c.newMatchId,
];

const isRetryable = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === '40P01' || code === '40001' || code === '23505';
};

/**
 * The same finish the base `resignMatch` writes, done on the SAME locked client the live step holds
 * (so a live ending and a move can never interleave). `status <> 'finished'` makes it idempotent at
 * the SQL level: a timeout racing an explicit leave produces exactly ONE finish.
 */
const FINISH_MATCH = `update matches set
  status = 'finished', result = $2, turn_deadline_at = null, expires_at = null,
  turn_start_state = state, turn_start_revision = revision, updated_at = $3, finished_at = $3
 where id = $1 and status <> 'finished'`;

const makeTx = (client: PgClient): LiveTx => ({
  async match(matchId) {
    const { rows } = await client.query('select * from matches where id = $1 for update', [matchId]);
    const row = rows[0];
    if (!row) return null;
    const parts = await client.query('select player_id, seat from match_participants where match_id = $1 order by seat', [matchId]);
    return {
      match: {
        id: String(row.id),
        status: String(row.status) as MatchStatus,
        revision: num(row.revision),
        state: json<State>(row.state),
        turnDeadlineAt: numOrNull(row.turn_deadline_at),
        turnTimeoutMs: num(row.turn_timeout_ms ?? 86_400_000),
        turnStartRevision: num(row.turn_start_revision ?? 0),
      },
      live: rowToLive(row),
      participants: parts.rows.map((r) => ({ playerId: String(r.player_id), seat: num(r.seat) === 1 ? 1 : 0 })),
    };
  },
  async players(ids) {
    const sorted = [...new Set(ids)].sort();
    if (sorted.length === 0) return [];
    const { rows } = await client.query('select * from players where id = any($1::uuid[]) order by id for update', [sorted]);
    const byId = new Map(rows.map((r) => [String(r.id), rowToPlayer(r)]));
    return sorted.map((id) => byId.get(id) ?? defaultLivePlayer(id));
  },
  async challenge(id) {
    const { rows } = await client.query(`select ${CHALLENGE_COLUMNS} from live_challenges where id = $1 for update`, [id]);
    return rows[0] ? rowToChallenge(rows[0]) : null;
  },
  async pendingForMatch(matchId) {
    const { rows } = await client.query(
      `select ${CHALLENGE_COLUMNS} from live_challenges where match_id = $1 and status = 'pending'`,
      [matchId],
    );
    return rows.map(rowToChallenge);
  },
  async sentSince(matchId, from, since) {
    const { rows } = await client.query(
      `select ${CHALLENGE_COLUMNS} from live_challenges where match_id = $1 and from_player = $2 and created_at >= $3`,
      [matchId, from, since],
    );
    return rows.map(rowToChallenge);
  },
  async saveLive(live) {
    await client.query(LIVE_UPDATE, liveValues(live));
  },
  async saveClock(matchId, clock) {
    await client.query('update matches set turn_timeout_ms = $2, turn_deadline_at = $3 where id = $1', [
      matchId,
      clock.turnTimeoutMs,
      clock.turnDeadlineAt,
    ]);
  },
  async finishMatch(matchId, _playerId, result: OnlineGameResult, now) {
    await client.query(FINISH_MATCH, [matchId, JSON.stringify(result), now]);
  },
  async savePlayer(p) {
    await client.query(
      `update players set live_match_id = $2, live_challenges_enabled = $3, presence_status = $4,
         presence_at = $5, presence_match_id = $6 where id = $1`,
      [p.playerId, p.liveMatchId, p.challengesEnabled, p.presence, p.presenceAt, p.presenceMatchId],
    );
  },
  async insertChallenge(c) {
    await client.query(
      `insert into live_challenges (${CHALLENGE_COLUMNS}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      challengeValues(c),
    );
  },
  async saveChallenge(c) {
    await client.query(
      'update live_challenges set status = $2, responded_at = $3, new_match_id = $4 where id = $1',
      [c.id, c.status, c.respondedAt, c.newMatchId],
    );
  },
});

export const postgresLiveStore = (pool: PgPool): LiveStore => ({
  async transact(fn) {
    for (let attempt = 0; ; attempt++) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(makeTx(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        if (isRetryable(error) && attempt < 3) continue;
        throw error;
      } finally {
        client.release?.();
      }
    }
  },
  async player(playerId) {
    const { rows } = await pool.query('select * from players where id = $1', [playerId]);
    return rows[0] ? rowToPlayer(rows[0]) : defaultLivePlayer(playerId);
  },
  async liveOf(matchId) {
    const { rows } = await pool.query('select * from matches where id = $1', [matchId]);
    return rowToLive(rows[0] ?? { id: matchId });
  },
  async setPresence(playerId, status, matchId, now) {
    await pool.query('update players set presence_status = $2, presence_at = $3, presence_match_id = $4 where id = $1', [
      playerId,
      status,
      now,
      matchId,
    ]);
  },
  async setChallengesEnabled(playerId, enabled) {
    await pool.query('update players set live_challenges_enabled = $2 where id = $1', [playerId, enabled]);
  },
  async challengesInvolving(playerId, since) {
    const { rows } = await pool.query(
      `select ${CHALLENGE_COLUMNS} from live_challenges
        where (to_player = $1 and status = 'pending')
           or ((from_player = $1 or to_player = $1) and created_at >= $2)
        order by created_at desc limit 20`,
      [playerId, since],
    );
    return rows.map(rowToChallenge);
  },
  async dueMatchIds(now) {
    const { rows } = await pool.query(
      `select id from matches
        where (live_since is not null or live_tail_rev is not null or live_autoplay_rev is not null)
          and ((status = 'active' and turn_deadline_at is not null and turn_deadline_at < $1)
               or (status = 'finished' and live_since is not null))
        limit 200`,
      [now],
    );
    return rows.map((r) => String(r.id));
  },
  async needsTick(matchId, now) {
    const { rows } = await pool.query(
      `select 1 from matches where id = $1
          and (live_since is not null or live_tail_rev is not null or live_autoplay_rev is not null)
          and ((status = 'active' and turn_deadline_at is not null and turn_deadline_at < $2) or status = 'finished')`,
      [matchId, now],
    );
    return rows.length > 0;
  },
});
