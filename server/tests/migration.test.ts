// The migration is a deliverable, so its security-critical properties are asserted here:
// authoritative state is never readable by a client role, the idempotency constraint exists, and
// the immutable match fields are present.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
const squashed = sql.replace(/\s+/g, ' ').toLowerCase();

describe('backend migration 0001_init.sql', () => {
  it('creates the five required tables', () => {
    for (const table of ['players', 'player_tokens', 'matches', 'match_participants', 'match_moves']) {
      expect(squashed).toContain(`create table if not exists ${table}`);
    }
  });

  it('enables row level security on every table and grants nothing to client roles', () => {
    for (const table of ['players', 'player_tokens', 'matches', 'match_participants', 'match_moves']) {
      expect(squashed).toContain(`alter table ${table} enable row level security`);
    }
    // The revoke is guarded so the migration also runs on a plain Postgres install.
    expect(squashed).toContain('revoke all on players, player_tokens, matches, match_participants, match_moves from');
    expect(squashed).toContain("'anon'");
    expect(squashed).toContain("'authenticated'");
    expect(squashed).toContain('from pg_roles where rolname = client_role');
    // No permissive policy is ever granted.
    expect(squashed).not.toContain('create policy');
  });

  it('stores tokens only as hashes, with a unique hash', () => {
    expect(squashed).toContain('token_hash text not null unique');
    expect(squashed).not.toMatch(/\btoken\s+text/);
  });

  it('records the immutable rules version, seed, config and starting seat', () => {
    expect(squashed).toContain('rules_version text not null');
    expect(squashed).toContain('seed bigint not null');
    expect(squashed).toContain('config jsonb not null');
    expect(squashed).toContain('starting_player smallint not null');
  });

  it('has a monotonic revision and the (match_id, request_id) idempotency key', () => {
    expect(squashed).toContain('revision integer not null default 0');
    expect(squashed).toContain('unique (match_id, request_id)');
    expect(squashed).toContain('primary key (match_id, revision)');
  });

  it('keeps one player per seat through a unique constraint', () => {
    expect(squashed).toContain('unique (match_id, seat)');
  });
});
