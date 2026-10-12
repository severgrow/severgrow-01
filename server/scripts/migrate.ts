// Applies the version-controlled SQL in server/migrations to the configured database, in order,
// exactly once, and records what it applied.
//
//   npm run server:migrate                    # reads DATABASE_URL (or .env)
//   npm run server:migrate -- --status        # show applied/pending without changing anything
//   npm run server:migrate -- --dry-run       # list what would run
//
// Guarantees:
//   * Each migration runs inside its own transaction: it either fully applies and is recorded, or
//     it rolls back and nothing is recorded.
//   * `schema_migrations` stores a checksum. A migration that was applied and has since changed is
//     refused (never silently skipped) — so an edited historical migration is caught immediately.
//   * Safe to re-run: already-applied migrations are skipped.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PgClient } from '../src/storage/postgres.js';
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from '../src/storage/pg-pool.js';
import type { PgPool } from '../src/storage/postgres.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TABLE = 'schema_migrations';

type Migration = { version: string; sql: string; checksum: string };

export const loadMigrations = (dir = MIGRATIONS_DIR): Migration[] => {
  const files = readdirSync(dir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));
  return files.map((version) => {
    const sql = readFileSync(join(dir, version), 'utf8');
    return { version, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
};

const ensureTable = async (client: PgClient | PgPool): Promise<void> => {
  await client.query(
    `create table if not exists ${TABLE} (
       version text primary key,
       checksum text not null,
       applied_at bigint not null
     )`,
  );
  // Server-only bookkeeping: never readable by a Supabase client role.
  await client.query(`alter table ${TABLE} enable row level security`);
  await client.query(
    `do $$
     declare r text;
     begin
       foreach r in array array['anon', 'authenticated'] loop
         if exists (select 1 from pg_roles where rolname = r) then
           execute format('revoke all on ${TABLE} from %I', r);
         end if;
       end loop;
     end $$`,
  );
};

const appliedMap = async (client: PgClient | PgPool): Promise<Map<string, string>> => {
  const { rows } = await client.query(`select version, checksum from ${TABLE}`);
  return new Map(rows.map((row) => [String(row.version), String(row.checksum)]));
};

export type MigrateResult = { applied: string[]; skipped: string[]; pending: string[] };

/**
 * Applies every pending migration in order. `dir` defaults to the real migrations folder; tests
 * pass a temporary one. `now` is injectable so `applied_at` is deterministic under test.
 */
export const migrate = async (
  pool: PgPool,
  now: () => number = () => Date.now(),
  dryRun = false,
  dir: string = MIGRATIONS_DIR,
): Promise<MigrateResult> => {
  const migrations = loadMigrations(dir);
  await ensureTable(pool);
  const applied = await appliedMap(pool);

  const result: MigrateResult = { applied: [], skipped: [], pending: [] };
  for (const migration of migrations) {
    const recorded = applied.get(migration.version);
    if (recorded !== undefined) {
      if (recorded !== migration.checksum) {
        throw new Error(
          `Migration ${migration.version} was already applied but its contents changed ` +
            `(recorded ${recorded.slice(0, 12)}…, now ${migration.checksum.slice(0, 12)}…). ` +
            'Add a new migration instead of editing an applied one.',
        );
      }
      result.skipped.push(migration.version);
      continue;
    }
    if (dryRun) {
      result.pending.push(migration.version);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(migration.sql);
      await client.query(`insert into ${TABLE} (version, checksum, applied_at) values ($1, $2, $3)`, [
        migration.version,
        migration.checksum,
        now(),
      ]);
      await client.query('commit');
      result.applied.push(migration.version);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw new Error(`Migration ${migration.version} failed and was rolled back: ${String(error)}`);
    } finally {
      client.release?.();
    }
  }
  return result;
};

const main = async (): Promise<void> => {
  const url = databaseUrlFromEnv();
  if (!url) {
    console.error('DATABASE_URL is not set. Put it in .env (git-ignored) or the environment.');
    process.exit(2);
  }
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const statusOnly = args.has('--status');
  const pool = poolFromUrl(url);
  try {
    if (statusOnly) {
      const migrations = loadMigrations();
      await ensureTable(pool);
      const applied = await appliedMap(pool);
      for (const migration of migrations) {
        const recorded = applied.get(migration.version);
        const state = recorded === undefined ? 'pending' : recorded === migration.checksum ? 'applied' : 'CHANGED';
        console.log(`  ${state.padEnd(8)} ${migration.version}`);
      }
      return;
    }
    console.log(`target: ${redactUrl(url)}`);
    const result = await migrate(pool, () => Date.now(), dryRun);
    for (const version of result.applied) console.log(`  applied  ${version}`);
    for (const version of result.skipped) console.log(`  up to date  ${version}`);
    for (const version of result.pending) console.log(`  would apply  ${version}`);
    console.log(
      dryRun
        ? `dry run: ${result.pending.length} pending, ${result.skipped.length} already applied`
        : `done: ${result.applied.length} applied, ${result.skipped.length} already applied`,
    );
  } finally {
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
  }
};

const isEntryPoint = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
};

if (isEntryPoint()) {
  void main().catch((error: unknown) => {
    console.error(String(error));
    process.exit(1);
  });
}
