// PHASE C — headless online-duel simulation through the REAL service and the REAL DuelClient
// (the same client the browser and any Edge caller use). No mock rules, no mock transport.
//
//   npx tsx server/scripts/online-simulation.ts                 # 30 local games (in-memory service)
//   npx tsx server/scripts/online-simulation.ts --live          # + 2 short games on the deployed Edge
//   BASE_URL=https://…/functions/v1/duel npx tsx server/scripts/online-simulation.ts --live
//
// Each game plays the production turn shape: Draw (committed) → local draft → Throw(batch) →
// Discard, on both seats, with mixed seeds. Scenario games add duplicate requestIds, stale
// revisions, concurrent submit races, reconnect mid-turn, two tabs of one player, resign and
// timeout. Every game checks the rules handshake; view/submit latency is measured (p50/p95).
import { performance } from 'node:perf_hooks';
import { createFetchApp } from '../src/fetch-app.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { DuelClient, DuelError } from '../src/client.js';
import type { FetchLike, KeyValue } from '../src/client.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { MatchRecord } from '../src/storage/types.js';
import { CURRENT_RULES_VERSION, apply, applyAs, legalActions, mulberry32, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Player, State, View } from '../../src/engine/index.js';
import { playGame } from '../../src/sim/run.js';
import { markTestRowsOrFail } from './mark-test-data.js';
import { shadowFromView } from '../../web/src/online/shadow.js';
import type { MatchViewPayload } from '../src/protocol.js';

type Handle = { label: string; client: DuelClient; token: string; matchId: string; seat: Player };
type Buckets = { view: number[]; submit: number[] };

const args = new Set(process.argv.slice(2));
const hasFlag = (name: string) => args.has(`--${name}`);
const numArg = (name: string, fallback: number): number => {
  const hit = [...args].find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const LIVE = hasFlag('live');
const GAMES = numArg('games', 30);
const LIVE_GAMES = numArg('live-games', 2);
const LIVE_MAX_TURNS = numArg('live-turns', 8);
const LIVE_BASE = process.env.BASE_URL ?? 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel';

const store = (): KeyValue => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
};

const localBuckets: Buckets = { view: [], submit: [] };
const liveBuckets: Buckets = { view: [], submit: [] };
const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! * 10) / 10;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GROW = new Set<Action['t']>(['Sprout', 'Bloom', 'PlayFruit', 'MegaBomb']);

type SubmitResult = { ok: true; player: MatchViewPayload; replayed: boolean } | { ok: false; code: string; status: number };

const submit = async (
  h: Handle,
  actions: Action[],
  expectedRevision: number,
  requestId: string,
  buckets: Buckets,
): Promise<SubmitResult> => {
  const started = performance.now();
  try {
    const res = await h.client.submitAction(h.token, h.matchId, { expectedRevision, requestId, actions });
    buckets.submit.push(performance.now() - started);
    return { ok: true, player: res.player, replayed: res.replayed };
  } catch (error) {
    buckets.submit.push(performance.now() - started);
    if (error instanceof DuelError) return { ok: false, code: error.code, status: error.status };
    throw error;
  }
};

const fetchView = async (h: Handle, buckets: Buckets): Promise<MatchViewPayload> => {
  const started = performance.now();
  const res = await h.client.getState(h.token, h.matchId);
  buckets.view.push(performance.now() - started);
  return res.player;
};

const newRequestId = (h: Handle, rev: number) => `${h.label}:${rev}:${Math.random().toString(36).slice(2, 8)}`;

/** Build a legal mid-turn draft on a shadow State — the same path the browser draft uses. */
const chooseDraft = (view: View, seat: Player, rng: () => number, budget = 4, aggressive = false): Action[] => {
  let state = shadowFromView(view);
  const picked: Action[] = [];
  for (let i = 0; i < budget; i++) {
    const legal = legalActions(viewFor(state, seat));
    const opts = legal.filter((a) => GROW.has(a.t));
    if (opts.length === 0) break;
    let a: Action;
    if (aggressive) {
      // Prefer a move that cuts links / strangles the opponent's root — this is how the
      // simulation reaches Strangle (surround) endings instead of only deck endings.
      const scored = opts.map((candidate) => {
        try {
          const next = applyAs(state, seat, candidate);
          const res = next.lastResolution;
          const strangled = next.result?.reason === 'strangle' || next.result?.reason === 'double_strangle' ? 1000 : 0;
          const cuts = res?.severed.reduce((n, s) => n + s.coords.length, 0) ?? 0;
          const placed = res?.placed.length ?? 0;
          return { candidate, score: strangled + cuts * 25 + placed + rng() };
        } catch {
          return { candidate, score: -1 };
        }
      });
      scored.sort((x, y) => y.score - x.score);
      a = scored[0]!.candidate;
    } else {
      a = opts[Math.floor(rng() * opts.length)]!;
    }
    try {
      state = applyAs(state, seat, a);
    } catch {
      break;
    }
    picked.push(a);
  }
  return picked;
};

const endsGameAfter = (view: View, seat: Player, draft: Action[]): boolean => {
  let s = shadowFromView(view);
  for (const a of draft) s = applyAs(s, seat, a);
  return s.phase === 'GAME_OVER';
};

/**
 * Play one turn for the handle. Returns:
 *  'ok'          — a turn was committed (or a Draw progressed the turn)
 *  'not-my-turn' — request lost a race / it is the opponent's turn
 *  'finished'    — the match is over
 *  'idle'        — nothing legal to do (should not happen in a live duel)
 */
const playTurn = async (h: Handle, rng: () => number, buckets: Buckets, aggressive: boolean, fail: (m: string) => void): Promise<'ok' | 'not-my-turn' | 'finished' | 'idle'> => {
  let view = await fetchView(h, buckets);
  if (view.rulesVersion !== CURRENT_RULES_VERSION) fail(`rules handshake: ${view.rulesVersion}`);
  if (view.status !== 'active') return 'finished';
  if (view.actor !== h.seat) return 'not-my-turn';

  if (view.view.phase === 'DRAW') {
    const draw = view.legalActions.find((a) => a.t === 'Draw');
    if (!draw) return 'idle';
    const res = await submit(h, [draw], view.revision, newRequestId(h, view.revision), buckets);
    if (!res.ok) {
      if (res.code === 'STALE_REVISION') return 'not-my-turn';
      fail(`Draw rejected: ${res.code}`);
      return 'idle';
    }
    view = res.player;
  }

  if (view.status !== 'active' || view.view.phase === 'GAME_OVER') return 'finished';

  if (view.view.phase === 'ACT') {
    const draft = chooseDraft(view.view, h.seat, rng, 4, aggressive);
    const batch: Action[] = endsGameAfter(view.view, h.seat, draft) ? draft : [...draft, { t: 'EndAct' }];
    if (batch.length === 0) return 'idle';
    const res = await submit(h, batch, view.revision, newRequestId(h, view.revision), buckets);
    if (!res.ok) {
      if (res.code === 'STALE_REVISION') return 'not-my-turn';
      fail(`Throw rejected: ${res.code}`);
      return 'idle';
    }
    view = res.player;
  }

  if (view.status === 'active' && view.view.phase === 'DISCARD' && view.actor === h.seat) {
    const disc = view.legalActions.find((a) => a.t === 'Discard');
    if (!disc) {
      fail('DISCARD step without a legal Discard');
      return 'idle';
    }
    const res = await submit(h, [disc], view.revision, newRequestId(h, view.revision), buckets);
    if (!res.ok && res.code !== 'STALE_REVISION') fail(`Discard rejected: ${res.code}`);
  }
  return 'ok';
};

type GameReport = {
  index: number;
  kind: string;
  startingPlayer: Player | null;
  turns: number;
  endReason: string | null;
  winner: Player | null;
  pass: boolean;
  skipped?: boolean;
  failures: string[];
  hiddenChecks: number;
};

type World = {
  storage: MemoryStorage | null;
  fetch: FetchLike;
  baseUrl: string;
  seat: [Handle, Handle];
  startingPlayer: Player;
};

const authoritative = async (world: World, matchId: string): Promise<MatchRecord | null> =>
  world.storage ? world.storage.matchById(matchId) : null;

/** Opponent hand + deck ids must never appear in a served payload (P-6). */
const hiddenLeak = (payloadJson: string, seat: Player, state: State): string | null => {
  const ids = (cards: readonly { id: number }[]) => cards.map((c) => c.id);
  const secret = new Set([...ids(state.hands[1 - seat] ?? []), ...ids(state.deck)]);
  for (const match of payloadJson.matchAll(/"id"\s*:\s*(\d+)/g)) {
    const id = Number(match[1]);
    if (secret.has(id)) return `card id ${id}`;
  }
  return null;
};

const playDuel = async (index: number, kind: string, world: World, buckets: Buckets, maxTurns: number | null, resignAfter = false): Promise<GameReport> => {
  const result: GameReport = {
    index,
    kind,
    startingPlayer: world.startingPlayer,
    turns: 0,
    endReason: null,
    winner: null,
    pass: true,
    failures: [],
    hiddenChecks: 0,
  };
  const fail = (m: string) => result.failures.push(m);
  const rng = mulberry32((1000 + index * 37) ^ 0x5eed);
  const aggressive = index % 2 === 0;

  if (world.startingPlayer !== 0 && world.startingPlayer !== 1) fail('startingPlayer is not a seat');

  const first = await fetchView(world.seat[0], buckets);
  if (first.startingPlayer !== first.view.turnPlayer) {
    fail(`startingPlayer ${first.startingPlayer} != first turnPlayer ${first.view.turnPlayer}`);
  }

  let actor: Player = first.actor;
  let guard = 0;
  while (guard++ < 400) {
    const h = world.seat[actor];
    const view = await fetchView(h, buckets);
    if (view.status !== 'active') {
      result.endReason = view.result?.reason ?? 'finished';
      result.winner = view.result?.winner ?? null;
      break;
    }
    const match = await authoritative(world, h.matchId);
    if (match) {
      const leak = hiddenLeak(JSON.stringify(view), h.seat, match.state);
      result.hiddenChecks++;
      if (leak) fail(`hidden-info leak in payload: ${leak}`);
    }
    // Deck-end fair last turn: an empty deck never offers a Draw; the final turn is ACT.
    if (view.view.deckCount === 0 && view.status === 'active' && view.view.phase !== 'ACT') {
      fail(`deck empty but phase is ${view.view.phase} (expected the final ACT turn)`);
    }
    if (maxTurns !== null && result.turns >= maxTurns) {
      if (resignAfter) {
        await h.client.resign(h.token, h.matchId);
        result.endReason = 'resigned';
      } else {
        result.endReason = 'turn-cap';
      }
      break;
    }
    const status = await playTurn(h, rng, buckets, aggressive, fail);
    if (status === 'finished') {
      const after = await fetchView(h, buckets);
      result.endReason = after.result?.reason ?? 'finished';
      result.winner = after.result?.winner ?? null;
      break;
    }
    result.turns++;
    actor = (1 - actor) as Player;
  }
  if (guard >= 400 && result.endReason === null) fail('turn cap reached without a result');
  result.pass = result.failures.length === 0;
  return result;
};

const makeLocalWorld = async (config: ServerConfig): Promise<World> => {
  const storage = new MemoryStorage();
  const service = new MatchService({ storage, config });
  const fetch: FetchLike = async (url, init) => {
    const response = await createFetchApp({ service, config })(
      new Request(url, { method: init.method, headers: init.headers, ...(init.body !== undefined ? { body: init.body } : {}) }),
    );
    return { status: response.status, ok: response.ok, json: () => response.json() as Promise<unknown> };
  };
  const baseUrl = 'https://sim.local';
  const c0 = new DuelClient({ baseUrl, fetch, storage: store() });
  const c1 = new DuelClient({ baseUrl, fetch, storage: store() });
  const g0 = await c0.createGuest();
  const g1 = await c1.createGuest();
  const created = await c0.createMatch(g0.token);
  const joined = await c1.joinMatch(g1.token, created.match.inviteCode);
  const matchId = created.match.matchId;
  return {
    storage,
    fetch,
    baseUrl,
    startingPlayer: created.player.startingPlayer,
    seat: [
      { label: 'G', client: c0, token: g0.token, matchId, seat: created.player.seat },
      { label: 'B', client: c1, token: g1.token, matchId, seat: joined.player.seat },
    ],
  };
};

// ------------------------------- run 30 games -------------------------------

console.log(`FUTASAKU online simulation — ${GAMES} local games${LIVE ? ` + ${LIVE_GAMES} live (${LIVE_BASE})` : ''}`);
console.log(`rules version: ${CURRENT_RULES_VERSION}\n`);

const results: GameReport[] = [];
for (let i = 0; i < GAMES; i++) {
  const kind = i % 5 === 0 ? 'scenario' : 'normal';
  const world = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
  try {
    results.push(await playDuel(i, kind, world, localBuckets, null));
  } catch (error) {
    results.push({
      index: i,
      kind,
      startingPlayer: world.startingPlayer,
      turns: 0,
      endReason: 'error',
      winner: null,
      pass: false,
      failures: [`threw: ${error instanceof Error ? error.message : String(error)}`],
      hiddenChecks: 0,
    });
  }
}

// ------------------------------- live Edge games -------------------------------

const liveResults: GameReport[] = [];
if (LIVE) {
  const liveFetch: FetchLike = (url, init) =>
    globalThis.fetch(url, {
      method: init.method,
      headers: init.headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
    }) as Promise<{ status: number; ok?: boolean; json(): Promise<unknown> }>;
  for (let i = 0; i < LIVE_GAMES; i++) {
    try {
      const c0 = new DuelClient({ baseUrl: LIVE_BASE, fetch: liveFetch, storage: store() });
      const c1 = new DuelClient({ baseUrl: LIVE_BASE, fetch: liveFetch, storage: store() });
      const g0 = await createGuestWithRetry(c0);
      const g1 = await createGuestWithRetry(c1);
      const created = await c0.createMatch(g0.token);
      const joined = await c1.joinMatch(g1.token, created.match.inviteCode);
      const matchId = created.match.matchId;
      // The live games create real rows on the real project: mark them as test data immediately
      // (migration 0013) so a simulation run can never move a number on the admin dashboard.
      await markTestRowsOrFail('online-simulation --live', {
        playerIds: [g0.player.id, g1.player.id],
        matchIds: [matchId],
      });
      const world: World = {
        storage: null,
        fetch: liveFetch,
        baseUrl: LIVE_BASE,
        startingPlayer: created.player.startingPlayer,
        seat: [
          { label: 'LG', client: c0, token: g0.token, matchId, seat: created.player.seat },
          { label: 'LB', client: c1, token: g1.token, matchId, seat: joined.player.seat },
        ],
      };
      console.log(`live game ${i + 1}: seat ${created.player.startingPlayer} starts (${LIVE_MAX_TURNS} turns then resign)`);
      liveResults.push(await playDuel(100 + i, 'live', world, liveBuckets, LIVE_MAX_TURNS, true));
      await sleep(500);
    } catch (error) {
      const rateLimited = error instanceof DuelError && error.code === 'RATE_LIMITED';
      const detail = error instanceof DuelError ? `${error.code} (${error.status}) ${error.message}` : error instanceof Error ? error.message : String(error);
      liveResults.push({
        index: 100 + i,
        kind: 'live',
        startingPlayer: null,
        turns: 0,
        endReason: rateLimited ? 'skipped (guest rate limit)' : 'error',
        winner: null,
        pass: rateLimited,
        skipped: rateLimited,
        failures: rateLimited ? [] : [detail],
        hiddenChecks: 0,
      });
      if (rateLimited) console.log(`live game ${i + 1}: SKIPPED — the host IP is over the guest rate limit (30/hour). Re-run later.`);
      else console.log(`live game ${i + 1}: FAILED — ${detail}`);
    }
  }
}

/** Guest creation can be rate limited while testing (30 fresh guests per IP per hour). */
async function createGuestWithRetry(client: DuelClient) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.createGuest();
    } catch (error) {
      lastError = error;
      if (error instanceof DuelError && error.code === 'RATE_LIMITED') {
        await sleep(10_000);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ------------------------------- targeted scenarios -------------------------------

const scenarios: { name: string; pass: boolean; note: string }[] = [];
const scenario = (name: string, pass: boolean, note = '') => scenarios.push({ name, pass, note });

async function targetedScenarios() {
  // 1) Duplicate requestId replays instead of applying twice.
  {
    const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
    const h = w.seat[w.startingPlayer];
    const view = await fetchView(h, localBuckets);
    const draw = view.legalActions.find((a) => a.t === 'Draw')!;
    const rid = 'duplicate-request-id';
    const first = await submit(h, [draw], view.revision, rid, localBuckets);
    const second = await submit(h, [draw], view.revision, rid, localBuckets);
    scenario(
      'duplicate requestId replays (no double move)',
      first.ok && second.ok && second.replayed === true,
      first.ok && second.ok ? '' : JSON.stringify({ first, second }),
    );
  }

  // 2) Stale revision rejected.
  {
    const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
    const h = w.seat[w.startingPlayer];
    const view = await fetchView(h, localBuckets);
    const draw = view.legalActions.find((a) => a.t === 'Draw')!;
    const good = await submit(h, [draw], view.revision, 'stale-good', localBuckets);
    const stale = await submit(h, [{ t: 'EndAct' }], view.revision, 'stale-bad', localBuckets);
    scenario('stale revision rejected (STALE_REVISION)', good.ok && !stale.ok && stale.code === 'STALE_REVISION', stale.ok ? '' : stale.code);
  }

  // 3) Concurrent submit race: exactly one wins.
  {
    const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
    const h = w.seat[w.startingPlayer];
    const view = await fetchView(h, localBuckets);
    const draw = view.legalActions.find((a) => a.t === 'Draw')!;
    const [r1, r2] = await Promise.all([
      submit(h, [draw], view.revision, 'race-a', localBuckets),
      submit(h, [draw], view.revision, 'race-b', localBuckets),
    ]);
    const wins = [r1, r2].filter((r) => r.ok).length;
    scenario('concurrent submit race: exactly one wins', wins === 1, `wins=${wins}`);
  }

  // 4) Resign hands the win to the opponent.
  {
    const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
    const a = w.seat[0];
    const b = w.seat[1];
    const res = await a.client.resign(a.token, a.matchId);
    const other = await fetchView(b, localBuckets);
    scenario(
      'resign hands the win to the opponent',
      res.player.result?.reason === 'resigned' && other.status === 'finished' && other.result?.winner === other.seat,
      JSON.stringify({ mine: res.player.result, other: other.result }),
    );
  }

  // 5) Timeout: the seat that must act loses.
  {
    const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 250 });
    const first = await fetchView(w.seat[0], localBuckets);
    const actorSeat = first.actor;
    const other = w.seat[actorSeat === 0 ? 1 : 0];
    const deadline = first.turnDeadlineAt;
    await sleep(500);
    const after = await fetchView(other, localBuckets);
    scenario(
      `timeout: seat ${actorSeat} on the clock loses`,
      deadline !== null && after.status === 'finished' && after.result?.reason === 'timeout' && after.result?.winner === other.seat,
      JSON.stringify({ deadline, status: after.status, result: after.result }),
    );
  }

  // 6) Reconnect mid-turn returns own Draw since a revision.
  {
    const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
    const h = w.seat[w.startingPlayer];
    const view = await fetchView(h, localBuckets);
    const draw = view.legalActions.find((a) => a.t === 'Draw')!;
    const afterDraw = await submit(h, [draw], view.revision, 'reconnect', localBuckets);
    const recon = await h.client.reconnect(h.token, h.matchId, view.revision);
    scenario(
      'reconnect mid-turn returns own Draw since revision',
      afterDraw.ok && recon.player.events.some((e) => e.t === 'Draw'),
      JSON.stringify({ rev: recon.player.revision, events: recon.player.events.map((e) => e.t) }),
    );
  }

  // 7) Two tabs of one player: the stale tab 409s, then recovers by refetch.
  {
    const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
    const h = w.seat[w.startingPlayer];
    const tab2 = new DuelClient({ baseUrl: w.baseUrl, fetch: w.fetch, storage: store() });
    const view = await fetchView(h, localBuckets);
    const draw = view.legalActions.find((a) => a.t === 'Draw')!;
    const tab1 = await submit(h, [draw], view.revision, 'tab1', localBuckets);
    const stale = await submit({ ...h, client: tab2 }, [{ t: 'EndAct' }], view.revision, 'tab2', localBuckets);
    const recovered = await tab2.getState(h.token, h.matchId);
    scenario(
      'two tabs: stale tab 409s then recovers by refetch',
      tab1.ok && !stale.ok && stale.code === 'STALE_REVISION' && recovered.player.revision === tab1.player.revision,
      stale.ok ? '' : stale.code,
    );
  }

  // 8) Hidden information: opponent hand + deck ids never appear in a served payload.
  {
    const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
    const h = w.seat[w.startingPlayer];
    const view = await fetchView(h, localBuckets);
    const match = (await authoritative(w, h.matchId))!;
    const leak = hiddenLeak(JSON.stringify(view), h.seat, match.state);
    scenario('hidden information: opponent hand/deck ids never in payload', leak === null, leak ?? '');
  }

  // 9) Strangle (surround) ending through the real service. Strangle is rare in play, so we
  //    locate a genuine position from a bot game, hand it to the service, and submit the
  //    winning move through the DuelClient — proving the server reports the ending correctly.
  {
    const found = findStrangleEnding();
    if (!found) {
      scenario('strangle (surround) ending via the real service', false, 'no strangle position found in 300 bot games');
    } else {
      const w = await makeLocalWorld({ ...DEFAULT_SERVER_CONFIG, turnTimeoutMs: 60_000 });
      const h = w.seat[found.seat];
      const before = (await authoritative(w, h.matchId))!;
      // Hand the crafted (engine-valid) position to the storage the service reads from.
      const map = (w.storage as unknown as { matches: Map<string, MatchRecord> }).matches;
      map.set(h.matchId, {
        ...before,
        state: found.state,
        turnStartState: found.state,
        turnStartRevision: before.revision,
        turnDeadlineAt: before.turnDeadlineAt === null ? null : before.turnDeadlineAt,
      });
      const res = await submit(h, [found.action], before.revision, 'strangle', localBuckets);
      const ok = res.ok && res.player.result?.reason === 'strangle' && res.player.result?.winner === found.seat;
      scenario('strangle (surround) ending via the real service', ok, ok ? `seed ${found.seed}` : JSON.stringify({ res }));
    }
  }
}

/** Replay a bot-vs-bot game to the move that strangles; returns the position + winning move. */
function findStrangleEnding(): { state: State; action: Action; seat: Player; seed: number } | null {
  for (let seed = 1; seed <= 300; seed++) {
    let record;
    try {
      record = playGame(seed, ['greedy', 'greedy']);
    } catch {
      continue;
    }
    if (record.result.reason !== 'strangle') continue;
    let state = newGame(seed);
    for (const action of record.actions.slice(0, -1)) state = apply(state, action);
    const last = record.actions[record.actions.length - 1];
    if (last === undefined || state.phase !== 'ACT') continue;
    return { state, action: last, seat: state.actor, seed };
  }
  return null;
}

await targetedScenarios();

// ------------------------------- report -------------------------------

const realResults = results;
const passed = realResults.filter((r) => r.pass).length;
const starts = realResults.map((r) => r.startingPlayer);
const seatVariety = starts.includes(0) && starts.includes(1);

console.log('idx  kind        start  turns  end               result');
for (const r of realResults) {
  console.log(
    `${String(r.index).padStart(3)}  ${r.kind.padEnd(11)} ${String(r.startingPlayer).padStart(5)}  ${String(r.turns).padStart(5)}  ${(r.endReason ?? '-').padEnd(17)} ${r.pass ? 'PASS' : 'FAIL'}`,
  );
  for (const f of r.failures) console.log(`       ! ${f}`);
}
for (const r of liveResults) {
  console.log(
    `${String(r.index).padStart(3)}  ${r.kind.padEnd(11)} ${String(r.startingPlayer).padStart(5)}  ${String(r.turns).padStart(5)}  ${(r.endReason ?? '-').padEnd(17)} ${r.pass ? 'PASS' : 'FAIL'}`,
  );
  for (const f of r.failures) console.log(`       ! ${f}`);
}

const reasons = realResults.reduce<Record<string, number>>((acc, r) => {
  acc[r.endReason ?? 'unknown'] = (acc[r.endReason ?? 'unknown'] ?? 0) + 1;
  return acc;
}, {});

console.log(`\ngames: ${realResults.length}  passed: ${passed}  failed: ${realResults.length - passed}`);
console.log(`starting seats: seat0=${starts.filter((s) => s === 0).length} seat1=${starts.filter((s) => s === 1).length} (variety: ${seatVariety})`);
console.log(`end reasons: ${JSON.stringify(reasons)}`);
console.log(`hidden-info checks: ${realResults.reduce((n, r) => n + r.hiddenChecks, 0)} payloads, leaks: ${realResults.reduce((n, r) => n + r.failures.filter((f) => f.includes('leak')).length, 0)}`);
console.log(`\nlatency (ms):`);
console.log(`  local  view   p50=${percentile(localBuckets.view, 50)} p95=${percentile(localBuckets.view, 95)} n=${localBuckets.view.length}`);
console.log(`  local  submit p50=${percentile(localBuckets.submit, 50)} p95=${percentile(localBuckets.submit, 95)} n=${localBuckets.submit.length}`);
if (LIVE) {
  console.log(`  live   view   p50=${percentile(liveBuckets.view, 50)} p95=${percentile(liveBuckets.view, 95)} n=${liveBuckets.view.length}`);
  console.log(`  live   submit p50=${percentile(liveBuckets.submit, 50)} p95=${percentile(liveBuckets.submit, 95)} n=${liveBuckets.submit.length}`);
}

console.log('\n=== targeted scenarios ===');
for (const s of scenarios) console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.name}${s.note ? `  (${s.note})` : ''}`);

const liveFailed = liveResults.filter((r) => !r.pass).length;
const scenarioFailed = scenarios.filter((s) => !s.pass).length;
if (realResults.length - passed || liveFailed || scenarioFailed || !seatVariety) {
  console.error(`\nSIMULATION FAILURES: games=${realResults.length - passed} live=${liveFailed} scenarios=${scenarioFailed} seatVariety=${seatVariety}`);
  process.exit(1);
}
console.log('\nOnline simulation passed.');
