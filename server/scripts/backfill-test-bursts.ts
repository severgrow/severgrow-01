// BACKFILL the accounts that were already in the database before harnesses tagged themselves at
// creation (`x-futasaku-traffic: test` → `players.is_test`).
//
//   node --env-file-if-exists=.env --import tsx server/scripts/backfill-test-bursts.ts             # dry run
//   node --env-file-if-exists=.env --import tsx server/scripts/backfill-test-bursts.ts --commit    # apply
//
// The owner's fear is the one that decides the rule here: "i mainly care about not confusing bots with
// real players who are testing the game". Hiding a real person is worse than showing one bot, so the
// rule is deliberately conservative and needs ALL of the following:
//
//   1. `kind = 'guest'`. An account is a signed-in or upgraded person; never touched.
//   2. No recorded activity of ANY kind, ever: no match seat, no wallet row, no ledger entry, no world
//      claim, no reward receipt, no report, no identity link, no presence ping. A human tester who did
//      anything at all is out, by construction.
//   3. A CI-sized creation BURST: at least `--min-burst` (default 8) accounts created within
//      `--window-min` minutes (default 5) of it, either side. A person opening the game once is not
//      part of such a burst.
//   4. Older than `--cutoff-hours` (default 6), so a run in progress is never judged halfway through.
//   5. Not already marked, and not overridden by the owner to "always human".
//
// A name is NEVER evidence: every guest name is generated from its id, so a generated-looking name is
// exactly what a real guest tester has too. The reason recorded on the row says which evidence was
// used, so the owner can disagree with any individual row from the dashboard.
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from '../src/storage/pg-pool.js';
import type { PgClient, PgPool } from '../src/storage/postgres.js';

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
  if (match) args.set(match[1]!, match[2] ?? 'true');
}
const commit = args.has('commit');
const minBurst = Math.max(2, Number(args.get('min-burst') ?? 8));
const windowMin = Math.max(1, Number(args.get('window-min') ?? 5));
const cutoffHours = Math.max(0, Number(args.get('cutoff-hours') ?? 6));

const REASON = `Backfill: created in a burst of at least ${minBurst} accounts within ${windowMin} minutes, with no recorded activity of any kind.`;

/** The candidate rule, in one place, so the dry run and the write can never differ. */
const CANDIDATES_SQL = `
  with act as (
    select p.id, p.created_at,
           (select count(*)::int from players a
             where a.created_at between p.created_at - ($1::bigint * 60000)
                                     and p.created_at + ($1::bigint * 60000)) as burst
      from players p
     where p.kind = 'guest'
       and p.is_test = false
       and (p.test_override is null or p.test_override <> false)
       and p.created_at < $2
       and p.presence_at is null
       and not exists (select 1 from match_participants mp where mp.player_id = p.id)
       and not exists (select 1 from seed_wallets w where w.player_id = p.id)
       and not exists (select 1 from seed_ledger l where l.player_id = p.id)
       and not exists (select 1 from world_claims c where c.owner_id = p.id)
       and not exists (select 1 from seed_reward_receipts r where r.player_id = p.id)
       and not exists (select 1 from feedback_reports f where f.player_id = p.id)
       and not exists (select 1 from player_identities i where i.player_id = p.id)
  )
  select id, created_at, burst from act where burst >= $3 order by created_at`;

const main = async (): Promise<void> => {
  const url = databaseUrlFromEnv();
  if (!url) {
    console.error('DATABASE_URL is not set. Put it in .env (git-ignored) or the environment.');
    process.exit(2);
  }
  console.log(`backfill-test-bursts against ${redactUrl(url)}`);
  console.log(
    `rule: guest · no activity of any kind · burst >= ${minBurst} within ±${windowMin} min · older than ${cutoffHours} h · not overridden to human`,
  );
  console.log(`mode: ${commit ? 'COMMIT' : 'DRY RUN (pass --commit to apply)'}`);

  const pool: PgPool = poolFromUrl(url, { max: 2 });
  const client: PgClient = await pool.connect();
  try {
    const cutoff = Date.now() - cutoffHours * 60 * 60 * 1000;
    const { rows } = await client.query(CANDIDATES_SQL, [windowMin, cutoff, minBurst]);
    const ids = rows.map((row) => String(row.id));

    const before = await client.query(
      `select count(*)::int as players,
              count(*) filter (where is_test)::int as marked,
              count(*) filter (where kind = 'account')::int as accounts
         from players`,
    );
    console.log(`\ncandidates: ${ids.length}`);
    console.log(`before: ${JSON.stringify(before.rows[0])}`);
    if (rows.length > 0) {
      const first = new Date(Number(rows[0]!.created_at)).toISOString();
      const last = new Date(Number(rows[rows.length - 1]!.created_at)).toISOString();
      const bursts = new Map<number, number>();
      for (const row of rows) bursts.set(Number(row.burst), (bursts.get(Number(row.burst)) ?? 0) + 1);
      console.log(`  created between ${first} and ${last}`);
      console.log(`  by burst size: ${[...bursts.entries()].sort((a, b) => a[0] - b[0]).map(([size, n]) => `${size}×${n}`).join(', ')}`);
    }

    if (!commit) {
      console.log('\nDRY RUN: nothing was changed. Re-run with --commit to apply.');
      return;
    }
    if (ids.length === 0) {
      console.log('\nNothing to mark.');
      return;
    }

    // Mark FIRST (reversible), never delete. A batch of ids, never a table sweep.
    const updated = await client.query(
      `update players set is_test = true, test_reason = $2
        where id = any($1::uuid[]) and is_test = false
        returning id`,
      [ids, REASON],
    );
    const after = await client.query(
      `select count(*)::int as players,
              count(*) filter (where is_test)::int as marked,
              count(*) filter (where kind = 'account')::int as accounts
         from players`,
    );
    console.log(`\nmarked ${updated.rows.length} players as test (rows deleted: 0)`);
    console.log(`after: ${JSON.stringify(after.rows[0])}`);
    console.log('revert one row from the dashboard ("This is a real person") or all of them with:');
    console.log(`  update players set is_test = false, test_reason = null where test_reason = '${REASON}';`);
  } finally {
    client.release?.();
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
  }
};

await main().catch((error: unknown) => {
  console.error(`backfill-test-bursts error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
