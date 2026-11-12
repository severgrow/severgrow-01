// Exercise every ADMIN READ path against the REAL database.
//
// The admin worker could only verify against in-memory seeded data (the quota guard forbids casual
// real-project runs), so its honest caveat was: "the first true-database render happens after
// approval." This closes that gap for the reads, which is the part that renders. It is READ-ONLY:
// it never calls triage() or writeSeen(), and migration 0012 is NOT applied, so any write would
// fail anyway.
//
//   node --env-file-if-exists=.env --import tsx server/scripts/verify-admin-reads.ts
import { databaseUrlFromEnv, poolFromUrl } from '../src/storage/pg-pool.js';
import { postgresAdminStore } from '../src/admin/postgres.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';

const url = databaseUrlFromEnv();
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

const pool = poolFromUrl(url, { max: 1 });
const store = postgresAdminStore(pool);
const now = Date.now();
const windows = {
  guestMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
  waitingExpireMs: DEFAULT_SERVER_CONFIG.waitingExpireMs,
  turnTimeoutMs: DEFAULT_SERVER_CONFIG.turnTimeoutMs,
};

let failed = 0;
const run = async (name: string, fn: () => Promise<unknown>) => {
  try {
    const v = await fn();
    // Show a compact shape rather than the whole payload.
    const shape = Array.isArray(v)
      ? `array(${v.length})`
      : v && typeof v === 'object'
        ? Object.keys(v as object).slice(0, 7).join(', ')
        : JSON.stringify(v);
    console.log(`  OK    ${name.padEnd(20)} ${shape}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL  ${name.padEnd(20)} ${String(e).slice(0, 200)}`);
  }
};

console.log('admin READ paths against the real database:\n');
await run('readSeen', () => store.readSeen('00000000-0000-0000-0000-000000000000'));
await run('countsSince', () => store.countsSince(now - 7 * 24 * 60 * 60 * 1000, now));
await run('overview', () => store.overview(now));
await run('reports', () => store.reports({ limit: 5 }));
await run('reports(kind)', () => store.reports({ kind: 'crash', limit: 5 }));
await run('stuck', () => store.stuck(now, windows));
await run('rulesVersionCounts', () => store.rulesVersionCounts());
await run('funnel', () => store.funnel(now));
await run('economy', () => store.economy(now));
// playerLookup takes an OBJECT ({ id } | { tag } | { name }), not a bare string — passing a string
// silently matches nothing and returns null, which looks like a bug but is a caller error. Try all
// three shapes so this script actually exercises the screen's real inputs.
await run('playerLookup(name)', () => store.playerLookup({ name: 'RYK' }));
await run('playerLookup(lower)', () => store.playerLookup({ name: 'ryk' }));
await run('playerLookup(id)', () => store.playerLookup({ id: '37e3d4d0-a34c-45b3-bc61-992fcf392912' }));
await run('matches', () => store.matches({ limit: 5 }));
await run('ledger', () => store.ledger({ limit: 5 }));
await run('world', () => store.world(now));
await run('campaign', () => store.campaign());
// The one read that returns BOTH sides of the human/bot split. It is the only admin read that is not
// filtered to `is_test = false`, so it is the one that must be checked against the real schema (its
// columns `test_reason` / `test_override` come from migration 0016).
await run('players', async () => {
  const page = await store.players(now);
  if (page.summary.humans + page.summary.bots !== page.total) {
    throw new Error(`the split does not add up: ${page.summary.humans} + ${page.summary.bots} != ${page.total}`);
  }
  return `${page.total} accounts: ${page.summary.humans} humans, ${page.summary.bots} bots`;
});

// A detail read needs a real id; take one from the list rather than inventing one. The row's field
// is `id` (AdminMatchRow), not `matchId`.
try {
  const page = await store.matches({ limit: 1 });
  const id = (page.rows[0] as { id?: string } | undefined)?.id;
  if (id) await run('matchDetail', () => store.matchDetail(id, 50));
  else console.log('  SKIP  matchDetail         no matches in the database');
} catch {
  console.log('  SKIP  matchDetail         could not list matches');
}

console.log(`\n${failed === 0 ? 'ALL ADMIN READS OK' : `${failed} READ PATH(S) FAILED`}`);
await (pool as unknown as { end?: () => Promise<void> }).end?.();
process.exit(failed === 0 ? 0 : 1);
