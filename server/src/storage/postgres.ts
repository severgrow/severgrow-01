// Postgres/Supabase storage adapter. It depends only on a tiny structural query interface, so it
// compiles without the `pg` package installed and `pg.Pool` satisfies it at runtime:
//
//   import pg from 'pg';
//   const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
//   const storage = postgresStorage(pool);
//
// Atomicity: `commitMove` takes `SELECT ... FOR UPDATE` on the match row for the whole
// check-and-write, so two concurrent submissions can never both advance the same revision, and a
// repeated request id returns the stored move without applying it again.
//
// Row Level Security: the migrations enable RLS with no anon/authenticated policies, so only the
// service role (the API server) can read authoritative state. This adapter must be given a
// service-role connection; never a client-side key.
import type { Action, Event, GameResult, Player, RulesConfig, State } from '../../../src/engine/index.js';
import type { MatchStatus } from '../protocol.js';
import type {
  CommitInput,
  CommitResult,
  Fail,
  MatchRecord,
  MoveRecord,
  Participant,
  PlayerRecord,
  Storage,
  TokenRecord,
} from './types.js';

export type PgRow = Record<string, unknown>;
export type PgQueryResult = { rows: PgRow[] };
export type PgClient = {
  query(text: string, values?: readonly unknown[]): Promise<PgQueryResult>;
  release?(): void;
};
export type PgPool = {
  query(text: string, values?: readonly unknown[]): Promise<PgQueryResult>;
  connect(): Promise<PgClient>;
};

const asString = (value: unknown): string => String(value);
const asNumber = (value: unknown): number => Number(value);
const asNullableString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const asNullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const asJson = <T>(value: unknown): T => (typeof value === 'string' ? (JSON.parse(value) as T) : (value as T));

const rowToPlayer = (row: PgRow): PlayerRecord => ({
  id: asString(row.id),
  kind: asString(row.kind) === 'account' ? 'account' : 'guest',
  displayName: asNullableString(row.display_name),
  createdAt: asNumber(row.created_at),
  upgradedAt: asNullableNumber(row.upgraded_at),
});

const rowToMatch = (row: PgRow): MatchRecord => ({
  id: asString(row.id),
  inviteCode: asString(row.invite_code),
  rulesVersion: asString(row.rules_version),
  seed: asNumber(row.seed),
  config: asJson<RulesConfig>(row.config),
  startingPlayer: asNumber(row.starting_player) === 1 ? 1 : 0,
  status: asString(row.status) as MatchStatus,
  revision: asNumber(row.revision),
  state: asJson<State>(row.state),
  result: row.result === null || row.result === undefined ? null : asJson<GameResult>(row.result),
  createdAt: asNumber(row.created_at),
  updatedAt: asNumber(row.updated_at),
  finishedAt: asNullableNumber(row.finished_at),
});

const rowToParticipant = (row: PgRow): Participant => ({
  matchId: asString(row.match_id),
  playerId: asString(row.player_id),
  seat: asNumber(row.seat) === 1 ? 1 : 0,
  joinedAt: asNumber(row.joined_at),
});

const rowToMove = (row: PgRow): MoveRecord => ({
  matchId: asString(row.match_id),
  revision: asNumber(row.revision),
  seat: asNumber(row.seat) === 1 ? 1 : 0,
  playerId: asString(row.player_id),
  action: asJson<Action>(row.action),
  events: asJson<Event[]>(row.events),
  requestId: asString(row.request_id),
  createdAt: asNumber(row.created_at),
});

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';

export const postgresStorage = (pool: PgPool): Storage => ({
  async createPlayer(player: PlayerRecord): Promise<void> {
    await pool.query(
      'insert into players (id, kind, display_name, created_at, upgraded_at) values ($1,$2,$3,$4,$5)',
      [player.id, player.kind, player.displayName, player.createdAt, player.upgradedAt],
    );
  },

  async playerById(id: string): Promise<PlayerRecord | null> {
    const { rows } = await pool.query('select * from players where id = $1', [id]);
    return rows[0] ? rowToPlayer(rows[0]) : null;
  },

  async updatePlayer(player: PlayerRecord): Promise<void> {
    await pool.query('update players set kind = $2, display_name = $3, upgraded_at = $4 where id = $1', [
      player.id,
      player.kind,
      player.displayName,
      player.upgradedAt,
    ]);
  },

  async issueToken(token: TokenRecord): Promise<void> {
    await pool.query('insert into player_tokens (id, player_id, token_hash, created_at, revoked_at) values ($1,$2,$3,$4,$5)', [
      token.id,
      token.playerId,
      token.tokenHash,
      token.createdAt,
      token.revokedAt,
    ]);
  },

  async playerByTokenHash(tokenHash: string): Promise<PlayerRecord | null> {
    const { rows } = await pool.query(
      'select p.* from player_tokens t join players p on p.id = t.player_id where t.token_hash = $1 and t.revoked_at is null',
      [tokenHash],
    );
    return rows[0] ? rowToPlayer(rows[0]) : null;
  },

  async createMatch(match: MatchRecord): Promise<{ ok: true } | Fail> {
    try {
      await pool.query(
        `insert into matches
           (id, invite_code, rules_version, seed, config, starting_player, status, revision, state, result, created_at, updated_at, finished_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          match.id,
          match.inviteCode,
          match.rulesVersion,
          match.seed,
          JSON.stringify(match.config),
          match.startingPlayer,
          match.status,
          match.revision,
          JSON.stringify(match.state),
          match.result === null ? null : JSON.stringify(match.result),
          match.createdAt,
          match.updatedAt,
          match.finishedAt,
        ],
      );
      return { ok: true };
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, code: 'DUPLICATE_INVITE_CODE', reason: 'Invite code already exists.' };
      throw error;
    }
  },

  async matchById(id: string): Promise<MatchRecord | null> {
    const { rows } = await pool.query('select * from matches where id = $1', [id]);
    return rows[0] ? rowToMatch(rows[0]) : null;
  },

  async matchByInviteCode(code: string): Promise<MatchRecord | null> {
    const { rows } = await pool.query('select * from matches where invite_code = $1', [code]);
    return rows[0] ? rowToMatch(rows[0]) : null;
  },

  async matchesOfPlayer(playerId: string): Promise<MatchRecord[]> {
    const { rows } = await pool.query(
      'select m.* from matches m join match_participants p on p.match_id = m.id where p.player_id = $1',
      [playerId],
    );
    return rows.map(rowToMatch);
  },

  async addParticipant(participant: Participant): Promise<{ ok: true } | Fail> {
    try {
      await pool.query('insert into match_participants (match_id, player_id, seat, joined_at) values ($1,$2,$3,$4)', [
        participant.matchId,
        participant.playerId,
        participant.seat,
        participant.joinedAt,
      ]);
      return { ok: true };
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, code: 'SEAT_TAKEN', reason: 'That seat is taken.' };
      throw error;
    }
  },

  async participantsOf(matchId: string): Promise<Participant[]> {
    const { rows } = await pool.query('select * from match_participants where match_id = $1 order by seat asc', [matchId]);
    return rows.map(rowToParticipant);
  },

  async activateMatch(matchId: string, now: number): Promise<MatchRecord | null> {
    const { rows } = await pool.query(
      "update matches set status = 'active', updated_at = $2 where id = $1 and status = 'waiting' returning *",
      [matchId, now],
    );
    if (rows[0]) return rowToMatch(rows[0]);
    // Already active (or finished): return the current row unchanged.
    return this.matchById(matchId);
  },

  async participantOf(matchId: string, playerId: string): Promise<Participant | null> {
    const { rows } = await pool.query('select * from match_participants where match_id = $1 and player_id = $2', [matchId, playerId]);
    return rows[0] ? rowToParticipant(rows[0]) : null;
  },

  async movesOf(matchId: string, sinceRevision: number): Promise<MoveRecord[]> {
    const { rows } = await pool.query('select * from match_moves where match_id = $1 and revision > $2 order by revision asc', [
      matchId,
      sinceRevision,
    ]);
    return rows.map(rowToMove);
  },

  async commitMove(input: CommitInput): Promise<CommitResult> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const locked = await client.query('select * from matches where id = $1 for update', [input.matchId]);
      const matchRow = locked.rows[0];
      if (!matchRow) return await rollback(client, { ok: false, code: 'MATCH_NOT_FOUND', reason: 'Unknown match.' });
      const match = rowToMatch(matchRow);

      const seatRow = await client.query('select * from match_participants where match_id = $1 and player_id = $2', [input.matchId, input.playerId]);
      if (!seatRow.rows[0]) return await rollback(client, { ok: false, code: 'NOT_A_PARTICIPANT', reason: 'You are not in this match.' });
      const seat: Player = asNumber(seatRow.rows[0].seat) === 1 ? 1 : 0;

      const priorRow = await client.query('select * from match_moves where match_id = $1 and request_id = $2', [input.matchId, input.requestId]);
      if (priorRow.rows[0]) {
        const prior = rowToMove(priorRow.rows[0]);
        if (prior.seat !== seat) return await rollback(client, { ok: false, code: 'REQUEST_ID_CONFLICT', reason: 'That request id belongs to another move.' });
        await client.query('commit');
        return { ok: true, replayed: true, match, move: prior };
      }

      if (match.revision !== input.expectedRevision) {
        return await rollback(client, {
          ok: false,
          code: 'STALE_REVISION',
          reason: `Expected revision ${input.expectedRevision}, current is ${match.revision}.`,
        });
      }

      const decision = input.decide({ match, seat });
      if (decision.kind === 'reject') return await rollback(client, { ok: false, code: decision.code, reason: decision.reason });

      const revision = match.revision + 1;
      await client.query(
        'insert into match_moves (match_id, revision, seat, player_id, action, events, request_id, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [input.matchId, revision, seat, input.playerId, JSON.stringify(decision.action), JSON.stringify(decision.events), input.requestId, input.now],
      );
      const finishedAt = decision.status === 'finished' ? input.now : match.finishedAt;
      await client.query('update matches set state = $2, revision = $3, status = $4, result = $5, updated_at = $6, finished_at = $7 where id = $1', [
        input.matchId,
        JSON.stringify(decision.nextState),
        revision,
        decision.status,
        decision.result === null ? null : JSON.stringify(decision.result),
        input.now,
        finishedAt,
      ]);
      await client.query('commit');

      const move: MoveRecord = {
        matchId: input.matchId,
        revision,
        seat,
        playerId: input.playerId,
        action: decision.action,
        events: decision.events,
        requestId: input.requestId,
        createdAt: input.now,
      };
      const next: MatchRecord = {
        ...match,
        revision,
        state: decision.nextState,
        status: decision.status,
        result: decision.result,
        updatedAt: input.now,
        finishedAt,
      };
      return { ok: true, replayed: false, match: next, move };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release?.();
    }
  },
});

const rollback = async <T extends Fail>(client: PgClient, fail: T): Promise<T> => {
  await client.query('rollback');
  return fail;
};
