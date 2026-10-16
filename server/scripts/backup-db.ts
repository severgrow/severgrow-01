// Logical backup of the live database: every public table's rows as JSON, plus the auth schema's
// users and identities. Read-only, safe to run any time.
//
//   node --env-file-if-exists=.env --import tsx server/scripts/backup-db.ts <out.json>
//
// Written because `pg_dump` is not installed on the development machine, and a production schema
// migration should never be applied without a restorable snapshot to hand. 2,900-odd rows today,
// so a JSON dump costs nothing; revisit only if the database grows a lot.
import pg from 'pg';
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) {
  console.error('usage: backup-db.ts <out.json>');
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

type Rows = Record<string, unknown>[];

const tables: string[] = (
  await c.query(`
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  `)
).rows.map((r: { table_name: string }) => r.table_name);

const dump: { takenAt: string; tables: Record<string, Rows>; auth: Record<string, Rows> } = {
  takenAt: new Date().toISOString(),
  tables: {},
  auth: {},
};
let totalRows = 0;

for (const t of tables) {
  const rows = (await c.query(`select * from "${t}"`)).rows as Rows;
  dump.tables[t] = rows;
  totalRows += rows.length;
  console.log(`  ${t}: ${rows.length}`);
}

// The sign-in accounts: needed to confirm a restore can rebuild an account link.
for (const t of ['users', 'identities']) {
  try {
    const rows = (await c.query(`select * from auth.${t}`)).rows as Rows;
    dump.auth[t] = rows;
    console.log(`  auth.${t}: ${rows.length}`);
  } catch (e) {
    console.log(`  auth.${t}: (skipped: ${String(e).slice(0, 60)})`);
  }
}

writeFileSync(out, JSON.stringify(dump, null, 1));
console.log(`\ntotal public rows: ${totalRows}`);
console.log(`written: ${out}`);
await c.end();
