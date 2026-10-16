// One command that verifies everything against the configured database:
//
//   npm run server:verify
//
// It (1) applies the versioned migrations, (2) runs the real-database integration suite, and
// (3) starts the server on a random port and runs the end-to-end smoke against it. It stops at the
// first failure so a broken database is reported immediately rather than hidden.
//
// Requires DATABASE_URL in the environment or a git-ignored `.env`.
import { spawn } from 'node:child_process';
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from '../src/storage/pg-pool.js';
import { startServer } from '../src/index.js';
import { DuelClient } from '../src/client.js';
import { markTestRows } from './mark-test-data.js';
import type { MarkInput } from './mark-test-data.js';
import type { FetchLike, KeyValue } from '../src/client.js';

const run = (label: string, command: string, args: string[], env: Record<string, string | undefined> = process.env): Promise<void> =>
  new Promise((resolve, reject) => {
    console.log(`\n=== ${label} ===`);
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`))));
  });

const memory = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

/** The same checks as server/scripts/smoke.ts, in-process, against a freshly started server.
 *  It returns the ids it created so `main` can mark them as test data (migration 0013). */
const smoke = async (baseUrl: string): Promise<MarkInput> => {
  const fetchImpl = globalThis.fetch as unknown as FetchLike;
  const a = new DuelClient({ baseUrl, fetch: fetchImpl, storage: memory() });
  const b = new DuelClient({ baseUrl, fetch: fetchImpl, storage: memory() });
  let failures = 0;
  const check = (name: string, ok: boolean, note = ''): void => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
    if (!ok) failures++;
  };

  const health = (await (await fetch(`${baseUrl}/v1/health`)).json()) as { rulesVersion?: string };
  check('health reports the pinned rules version', typeof health.rulesVersion === 'string', health.rulesVersion);

  const guestA = await a.createGuest('Verify A');
  const guestB = await b.createGuest('Verify B');
  check('two guests are created', guestA.ok && guestB.ok);
  const playerIds: string[] = [guestA.player.id, guestB.player.id];
  const matchIds: string[] = [];

  const created = await a.createMatch(guestA.token);
  matchIds.push(created.match.matchId);
  check('guest A creates a waiting match', created.match.status === 'waiting', created.match.inviteCode);
  // Same as the real UI: persist the session so a page refresh can resume via `resume()`.
  a.saveSession({ token: guestA.token, matchId: created.match.matchId, seat: created.player.seat });
  const joined = await b.joinMatch(guestB.token, created.match.inviteCode);
  check('guest B joins by invite code', joined.match.status === 'active' && joined.player.seat === 1);
  b.saveSession({ token: guestB.token, matchId: joined.match.matchId, seat: joined.player.seat });

  const matchId = created.match.matchId;
  const viewA = (await a.getState(guestA.token, matchId)).player;
  const viewB = (await b.getState(guestB.token, matchId)).player;
  const hidden = (p: typeof viewA) => !Object.keys(p.view).some((k) => ['seed', 'deck', 'hands', 'history', 'fruitKnown'].includes(k));
  check('both views hide the seed, deck and hands', hidden(viewA) && hidden(viewB));

  const acting = viewA.legalActions.length > 0 ? { client: a, token: guestA.token, payload: viewA } : { client: b, token: guestB.token, payload: viewB };
  const action = acting.payload.legalActions[0]!;
  const submitted = await acting.client.submitAction(acting.token, matchId, {
    expectedRevision: acting.payload.revision,
    requestId: 'verify-move-1',
    action,
  });
  check('a legal move is accepted and the revision advances', !submitted.replayed && submitted.player.revision === acting.payload.revision + 1);

  const replay = await acting.client.submitAction(acting.token, matchId, { expectedRevision: acting.payload.revision, requestId: 'verify-move-1', action });
  check('a duplicate request is applied exactly once', replay.replayed && replay.player.revision === submitted.player.revision);

  // Turn-gated: the actor sees the live revision; the opponent stays on the last boundary.
  const afterA = (await a.getState(guestA.token, matchId)).player;
  const afterB = (await b.getState(guestB.token, matchId)).player;
  const actorAfter = submitted.player.seat === 0 ? afterA : afterB;
  const waitingAfter = submitted.player.seat === 0 ? afterB : afterA;
  check('the actor sees the persisted revision', actorAfter.revision === submitted.player.revision);
  check('the opponent stays gated mid-turn', waitingAfter.revision === acting.payload.revision);

  const resumed = await a.resume();
  check('a refresh reconnects to the seat-0 gated revision', resumed?.player.revision === afterA.revision);

  const outsider = new DuelClient({ baseUrl, fetch: fetchImpl, storage: memory() });
  const outsiderGuest = await outsider.createGuest();
  playerIds.push(outsiderGuest.player.id);
  const denied = await outsider
    .getState(outsiderGuest.token, matchId)
    .then(() => 'allowed')
    .catch((e: unknown) => (e as { code?: string }).code ?? 'unknown');
  check('an unrelated player is refused', denied === 'NOT_A_PARTICIPANT', String(denied));

  if (failures > 0) throw new Error(`${failures} end-to-end check(s) failed`);
  console.log('  all end-to-end checks passed');
  return { playerIds, matchIds };
};

const main = async (): Promise<void> => {
  const url = databaseUrlFromEnv();
  if (!url) {
    console.error('DATABASE_URL is not set. Put it in .env (git-ignored) or the environment.');
    process.exit(2);
  }
  console.log(`Verifying against ${redactUrl(url)}`);

  await run('apply migrations', 'node', ['--env-file-if-exists=.env', '--import', 'tsx', 'server/scripts/migrate.ts']);
  // This is the deliberate real-database command (it already refused to run without DATABASE_URL
  // above), so opt the spawned suite in: the integration tests now connect only with
  // REQUIRE_DATABASE=1 (see the quota guard + docs/BACKEND.md).
  await run(
    'real-database integration tests',
    'node',
    [
      '--env-file-if-exists=.env',
      './node_modules/vitest/vitest.mjs',
      'run',
      'server/tests/postgres.integration.test.ts',
    ],
    { ...process.env, REQUIRE_DATABASE: '1' },
  );

  console.log('\n=== end-to-end smoke (in-process server) ===');
  // Integration tests share the guest:ip:unknown rate-limit bucket on the real DB.
  const cleanupPool = poolFromUrl(url, { max: 1 });
  try {
    await cleanupPool.query("delete from rate_limits where bucket like 'guest:%' or bucket like 'join:%' or bucket like 'actions:%'");
  } finally {
    await (cleanupPool as unknown as { end?: () => Promise<void> }).end?.();
  }
  const started = await startServer({ port: 0 });
  let created: MarkInput = {};
  try {
    created = await smoke(`http://127.0.0.1:${started.port}`);
  } finally {
    await started.close();
  }

  // The end-to-end smoke created real rows in the real database. Mark them as test data so a
  // verification run can never move a number on the admin dashboard (migration 0013).
  const markPool = poolFromUrl(url, { max: 1 });
  try {
    const marked = await markTestRows(markPool, created);
    console.log(`\nmarked ${marked.players} player(s) and ${marked.matches} match(es) as test data`);
  } finally {
    await (markPool as unknown as { end?: () => Promise<void> }).end?.();
  }

  console.log('\nVERIFICATION PASSED');
};

await main().catch((error: unknown) => {
  console.error(`\nVERIFICATION FAILED: ${String(error)}`);
  process.exit(1);
});
