// ONE-OFF cleanup: mark the pre-existing test/verification history (migration 0013) and delete it,
// leaving the owner's real account and everything of his untouched.
//
//   node --env-file-if-exists=.env --import tsx server/scripts/clean-test-data.ts            # dry run
//   node --env-file-if-exists=.env --import tsx server/scripts/clean-test-data.ts --commit   # do it
//
// What counts as real, and what is test:
//   * EVERY `kind = 'account'` row is kept and left unmarked. An account is a signed-in or upgraded
//     person — and a real Google sign-in can appear at ANY moment (one did, mid-task). Deleting a
//     real person's account is irreversible, so accounts are never deleted here.
//   * Every `kind = 'guest'` row is generated traffic (a test guest and a real guest are created by
//     the same generator). Guests are MARKED as test; a guest is deleted unless it is "entangled" —
//     a participant in one of the accounts' matches. Those entangled guests are marked but kept,
//     because `match_moves.player_id` is ON DELETE NO ACTION: deleting them would break the
//     account's match, and no account's data is given up to make the tables tidy.
//   * A match is kept when any of its participants is a keeper; every other (all-guest) match goes.
//     A kept account match that contains a marked guest becomes marked too, so the dashboard's
//     "any test participant ⇒ test match" rule hides it without touching the row.
//   * MARK FIRST, then delete: the mark makes the operation auditable, and gives a gentler lever if
//     a delete has to be deferred.
//   * Everything is inside ONE transaction with explicit before/after counts, and it ROLLS BACK
//     unless the owner's numbers are identical afterwards. Never a TRUNCATE, never a wildcard: every
//     statement is scoped by an explicit id set.
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from '../src/storage/pg-pool.js';
import { adminPlayerIdsFromEnv } from '../src/config.js';
import type { PgClient, PgPool } from '../src/storage/postgres.js';

const commit = process.argv.includes('--commit');

type Counts = {
  players: number;
  matches: number;
  moves: number;
  participants: number;
  wallets: number;
  ledger: number;
  receipts: number;
  tickets: number;
  claims: number;
  tiles: number;
  liveChallenges: number;
  reports: number;
};

const COUNTS_SQL = `select
  (select count(*)::int from players) as players,
  (select count(*)::int from matches) as matches,
  (select count(*)::int from match_moves) as moves,
  (select count(*)::int from match_participants) as participants,
  (select count(*)::int from seed_wallets) as wallets,
  (select count(*)::int from seed_ledger) as ledger,
  (select count(*)::int from seed_reward_receipts) as receipts,
  (select count(*)::int from training_seed_tickets) as tickets,
  (select count(*)::int from world_claims) as claims,
  (select count(*)::int from world_tiles) as tiles,
  (select count(*)::int from live_challenges) as "liveChallenges",
  (select count(*)::int from feedback_reports) as reports`;

const counts = async (client: PgClient, sql = COUNTS_SQL): Promise<Counts> => {
  const { rows } = await client.query(sql);
  return rows[0] as unknown as Counts;
};

const ownerCounts = async (client: PgClient, owners: string[]): Promise<Record<string, number>> => {
  const { rows } = await client.query(
    `select
       (select count(*)::int from players where id = any($1::uuid[])) as players,
       (select count(*)::int from matches m join match_participants mp on mp.match_id = m.id where mp.player_id = any($1::uuid[])) as matches,
       (select count(*)::int from seed_wallets where player_id = any($1::uuid[])) as wallets,
       (select coalesce(sum(balance), 0)::int from seed_wallets where player_id = any($1::uuid[])) as balance,
       (select coalesce(sum(lifetime_earned), 0)::bigint from seed_wallets where player_id = any($1::uuid[])) as earned,
       (select coalesce(sum(lifetime_spent), 0)::bigint from seed_wallets where player_id = any($1::uuid[])) as spent,
       (select count(*)::int from seed_ledger where player_id = any($1::uuid[])) as ledger,
       (select count(*)::int from seed_reward_receipts where player_id = any($1::uuid[])) as receipts,
       (select count(*)::int from world_claims where owner_id = any($1::uuid[])) as claims`,
    [owners],
  );
  return rows[0] as unknown as Record<string, number>;
};

const ids = async (client: PgClient, sql: string, values: readonly unknown[] = []): Promise<string[]> => {
  const { rows } = await client.query(sql, values);
  return rows.map((row) => String(row.id));
};

const main = async (): Promise<void> => {
  const url = databaseUrlFromEnv();
  if (!url) {
    console.error('DATABASE_URL is not set. Put it in .env (git-ignored) or the environment.');
    process.exit(2);
  }
  const owners = adminPlayerIdsFromEnv();
  if (owners.length === 0) {
    console.error('No owner id: ADMIN_PLAYER_IDS is empty and the founding-owner fallback is unavailable.');
    process.exit(2);
  }

  console.log(`clean-test-data against ${redactUrl(url)}`);
  console.log(`owner (never touched): ${owners.join(', ')}  mode: ${commit ? 'COMMIT' : 'DRY RUN (pass --commit to apply)'}`);

  const pool: PgPool = poolFromUrl(url, { max: 2 });
  const client = await pool.connect();
  try {
    await client.query('begin');

    // ---- plan ----------------------------------------------------------------
    const accounts = await ids(client, `select id::text as id from players where kind = 'account' order by created_at`);
    const guestIds = await ids(client, `select id::text as id from players where kind = 'guest' order by created_at`);
    // "Entangled": a guest seated in a match one of the accounts is in — kept so that account match
    // stays valid (`match_moves.player_id` is NO ACTION).
    const entangled = await ids(
      client,
      `select distinct mp.player_id::text as id
         from match_participants mp
        where mp.match_id in (select match_id from match_participants where player_id = any($1::uuid[]))
          and mp.player_id <> all($1::uuid[])`,
      [accounts],
    );
    const keep = [...new Set([...accounts, ...entangled])];
    const entangledSet = new Set(entangled);
    const deletablePlayers = guestIds.filter((id) => !entangledSet.has(id));
    const deletableMatches = await ids(
      client,
      `select id::text as id from matches m
        where not exists (select 1 from match_participants mp where mp.match_id = m.id and mp.player_id = any($1::uuid[]))`,
      [keep],
    );

    const before = await counts(client);
    const ownerBefore = await ownerCounts(client, owners);

    console.log('\nplan:');
    console.log(`  accounts kept unmarked:    ${accounts.length}  (never deleted: a signed-in person)`);
    console.log(`  entangled guests kept:     ${entangled.length}  (in an account match; cannot be deleted without breaking it)`);
    console.log(`  guests to mark + delete:   ${deletablePlayers.length}`);
    console.log(`  matches to mark + delete:  ${deletableMatches.length}  (kept account matches with a marked guest are marked, not deleted)`);
    console.log(`  before: ${JSON.stringify(before)}`);
    console.log(`  owner before: ${JSON.stringify(ownerBefore)}`);
    if (deletablePlayers.length > 0) {
      const sample = await client.query(
        `select display_name, kind from players where id = any($1::uuid[]) order by created_at limit 12`,
        [deletablePlayers],
      );
      console.log(`  sample: ${sample.rows.map((r) => `${String(r.display_name ?? '(no name)')}·${String(r.kind)}`).join(', ')}${deletablePlayers.length > 12 ? ', …' : ''}`);
    }

    if (!commit) {
      await client.query('rollback');
      console.log('\nDRY RUN: nothing was changed. Re-run with --commit to apply.');
      return;
    }

    // ---- mark (auditable, and the dashboard would already be clean if the delete were deferred) --
    // Every guest is marked, including the entangled ones that are kept. Any match with a marked
    // participant is marked too, so an account match a test guest joined is hidden without being
    // deleted. Accounts are never marked.
    await client.query('update players set is_test = true where id = any($1::uuid[]) and is_test = false', [guestIds]);
    await client.query(
      `update matches set is_test = true
        where is_test = false
          and exists (select 1 from match_participants mp join players p on p.id = mp.player_id
                       where mp.match_id = matches.id and p.is_test)`,
    );

    // ---- delete (children first; RESTRICT FKs before players) -----------------
    const del = async (sql: string, values: readonly unknown[]): Promise<number> => (await client.query(sql, values)).rows.length;
    await del('delete from feedback_reports where player_id = any($1::uuid[])', [deletablePlayers]);
    await del('delete from admin_audit where actor_id = any($1::uuid[])', [deletablePlayers]);
    await del('delete from feedback_triage where updated_by = any($1::uuid[])', [deletablePlayers]);
    await del('delete from seed_ledger where player_id = any($1::uuid[])', [deletablePlayers]);
    await del('delete from seed_reward_receipts where player_id = any($1::uuid[])', [deletablePlayers]);
    await del('delete from training_seed_tickets where player_id = any($1::uuid[])', [deletablePlayers]);
    await del('delete from world_claims where owner_id = any($1::uuid[])', [deletablePlayers]);
    await del('delete from device_link_codes where player_id = any($1::uuid[])', [deletablePlayers]);
    // Deleting the matches cascades to their participants, moves, live challenges and legacy tiles.
    await del('delete from matches where id = any($1::uuid[])', [deletableMatches]);
    await del('delete from players where id = any($1::uuid[])', [deletablePlayers]);

    // ---- verify --------------------------------------------------------------
    const after = await counts(client);
    const ownerAfter = await ownerCounts(client, owners);
    const ownerUnchanged = JSON.stringify(ownerBefore) === JSON.stringify(ownerAfter);
    if (!ownerUnchanged) {
      throw new Error(`owner data changed: before ${JSON.stringify(ownerBefore)} after ${JSON.stringify(ownerAfter)}`);
    }
    const accountsAfter = (await client.query(`select count(*)::int as n from players where kind = 'account'`)).rows[0];
    if (Number((accountsAfter as { n?: unknown }).n ?? -1) !== accounts.length) {
      throw new Error('an account was removed; refusing to commit');
    }
    const unmarkedGuests = (await client.query(`select count(*)::int as n from players where kind = 'guest' and is_test = false`)).rows[0];
    if (Number((unmarkedGuests as { n?: unknown }).n ?? -1) !== 0) {
      throw new Error('some guests were left unmarked; refusing to commit');
    }

    await client.query('commit');
    console.log('\nmarked and deleted.');
    console.log(`  after: ${JSON.stringify(after)}`);
    console.log(`  owner after: ${JSON.stringify(ownerAfter)}  (identical to before: ${ownerUnchanged})`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    console.error(`\nROLLED BACK: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    client.release?.();
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
  }
};

await main().catch((error: unknown) => {
  console.error(`clean-test-data error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
