// The Postgres adapter, driven by a recording fake pool. This verifies the transaction shape and
// the ordering of the atomic pipeline (lock → participant → idempotency → revision → write →
// commit, or rollback on any rejection). It does not prove the SQL runs on a real server — see
// docs/BACKEND.md for the required live database integration test.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/engine/index.js';
import type { Action, Player } from '../../src/engine/index.js';
import { postgresStorage } from '../src/storage/postgres.js';
import type { PgClient, PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';
import type { Decision, MatchRecord, MoveRecord } from '../src/storage/types.js';

type Call = { text: string; values: readonly unknown[] };

/** A scripted pool: rows are matched by a substring of the statement. */
const fakePool = () => {
  const calls: Call[] = [];
  const scripts: { match: string; rows: PgRow[] }[] = [];
  const clients: PgClient[] = [];
  let onQuery: ((text: string, values: readonly unknown[]) => PgQueryResult | undefined) | null = null;

  const respond = (text: string, values: readonly unknown[]): PgQueryResult => {
    calls.push({ text, values });
    const scripted = onQuery?.(text, values);
    if (scripted) return scripted;
    for (const script of scripts) if (text.includes(script.match)) return { rows: script.rows };
    return { rows: [] };
  };

  const client: PgClient = { query: async (text, values = []) => respond(text, values) };
  const pool: PgPool = {
    query: async (text, values = []) => respond(text, values),
    connect: async () => {
      clients.push(client);
      return client;
    },
  };
  return {
    pool,
    calls,
    clients,
    script: (match: string, rows: PgRow[]) => void scripts.push({ match, rows }),
    onQuery: (fn: (text: string, values: readonly unknown[]) => PgQueryResult | undefined) => void (onQuery = fn),
    statements: () => calls.map((c) => c.text.replace(/\s+/g, ' ').trim()),
  };
};

const matchRow = (overrides: PgRow = {}): PgRow => ({
  id: 'm1',
  invite_code: 'ABCDEFGH',
  rules_version: 'futasaku0.4-strength-draw',
  seed: '123456789',
  config: JSON.stringify(DEFAULT_CONFIG),
  starting_player: 0,
  status: 'active',
  revision: 3,
  state: JSON.stringify({ seed: 1, config: DEFAULT_CONFIG, board: {}, terrain: {}, hands: [[], []], deck: [], discard: [], turnPlayer: 0, actor: 0, phase: 'DRAW', drawnFromDiscard: null, fruitPlayed: 0, fruitKnown: [0, 0], strengthenUsed: [0, 0], finalTurn: null, rotPick: null, turnNumber: 1, result: null, lastResolution: null, sproutsThisTurn: 0 }),
  result: null,
  created_at: '1000',
  updated_at: '2000',
  finished_at: null,
  turn_deadline_at: null,
  turn_timeout_ms: '86400000',
  turn_start_revision: 0,
  turn_start_state: null,
  expires_at: null,
  ...overrides,
});

const moveRow = (requestId: string, seat: Player, revision = 4): PgRow => ({
  match_id: 'm1',
  revision,
  seat,
  player_id: 'p1',
  action: JSON.stringify({ t: 'EndAct' }),
  events: JSON.stringify([]),
  request_id: requestId,
  created_at: '3000',
});

const applyDecision = (code = 'ok'): Decision =>
  code === 'ok'
    ? {
        kind: 'apply',
        nextState: matchRow().state as never,
        events: [],
        action: { t: 'EndAct' } as Action,
        status: 'active',
        result: null,
        refreshDeadline: false,
        advanceTurnBoundary: false,
      }
    : { kind: 'reject', code, reason: `rejected: ${code}` };

const commit = (storage: ReturnType<typeof postgresStorage>, decide: () => Decision, requestId = 'r1') =>
  storage.commitMove({ matchId: 'm1', playerId: 'p1', expectedRevision: 3, requestId, now: 5_000, decide });

describe('postgres storage: reads map rows to records', () => {
  it('maps a match row, parsing jsonb and numeric strings', async () => {
    const fake = fakePool();
    fake.script('select * from matches where id', [matchRow()]);
    const storage = postgresStorage(fake.pool);
    const match = await storage.matchById('m1');
    expect(match).not.toBeNull();
    expect(match!.seed).toBe(123456789);
    expect(match!.revision).toBe(3);
    expect(match!.status).toBe('active');
    expect(match!.config).toBeInstanceOf(Object);
  });

  it('returns null when no row matches', async () => {
    const storage = postgresStorage(fakePool().pool);
    expect(await storage.matchById('missing')).toBeNull();
  });
});

describe('postgres storage: commitMove is atomic and idempotent', () => {
  it('locks the match, checks participant and revision, then inserts and commits', async () => {
    const fake = fakePool();
    fake.script('select * from matches where id', [matchRow()]);
    fake.script('from match_participants', [{ match_id: 'm1', player_id: 'p1', seat: 0, joined_at: '900' }]);
    const storage = postgresStorage(fake.pool);

    const result = await commit(storage, () => applyDecision());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replayed).toBe(false);
    expect(result.match.revision).toBe(4);

    const statements = fake.statements();
    expect(statements[0]).toBe('begin');
    expect(statements[1]).toContain('select * from matches where id = $1 for update');
    expect(statements.some((s) => s.includes('from match_participants'))).toBe(true);
    expect(statements.some((s) => s.includes('from match_moves where match_id = $1 and request_id = $2'))).toBe(true);
    expect(statements.some((s) => s.startsWith('insert into match_moves'))).toBe(true);
    expect(statements.some((s) => s.includes('update matches set') && s.includes('turn_deadline_at'))).toBe(true);
    expect(statements.at(-1)).toBe('commit');
    expect(statements).not.toContain('rollback');
  });

  it('returns the stored move for a repeated request id and never inserts again', async () => {
    const fake = fakePool();
    fake.script('select * from matches where id', [matchRow()]);
    fake.script('from match_participants', [{ match_id: 'm1', player_id: 'p1', seat: 0, joined_at: '900' }]);
    fake.script('from match_moves where match_id = $1 and request_id', [moveRow('same', 0)]);
    const storage = postgresStorage(fake.pool);

    const result = await commit(storage, () => applyDecision(), 'same');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replayed).toBe(true);
    expect(result.move.requestId).toBe('same');
    const statements = fake.statements();
    expect(statements.some((s) => s.startsWith('insert into match_moves'))).toBe(false);
    expect(statements).not.toContain('rollback');
  });

  it('rolls back a repeated request id that belongs to a different seat', async () => {
    const fake = fakePool();
    fake.script('select * from matches where id', [matchRow()]);
    fake.script('from match_participants', [{ match_id: 'm1', player_id: 'p1', seat: 0, joined_at: '900' }]);
    fake.script('from match_moves where match_id = $1 and request_id', [moveRow('other', 1)]);
    const result = await commit(postgresStorage(fake.pool), () => applyDecision(), 'other');
    expect(result).toMatchObject({ ok: false, code: 'REQUEST_ID_CONFLICT' });
    expect(fake.statements()).toContain('rollback');
  });

  it('rolls back when the caller is not a participant', async () => {
    const fake = fakePool();
    fake.script('select * from matches where id', [matchRow()]);
    // No participant row scripted → empty result.
    const result = await commit(postgresStorage(fake.pool), () => applyDecision());
    expect(result).toMatchObject({ ok: false, code: 'NOT_A_PARTICIPANT' });
    expect(fake.statements()).toContain('rollback');
    expect(fake.statements()).not.toContain('commit');
  });

  it('rolls back a stale revision without inserting', async () => {
    const fake = fakePool();
    fake.script('select * from matches where id', [matchRow()]);
    fake.script('from match_participants', [{ match_id: 'm1', player_id: 'p1', seat: 0, joined_at: '900' }]);
    const storage = postgresStorage(fake.pool);
    const result = await storage.commitMove({ matchId: 'm1', playerId: 'p1', expectedRevision: 2, requestId: 'r', now: 5_000, decide: () => applyDecision() });
    expect(result).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    expect(fake.statements()).not.toContain('commit');
    expect(fake.statements().some((s) => s.startsWith('insert into match_moves'))).toBe(false);
  });

  it('rolls back when the rules layer rejects the move', async () => {
    const fake = fakePool();
    fake.script('select * from matches where id', [matchRow()]);
    fake.script('from match_participants', [{ match_id: 'm1', player_id: 'p1', seat: 0, joined_at: '900' }]);
    const result = await commit(postgresStorage(fake.pool), () => applyDecision('NOT_YOUR_TURN'));
    expect(result).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(fake.statements()).toContain('rollback');
  });

  it('rolls back and rethrows when a statement fails', async () => {
    const fake = fakePool();
    fake.onQuery((text) => {
      if (text.includes('insert into match_moves')) throw new Error('boom');
      return undefined;
    });
    fake.script('select * from matches where id', [matchRow()]);
    fake.script('from match_participants', [{ match_id: 'm1', player_id: 'p1', seat: 0, joined_at: '900' }]);
    await expect(commit(postgresStorage(fake.pool), () => applyDecision())).rejects.toThrow('boom');
    expect(fake.statements()).toContain('rollback');
  });
});

describe('postgres storage: write paths', () => {
  it('reports a duplicate invite code instead of throwing', async () => {
    const fake = fakePool();
    fake.onQuery((text) => {
      if (text.startsWith('insert into matches')) {
        const error = new Error('duplicate key') as Error & { code: string };
        error.code = '23505';
        throw error;
      }
      return undefined;
    });
    const storage = postgresStorage(fake.pool);
    const record: MatchRecord = {
      id: 'm1',
      inviteCode: 'ABCDEFGH',
      rulesVersion: 'futasaku0.4-strength-draw',
      seed: 1,
      config: DEFAULT_CONFIG,
      startingPlayer: 0,
      status: 'waiting',
      revision: 0,
      state: matchRow().state as never,
      result: null,
      createdAt: 1,
      updatedAt: 1,
      finishedAt: null,
      turnDeadlineAt: null,
      turnTimeoutMs: 86_400_000,
      turnStartRevision: 0,
      turnStartState: null,
      expiresAt: null,
      openQueue: false,
    };
    expect(await storage.createMatch(record)).toMatchObject({ ok: false, code: 'DUPLICATE_INVITE_CODE' });
  });

  it('returns the updated row from activateMatch and falls back to a read', async () => {
    const fake = fakePool();
    fake.onQuery((text) =>
      text.includes("status = 'active'") && text.includes('turn_deadline_at') ? { rows: [matchRow({ status: 'active' })] } : undefined,
    );
    const storage = postgresStorage(fake.pool);
    const activated = await storage.activateMatch('m1', 123, 60_000);
    expect(activated?.status).toBe('active');

    const fake2 = fakePool();
    fake2.script('select * from matches where id', [matchRow({ status: 'active' })]);
    const storage2 = postgresStorage(fake2.pool);
    expect((await storage2.activateMatch('m1', 123, 60_000))?.status).toBe('active');
  });

  it('maps move rows back into records', async () => {
    const fake = fakePool();
    fake.script('from match_moves', [moveRow('r9', 1, 7)]);
    const storage = postgresStorage(fake.pool);
    const moves: MoveRecord[] = await storage.movesOf('m1', 0);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ revision: 7, seat: 1, requestId: 'r9' });
  });
});
