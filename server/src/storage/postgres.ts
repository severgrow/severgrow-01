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
import type { Action, Event, Player, RulesConfig, State } from '../../../src/engine/index.js';
import { scores } from '../../../src/engine/index.js';
import type { MatchStatus, OnlineGameResult } from '../protocol.js';
import type {
  CommitBatchInput,
  CommitInput,
  CommitResult,
  Decision,
  DeviceLinkCode,
  Fail,
  MatchListRow,
  MatchRecord,
  MoveRecord,
  Participant,
  PlayerRecord,
  Storage,
  SweepResult,
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

const copy = <T>(value: T): T => structuredClone(value);

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
  result: row.result === null || row.result === undefined ? null : asJson<OnlineGameResult>(row.result),
  createdAt: asNumber(row.created_at),
  updatedAt: asNumber(row.updated_at),
  finishedAt: asNullableNumber(row.finished_at),
  turnDeadlineAt: asNullableNumber(row.turn_deadline_at),
  turnTimeoutMs: asNumber(row.turn_timeout_ms ?? 86_400_000),
  turnStartRevision: asNumber(row.turn_start_revision ?? 0),
  turnStartState:
    row.turn_start_state === null || row.turn_start_state === undefined ? null : asJson<State>(row.turn_start_state),
  expiresAt: asNullableNumber(row.expires_at),
});

const rowToParticipant = (row: PgRow): Participant => ({
  matchId: asString(row.match_id),
  playerId: asString(row.player_id),
  seat: asNumber(row.seat) === 1 ? 1 : 0,
  joinedAt: asNumber(row.joined_at),
  lastSeenAt: asNumber(row.last_seen_at ?? row.joined_at ?? 0),
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

const timeoutResult = (match: MatchRecord): OnlineGameResult => {
  const actor = match.state.actor;
  const winner: Player = actor === 0 ? 1 : 0;
  return { winner, reason: 'timeout', scores: scores(match.state) };
};

const finishTimeout = (match: MatchRecord, now: number): MatchRecord => ({
  ...match,
  status: 'finished',
  result: timeoutResult(match),
  turnDeadlineAt: null,
  expiresAt: null,
  turnStartState: copy(match.state),
  turnStartRevision: match.revision,
  updatedAt: now,
  finishedAt: now,
});

const finishExpiredWaiting = (match: MatchRecord, now: number): MatchRecord => ({
  ...match,
  status: 'finished',
  result: null,
  turnDeadlineAt: null,
  expiresAt: null,
  updatedAt: now,
  finishedAt: now,
});

const expiryDecision = (match: MatchRecord, now: number): MatchRecord => {
  if (match.status === 'active' && match.turnDeadlineAt !== null && now > match.turnDeadlineAt) {
    return finishTimeout(match, now);
  }
  if (match.status === 'waiting' && match.expiresAt !== null && now > match.expiresAt) {
    return finishExpiredWaiting(match, now);
  }
  return match;
};

const persistMatch = async (client: PgClient, match: MatchRecord): Promise<void> => {
  await client.query(
    `update matches set
       state = $2,
       revision = $3,
       status = $4,
       result = $5,
       updated_at = $6,
       finished_at = $7,
       turn_deadline_at = $8,
       turn_timeout_ms = $9,
       turn_start_revision = $10,
       turn_start_state = $11,
       expires_at = $12
     where id = $1`,
    [
      match.id,
      JSON.stringify(match.state),
      match.revision,
      match.status,
      match.result === null ? null : JSON.stringify(match.result),
      match.updatedAt,
      match.finishedAt,
      match.turnDeadlineAt,
      match.turnTimeoutMs,
      match.turnStartRevision,
      match.turnStartState === null ? null : JSON.stringify(match.turnStartState),
      match.expiresAt,
    ],
  );
};

const rollback = async <T extends Fail>(client: PgClient, fail: T): Promise<T> => {
  await client.query('rollback');
  return fail;
};

const applyExpiryOnLockedRow = async (
  client: PgClient,
  match: MatchRecord,
  now: number,
): Promise<{ match: MatchRecord; updated: boolean }> => {
  const next = expiryDecision(match, now);
  if (next.status === match.status && next.revision === match.revision && next.finishedAt === match.finishedAt) {
    return { match, updated: false };
  }
  await persistMatch(client, next);
  return { match: next, updated: true };
};

const endCommitTx = async <T>(client: PgClient, expiryUpdated: boolean, outcome: T): Promise<T> => {
  await client.query(expiryUpdated ? 'commit' : 'rollback');
  return outcome;
};

const runCommit = async (client: PgClient, input: {
  matchId: string;
  playerId: string;
  expectedRevision: number;
  requestId: string;
  now: number;
  batch: boolean;
  steps: number;
  decideAt: (match: MatchRecord, seat: Player, index: number) => Decision;
}): Promise<CommitResult> => {
  const locked = await client.query('select * from matches where id = $1 for update', [input.matchId]);
  const matchRow = locked.rows[0];
  if (!matchRow) return await rollback(client, { ok: false, code: 'MATCH_NOT_FOUND', reason: 'Unknown match.' });

  let match = rowToMatch(matchRow);
  const expiry = await applyExpiryOnLockedRow(client, match, input.now);
  match = expiry.match;
  let expiryUpdated = expiry.updated;

  if (match.status === 'finished' && match.result?.reason === 'timeout') {
    return await endCommitTx(client, true, { ok: false, code: 'TIMED_OUT', reason: 'This turn timed out.' });
  }
  if (match.status === 'finished') {
    return await endCommitTx(client, expiryUpdated, { ok: false, code: 'MATCH_FINISHED', reason: 'This match is over.' });
  }
  if (match.status === 'waiting') {
    return await endCommitTx(client, expiryUpdated, { ok: false, code: 'MATCH_NOT_ACTIVE', reason: 'Waiting for an opponent to join.' });
  }

  const seatRow = await client.query('select * from match_participants where match_id = $1 and player_id = $2', [
    input.matchId,
    input.playerId,
  ]);
  if (!seatRow.rows[0]) {
    return await endCommitTx(client, expiryUpdated, { ok: false, code: 'NOT_A_PARTICIPANT', reason: 'You are not in this match.' });
  }
  const seat: Player = asNumber(seatRow.rows[0].seat) === 1 ? 1 : 0;

  const priorKey = input.batch ? `${input.requestId}#0` : input.requestId;
  const priorRow = await client.query('select * from match_moves where match_id = $1 and request_id = $2', [input.matchId, priorKey]);
  if (priorRow.rows[0]) {
    const prior = rowToMove(priorRow.rows[0]);
    if (prior.seat !== seat) {
      return await endCommitTx(client, expiryUpdated, {
        ok: false,
        code: 'REQUEST_ID_CONFLICT',
        reason: 'That request id belongs to another move.',
      });
    }
    const batchRows = input.batch
      ? (
          await client.query(
            'select * from match_moves where match_id = $1 and request_id like $2 order by revision asc',
            [input.matchId, `${input.requestId}#%`],
          )
        ).rows
      : [priorRow.rows[0]];
    const batchMoves = batchRows.map(rowToMove);
    const last = batchMoves[batchMoves.length - 1]!;
    await client.query('commit');
    return { ok: true, replayed: true, match: copy(match), move: copy(last), moves: copy(batchMoves) };
  }

  const conflictRows = await client.query(
    'select * from match_moves where match_id = $1 and (request_id = $2 or request_id like $3)',
    [input.matchId, input.requestId, `${input.requestId}#%`],
  );
  for (const row of conflictRows.rows) {
    const move = rowToMove(row);
    if (move.seat !== seat) {
      return await endCommitTx(client, expiryUpdated, {
        ok: false,
        code: 'REQUEST_ID_CONFLICT',
        reason: 'That request id belongs to another move.',
      });
    }
  }

  if (match.revision !== input.expectedRevision) {
    return await endCommitTx(client, expiryUpdated, {
      ok: false,
      code: 'STALE_REVISION',
      reason: `Expected revision ${input.expectedRevision}, current is ${match.revision}.`,
    });
  }

  const applied: MoveRecord[] = [];
  let current = match;

  for (let i = 0; i < input.steps; i++) {
    const decision = input.decideAt(copy(current), seat, i);
    if (decision.kind === 'reject') {
      return await endCommitTx(client, expiryUpdated, { ok: false, code: decision.code, reason: decision.reason });
    }

    const revision = current.revision + 1;
    const requestId = input.batch ? `${input.requestId}#${i}` : input.requestId;
    applied.push({
      matchId: input.matchId,
      revision,
      seat,
      playerId: input.playerId,
      action: decision.action,
      events: decision.events,
      requestId,
      createdAt: input.now,
    });

    let turnDeadlineAt = current.turnDeadlineAt;
    let turnStartRevision = current.turnStartRevision;
    let turnStartState = current.turnStartState;
    if (decision.status === 'finished') {
      turnDeadlineAt = null;
      turnStartRevision = revision;
      turnStartState = copy(decision.nextState);
    } else {
      if (decision.advanceTurnBoundary) {
        turnStartRevision = revision;
        turnStartState = copy(decision.nextState);
      }
      if (decision.refreshDeadline) {
        turnDeadlineAt = input.now + current.turnTimeoutMs;
      }
    }

    current = {
      ...current,
      revision,
      state: decision.nextState,
      status: decision.status,
      result: decision.result,
      updatedAt: input.now,
      finishedAt: decision.status === 'finished' ? input.now : current.finishedAt,
      turnDeadlineAt,
      turnStartRevision,
      turnStartState,
    };
  }

  for (const move of applied) {
    await client.query(
      'insert into match_moves (match_id, revision, seat, player_id, action, events, request_id, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        move.matchId,
        move.revision,
        move.seat,
        move.playerId,
        JSON.stringify(move.action),
        JSON.stringify(move.events),
        move.requestId,
        move.createdAt,
      ],
    );
  }

  await persistMatch(client, current);
  await client.query('commit');

  const last = applied[applied.length - 1]!;
  return { ok: true, replayed: false, match: copy(current), move: copy(last), moves: copy(applied) };
};

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
           (id, invite_code, rules_version, seed, config, starting_player, status, revision, state, result,
            created_at, updated_at, finished_at, turn_deadline_at, turn_timeout_ms, turn_start_revision, turn_start_state, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
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
          match.turnDeadlineAt,
          match.turnTimeoutMs,
          match.turnStartRevision,
          match.turnStartState === null ? null : JSON.stringify(match.turnStartState),
          match.expiresAt,
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

  async listMatchesForPlayer(playerId: string): Promise<MatchListRow[]> {
    const { rows } = await pool.query(
      `select m.*,
              self.seat as my_seat,
              self.last_seen_at as my_last_seen_at,
              opp.player_id as opponent_id,
              opp_p.display_name as opponent_name
         from match_participants self
         join matches m on m.id = self.match_id
         left join match_participants opp on opp.match_id = self.match_id and opp.player_id <> self.player_id
         left join players opp_p on opp_p.id = opp.player_id
        where self.player_id = $1`,
      [playerId],
    );
    return rows.map((row) => ({
      match: rowToMatch(row),
      mySeat: asNumber(row.my_seat) === 1 ? 1 : 0,
      lastSeenAt: asNumber(row.my_last_seen_at),
      opponentId: asNullableString(row.opponent_id),
      opponentName: asNullableString(row.opponent_name),
    }));
  },

  async addParticipant(participant: Participant): Promise<{ ok: true } | Fail> {
    const { rows } = await pool.query('select player_id, seat from match_participants where match_id = $1', [participant.matchId]);
    if (rows.some((r) => asString(r.player_id) === participant.playerId)) {
      return { ok: false, code: 'ALREADY_JOINED', reason: 'Already in this match.' };
    }
    if (rows.some((r) => (asNumber(r.seat) === 1 ? 1 : 0) === participant.seat)) {
      return { ok: false, code: 'SEAT_TAKEN', reason: 'That seat is taken.' };
    }
    if (rows.length >= 2) return { ok: false, code: 'MATCH_FULL', reason: 'This match is full.' };
    try {
      await pool.query(
        'insert into match_participants (match_id, player_id, seat, joined_at, last_seen_at) values ($1,$2,$3,$4,$5)',
        [participant.matchId, participant.playerId, participant.seat, participant.joinedAt, participant.lastSeenAt],
      );
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

  async activateMatch(matchId: string, now: number, turnTimeoutMs: number): Promise<MatchRecord | null> {
    const deadline = now + turnTimeoutMs;
    const { rows } = await pool.query(
      `update matches set
         status = 'active',
         updated_at = $2,
         turn_timeout_ms = $3,
         turn_deadline_at = $4,
         turn_start_revision = revision,
         turn_start_state = state,
         expires_at = null
       where id = $1 and status = 'waiting'
       returning *`,
      [matchId, now, turnTimeoutMs, deadline],
    );
    if (rows[0]) return rowToMatch(rows[0]);
    return this.matchById(matchId);
  },

  async participantOf(matchId: string, playerId: string): Promise<Participant | null> {
    const { rows } = await pool.query('select * from match_participants where match_id = $1 and player_id = $2', [matchId, playerId]);
    return rows[0] ? rowToParticipant(rows[0]) : null;
  },

  async touchParticipant(matchId: string, playerId: string, now: number): Promise<void> {
    await pool.query('update match_participants set last_seen_at = $3 where match_id = $1 and player_id = $2', [matchId, playerId, now]);
  },

  async ping(): Promise<void> {
    await pool.query('select 1 as ok');
  },

  async movesOf(matchId: string, sinceRevision: number): Promise<MoveRecord[]> {
    const { rows } = await pool.query('select * from match_moves where match_id = $1 and revision > $2 order by revision asc', [
      matchId,
      sinceRevision,
    ]);
    return rows.map(rowToMove);
  },

  async applyExpiry(matchId: string, now: number): Promise<MatchRecord | null> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const locked = await client.query('select * from matches where id = $1 for update', [matchId]);
      if (!locked.rows[0]) {
        await client.query('rollback');
        return null;
      }
      const { match } = await applyExpiryOnLockedRow(client, rowToMatch(locked.rows[0]), now);
      await client.query('commit');
      return copy(match);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release?.();
    }
  },

  async resignMatch(matchId: string, playerId: string, now: number, result: OnlineGameResult): Promise<MatchRecord | null> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const locked = await client.query('select * from matches where id = $1 for update', [matchId]);
      if (!locked.rows[0]) {
        await client.query('rollback');
        return null;
      }
      const participant = await client.query('select 1 from match_participants where match_id = $1 and player_id = $2', [matchId, playerId]);
      if (!participant.rows[0]) {
        await client.query('rollback');
        return null;
      }
      let match = rowToMatch(locked.rows[0]);
      if (match.status === 'finished') {
        await client.query('commit');
        return copy(match);
      }
      const next: MatchRecord = {
        ...match,
        status: 'finished',
        result,
        turnDeadlineAt: null,
        expiresAt: null,
        turnStartState: copy(match.state),
        turnStartRevision: match.revision,
        updatedAt: now,
        finishedAt: now,
      };
      await persistMatch(client, next);
      await client.query('commit');
      return copy(next);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release?.();
    }
  },

  async sweep(now: number, guestMaxAgeMs: number): Promise<SweepResult> {
    let timedOut = 0;
    let expiredWaiting = 0;
    const { rows: expiring } = await pool.query(
      `select * from matches
        where (status = 'active' and turn_deadline_at is not null and turn_deadline_at < $1)
           or (status = 'waiting' and expires_at is not null and expires_at < $1)`,
      [now],
    );
    for (const row of expiring) {
      const match = rowToMatch(row);
      const wasActive = match.status === 'active';
      const next = expiryDecision(match, now);
      if (next.status === match.status && next.finishedAt === match.finishedAt) continue;
      await persistMatch(pool, next);
      if (wasActive) timedOut += 1;
      else expiredWaiting += 1;
    }

    let deletedGuests = 0;
    const cutoff = now - guestMaxAgeMs;
    const { rows: guests } = await pool.query(
      "select id from players p where p.kind = 'guest' and p.created_at < $1 and not exists (select 1 from match_participants mp where mp.player_id = p.id)",
      [cutoff],
    );
    for (const row of guests) {
      await pool.query('delete from players where id = $1', [asString(row.id)]);
      deletedGuests += 1;
    }
    return { timedOut, expiredWaiting, deletedGuests };
  },

  async hitRateLimit(bucket: string, windowStart: number, max: number): Promise<{ ok: boolean; count: number }> {
    const { rows } = await pool.query(
      `insert into rate_limits (bucket, window_start, count) values ($1, $2, 1)
       on conflict (bucket, window_start) do update set count = rate_limits.count + 1
       returning count`,
      [bucket, windowStart],
    );
    const count = asNumber(rows[0]?.count ?? 1);
    return { ok: count <= max, count };
  },

  async createLinkCode(code: DeviceLinkCode): Promise<void> {
    await pool.query('insert into device_link_codes (id, code_hash, player_id, created_at, expires_at, used_at) values ($1,$2,$3,$4,$5,$6)', [
      code.id,
      code.codeHash,
      code.playerId,
      code.createdAt,
      code.expiresAt,
      code.usedAt,
    ]);
  },

  async redeemLinkCode(codeHash: string, now: number): Promise<{ playerId: string } | null> {
    const { rows } = await pool.query(
      'update device_link_codes set used_at = $2 where code_hash = $1 and used_at is null and expires_at > $2 returning player_id',
      [codeHash, now],
    );
    if (!rows[0]) return null;
    return { playerId: asString(rows[0].player_id) };
  },

  async commitMove(input: CommitInput): Promise<CommitResult> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      return await runCommit(client, {
        matchId: input.matchId,
        playerId: input.playerId,
        expectedRevision: input.expectedRevision,
        requestId: input.requestId,
        now: input.now,
        batch: false,
        steps: 1,
        decideAt: (match, seat) => input.decide({ match, seat }),
      });
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release?.();
    }
  },

  async commitBatch(input: CommitBatchInput): Promise<CommitResult> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      return await runCommit(client, {
        matchId: input.matchId,
        playerId: input.playerId,
        expectedRevision: input.expectedRevision,
        requestId: input.requestId,
        now: input.now,
        batch: true,
        steps: input.actions.length,
        decideAt: (match, seat, index) => input.decideOne({ match, seat, action: input.actions[index]! }),
      });
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release?.();
    }
  },
});
