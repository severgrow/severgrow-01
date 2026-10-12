// The migration runner. Driven by a recording fake pool and a temporary migrations directory, so
// the versioning rules are proven without a database:
//   * applied in filename order, each in its own transaction;
//   * re-running applies nothing (already-applied are skipped);
//   * an applied migration whose contents changed is refused, never silently skipped;
//   * a failure rolls back and records nothing;
//   * --dry-run lists pending without writing.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMigrations, migrate } from '../scripts/migrate.js';
import type { PgClient, PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';

type Call = { text: string; values: readonly unknown[] };

/** A recording fake pool: `schema_migrations` reads come from `applied`, everything is logged. */
const fakePool = (applied: PgRow[] = []) => {
  const calls: Call[] = [];
  const clients: PgClient[] = [];
  let failOn: RegExp | null = null;

  const respond = (text: string, values: readonly unknown[]): PgQueryResult => {
    calls.push({ text, values });
    if (failOn?.test(text)) {
      const error = new Error('simulated failure') as Error & { code: string };
      error.code = '42P01';
      throw error;
    }
    if (text.includes('select version, checksum from schema_migrations')) return { rows: applied };
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
    statements: () => calls.map((c) => c.text.replace(/\s+/g, ' ').trim()),
    inserts: () => calls.filter((c) => c.text.startsWith('insert into schema_migrations')),
    failOn: (re: RegExp | null) => void (failOn = re),
  };
};

const dirs: string[] = [];
const migrationsDir = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'futasaku-mig-'));
  dirs.push(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
};

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('loadMigrations', () => {
  it('reads *.sql in filename order and ignores anything else', () => {
    const dir = migrationsDir({
      '0002_second.sql': 'select 2;',
      '0001_first.sql': 'select 1;',
      'notes.txt': 'ignore me',
      'no_number.sql': 'ignore me too',
    });
    const migrations = loadMigrations(dir);
    expect(migrations.map((m) => m.version)).toEqual(['0001_first.sql', '0002_second.sql']);
    expect(migrations[0]!.checksum).toHaveLength(64);
    // Checksums are content-based and stable.
    expect(loadMigrations(dir).map((m) => m.checksum)).toEqual(migrations.map((m) => m.checksum));
  });

  it('finds the real migrations folder', () => {
    expect(loadMigrations().map((m) => m.version)).toContain('0001_init.sql');
  });
});

describe('migrate', () => {
  it('applies pending migrations in order, each in its own transaction, and records a checksum', async () => {
    const dir = migrationsDir({ '0001_a.sql': 'create table a();', '0002_b.sql': 'create table b();' });
    const fake = fakePool();
    const result = await migrate(fake.pool, () => 1_700_000_000_000, false, dir);

    expect(result.applied).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(result.skipped).toEqual([]);
    expect(result.pending).toEqual([]);

    const statements = fake.statements();
    expect(statements[0]).toContain('create table if not exists schema_migrations');
    // One transaction per migration.
    expect(statements.filter((s) => s === 'begin')).toHaveLength(2);
    expect(statements.filter((s) => s === 'commit')).toHaveLength(2);
    expect(statements).not.toContain('rollback');
    // The migration SQL itself ran between begin and commit.
    expect(statements).toContain('create table a();');

    // version + checksum + the injected timestamp are recorded.
    const inserts = fake.inserts();
    expect(inserts).toHaveLength(2);
    expect(inserts[0]!.values[0]).toBe('0001_a.sql');
    expect(String(inserts[0]!.values[1])).toHaveLength(64);
    expect(inserts[0]!.values[2]).toBe(1_700_000_000_000);
  });

  it('skips migrations that are already applied (idempotent re-run)', async () => {
    const dir = migrationsDir({ '0001_a.sql': 'create table a();' });
    const first = fakePool();
    await migrate(first.pool, () => 1, false, dir);
    const recordedChecksum = String(first.inserts()[0]!.values[1]);

    const second = fakePool([{ version: '0001_a.sql', checksum: recordedChecksum }]);
    const result = await migrate(second.pool, () => 2, false, dir);
    expect(result).toEqual({ applied: [], skipped: ['0001_a.sql'], pending: [] });
    expect(second.statements()).not.toContain('begin');
    expect(second.inserts()).toHaveLength(0);
  });

  it('refuses an applied migration whose contents changed', async () => {
    const dir = migrationsDir({ '0001_a.sql': 'create table a();' });
    const stale = fakePool([{ version: '0001_a.sql', checksum: 'a'.repeat(64) }]);
    await expect(migrate(stale.pool, () => 3, false, dir)).rejects.toThrow(/contents changed/);
    expect(stale.statements()).not.toContain('begin');
  });

  it('rolls back and records nothing when a migration fails', async () => {
    const dir = migrationsDir({ '0001_a.sql': 'create table a();', '0002_b.sql': 'create table b();' });
    const fake = fakePool();
    fake.failOn(/create table b\(\)/);
    await expect(migrate(fake.pool, () => 4, false, dir)).rejects.toThrow(/failed and was rolled back/);

    const statements = fake.statements();
    expect(statements).toContain('rollback');
    // Only migration 1 was recorded; migration 2 was not.
    expect(fake.inserts().map((c) => c.values[0])).toEqual(['0001_a.sql']);
  });

  it('lists pending migrations on a dry run without writing', async () => {
    const dir = migrationsDir({ '0001_a.sql': 'create table a();', '0002_b.sql': 'create table b();' });
    const fake = fakePool();
    const result = await migrate(fake.pool, () => 5, true, dir);
    expect(result.pending).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(result.applied).toEqual([]);
    const statements = fake.statements();
    expect(statements).not.toContain('begin');
    expect(statements).not.toContain('create table a();');
    expect(fake.inserts()).toHaveLength(0);
  });

  it('turns on RLS and revokes the Supabase client roles for its own bookkeeping table', async () => {
    const dir = migrationsDir({ '0001_a.sql': 'select 1;' });
    const fake = fakePool();
    await migrate(fake.pool, () => 6, false, dir);
    const statements = fake.statements();
    expect(statements.some((s) => s.includes('alter table schema_migrations enable row level security'))).toBe(true);
    expect(statements.some((s) => s.includes("array['anon', 'authenticated']"))).toBe(true);
    expect(statements.some((s) => s.includes('revoke all on schema_migrations from %I'))).toBe(true);
  });
});
