// FUTASAKU 0.5 — sustained online-duel load test (the spec's Phase 6 item 8).
//
//   node --env-file-if-exists=.env --import tsx server/scripts/load-test.ts \
//     --matches=50 --duration=300 --pool=12 --max-matches=250 --edge-probe=12
//
// What it does, and why it is built this way
// ------------------------------------------
// The goal is ~50 concurrent matches / ~100 virtual players sustained for ~5 minutes, then honest
// numbers: p50/p95 for view fetch and submit, error counts (429/503/500), peak database
// connections, and measured storage per finished match.
//
// Mode `local` (the default, and what the shipped numbers use):
//   It starts the REAL server (`createHttpServer` + `MatchService` + `PostgresStorage`) on a random
//   localhost port, pointed at the REAL Supabase project named by `DATABASE_URL`. The virtual
//   players drive it over real HTTP through the same `DuelClient` the browser uses. The database
//   work (row locks, jsonb writes, indexes) is the same work the deployed Edge function does; only
//   the network hop differs (localhost instead of the Edge isolate, which is co-located with the DB
//   and is therefore FASTER — so these latencies are a pessimistic upper bound).
//
//   Why not 100 real Edge guests from one IP? The deployed API rate-limits guest creation to 200
//   per IP per hour and joins to 400 per IP per hour; every virtual player here shares this
//   machine's single public IP. A sustained 100-player run through Edge would either be throttled
//   by design or force temporarily raising the deployed secrets (risk to the shared project). The
//   per-player limits (120 actions/min) would distort the numbers far less, but the per-IP guest
//   budget is the blocker. We therefore say so explicitly and run the sustained phase against the
//   local instance on the SAME database, with the per-IP/per-player limits raised to a non-binding
//   value IN THIS LOCAL CONFIG ONLY (nothing deployed is touched, so nothing needs reverting).
//
//   A bounded `--edge-probe=N` phase additionally plays N real duels over HTTPS against the
//   deployed Edge function to prove and measure the live path.
//
// Safety: every row this creates is tracked by id in `.tmp-loadtest-ids.json`; cleanup deletes
// exactly those ids (`where id = any(...)`), never a table-wide delete. Secrets are never printed
// (only the redacted connection string). The pool is deliberately small so the shared free-tier
// project is never pushed toward its 60-connection ceiling.

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createHttpServer } from '../src/http.js';
import { MatchService } from '../src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from '../src/storage/pg-pool.js';
import { postgresStorage } from '../src/storage/postgres.js';
import { DuelClient, DuelError } from '../src/client.js';
import type { KeyValue } from '../src/client.js';
import { createDraftEngine } from '../../web/src/online/draft.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import type { MatchViewPayload, SubmitActionRequest } from '../src/protocol.js';

// ----------------------------------------------------------------- argument parsing

const argStr = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const argNum = (name: string, fallback: number): number => {
  const raw = argStr(name, '');
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) ? n : fallback;
};
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const MATCHES = Math.max(1, Math.floor(argNum('matches', 50)));
const PLAYERS = Math.max(2, Math.floor(argNum('players', MATCHES * 2)));
const CONCURRENCY = Math.max(1, Math.min(MATCHES, Math.floor(argNum('concurrency', MATCHES))));
const DURATION_S = Math.max(1, Math.floor(argNum('duration', 300)));
const POOL = Math.max(1, Math.floor(argNum('pool', 12)));
const MAX_MATCHES = Math.max(0, Math.floor(argNum('max-matches', 250)));
const PACE_MS = Math.max(0, Math.floor(argNum('pace', 700)));
const EDGE_PROBE = Math.max(0, Math.floor(argNum('edge-probe', 0)));
const EDGE_URL = argStr('edge-url', 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel');
const MODE = argStr('mode', 'local');
const KEEP = hasFlag('keep');

const RUN_ID = Date.now().toString(36);
const IDS_PATH = argStr('ids', '.tmp-loadtest-ids.json');
const OUT_PATH = argStr('out', `.tmp-loadtest-${RUN_ID}.json`);

// ----------------------------------------------------------------- shared state

type Ids = { runId: string; players: string[]; matches: string[]; rateBuckets: string[] };
const ids: Ids = { runId: RUN_ID, players: [], matches: [], rateBuckets: [] };

const memoryKv = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

/** Deterministic little PRNG so a run is reproducible (no Math.random in the engine, scripts may). */
const lcg = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]! * 10) / 10;
};

const maxOf = (values: number[]): number | null => {
  if (values.length === 0) return null;
  let m = -Infinity;
  for (const v of values) if (v > m) m = v;
  return Math.round(m * 10) / 10;
};

const stats = (values: number[]): { p50: number | null; p95: number | null; p99: number | null; max: number | null; count: number } => ({
  p50: percentile(values, 50),
  p95: percentile(values, 95),
  p99: percentile(values, 99),
  max: maxOf(values),
  count: values.length,
});

type ErrorBuckets = { byCode: Map<string, number>; byStatus: Map<string, number> };
const bump = (map: Map<string, number>, key: string): void => void map.set(key, (map.get(key) ?? 0) + 1);

const localErrors: ErrorBuckets = { byCode: new Map(), byStatus: new Map() };
const edgeErrors: ErrorBuckets = { byCode: new Map(), byStatus: new Map() };

const recordError = (buckets: ErrorBuckets, error: unknown): string => {
  if (error instanceof DuelError) {
    bump(buckets.byCode, error.code);
    bump(buckets.byStatus, String(error.status));
    return error.code;
  }
  bump(buckets.byCode, 'UNHANDLED');
  return 'UNHANDLED';
};

const latencyLocal = { view: [] as number[], submit: [] as number[], other: [] as number[] };
const latencyEdge = { view: [] as number[], submit: [] as number[], other: [] as number[] };

const requestCount = { local: 0, edge: 0 };

// ----------------------------------------------------------------- player handle + match play

type PlayerHandle = { name: string; client: DuelClient; token: string; id: string; seat: 0 | 1 };

const other = (seat: 0 | 1): 0 | 1 => (seat === 0 ? 1 : 0);

const timed = async <T>(bucket: number[], counter: { n: number }, fn: () => Promise<T>): Promise<T> => {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    bucket.push(performance.now() - t0);
    counter.n += 1;
  }
};

/** The atomic action batch for whatever phase the acting seat is in (mirrors the browser client). */
const buildActions = (v: MatchViewPayload): Action[] | null => {
  const legal = v.legalActions;
  if (legal.length === 0) return null;
  if (v.view.phase === 'DRAW') {
    return [legal.find((a) => a.t === 'Draw') ?? legal[0]!];
  }
  if (v.view.phase === 'ACT') {
    const endAct = legal.find((a) => a.t === 'EndAct');
    if (!endAct) return [legal[0]!];
    const draft = createDraftEngine({ matchId: v.matchId, storage: null });
    draft.syncFromServer(v.view, v.revision);
    for (let i = 0; i < 6; i++) {
      const board = draft.legal().filter((a) => a.t !== 'EndAct');
      if (board.length === 0) break;
      let choice: Action;
      try {
        choice = GreedyBot.chooseAction(draft.view());
      } catch {
        break;
      }
      if (choice.t === 'EndAct') break;
      if (!draft.play(choice)) break;
    }
    return [...draft.actions(), endAct];
  }
  if (v.view.phase === 'DISCARD') {
    return [legal.find((a) => a.t === 'Discard') ?? legal[0]!];
  }
  return [legal[0]!];
};

type MatchOutcome = { matchId: string; outcome: 'finished' | 'guard' | 'stuck' | 'error'; errorCode?: string };

/** Plays one whole duel between two players; the loser/winner does not matter, only that it ends. */
const playMatch = async (
  a: PlayerHandle,
  b: PlayerHandle,
  lat: { view: number[]; submit: number[]; other: number[] },
  counter: { n: number },
  errBuckets: ErrorBuckets,
  paceRandom: () => number,
): Promise<MatchOutcome> => {
  let created: Awaited<ReturnType<DuelClient['createMatch']>>;
  try {
    created = await timed(lat.other, counter, () => a.client.createMatch(a.token));
  } catch (error) {
    return { matchId: '', outcome: 'error', errorCode: recordError(errBuckets, error) };
  }
  const matchId = created.match.matchId;
  ids.matches.push(matchId);
  a.seat = created.player.seat;
  b.seat = other(a.seat);

  try {
    await timed(lat.other, counter, () => b.client.joinMatch(b.token, created.match.inviteCode));
  } catch (error) {
    return { matchId, outcome: 'error', errorCode: recordError(errBuckets, error) };
  }

  let current = a.seat === created.player.actor ? a : b;
  let guard = 0;

  while (guard++ < 4000) {
    // Only the seat that must act is fetched; poll the other only if that view has no move (rare).
    let view: MatchViewPayload;
    try {
      view = await timed(lat.view, counter, () => current.client.getState(current.token, matchId).then((r) => r.player));
    } catch (error) {
      return { matchId, outcome: 'error', errorCode: recordError(errBuckets, error) };
    }
    if (view.status === 'finished') return { matchId, outcome: 'finished' };

    if (view.legalActions.length === 0) {
      const alternate = current === a ? b : a;
      let otherView: MatchViewPayload;
      try {
        otherView = await timed(lat.view, counter, () => alternate.client.getState(alternate.token, matchId).then((r) => r.player));
      } catch (error) {
        return { matchId, outcome: 'error', errorCode: recordError(errBuckets, error) };
      }
      if (otherView.status === 'finished') return { matchId, outcome: 'finished' };
      if (otherView.legalActions.length === 0) return { matchId, outcome: 'stuck' };
      current = alternate;
      view = otherView;
    }

    const actions = buildActions(view);
    if (!actions) return { matchId, outcome: 'stuck' };
    const request: SubmitActionRequest = {
      expectedRevision: view.revision,
      requestId: `lt-${RUN_ID}-${a.id.slice(0, 8)}-${counter.n}`,
      actions,
    };
    try {
      const res = await timed(lat.submit, counter, () => current.client.submitAction(current.token, matchId, request));
      current = res.player.actor === a.seat ? a : b;
    } catch (error) {
      const code = recordError(errBuckets, error);
      if (code === 'STALE_REVISION' || code === 'REQUEST_ID_CONFLICT') continue; // refetch and retry
      return { matchId, outcome: 'error', errorCode: code };
    }
    // Human-like pacing so ~50 concurrent sessions stay a sustained load, not a burst.
    if (PACE_MS > 0) await sleep(PACE_MS + Math.floor(paceRandom() * PACE_MS));
  }
  return { matchId, outcome: 'guard' };
};

// ----------------------------------------------------------------- database helpers

type PgQueryable = { query(sql: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

const count = async (pool: PgQueryable, sql: string, values: readonly unknown[] = []): Promise<number> => {
  const { rows } = await pool.query(sql, values);
  return Number(rows[0]?.n ?? 0);
};

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));

// ----------------------------------------------------------------- edge probe

const edgeProbe = async (n: number, baseUrl: string): Promise<void> => {
  if (n <= 0) return;
  console.log(`\nedge probe: ${n} real HTTPS duel(s) against ${baseUrl}`);
  const mk = (): PlayerHandle => ({
    name: 'edge',
    client: new DuelClient({ baseUrl, storage: memoryKv(), clientVersion: '0.5.0' }),
    token: '',
    id: '',
    seat: 0,
  });
  const a = mk();
  const b = mk();
  try {
    const ga = await a.client.createGuest();
    a.token = ga.token;
    a.id = ga.player.id;
    const gb = await b.client.createGuest();
    b.token = gb.token;
    b.id = gb.player.id;
    ids.players.push(a.id, b.id);
  } catch (error) {
    console.log(`  edge probe skipped: guest creation failed (${recordError(edgeErrors, error)})`);
    return;
  }
  const rnd = lcg(0xed6e);
  for (let i = 0; i < n; i++) {
    const counter = { n: 0 };
    const outcome = await playMatch(a, b, latencyEdge, counter, edgeErrors, rnd);
    requestCount.edge += counter.n;
    console.log(`  edge ${i + 1}/${n}: ${outcome.outcome}${outcome.errorCode ? ` (${outcome.errorCode})` : ''}`);
    if (outcome.outcome === 'error' && (outcome.errorCode === 'RATE_LIMITED' || outcome.errorCode === 'UNAVAILABLE')) {
      console.log('  edge probe: stopping early — the deployed per-IP budget is exhausted (honest, not a failure).');
      break;
    }
  }
};

// ----------------------------------------------------------------- main

const main = async (): Promise<void> => {
  if (hasFlag('help')) {
    console.log('load-test.ts --matches=50 --duration=300 --pool=12 --max-matches=250 --edge-probe=12 [--mode=local|edge] [--keep]');
    return;
  }
  const url = databaseUrlFromEnv();
  if (!url) {
    console.error('DATABASE_URL is not set (put it in .env, which is git-ignored).');
    process.exit(2);
  }
  console.log(`load test ${RUN_ID}: mode=${MODE} matches=${MATCHES} players=${PLAYERS} concurrency=${CONCURRENCY}`);
  console.log(`  duration=${DURATION_S}s pool=${POOL} max-matches=${MAX_MATCHES === 0 ? 'unlimited' : MAX_MATCHES} pace=${PACE_MS}ms`);
  console.log(`  database=${redactUrl(url)}`);

  const pool = poolFromUrl(url, { max: POOL, idleTimeoutMillis: 20_000 });
  const monitorPool = poolFromUrl(url, { max: 1 });
  const storage = postgresStorage(pool);
  const config = {
    ...DEFAULT_SERVER_CONFIG,
    corsOrigin: '*',
    // Local-only: the per-IP guest/join budgets would throttle 100 players from one address. This
    // raises them in THIS process only — nothing deployed changes, so nothing needs reverting.
    rateLimits: {
      guestPerIpPerHour: 10_000_000,
      joinPerPlayerPerHour: 10_000_000,
      joinPerIpPerHour: 10_000_000,
      linkCodePerPlayerPerHour: 10_000_000,
      linkRedeemPerIpPerHour: 10_000_000,
      actionsPerPlayerPerMinute: 10_000_000,
      sweepPerIpPerHour: 10_000_000,
    },
  };
  const service = new MatchService({ storage, config });
  let serverErrors = 0;
  const httpServer = createHttpServer({
    service,
    config,
    logger: (line) => {
      if (line.startsWith('ERROR')) serverErrors += 1;
    },
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const port = address !== null && typeof address === 'object' ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`  local server: ${baseUrl} (rules ${service.rulesVersion})`);

  const before = {
    dbSize: num((await monitorPool.query('select pg_database_size(current_database()) as n')).rows[0]?.n),
    matches: await count(monitorPool, 'select count(*)::int as n from matches'),
    moves: await count(monitorPool, 'select count(*)::int as n from match_moves'),
    players: await count(monitorPool, 'select count(*)::int as n from players'),
    rel: {
      matches: num((await monitorPool.query("select pg_total_relation_size('matches') as n")).rows[0]?.n),
      match_moves: num((await monitorPool.query("select pg_total_relation_size('match_moves') as n")).rows[0]?.n),
      match_participants: num((await monitorPool.query("select pg_total_relation_size('match_participants') as n")).rows[0]?.n),
    },
  };

  let peakConnections = 0;
  let stop = false;
  const sample = async (): Promise<void> => {
    try {
      const n = await count(monitorPool, 'select count(*)::int as n from pg_stat_activity where datname = current_database()');
      if (n > peakConnections) peakConnections = n;
    } catch {
      /* a sampling blip must never take the run down */
    }
  };
  const monitor = setInterval(() => void sample(), 2000);

  const startedAt = Date.now();
  const deadline = startedAt + DURATION_S * 1000;
  const counters = { created: 0, finished: 0, guard: 0, stuck: 0, error: 0 };
  const createGuard = (): boolean => (MAX_MATCHES === 0 || counters.created < MAX_MATCHES) && Date.now() < deadline;

  // --- create the virtual players once, over the local HTTP API (tracked for cleanup)
  const players: PlayerHandle[] = [];
  console.log(`  creating ${PLAYERS} virtual players…`);
  for (let i = 0; i < PLAYERS; i++) {
    const client = new DuelClient({ baseUrl, storage: memoryKv(), clientVersion: '0.5.0' });
    try {
      const g = await client.createGuest();
      players.push({ name: `p${i}`, client, token: g.token, id: g.player.id, seat: 0 });
      ids.players.push(g.player.id);
    } catch (error) {
      console.log(`  player ${i} creation failed: ${recordError(localErrors, error)}`);
      break;
    }
  }
  if (players.length < 2) {
    console.error('could not create enough virtual players; aborting.');
    clearInterval(monitor);
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
    await (monitorPool as unknown as { end?: () => Promise<void> }).end?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    process.exit(1);
  }
  console.log(`  ${players.length} players ready; starting ${CONCURRENCY} concurrent lanes`);

  const persistIds = (): void => writeFileSync(IDS_PATH, JSON.stringify(ids));
  persistIds();
  const idsTicker = setInterval(persistIds, 2000);

  const lane = async (index: number): Promise<void> => {
    const a = players[(index * 2) % players.length]!;
    const b = players[(index * 2 + 1) % players.length]!;
    const rnd = lcg(index + 1);
    while (createGuard() && !stop) {
      counters.created += 1;
      const counter = { n: 0 };
      let outcome: MatchOutcome;
      try {
        outcome = await playMatch(a, b, latencyLocal, counter, localErrors, rnd);
      } catch (error) {
        counters.error += 1;
        recordError(localErrors, error);
        continue;
      }
      requestCount.local += counter.n;
      if (outcome.outcome === 'finished') counters.finished += 1;
      else if (outcome.outcome === 'guard') counters.guard += 1;
      else if (outcome.outcome === 'stuck') counters.stuck += 1;
      else counters.error += 1;
    }
  };

  const progress = setInterval(() => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`  ${elapsed}s: created=${counters.created} finished=${counters.finished} stuck=${counters.stuck} error=${counters.error} peakConns=${peakConnections}`);
  }, 15_000);

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => lane(i)));
  stop = true;
  clearInterval(progress);
  clearInterval(idsTicker);
  clearInterval(monitor);
  await sample();
  persistIds();

  const actualDurationS = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\nlocal load done in ${actualDurationS}s: created=${counters.created} finished=${counters.finished} stuck=${counters.stuck} error=${counters.error} peakConns=${peakConnections}`);

  await edgeProbe(EDGE_PROBE, EDGE_URL);

  // --- storage measurement while the rows still exist, using only OUR tracked match ids
  const matchIds = ids.matches.filter((m) => m.length > 0);
  const finishedStats =
    matchIds.length === 0
      ? null
      : (
          await monitorPool.query(
            `select count(*)::int as matches,
                    coalesce(sum(pg_column_size(state)),0) as state_bytes,
                    coalesce(sum(coalesce(pg_column_size(turn_start_state),0)),0) as turn_start_bytes,
                    coalesce(sum(pg_column_size(config)),0) as config_bytes,
                    coalesce(sum(coalesce(pg_column_size(result),0)),0) as result_bytes,
                    coalesce(sum(pg_column_size(invite_code) + pg_column_size(rules_version)),0) as misc_bytes
               from matches where id = any($1::uuid[])`,
            [matchIds],
          )
        ).rows[0];
  const moveStats =
    matchIds.length === 0
      ? null
      : (
          await monitorPool.query(
            `select count(*)::int as moves,
                    coalesce(sum(pg_column_size(action)),0) as action_bytes,
                    coalesce(sum(pg_column_size(events)),0) as events_bytes,
                    coalesce(sum(pg_column_size(request_id)),0) as request_bytes,
                    coalesce(avg(revision),0) as avg_revision
               from match_moves where match_id = any($1::uuid[])`,
            [matchIds],
          )
        ).rows[0];
  const participantRows =
    matchIds.length === 0 ? 0 : await count(monitorPool, 'select count(*)::int as n from match_participants where match_id = any($1::uuid[])', [matchIds]);

  const after = {
    dbSize: num((await monitorPool.query('select pg_database_size(current_database()) as n')).rows[0]?.n),
    matches: await count(monitorPool, 'select count(*)::int as n from matches'),
    moves: await count(monitorPool, 'select count(*)::int as n from match_moves'),
    rel: {
      matches: num((await monitorPool.query("select pg_total_relation_size('matches') as n")).rows[0]?.n),
      match_moves: num((await monitorPool.query("select pg_total_relation_size('match_moves') as n")).rows[0]?.n),
      match_participants: num((await monitorPool.query("select pg_total_relation_size('match_participants') as n")).rows[0]?.n),
    },
  };

  const finishedMatches = num(finishedStats?.matches);
  const rowBytesPerMatch = finishedMatches > 0
    ? Math.round((num(finishedStats?.state_bytes) + num(finishedStats?.turn_start_bytes) + num(finishedStats?.config_bytes) + num(finishedStats?.result_bytes) + num(finishedStats?.misc_bytes)) / finishedMatches)
    : 0;
  const moveRowsPerMatch = finishedMatches > 0 ? num(moveStats?.moves) / finishedMatches : 0;
  const moveBytesPerMatch = finishedMatches > 0
    ? Math.round((num(moveStats?.action_bytes) + num(moveStats?.events_bytes) + num(moveStats?.request_bytes)) / finishedMatches)
    : 0;
  const tableRelDelta =
    after.rel.matches - before.rel.matches + (after.rel.match_moves - before.rel.match_moves) + (after.rel.match_participants - before.rel.match_participants);
  const totalBytesPerMatch = rowBytesPerMatch + moveBytesPerMatch;

  const report = {
    meta: {
      runId: RUN_ID,
      when: new Date().toISOString(),
      mode: MODE,
      rulesVersion: CURRENT_RULES_VERSION,
      matches: MATCHES,
      players: PLAYERS,
      concurrency: CONCURRENCY,
      durationSec: DURATION_S,
      actualDurationSec: actualDurationS,
      paceMs: PACE_MS,
      poolMax: POOL,
      maxMatches: MAX_MATCHES,
      database: redactUrl(url),
      edgeUrl: EDGE_URL,
      edgeProbe: EDGE_PROBE,
    },
    latency: {
      local: { view: stats(latencyLocal.view), submit: stats(latencyLocal.submit), other: stats(latencyLocal.other) },
      edge: { view: stats(latencyEdge.view), submit: stats(latencyEdge.submit) },
    },
    requests: requestCount,
    counters,
    serverErrors,
    errors: {
      local: { byCode: Object.fromEntries(localErrors.byCode), byStatus: Object.fromEntries(localErrors.byStatus) },
      edge: { byCode: Object.fromEntries(edgeErrors.byCode), byStatus: Object.fromEntries(edgeErrors.byStatus) },
    },
    db: {
      peakConnections,
      maxConnections: await count(monitorPool, "select setting::int as n from pg_settings where name = 'max_connections'"),
      dbSizeBefore: before.dbSize,
      dbSizeAfter: after.dbSize,
      dbSizeDelta: after.dbSize - before.dbSize,
      rowsBefore: before,
      rowsAfter: after,
    },
    storage: {
      finishedMatches,
      participantRows,
      rowBytesPerMatch,
      moveRowsPerMatch: Math.round(moveRowsPerMatch * 10) / 10,
      moveBytesPerMatch,
      totalBytesPerMatch,
      breakdownPerMatch: {
        matches_state: finishedMatches > 0 ? Math.round(num(finishedStats?.state_bytes) / finishedMatches) : 0,
        matches_turn_start_state: finishedMatches > 0 ? Math.round(num(finishedStats?.turn_start_bytes) / finishedMatches) : 0,
        matches_config_result_invite: finishedMatches > 0 ? Math.round((num(finishedStats?.config_bytes) + num(finishedStats?.result_bytes) + num(finishedStats?.misc_bytes)) / finishedMatches) : 0,
        match_moves_action: finishedMatches > 0 ? Math.round(num(moveStats?.action_bytes) / finishedMatches) : 0,
        match_moves_events: finishedMatches > 0 ? Math.round(num(moveStats?.events_bytes) / finishedMatches) : 0,
      },
      tableRelationDeltaAllMatches: tableRelDelta,
      projection: {
        oneThousandMatchesBytes: totalBytesPerMatch * 1000,
        tenThousandMatchesBytes: totalBytesPerMatch * 10000,
      },
    },
  };

  console.log('\n===== LOAD TEST RESULT =====');
  console.log(JSON.stringify(report, null, 2));
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${OUT_PATH}`);

  // --- cleanup: delete exactly the rows we tracked (never a table-wide delete)
  if (!KEEP) {
    console.log('\ncleaning up tracked rows…');
    const owned = await monitorPool.query(
      'select distinct match_id as id from match_participants where player_id = any($1::uuid[])',
      [ids.players],
    );
    const allMatches = [...new Set([...matchIds, ...owned.rows.map((r) => String(r.id))])];
    const rateBuckets = [
      ...new Set([
        ...ids.rateBuckets,
        ...players.flatMap((p) => [`join:player:${p.id}`, `actions:player:${p.id}`]),
        'guest:ip:unknown',
        'join:ip:unknown',
      ]),
    ];
    const del = async (sql: string, values: readonly unknown[]): Promise<number> => {
      const { rows } = await monitorPool.query(sql, values);
      return rows.length;
    };
    await del('delete from match_moves where match_id = any($1::uuid[])', [allMatches]);
    await del('delete from match_participants where match_id = any($1::uuid[])', [allMatches]);
    await del('delete from matches where id = any($1::uuid[])', [allMatches]);
    await del('delete from device_link_codes where player_id = any($1::uuid[])', [ids.players]);
    await del('delete from player_tokens where player_id = any($1::uuid[])', [ids.players]);
    await del('delete from players where id = any($1::uuid[])', [ids.players]);
    await del('delete from rate_limits where bucket = any($1::text[])', [rateBuckets]);
    console.log(`deleted ${allMatches.length} match(es), ${ids.players.length} player(s), ${rateBuckets.length} rate bucket(s)`);
    writeFileSync(IDS_PATH, JSON.stringify({ runId: RUN_ID, players: [], matches: [], rateBuckets: [] }));
  } else {
    console.log(`--keep: rows left in the database, tracked in ${IDS_PATH}`);
  }

  clearInterval(monitor);
  await (pool as unknown as { end?: () => Promise<void> }).end?.();
  await (monitorPool as unknown as { end?: () => Promise<void> }).end?.();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
};

const isEntryPoint = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
};

if (isEntryPoint()) {
  void main().catch((error: unknown) => {
    console.error(`LOAD TEST FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
