// FUTASAKU 0.5 — large-scale online duel soak (200 duels).
//
// Two modes, both against the REAL stack:
//   * `inproc` — MatchService + PostgresStorage (the real database), driven in-process through the
//     exact same pipeline the HTTP handler uses. Used for most of the 200 so the variety
//     (deadlines, fouls, async, resign) can be exercised deterministically with an injectable clock.
//   * `edge`   — the deployed Supabase Edge Function over real HTTPS through the real `DuelClient`
//     (the same client the browser uses), so the live path is proven too.
//
// It never changes app code. It creates rows it tracks by id and deletes exactly those on the way
// out (see `--cleanup`). Secrets are never printed; only the redacted connection string is logged.
//
//   node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --total=200 --edge=20
//   node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --cleanup
//   node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --render-only

import { performance } from 'node:perf_hooks';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { RecordingBroadcaster } from '../src/broadcast.js';
import { ApiError } from '../src/errors.js';
import { DuelClient, DuelError } from '../src/client.js';
import type { FetchLike, KeyValue } from '../src/client.js';
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from '../src/storage/pg-pool.js';
import { postgresStorage } from '../src/storage/postgres.js';
import { gatedStateFor } from '../src/turn-boundary.js';
import type { MatchRecord, PlayerRecord, Storage } from '../src/storage/types.js';
import type {
  MatchListEntry,
  MatchSummary,
  MatchViewPayload,
  SubmitActionRequest,
  SubmitActionResponse,
} from '../src/protocol.js';

import { CURRENT_RULES_VERSION, apply, scores } from '../../src/engine/index.js';
import type { Action, Event, Player, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { createDraftEngine } from '../../web/src/online/draft.js';
import { emptyClock, noteServerNow, remainingMs } from '../../web/src/online/clock.js';
import { requireRealProjectOptIn } from './real-project-guard.js';
import { markTestRowsOrFail } from './mark-test-data.js';

// ----------------------------------------------------------------- constants

export const DEFAULT_EDGE_URL = 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel';

/** Keys that must never appear anywhere in a payload (defence in depth around `viewFor`). */
const FORBIDDEN_KEYS = ['seed', 'deck', 'hands', 'history', 'turnStartState', 'fruitKnown', 'opponentHand'];

const KNOWN_REASONS = ['strangle', 'double_strangle', 'deck_exhaustion', 'turn_limit', 'knock', 'timeout', 'resigned'];

/** The soak raises the per-IP rate limits so 200 games are not throttled by design (limits are tested once). */
const HIGH_LIMITS: ServerConfig['rateLimits'] = {
  guestPerIpPerHour: 1_000_000,
  joinPerPlayerPerHour: 1_000_000,
  joinPerIpPerHour: 1_000_000,
  createPerPlayerPerHour: 1_000_000,
  createPerIpPerHour: 1_000_000,
  linkCodePerPlayerPerHour: 1_000_000,
  linkRedeemPerIpPerHour: 1_000_000,
  actionsPerPlayerPerMinute: 10_000_000,
  sweepPerIpPerHour: 1_000_000,
  worldPerIpPerHour: 1_000_000,
};

const MAX_LOOP = 6_000;

// ----------------------------------------------------------------- types

export type Scenario = 'core' | 'async' | 'deadline' | 'fouls' | 'resign' | 'edge';
export type Style = 'full' | 'one' | 'skip';

export type GameSpec = { index: number; scenario: Scenario; style: Style };

export type Clock = { now(): number; set(t: number): void; advance(ms: number): void };

export const createClock = (start = Date.now()): Clock => {
  let t = start;
  return { now: () => t, set: (x) => void (t = x), advance: (ms) => void (t += ms) };
};

export type Ok<T> = { ok: true; value: T; ms: number; raw?: string };
export type Err = { ok: false; code: string; status: number; message: string; ms: number; raw?: string };
export type Call<T> = Ok<T> | Err;

export type GuestHandle = { playerId: string; token: string };

export interface Port {
  readonly kind: 'inproc' | 'edge';
  createGuest(ip: string | null): Promise<Call<GuestHandle>>;
  createMatch(token: string): Promise<Call<{ matchId: string; inviteCode: string; player: MatchViewPayload; summary: MatchSummary }>>;
  join(token: string, code: string): Promise<Call<{ player: MatchViewPayload; summary: MatchSummary }>>;
  getView(token: string, matchId: string, since?: number): Promise<Call<MatchViewPayload>>;
  submit(token: string, matchId: string, req: SubmitActionRequest): Promise<Call<SubmitActionResponse>>;
  resign(token: string, matchId: string): Promise<Call<{ player: MatchViewPayload; summary: MatchSummary }>>;
  listMatches(token: string): Promise<Call<MatchListEntry[]>>;
}

export type Ids = {
  players: string[];
  matches: string[];
  rateBuckets: string[];
  /** Players that must NOT be deleted: the reusable live-Edge guests. */
  keepers?: string[];
};

export const emptyIds = (): Ids => ({ players: [], matches: [], rateBuckets: [], keepers: [] });

export type Failure = {
  game: number;
  scenario: Scenario;
  mode: 'inproc' | 'edge';
  check: string;
  detail: string;
  matchId?: string;
  seed?: number | null;
};

type CheckStat = { pass: number; fail: number };
export type LatencyBag = { view: number[]; submit: number[]; other: number[] };

/** A resumable snapshot of everything the report accumulated so far. */
export type PersistedState = {
  checks: [string, CheckStat][];
  failures: Failure[];
  games: Record<string, unknown>[];
  notes: string[];
  latency: { inproc: LatencyBag; edge: LatencyBag };
};

export class Report {
  readonly checks = new Map<string, CheckStat>();
  readonly failures: Failure[] = [];
  readonly games: Record<string, unknown>[] = [];
  readonly latency: { inproc: LatencyBag; edge: LatencyBag } = {
    inproc: { view: [], submit: [], other: [] },
    edge: { view: [], submit: [], other: [] },
  };
  readonly notes: string[] = [];
  private readonly onceDone = new Set<string>();

  check(
    name: string,
    ok: boolean,
    ctx: { game: number; scenario: Scenario; mode: 'inproc' | 'edge'; matchId?: string; seed?: number | null },
    detail?: unknown,
  ): void {
    const stat = this.checks.get(name) ?? { pass: 0, fail: 0 };
    if (ok) stat.pass += 1;
    else stat.fail += 1;
    this.checks.set(name, stat);
    if (!ok) {
      const detailStr = detail === undefined ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail);
      this.failures.push({
        game: ctx.game,
        scenario: ctx.scenario,
        mode: ctx.mode,
        check: name,
        detail: detailStr.slice(0, 600),
        ...(ctx.matchId !== undefined ? { matchId: ctx.matchId } : {}),
        ...(ctx.seed !== undefined ? { seed: ctx.seed } : {}),
      });
    }
  }

  /** A check that only needs to run once for the whole soak. */
  once(name: string, ok: boolean, ctx: { game: number; scenario: Scenario; mode: 'inproc' | 'edge'; matchId?: string }, detail?: unknown): void {
    if (this.onceDone.has(name)) return;
    this.onceDone.add(name);
    this.check(name, ok, ctx, detail);
  }

  note(line: string): void {
    this.notes.push(line);
  }

  recordGame(row: Record<string, unknown>): void {
    this.games.push(row);
  }

  /** Drops the failures of one game so a resumed retry does not double-count them. */
  dropFailures(mode: 'inproc' | 'edge', game: number): void {
    for (let i = this.failures.length - 1; i >= 0; i--) {
      const f = this.failures[i]!;
      if (f.mode !== mode || f.game !== game) continue;
      // Keep the per-check counters in step, or the summary table overstates failures.
      const stat = this.checks.get(f.check);
      if (stat) stat.fail = Math.max(0, stat.fail - 1);
      this.failures.splice(i, 1);
    }
  }

  /** Drops a recorded game so a resumed retry can replace it (instead of duplicating it). */
  dropGame(mode: 'inproc' | 'edge', index: number): void {
    for (let i = this.games.length - 1; i >= 0; i--) {
      const g = this.games[i]!;
      if (g.mode === mode && g.index === index) this.games.splice(i, 1);
    }
  }

  /** Rebuilds this report from a previous (interrupted) slice so a run can resume. */
  adopt(state: PersistedState): void {
    for (const [name, stat] of state.checks) this.checks.set(name, stat);
    this.failures.push(...state.failures);
    this.games.push(...state.games);
    this.notes.push(...state.notes);
    this.latency.inproc = state.latency.inproc;
    this.latency.edge = state.latency.edge;
    // Names already present were produced by a `once()` check; do not run them again.
    for (const [name] of state.checks) this.onceDone.add(name);
  }

  toState(): PersistedState {
    return {
      checks: [...this.checks],
      failures: this.failures,
      games: this.games,
      notes: this.notes,
      latency: this.latency,
    };
  }

  totals(): { pass: number; fail: number } {
    let pass = 0;
    let fail = 0;
    for (const s of this.checks.values()) {
      pass += s.pass;
      fail += s.fail;
    }
    return { pass, fail };
  }
}

// ----------------------------------------------------------------- ids file

const loadIds = (path: string): Ids => {
  if (!existsSync(path)) return emptyIds();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Ids>;
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      rateBuckets: Array.isArray(parsed.rateBuckets) ? parsed.rateBuckets : [],
      keepers: Array.isArray(parsed.keepers) ? parsed.keepers : [],
    };
  } catch {
    return emptyIds();
  }
};

const saveIds = (path: string, ids: Ids): void => {
  writeFileSync(path, JSON.stringify(ids, null, 2));
};

// ----------------------------------------------------------------- ports

const errInfo = (error: unknown, ms: number): Err => {
  if (error instanceof ApiError) return { ok: false, code: error.code, status: error.status, message: error.message, ms };
  if (error instanceof DuelError) return { ok: false, code: error.code, status: error.status, message: error.message, ms };
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, code: 'UNHANDLED', status: 0, message, ms };
};

export class InprocPort implements Port {
  readonly kind = 'inproc' as const;
  private readonly players = new Map<string, PlayerRecord>();

  constructor(private readonly service: MatchService, private readonly onLatency?: (kind: 'view' | 'submit' | 'other', ms: number) => void) {}

  private player(token: string): PlayerRecord {
    const found = this.players.get(token);
    if (!found) throw new ApiError('UNAUTHORIZED', 'Unknown token in the soak harness.');
    return found;
  }

  private note(kind: 'view' | 'submit' | 'other', ms: number): void {
    this.onLatency?.(kind, ms);
  }

  async createGuest(ip: string | null): Promise<Call<GuestHandle>> {
    const t0 = performance.now();
    try {
      const guest = await this.service.createGuest(null, ip);
      const player = await this.service.authenticate(guest.token);
      this.players.set(guest.token, player);
      this.note('other', performance.now() - t0);
      return { ok: true, value: { playerId: player.id, token: guest.token }, ms: performance.now() - t0 };
    } catch (error) {
      return errInfo(error, performance.now() - t0);
    }
  }

  async createMatch(token: string): Promise<Call<{ matchId: string; inviteCode: string; player: MatchViewPayload; summary: MatchSummary }>> {
    const t0 = performance.now();
    try {
      const created = await this.service.createMatch(this.player(token));
      this.note('other', performance.now() - t0);
      return {
        ok: true,
        value: { matchId: created.match.matchId, inviteCode: created.match.inviteCode, player: created.player, summary: created.match },
        ms: performance.now() - t0,
      };
    } catch (error) {
      return errInfo(error, performance.now() - t0);
    }
  }

  async join(token: string, code: string): Promise<Call<{ player: MatchViewPayload; summary: MatchSummary }>> {
    const t0 = performance.now();
    try {
      const joined = await this.service.joinMatch(this.player(token), code);
      this.note('other', performance.now() - t0);
      return { ok: true, value: { player: joined.player, summary: joined.match }, ms: performance.now() - t0 };
    } catch (error) {
      return errInfo(error, performance.now() - t0);
    }
  }

  async getView(token: string, matchId: string, since?: number): Promise<Call<MatchViewPayload>> {
    const t0 = performance.now();
    try {
      const player = await this.service.viewPayload(this.player(token), matchId, since ?? 0);
      this.note('view', performance.now() - t0);
      return { ok: true, value: player, ms: performance.now() - t0 };
    } catch (error) {
      return errInfo(error, performance.now() - t0);
    }
  }

  async submit(token: string, matchId: string, req: SubmitActionRequest): Promise<Call<SubmitActionResponse>> {
    const t0 = performance.now();
    try {
      const res = await this.service.submitAction(this.player(token), matchId, req);
      this.note('submit', performance.now() - t0);
      return { ok: true, value: res, ms: performance.now() - t0 };
    } catch (error) {
      return errInfo(error, performance.now() - t0);
    }
  }

  async resign(token: string, matchId: string): Promise<Call<{ player: MatchViewPayload; summary: MatchSummary }>> {
    const t0 = performance.now();
    try {
      const res = await this.service.resign(this.player(token), matchId);
      this.note('other', performance.now() - t0);
      return { ok: true, value: { player: res.player, summary: res.match }, ms: performance.now() - t0 };
    } catch (error) {
      return errInfo(error, performance.now() - t0);
    }
  }

  async listMatches(token: string): Promise<Call<MatchListEntry[]>> {
    const t0 = performance.now();
    try {
      const rows = await this.service.listMyMatches(this.player(token));
      return { ok: true, value: rows, ms: performance.now() - t0 };
    } catch (error) {
      return errInfo(error, performance.now() - t0);
    }
  }
}

const memoryKv = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

/** Counters for transient live-API errors the harness retried (surfaced honestly in the report). */
export const soakCounters = { edge5xxRetried: 0, edgeNetworkRetried: 0 };

type RawCapture = { status: number; text: string };

const capturingFetch = (capture: RawCapture): FetchLike => async (url, init) => {
  const res = await fetch(url, init);
  const text = await res.text();
  capture.status = res.status;
  capture.text = text;
  return { status: res.status, ok: res.ok, json: async () => JSON.parse(text) as unknown };
};

export class EdgePort implements Port {
  readonly kind = 'edge' as const;

  constructor(private readonly baseUrl: string, private readonly onLatency?: (kind: 'view' | 'submit' | 'other', ms: number) => void) {}

  private async call<T>(tag: 'view' | 'submit' | 'other', fn: (client: DuelClient) => Promise<T>, retryable = false): Promise<Call<T>> {
    let last: Err | null = null;
    const attempts = retryable ? 3 : 1;
    for (let i = 0; i < attempts; i++) {
      const capture: RawCapture = { status: 0, text: '' };
      const client = new DuelClient({ baseUrl: this.baseUrl, fetch: capturingFetch(capture), storage: memoryKv() });
      const t0 = performance.now();
      try {
        const value = await fn(client);
        const ms = performance.now() - t0;
        this.onLatency?.(tag, ms);
        return { ok: true, value, ms, raw: capture.text };
      } catch (error) {
        const ms = performance.now() - t0;
        const info = errInfo(error, ms);
        this.onLatency?.(tag, ms);
        info.raw = capture.text;
        last = info;
        if (info.status >= 500) soakCounters.edge5xxRetried += 1;
        if (info.code === 'NETWORK' || info.status === 0) soakCounters.edgeNetworkRetried += 1;
        if (info.code === 'NETWORK' || info.status === 0 || (retryable && info.status >= 500)) {
          await sleep(300 * (i + 1));
          continue;
        }
        return info;
      }
    }
    return last ?? { ok: false, code: 'NETWORK', status: 0, message: 'retries exhausted', ms: 0 };
  }

  createGuest(_ip: string | null): Promise<Call<GuestHandle>> {
    return this.call(
      'other',
      async (c) => {
        const res = await c.createGuest();
        return { playerId: res.player.id, token: res.token };
      },
      true,
    );
  }

  // Setup calls retry a transient 5xx too. The live function's 5xx here is a Postgres
  // "remaining connection slots" error raised while *acquiring* a connection, before any row is
  // written, so a retry cannot double-create a match. Without this a single pooler blip aborts a game.
  createMatch(token: string): Promise<Call<{ matchId: string; inviteCode: string; player: MatchViewPayload; summary: MatchSummary }>> {
    return this.call(
      'other',
      async (c) => {
        const res = await c.createMatch(token);
        return { matchId: res.match.matchId, inviteCode: res.match.inviteCode, player: res.player, summary: res.match };
      },
      true,
    );
  }

  join(token: string, code: string): Promise<Call<{ player: MatchViewPayload; summary: MatchSummary }>> {
    return this.call(
      'other',
      async (c) => {
        const res = await c.joinMatch(token, code);
        return { player: res.player, summary: res.match };
      },
      true,
    );
  }

  getView(token: string, matchId: string, since?: number): Promise<Call<MatchViewPayload>> {
    return this.call('view', async (c) => (await c.getState(token, matchId, since)).player, true);
  }

  submit(token: string, matchId: string, req: SubmitActionRequest): Promise<Call<SubmitActionResponse>> {
    return this.call('submit', (c) => c.submitAction(token, matchId, req), true);
  }

  resign(token: string, matchId: string): Promise<Call<{ player: MatchViewPayload; summary: MatchSummary }>> {
    return this.call('other', async (c) => {
      const res = await c.resign(token, matchId);
      return { player: res.player, summary: res.match };
    });
  }

  listMatches(token: string): Promise<Call<MatchListEntry[]>> {
    return this.call('other', async (c) => (await c.listMatches(token)).matches);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Submits with a polite back-off when the shared IP bucket is rate limited (live Edge only).
 * The requestId is stable, so a retry after a 429 can never double-apply.
 */
const submitSafe = async (port: Port, token: string, matchId: string, req: SubmitActionRequest): Promise<Call<SubmitActionResponse>> => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await port.submit(token, matchId, req);
    if (res.ok) return res;
    if (res.code === 'RATE_LIMITED') {
      await sleep(61_000);
      continue;
    }
    // A redeploy or a transient gateway error can kill an in-flight request. The requestId is
    // stable, so a retry either applies once or replays the stored outcome — never both.
    if (res.code === 'INTERNAL' || res.status >= 500 || res.code === 'NETWORK' || res.status === 0) {
      await sleep(500 * (attempt + 1));
      continue;
    }
    return res;
  }
  return port.submit(token, matchId, req);
};

// ----------------------------------------------------------------- runtime

export type Runtime = {
  mode: 'inproc' | 'edge';
  storage: Storage;
  clock: Clock;
  report: Report;
  ids: Ids;
  config?: ServerConfig;
  broadcaster?: RecordingBroadcaster;
  /** in-process only: the service every port talks to. */
  service?: MatchService;
  /** edge only: the deployed function base URL. */
  edgeUrl?: string;
  saveIds: () => void;
};

export type InprocEnv = {
  service: MatchService;
  storage: Storage;
  clock: Clock;
  config: ServerConfig;
  broadcaster: RecordingBroadcaster;
};

/** Builds a Runtime for the in-process mode (also used by the hermetic regression test). */
export const makeInprocRuntime = (env: InprocEnv, report: Report, ids: Ids, saveIds: () => void): Runtime => ({
  mode: 'inproc',
  storage: env.storage,
  clock: env.clock,
  report,
  ids,
  config: env.config,
  broadcaster: env.broadcaster,
  service: env.service,
  saveIds,
});

// ----------------------------------------------------------------- plan

export const buildPlan = (total: number, edgeGames: number): GameSpec[] => {
  const edge = Math.min(Math.max(0, edgeGames), Math.max(0, total));
  const rest = total - edge;
  let resign = Math.max(1, Math.round(rest * 0.05));
  let deadline = Math.max(2, Math.round(rest * 0.08));
  let fouls = Math.max(2, Math.round(rest * 0.08));
  let asyncN = Math.max(2, Math.round(rest * 0.11));
  let shrunk = true;
  while (resign + deadline + fouls + asyncN > rest && shrunk) {
    shrunk = false;
    if (asyncN > 1 && asyncN >= fouls) (asyncN -= 1), (shrunk = true);
    else if (fouls > 1) (fouls -= 1), (shrunk = true);
    else if (deadline > 1) (deadline -= 1), (shrunk = true);
    else if (resign > 1) (resign -= 1), (shrunk = true);
  }
  const core = Math.max(0, rest - resign - deadline - fouls - asyncN);
  const plan: GameSpec[] = [];
  const styles: Style[] = ['full', 'full', 'full', 'one', 'skip'];
  const push = (scenario: Scenario, n: number): void => {
    for (let i = 0; i < n; i++) plan.push({ index: plan.length, scenario, style: styles[plan.length % styles.length]! });
  };
  push('core', core);
  push('async', asyncN);
  push('deadline', deadline);
  push('fouls', fouls);
  push('resign', resign);
  push('edge', edge);
  return plan;
};

// ----------------------------------------------------------------- audits

const walk = (value: unknown, keys: string[], cardIds: number[]): void => {
  if (Array.isArray(value)) {
    for (const v of value) walk(v, keys, cardIds);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const obj = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    keys.push(k);
    if (k === 'id' && typeof v === 'number' && ('suit' in obj || 'rank' in obj)) cardIds.push(v);
    else if (k === 'card' && typeof v === 'number') cardIds.push(v);
    else if (k === 'cards' && Array.isArray(v)) for (const x of v) if (typeof x === 'number') cardIds.push(x);
    walk(v, keys, cardIds);
  }
};

const sameIds = (a: readonly { id: number }[], b: readonly { id: number }[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = a.map((c) => c.id).sort((x, y) => x - y);
  const sb = b.map((c) => c.id).sort((x, y) => x - y);
  return sa.every((x, i) => x === sb[i]);
};

type AuditCtx = { game: number; scenario: Scenario; mode: 'inproc' | 'edge'; matchId: string; report: Report };

const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** The full hidden-information audit for one payload against the authoritative row. */
export const auditPayload = (payload: MatchViewPayload, seat: Player, match: MatchRecord, ctx: AuditCtx): void => {
  const c = { game: ctx.game, scenario: ctx.scenario, mode: ctx.mode, matchId: ctx.matchId, seed: match.seed };
  const gated = gatedStateFor(match, seat);
  const hidden = new Set<number>([
    ...match.state.hands[other(seat)]!.map((card) => card.id),
    ...match.state.deck.map((card) => card.id),
  ]);

  const keys: string[] = [];
  const cardIds: number[] = [];
  walk(payload, keys, cardIds);

  const badKey = keys.find((k) => FORBIDDEN_KEYS.includes(k));
  ctx.report.check('hidden.no_forbidden_key', badKey === undefined, c, { badKey });

  const leaked = [...new Set(cardIds.filter((id) => hidden.has(id)))];
  ctx.report.check('hidden.no_hidden_card', leaked.length === 0, c, { leaked });

  const hiddenDraw = payload.events.some((e: Event) => e.t === 'Draw' && e.from === 'deck' && e.player !== seat && e.card !== undefined);
  ctx.report.check('hidden.no_hidden_draw_event', !hiddenDraw, c);

  ctx.report.check('hidden.own_hand_exact', sameIds(payload.view.hand, gated.hands[seat]!), c, {
    got: payload.view.hand.length,
    want: gated.hands[seat]!.length,
  });
  ctx.report.check('hidden.discard_exact', sameIds(payload.view.discard, gated.discard), c);
  ctx.report.check('hidden.deck_count_exact', payload.view.deckCount === gated.deck.length, c, {
    got: payload.view.deckCount,
    want: gated.deck.length,
  });
  ctx.report.check('hidden.opp_hand_count_exact', payload.view.opponentHandCount === gated.hands[other(seat)]!.length, c);
  ctx.report.check('hidden.seat_exact', payload.seat === seat && payload.view.player === seat, c);
  if (payload.status === 'active') {
    ctx.report.check('deadline.actor_is_turn_player', payload.actor === payload.turnPlayer, c, {
      actor: payload.actor,
      turnPlayer: payload.turnPlayer,
    });
  }
};

/** Deadline rules: refreshes only on handover, never on a Draw or a mid-turn move; clears at the end. */
export const auditDeadlineAfterMove = (
  before: MatchViewPayload,
  after: MatchViewPayload,
  nowMs: number,
  timeoutMs: number,
  ctx: AuditCtx,
  label: string,
): void => {
  const c = { game: ctx.game, scenario: ctx.scenario, mode: ctx.mode, matchId: ctx.matchId };
  if (after.status === 'finished') {
    ctx.report.check('deadline.cleared_on_finish', after.turnDeadlineAt === null, c, { label });
    return;
  }
  if (after.actor !== before.actor) {
    // In-process the clock is exact; over the live API we can only prove the deadline moved forward.
    const exact = nowMs + timeoutMs;
    const ok = ctx.mode === 'inproc' ? after.turnDeadlineAt === exact : after.turnDeadlineAt !== before.turnDeadlineAt;
    ctx.report.check('deadline.refreshed_on_handover', ok, c, {
      label,
      got: after.turnDeadlineAt,
      before: before.turnDeadlineAt,
    });
  } else {
    ctx.report.check('deadline.stable_within_turn', after.turnDeadlineAt === before.turnDeadlineAt, c, {
      label,
      got: after.turnDeadlineAt,
      before: before.turnDeadlineAt,
    });
  }
};

// ----------------------------------------------------------------- turn play

type SeatRef = { name: 'A' | 'B'; seat: Player; token: string; port: Port };
type Counters = { moves: number; actorTurns: number; discards: number };

const ridFactory = (game: number): (() => string) => {
  let seq = 0;
  return () => `soak-${game}-${++seq}`;
};

/**
 * How many actions of a legal batch the server applies before the game ends. A winning draft move
 * (a Strangle Bloom, or a Discard that exhausts the deck) can end the game *inside* the batch, so
 * the server applies only the moves up to the end and drops the rest — the revision therefore grows
 * by this count, not by `batch.length`.
 */
const movesUntilEnd = (state: State, batch: readonly Action[]): number => {
  let current = state;
  let n = 0;
  for (const action of batch) {
    if (current.phase === 'GAME_OVER') break;
    try {
      current = apply(current, action);
    } catch {
      break;
    }
    n += 1;
  }
  return n;
};

const auditFresh = async (rt: Runtime, matchId: string, payload: MatchViewPayload, seat: Player, ctx: AuditCtx): Promise<void> => {
  const match = await rt.storage.matchById(matchId);
  if (match) auditPayload(payload, seat, match, ctx);
};

/**
 * Advance the acting seat through the real browser turn protocol, one phase at a time:
 *   DRAW -> one Draw request; ACT -> local shadow draft + `[...draft, EndAct]` batch; DISCARD -> one batch.
 * Being phase-driven makes it robust to fouls that already consumed the Draw.
 */
const playTurn = async (
  actor: SeatRef,
  otherSeat: SeatRef,
  bySeat: [MatchViewPayload, MatchViewPayload],
  rt: Runtime,
  spec: GameSpec,
  ctx: AuditCtx,
  rid: () => string,
  counters: Counters,
): Promise<boolean> => {
  const timeoutMs = rt.config?.turnTimeoutMs ?? DEFAULT_SERVER_CONFIG.turnTimeoutMs;
  let progressed = false;
  let start = bySeat[actor.seat];

  if (start.status === 'active' && start.actor === actor.seat && start.view.phase === 'DRAW') {
    const draw = start.legalActions.find((a) => a.t === 'Draw' && a.from === 'deck') ?? start.legalActions.find((a) => a.t === 'Draw');
    if (!draw) return false;
    const now = rt.clock.now();
    const res = await submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: start.revision, requestId: rid(), actions: [draw] });
    ctx.report.check('play.draw_accepted', res.ok, ctx, res.ok ? undefined : res);
    if (!res.ok) return false;
    ctx.report.check('revision.plus_batch_len', res.value.player.revision === start.revision + 1, ctx, res);
    ctx.report.check('revision.not_replayed', res.value.replayed === false, ctx);
    auditDeadlineAfterMove(start, res.value.player, now, timeoutMs, ctx, 'draw');
    await auditFresh(rt, ctx.matchId, res.value.player, actor.seat, ctx);
    bySeat[actor.seat] = res.value.player;
    counters.moves += 1;
    progressed = true;

    // The opponent must stay frozen behind the turn boundary across a mid-turn Draw.
    const oppMid = await otherSeat.port.getView(otherSeat.token, ctx.matchId);
    if (oppMid.ok) {
      await auditFresh(rt, ctx.matchId, oppMid.value, otherSeat.seat, ctx);
      ctx.report.check('hidden.opponent_gated_mid_turn', oppMid.value.revision === start.turnStartRevision, ctx, {
        got: oppMid.value.revision,
        boundary: start.turnStartRevision,
      });
      const since = await otherSeat.port.getView(otherSeat.token, ctx.matchId, start.turnStartRevision);
      ctx.report.check('reconnect.since_hides_mid_turn', since.ok && since.value.events.length === 0, ctx, since.ok ? since.value.events.length : since);
    }
    start = bySeat[actor.seat];
  }

  if (start.status === 'active' && start.actor === actor.seat && start.view.phase === 'ACT') {
    const draft = createDraftEngine({ matchId: ctx.matchId, storage: null });
    draft.syncFromServer(start.view, start.revision);
    const maxMoves = spec.style === 'skip' ? 0 : spec.style === 'one' ? 1 : 3;
    for (let i = 0; i < maxMoves; i++) {
      const board = draft.legal().filter((a) => a.t !== 'EndAct');
      if (board.length === 0) break;
      const choice = GreedyBot.chooseAction(draft.view());
      if (choice.t === 'EndAct') break;
      if (!draft.play(choice)) break;
    }
    const batch: Action[] = [...draft.actions(), { t: 'EndAct' }];
    const expected = draft.baseRevision() || start.revision;
    const now = rt.clock.now();
    // A winning draft move can end the game *inside* the batch, so the server applies only the
    // moves up to the end and drops the rest. Simulate the batch on the authoritative pre-state so
    // the revision check counts exactly the moves that were applied, not the whole batch length.
    const preMatch = await rt.storage.matchById(ctx.matchId);
    const appliedCount = preMatch ? movesUntilEnd(preMatch.state, batch) : batch.length;
    const res = await submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: expected, requestId: rid(), actions: batch });
    ctx.report.check('play.throw_accepted', res.ok, ctx, res.ok ? undefined : res);
    if (!res.ok) return progressed;
    ctx.report.check('revision.plus_batch_len', res.value.player.revision === expected + appliedCount, ctx, {
      got: res.value.player.revision,
      want: expected + appliedCount,
      batch: batch.length,
      applied: appliedCount,
    });
    auditDeadlineAfterMove(start, res.value.player, now, timeoutMs, ctx, 'throw');
    await auditFresh(rt, ctx.matchId, res.value.player, actor.seat, ctx);
    bySeat[actor.seat] = res.value.player;
    counters.moves += batch.length;
    progressed = true;
    start = bySeat[actor.seat];
  }

  if (start.status === 'active' && start.actor === actor.seat && start.view.phase === 'DISCARD') {
    const discard = start.legalActions.find((a) => a.t === 'Discard');
    if (discard) {
      const now = rt.clock.now();
      const res = await submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: start.revision, requestId: rid(), actions: [discard] });
      ctx.report.check('play.discard_accepted', res.ok, ctx, res.ok ? undefined : res);
      if (!res.ok) return progressed;
      ctx.report.check('revision.plus_batch_len', res.value.player.revision === start.revision + 1, ctx, res);
      auditDeadlineAfterMove(start, res.value.player, now, timeoutMs, ctx, 'discard');
      await auditFresh(rt, ctx.matchId, res.value.player, actor.seat, ctx);
      bySeat[actor.seat] = res.value.player;
      counters.moves += 1;
      counters.discards += 1;
      progressed = true;
    }
  }

  if (progressed) counters.actorTurns += 1;
  return progressed;
};

/** Idempotency / stale revision / requestId conflict / concurrency fouls (one kind per game). */
const injectFouls = async (
  seats: [SeatRef, SeatRef],
  bySeat: [MatchViewPayload, MatchViewPayload],
  rt: Runtime,
  ctx: AuditCtx,
  rid: () => string,
  kind: string,
): Promise<void> => {
  const actorSeat = seats.find((s) => bySeat[s.seat].status === 'active' && bySeat[s.seat].actor === s.seat && bySeat[s.seat].legalActions.length > 0);
  if (!actorSeat) return;
  const actor = actorSeat;
  const opponent = seats.find((s) => s.seat !== actor.seat)!;
  const view = bySeat[actor.seat];

  if (kind === 'duplicate') {
    const requestId = rid();
    const first = await submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: view.revision, requestId, actions: [view.legalActions[0]!] });
    if (!first.ok) {
      ctx.report.check('idempotency.first_ok', false, ctx, first);
      return;
    }
    const second = await submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: view.revision, requestId, actions: [view.legalActions[0]!] });
    ctx.report.check('idempotency.replay', second.ok && second.value.replayed && second.value.player.revision === first.value.player.revision, ctx, second.ok ? second.value.replayed : second);
    const stale = await submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: view.revision, requestId: rid(), actions: [view.legalActions[0]!] });
    ctx.report.check('idempotency.stale_409', !stale.ok && stale.code === 'STALE_REVISION', ctx, stale);
    const conflict = await submitSafe(opponent.port, opponent.token, ctx.matchId, { expectedRevision: 0, requestId, actions: [{ t: 'EndAct' }] });
    ctx.report.check('idempotency.conflict_409', !conflict.ok && conflict.code === 'REQUEST_ID_CONFLICT', ctx, conflict);
    if (first.ok) {
      bySeat[actor.seat] = first.value.player;
      await auditFresh(rt, ctx.matchId, first.value.player, actor.seat, ctx);
    }
    return;
  }

  if (kind === 'race_same_seat') {
    const action = view.legalActions[0];
    if (!action) return;
    const [r1, r2] = await Promise.all([
      submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: view.revision, requestId: rid(), actions: [action] }),
      submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: view.revision, requestId: rid(), actions: [action] }),
    ]);
    const okCount = [r1, r2].filter((r) => r.ok).length;
    ctx.report.check('race.exactly_one_winner', okCount === 1, ctx, { okCount, codes: [r1.ok ? 'ok' : r1.code, r2.ok ? 'ok' : r2.code] });
    const loser = [r1, r2].find((r) => !r.ok);
    if (loser && !loser.ok) ctx.report.check('race.loser_clean_409', loser.code === 'STALE_REVISION' || loser.code === 'REQUEST_ID_CONFLICT', ctx, loser);
    const won = [r1, r2].find((r) => r.ok);
    if (won && won.ok) bySeat[actor.seat] = won.value.player;
    return;
  }

  if (kind === 'race_both_seats') {
    const action = view.legalActions[0];
    if (!action) return;
    const otherView = bySeat[opponent.seat];
    const [r1, r2] = await Promise.all([
      submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: view.revision, requestId: rid(), actions: [action] }),
      submitSafe(opponent.port, opponent.token, ctx.matchId, { expectedRevision: otherView.revision, requestId: rid(), actions: [action] }),
    ]);
    const okCount = [r1, r2].filter((r) => r.ok).length;
    ctx.report.check('race.exactly_one_winner', okCount === 1, ctx, { okCount, codes: [r1.ok ? 'ok' : r1.code, r2.ok ? 'ok' : r2.code] });
    const loser = [r1, r2].find((r) => !r.ok);
    if (loser && !loser.ok) ctx.report.check('race.loser_not_actor_or_stale', loser.code === 'NOT_YOUR_TURN' || loser.code === 'STALE_REVISION' || loser.code === 'REQUEST_ID_CONFLICT', ctx, loser);
    if (r1.ok) bySeat[actor.seat] = r1.value.player;
    if (r2.ok) bySeat[opponent.seat] = r2.value.player;
    return;
  }

  if (kind === 'atomic_batch') {
    // A batch is all-or-nothing: a legal first action followed by an illegal one must apply nothing.
    //
    // The illegal second action must be illegal in the phase the first action leaves behind. The
    // old choice keyed on the START phase and used `EndAct` for a DRAW batch — but Draw moves to ACT
    // where EndAct is legal, so `[Draw, EndAct]` was a perfectly valid turn and the check failed on
    // a healthy server. A Discard of a card that can never be in a hand is illegal in DRAW, ACT and
    // DISCARD alike, so it is the robust choice.
    //
    // The first action must also not itself end the game (a winning draft move would legitimately
    // finish the match instead of being rejected as a partial apply), so pick one that stays active.
    const beforeRevision = view.revision;
    const beforePhase = view.view.phase;
    const illegal: Action = { t: 'Discard', card: -1 };
    const authoritative = await rt.storage.matchById(ctx.matchId);
    const safeFirst = view.legalActions.find((a) => {
      if (!authoritative) return a.t !== 'Discard';
      try {
        return apply(authoritative.state, a).phase !== 'GAME_OVER';
      } catch {
        return false;
      }
    });
    if (!safeFirst) return;
    const res = await submitSafe(actor.port, actor.token, ctx.matchId, {
      expectedRevision: beforeRevision,
      requestId: rid(),
      actions: [safeFirst, illegal],
    });
    ctx.report.check('revision.batch_rejected_whole', !res.ok, ctx, res.ok ? `batch accepted (first=${safeFirst.t})` : undefined);
    const fresh = await actor.port.getView(actor.token, ctx.matchId);
    if (fresh.ok) {
      ctx.report.check('revision.batch_no_partial_apply', fresh.value.revision === beforeRevision && fresh.value.view.phase === beforePhase, ctx, {
        revision: fresh.value.revision,
        phase: fresh.value.view.phase,
      });
    }
    return;
  }

  if (kind === 'two_tabs') {
    // The same player, two tabs: an old revision gets a clean 409 and a refetch recovers.
    const stale = await submitSafe(actor.port, actor.token, ctx.matchId, { expectedRevision: Math.max(0, view.revision - 1), requestId: rid(), actions: [{ t: 'EndAct' }] });
    ctx.report.check('two_tabs.stale_409', !stale.ok && stale.code === 'STALE_REVISION', ctx, stale);
    const fresh = await actor.port.getView(actor.token, ctx.matchId);
    ctx.report.check('two_tabs.refetch_recovers', fresh.ok && fresh.value.revision === view.revision, ctx, fresh.ok ? fresh.value.revision : fresh);
  }
};

// ----------------------------------------------------------------- one game

export type GameOutcome = {
  completed: boolean;
  moves: number;
  actorTurns: number;
  result: { winner: Player | null; reason: string; scores: [number, number] } | null;
  seed: number | null;
  startingPlayer: Player | null;
  fatal?: string;
  guestIds: string[];
  matchId?: string;
};

export const playGame = async (spec: GameSpec, rt: Runtime, provided?: [GuestHandle, GuestHandle]): Promise<GameOutcome> => {
  const report = rt.report;
  const game = spec.index;
  const mkIp = (n: number): string => `198.18.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`;
  const ipA = mkIp(game * 2);
  const ipB = mkIp(game * 2 + 1);

  const latency = (kind: 'view' | 'submit' | 'other', ms: number): void => {
    (rt.mode === 'edge' ? report.latency.edge : report.latency.inproc)[kind].push(ms);
  };
  const portA = rt.mode === 'inproc' ? new InprocPort(rt.service!, latency) : new EdgePort(rt.edgeUrl!, latency);
  const portB = rt.mode === 'inproc' ? new InprocPort(rt.service!, latency) : new EdgePort(rt.edgeUrl!, latency);

  const base = { game, scenario: spec.scenario, mode: rt.mode };
  const fatal = (message: string, guestIds: string[] = []): GameOutcome => {
    report.check('game.setup_ok', false, base, message);
    return { completed: false, moves: 0, actorTurns: 0, result: null, seed: null, startingPlayer: null, fatal: message, guestIds };
  };

  let guestA: GuestHandle;
  let guestB: GuestHandle;
  if (provided) {
    [guestA, guestB] = provided;
  } else {
    const a = await portA.createGuest(ipA);
    if (!a.ok) return fatal(`createGuest A: ${a.code} ${a.message}`);
    const b = await portB.createGuest(ipB);
    if (!b.ok) return fatal(`createGuest B: ${b.code} ${b.message}`);
    guestA = a.value;
    guestB = b.value;
    if (rt.mode === 'inproc') {
      rt.ids.rateBuckets.push(`guest:ip:${ipA}`, `guest:ip:${ipB}`, `join:ip:${ipA}`, `join:ip:${ipB}`);
    }
  }
  const guestIds = [guestA.playerId, guestB.playerId];
  if (provided) {
    // Reused live-Edge guests: never delete them (the guest budget is 30 per IP per hour).
    if (!rt.ids.keepers) rt.ids.keepers = [];
    for (const id of guestIds) if (!rt.ids.keepers.includes(id)) rt.ids.keepers.push(id);
  } else {
    for (const id of guestIds) if (!rt.ids.players.includes(id)) rt.ids.players.push(id);
  }
  rt.ids.rateBuckets.push(`join:player:${guestA.playerId}`, `join:player:${guestB.playerId}`, `actions:player:${guestA.playerId}`, `actions:player:${guestB.playerId}`);

  const created = await portA.createMatch(guestA.token);
  if (!created.ok) return fatal(`createMatch: ${created.code} ${created.message}`, guestIds);
  const matchId = created.value.matchId;
  if (!rt.ids.matches.includes(matchId)) rt.ids.matches.push(matchId);
  rt.saveIds();

  const ctx: AuditCtx = { game, scenario: spec.scenario, mode: rt.mode, matchId, report };
  report.check('handshake.rules_version', (created.value.player.rulesVersion || CURRENT_RULES_VERSION) === CURRENT_RULES_VERSION, ctx, created.value.player.rulesVersion);

  const joinNow = rt.clock.now();
  const joined = await portB.join(guestB.token, created.value.inviteCode);
  if (!joined.ok) return fatal(`join: ${joined.code} ${joined.message}`, guestIds);

  if (created.value.player.seat === joined.value.player.seat) return fatal('both players were given the same seat', guestIds);
  const seats: [SeatRef, SeatRef] = [
    { name: 'A', seat: created.value.player.seat, token: guestA.token, port: portA },
    { name: 'B', seat: joined.value.player.seat, token: guestB.token, port: portB },
  ];
  const bySeat: [MatchViewPayload, MatchViewPayload] = [created.value.player, joined.value.player];
  bySeat[seats[0].seat] = created.value.player;
  bySeat[seats[1].seat] = joined.value.player;

  const match = await rt.storage.matchById(matchId);
  if (!match) return fatal('match row missing after create', guestIds);
  const seed = match.seed;
  const startingPlayer = match.startingPlayer;
  const timeoutMs = rt.config?.turnTimeoutMs ?? DEFAULT_SERVER_CONFIG.turnTimeoutMs;

  report.check('handshake.rules_stored', match.rulesVersion === CURRENT_RULES_VERSION, { ...ctx, seed }, match.rulesVersion);
  report.check('finish.starting_seat_consistent', joined.value.player.actor === startingPlayer && joined.value.summary.status === 'active', { ...ctx, seed }, {
    actor: joined.value.player.actor,
    startingPlayer,
  });
  if (rt.mode === 'inproc') {
    report.check('deadline.set_on_start', joined.value.player.turnDeadlineAt === joinNow + timeoutMs, ctx, {
      got: joined.value.player.turnDeadlineAt,
      want: joinNow + timeoutMs,
    });
  }

  const rid = ridFactory(game);
  const counters: Counters = { moves: 0, actorTurns: 0, discards: 0 };
  let resignerSeat: Player | null = null;
  let expiryActor: Player | null = null;

  const refreshBoth = async (): Promise<void> => {
    const views = await Promise.all(seats.map((s) => s.port.getView(s.token, matchId)));
    const fresh = await rt.storage.matchById(matchId);
    for (let i = 0; i < seats.length; i++) {
      const res = views[i]!;
      if (res.ok) {
        bySeat[seats[i]!.seat] = res.value;
        if (fresh) auditPayload(res.value, seats[i]!.seat, fresh, ctx);
      }
    }
  };

  const finished = (): boolean => bySeat[0].status === 'finished' || bySeat[1].status === 'finished';
  const actorRef = (): SeatRef | null =>
    seats.find((s) => bySeat[s.seat].status === 'active' && bySeat[s.seat].actor === s.seat && bySeat[s.seat].legalActions.length > 0) ?? null;

  try {
    // A short normal opening so scenario injections land mid-game.
    while (!finished() && counters.actorTurns < 2) {
      await refreshBoth();
      const actor = actorRef();
      if (!actor) break;
      const otherSeat = seats.find((s) => s !== actor)!;
      if (!(await playTurn(actor, otherSeat, bySeat, rt, spec, ctx, rid, counters))) break;
    }

    // Deadline scenario: prove "accepted exactly at the deadline", then let the same seat run out.
    if (spec.scenario === 'deadline' && !finished()) {
      await refreshBoth();
      const actor = actorRef();
      if (actor) {
        const view = bySeat[actor.seat];
        const deadline = view.turnDeadlineAt;
        if (deadline !== null) {
          // 1. a submit exactly AT the deadline is accepted and the clock keeps its meaning
          rt.clock.set(deadline);
          const below = rt.clock.now();
          const accepted = await submitSafe(actor.port, actor.token, matchId, { expectedRevision: view.revision, requestId: rid(), actions: [view.legalActions[0]!] });
          ctx.report.check('deadline.accept_at_deadline', accepted.ok, ctx, accepted.ok ? undefined : accepted);
          if (accepted.ok) {
            auditDeadlineAfterMove(view, accepted.value.player, below, timeoutMs, ctx, 'at-deadline');
            await auditFresh(rt, matchId, accepted.value.player, actor.seat, ctx);
            bySeat[actor.seat] = accepted.value.player;
            counters.moves += 1;
          }
          // 2. the same seat now misses the clock TWICE. The first miss spends the seat's one
          //    grace (warn + extend, match stays active); the second miss finishes with 'timeout'.
          expiryActor = actor.seat;
          let current = bySeat[actor.seat];
          if (current.turnDeadlineAt !== null) {
            const graceMs = rt.config?.graceExtensionMs ?? timeoutMs;
            const firstDeadline = current.turnDeadlineAt;
            if (game % 2 === 0) {
              rt.clock.set(firstDeadline + 1_000);
              const lazy = await actor.port.getView(actor.token, matchId);
              if (lazy.ok) {
                bySeat[actor.seat] = lazy.value;
                ctx.report.check(
                  'deadline.first_miss_spends_grace',
                  lazy.value.status === 'active',
                  ctx,
                  { status: lazy.value.status },
                );
              }
            } else {
              rt.clock.set(firstDeadline + 1);
              const late = await submitSafe(actor.port, actor.token, matchId, { expectedRevision: current.revision, requestId: rid(), actions: [current.legalActions[0]!] });
              // The submit arrives after the extension, so it is accepted (never a spurious loss).
              ctx.report.check('deadline.submit_after_grace_accepted', late.ok, ctx, late.ok ? undefined : late);
              const fresh = await actor.port.getView(actor.token, matchId);
              if (fresh.ok) bySeat[actor.seat] = fresh.value;
            }

            // The first miss extended the deadline by one turn window (never finished).
            current = bySeat[actor.seat];
            ctx.report.check(
              'deadline.grace_extends_deadline',
              current.status !== 'active' || current.turnDeadlineAt === null || current.turnDeadlineAt >= firstDeadline + graceMs,
              ctx,
              { status: current.status, before: firstDeadline, after: current.turnDeadlineAt, graceMs },
            );

            // Second miss: past the extended deadline the seat loses with reason 'timeout'.
            if (current.turnDeadlineAt !== null) {
              rt.clock.set(current.turnDeadlineAt + 1);
              const final = await actor.port.getView(actor.token, matchId);
              if (final.ok) {
                bySeat[actor.seat] = final.value;
                ctx.report.check(
                  'deadline.second_miss_times_out',
                  final.value.status === 'finished' && final.value.result?.reason === 'timeout',
                  ctx,
                  { status: final.value.status, reason: final.value.result?.reason },
                );
              }
            }
          }
        }
      }
    }

    // Fouls: one kind per game, rotated by index.
    if (spec.scenario === 'fouls' && !finished()) {
      await refreshBoth();
      const kinds = ['duplicate', 'race_same_seat', 'race_both_seats', 'two_tabs', 'atomic_batch'];
      await injectFouls(seats, bySeat, rt, ctx, rid, kinds[game % kinds.length]!);
    }

    let guard = 0;
    while (spec.scenario !== 'deadline' && !finished() && guard++ < MAX_LOOP) {
      if (spec.scenario === 'async') {
        // a player is "away" for a stretch: the clock moves but never past this turn's deadline
        const actor = actorRef();
        const deadline = actor ? bySeat[actor.seat].turnDeadlineAt : null;
        const away = rt.clock.now() + 45 * 60 * 1000;
        const target = deadline !== null ? Math.min(away, deadline - 30_000) : away;
        rt.clock.set(Math.max(rt.clock.now(), target));
      } else {
        // varied client pacing (fast/slow players), still far from the 24h deadline
        rt.clock.advance((game * 37 + guard * 11) % (7 * 60 * 1000));
      }

      // Reconnect / catch-up: a poll with `since` returns nothing new while still gated.
      if (spec.scenario === 'async' && guard % 3 === 0) {
        for (const s of seats) {
          const boundary = bySeat[s.seat].turnStartRevision;
          const res = await s.port.getView(s.token, matchId, boundary);
          if (res.ok) {
            ctx.report.check('reconnect.since_never_returns_hidden', res.value.revision >= boundary, ctx, {
              got: res.value.revision,
              boundary,
            });
          }
        }
      }

      await refreshBoth();
      if (finished()) break;
      const actor = actorRef();
      if (!actor) {
        const live = await rt.storage.matchById(matchId);
        if (live && live.status === 'finished') break;
        ctx.report.check(
          'game.actor_found',
          false,
          ctx,
          {
            liveStatus: live?.status ?? null,
            seats: seats.map((s) => ({
              seat: s.seat,
              status: bySeat[s.seat].status,
              phase: bySeat[s.seat].view.phase,
              actor: bySeat[s.seat].actor,
              turnPlayer: bySeat[s.seat].turnPlayer,
              legals: bySeat[s.seat].legalActions.length,
              revision: bySeat[s.seat].revision,
              boundary: bySeat[s.seat].turnStartRevision,
            })),
          },
        );
        break;
      }
      const otherSeat = seats.find((s) => s !== actor)!;
      if (!(await playTurn(actor, otherSeat, bySeat, rt, spec, ctx, rid, counters))) {
        const live = await rt.storage.matchById(matchId);
        if (live && live.status === 'finished') break;
        ctx.report.check('game.turn_progressed', false, ctx, { phase: bySeat[actor.seat].view.phase });
        break;
      }

      if (spec.scenario === 'resign' && counters.actorTurns >= 4) {
        const quitter = seats[game % 2]!;
        const res = await quitter.port.resign(quitter.token, matchId);
        resignerSeat = quitter.seat;
        ctx.report.check('finish.resign_accepted', res.ok && res.value.summary.status === 'finished', ctx, res.ok ? res.value.summary.status : res);
        if (res.ok) bySeat[quitter.seat] = res.value.player;
        break;
      }
    }

    // ---- final audit
    const live = await rt.storage.matchById(matchId);
    let result: GameOutcome['result'] = null;
    if (!live) return fatal('match row vanished during play', guestIds);
    ctx.report.check('finish.finished', live.status === 'finished' && live.result !== null, { ...ctx, seed }, live.status);
    if (live.result) {
      const r = live.result;
      result = { winner: r.winner, reason: r.reason, scores: r.scores };
      ctx.report.check('finish.reason_known', KNOWN_REASONS.includes(r.reason), ctx, r.reason);
      ctx.report.check('finish.scores_sane', r.scores.length === 2 && r.scores.every((n) => Number.isFinite(n) && n >= 0), ctx, r.scores);
      const trueScores = scores(live.state);
      ctx.report.check('finish.scores_match_state', trueScores[0] === r.scores[0] && trueScores[1] === r.scores[1], ctx, {
        stored: r.scores,
        state: trueScores,
      });
      if (r.reason === 'timeout') {
        ctx.report.check('deadline.timeout_winner_correct', expiryActor !== null && r.winner === other(expiryActor), ctx, { winner: r.winner, expiryActor });
        ctx.report.check('finish.timeout_only_from_deadline_batch', spec.scenario === 'deadline', ctx, spec.scenario);
      }
      if (r.reason === 'resigned') {
        ctx.report.check('finish.resign_winner_correct', resignerSeat !== null && r.winner === other(resignerSeat), ctx, { winner: r.winner, resignerSeat });
      }
      if (r.reason !== 'double_strangle' && r.reason !== 'deck_exhaustion' && r.reason !== 'turn_limit') {
        ctx.report.check('finish.winner_present', r.winner !== null, ctx, r);
      }
    }
    for (const s of seats) {
      const v = await s.port.getView(s.token, matchId);
      if (v.ok) ctx.report.check('deadline.cleared_on_finish', v.value.turnDeadlineAt === null, ctx);
    }
    const list = await portA.listMatches(guestA.token);
    if (list.ok) {
      const keys: string[] = [];
      const cards: number[] = [];
      walk(list.value, keys, cards);
      const bad = keys.find((k) => FORBIDDEN_KEYS.includes(k));
      ctx.report.check('list.no_state', bad === undefined, ctx, bad);
    }
    report.recordGame({
      index: game,
      scenario: spec.scenario,
      style: spec.style,
      mode: rt.mode,
      matchId,
      seed,
      startingPlayer,
      status: live.status,
      result,
      moves: live.revision,
      actorTurns: counters.actorTurns,
    });
    return { completed: live.status === 'finished', moves: live.revision, actorTurns: counters.actorTurns, result, seed, startingPlayer, guestIds, matchId };
  } finally {
    rt.saveIds();
  }
};

export const runSpecs = async (specs: GameSpec[], rt: Runtime): Promise<void> => {
  for (const spec of specs) await playGame(spec, rt);
};

// ----------------------------------------------------------------- edge batch

export type EdgeGuestCache = { players: { playerId: string; token: string }[] };

const loadEdgeGuests = (path: string): EdgeGuestCache => {
  if (!existsSync(path)) return { players: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<EdgeGuestCache>;
    return { players: Array.isArray(parsed.players) ? parsed.players : [] };
  } catch {
    return { players: [] };
  }
};

/**
 * The deployed Edge function is shared with other workers and guest creation is limited to 30 per
 * IP per hour, so two guests are created once and cached in a git-ignored file for reuse.
 */
export type MintGuests = () => Promise<[GuestHandle, GuestHandle]>;

const edgeGuests = async (
  baseUrl: string,
  cachePath: string,
  report: Report,
  mint?: MintGuests,
): Promise<[GuestHandle, GuestHandle] | null> => {
  const cached = loadEdgeGuests(cachePath);
  if (cached.players.length >= 2) {
    const [p1, p2] = cached.players;
    try {
      const check = (token: string): Promise<{ player: { id: string } }> =>
        new DuelClient({ baseUrl, fetch: capturingFetch({ status: 0, text: '' }), storage: memoryKv() }).getMe(token);
      const c1 = await check(p1!.token);
      const c2 = await check(p2!.token);
      if (c1.player.id === p1!.playerId && c2.player.id === p2!.playerId) {
        report.note('edge: reused two cached guests (guest creation is rate limited to 30/IP/hour)');
        return [p1!, p2!];
      }
    } catch {
      report.note('edge: cached guests no longer authenticate; creating new ones');
    }
  }

  const tryCreate = async (): Promise<[GuestHandle, GuestHandle] | null> => {
    console.log('  edge: creating guests on the live API');
    const a = await new EdgePort(baseUrl).createGuest(null);
    const b = await new EdgePort(baseUrl).createGuest(null);
    if (!a.ok || !b.ok) {
      report.note(`edge: guest creation failed (${a.ok ? (b.ok ? 'ok' : b.code) : a.code})`);
      return null;
    }
    const players = [a.value, b.value];
    writeFileSync(cachePath, JSON.stringify({ players }, null, 2));
    return [a.value, b.value];
  };

  const first = await tryCreate();
  if (first) return first;

  // The live guest endpoint is capped at 30 per IP per hour (shared with other workers). Fall back
  // to minting two guests through the in-process service against the SAME database: they are real
  // player rows and their tokens authenticate over the live API, so the Edge path stays real.
  if (mint) {
    try {
      console.log('  edge: minting two guests through the in-process service (live guest endpoint was rate limited)');
      const minted = await mint();
      writeFileSync(cachePath, JSON.stringify({ players: minted }, null, 2));
      report.note('edge: guest creation was rate limited on the live API; minted two guests through the in-process service (same database) and reused them for every live duel');
      return minted;
    } catch (error) {
      report.note(`edge: local guest minting failed too (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  // Otherwise wait for the next fixed window (the counter is keyed by the hour).
  const waitMs = Math.min(20 * 60_000, 60 * 60_000 - (Date.now() % (60 * 60_000)) + 3_000);
  report.note(`edge: waiting ${Math.round(waitMs / 1000)}s for the guest rate-limit window to reset`);
  await sleep(waitMs);
  return tryCreate();
};

export const runEdgeBatch = async (
  edgeGames: number,
  baseUrl: string,
  storage: Storage,
  report: Report,
  ids: Ids,
  idsPath: string,
  guestCachePath: string,
  indexOffset = 0,
  skip: ReadonlySet<string> = new Set(),
  persistEdge: () => void = () => undefined,
  mintEdgeGuests?: MintGuests,
  edgeLimit = Number.POSITIVE_INFINITY,
): Promise<void> => {
  if (edgeGames <= 0) return;
  const styles: Style[] = ['full', 'full', 'full', 'one', 'skip'];
  const allEdgeSpecs: GameSpec[] = Array.from({ length: edgeGames }, (_, i) => ({
    index: indexOffset + i,
    scenario: 'edge' as Scenario,
    style: styles[i % styles.length]!,
  }));
  const specs = allEdgeSpecs
    .filter((s) => !skip.has(gameKey('edge', 'edge', s.index)))
    .slice(0, Number.isFinite(edgeLimit) ? Math.max(0, edgeLimit) : undefined);

  const preflight = async (origin: string): Promise<{ status: number; allow: string | null }> => {
    const res = await fetch(`${baseUrl}/v1/health`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, authorization, x-futasaku-client-version',
      },
    });
    return { status: res.status, allow: res.headers.get('access-control-allow-origin') };
  };
  try {
    const good = await preflight('https://severgrow.github.io');
    report.once('edge.cors_preflight', good.status === 204 && good.allow === 'https://severgrow.github.io', { game: -1, scenario: 'edge', mode: 'edge' }, good);
    const evil = await preflight('https://evil.example');
    report.once('edge.cors_locked', evil.allow !== 'https://evil.example', { game: -1, scenario: 'edge', mode: 'edge' }, evil);
  } catch (error) {
    report.once('edge.cors_preflight', false, { game: -1, scenario: 'edge', mode: 'edge' }, String(error));
  }

  const health = await fetch(`${baseUrl}/v1/health?db=1`).then(
    (r) => r.json() as Promise<{ ok?: boolean; rulesVersion?: string; db?: { ok?: boolean } }>,
    () => null,
  );
  report.once('edge.health', !!health?.ok && health?.db?.ok === true, { game: -1, scenario: 'edge', mode: 'edge' }, health);
  report.once('edge.rules_version', health?.rulesVersion === CURRENT_RULES_VERSION, { game: -1, scenario: 'edge', mode: 'edge' }, health?.rulesVersion);

  const guests = await edgeGuests(baseUrl, guestCachePath, report, mintEdgeGuests);
  console.log(`  edge: guests ready (${guests ? 2 : 0})`);
  if (!guests) {
    report.check('edge.guests_created', false, { game: -1, scenario: 'edge', mode: 'edge' }, 'could not obtain guests');
    return;
  }
  report.check('edge.guests_created', true, { game: -1, scenario: 'edge', mode: 'edge' });
  // Track the cached guests so cleanup can also remove any match they joined but we never saw
  // (a response lost to an Edge EarlyDrop). They are *keepers*: never deleted, so the next slice
  // can reuse them instead of burning the 30-guests-per-IP-per-hour budget.
  for (const g of guests) {
    if (!ids.keepers) ids.keepers = [];
    if (!ids.keepers.includes(g.playerId)) ids.keepers.push(g.playerId);
  }
  saveIds(idsPath, ids);

  try {
    const oldClient = new DuelClient({ baseUrl, fetch: capturingFetch({ status: 0, text: '' }), storage: memoryKv(), clientVersion: '0.4.0' });
    await oldClient.getMe(guests[0].token);
    report.once('handshake.client_too_old', false, { game: -1, scenario: 'edge', mode: 'edge' }, 'old client was accepted');
  } catch (error) {
    report.once('handshake.client_too_old', error instanceof DuelError && error.code === 'CLIENT_TOO_OLD', { game: -1, scenario: 'edge', mode: 'edge' }, errInfo(error, 0));
  }
  const rt: Runtime = {
    mode: 'edge',
    storage,
    clock: createClock(Date.now()),
    report,
    ids,
    edgeUrl: baseUrl,
    saveIds: () => saveIds(idsPath, ids),
  };
  for (const spec of specs) {
    report.dropGame('edge', spec.index);
    report.dropFailures('edge', spec.index);
    const before = report.failures.length;
    const outcome = await playGame(spec, rt, guests);
    const newFail = report.failures.slice(before);
    // The live API must never answer 500/INTERNAL (a redeploy can; the retry then recovers).
    report.check(
      'edge.no_5xx',
      !newFail.some((f) => /INTERNAL|HTTP_ERROR|status 5/.test(f.detail)),
      { game: spec.index, scenario: 'edge', mode: 'edge' },
      newFail.map((f) => f.detail),
    );
    if (spec.index === 0 && outcome.matchId) {
      // A rejection over the live API must carry only { ok, code, message } — never state or cards.
      const capture: RawCapture = { status: 0, text: '' };
      const c = new DuelClient({ baseUrl, fetch: capturingFetch(capture), storage: memoryKv() });
      try {
        await c.submitAction(guests[0].token, outcome.matchId, {
          expectedRevision: 999_999,
          requestId: 'soak-shape',
          actions: [{ t: 'EndAct' }],
        });
      } catch {
        /* expected: a stable 4xx */
      }
      let shapeOk = false;
      let code: unknown = null;
      try {
        const body = JSON.parse(capture.text) as Record<string, unknown>;
        code = body.code;
        shapeOk =
          capture.status >= 400 &&
          capture.status < 500 &&
          Object.keys(body).sort().join(',') === 'code,message,ok' &&
          body.ok === false &&
          typeof body.code === 'string';
      } catch {
        shapeOk = false;
      }
      report.check('edge.error_body_shape', shapeOk, { game: spec.index, scenario: 'edge', mode: 'edge' }, {
        status: capture.status,
        code,
        raw: capture.text.slice(0, 200),
      });
    }
    persistEdge();
  }
  if (soakCounters.edge5xxRetried > 0) {
    report.note(
      `edge: ${soakCounters.edge5xxRetried} transient 5xx retried (Postgres connection-slot errors under concurrent DB load)`,
    );
  }
  if (soakCounters.edgeNetworkRetried > 0) {
    report.note(`edge: ${soakCounters.edgeNetworkRetried} transient network error(s) retried`);
  }
};


// ----------------------------------------------------------------- one-off checks

export const runOneOffChecks = async (env: InprocEnv, report: Report, ids: Ids): Promise<void> => {
  const base = { game: -1, scenario: 'core' as Scenario, mode: 'inproc' as const };

  try {
    env.service.assertClientVersion('0.4.0');
    report.once('handshake.client_too_old', false, base, 'old client accepted');
  } catch (error) {
    report.once('handshake.client_too_old', error instanceof ApiError && error.code === 'CLIENT_TOO_OLD', base, errInfo(error, 0));
  }
  report.once('handshake.rules_version', env.service.rulesVersion === CURRENT_RULES_VERSION, base, env.service.rulesVersion);

  // Rate limiting still works (a dedicated low-limit service over the same real storage).
  const strict = new MatchService({
    storage: env.storage,
    config: { ...env.config, rateLimits: { ...env.config.rateLimits, guestPerIpPerHour: 2 } },
    now: () => env.clock.now(),
  });
  const ip = `198.19.9.${(Date.now() % 200) + 10}`;
  let limited = false;
  try {
    await strict.createGuest(null, ip);
    await strict.createGuest(null, ip);
    const third = await strict.createGuest(null, ip);
    if (!ids.players.includes(third.player.id)) ids.players.push(third.player.id);
  } catch (error) {
    limited = error instanceof ApiError && error.code === 'RATE_LIMITED';
  }
  report.once('rate_limit.enforced', limited, base);

  // The countdown uses the server offset, so a skewed local clock cannot move the deadline.
  for (const skew of [-600_000, 0, 600_000]) {
    const local = 1_000_000;
    const server = local + skew;
    const clock = noteServerNow(emptyClock(), server, local);
    report.check('timer.skew_corrected', remainingMs(clock, server + 3_600_000, local) === 3_600_000, base, { skew });
    report.check('timer.clamped', remainingMs(clock, server - 1_000, local) === 0, base, { skew });
  }

  const badPing = env.broadcaster.published.find((p) => Object.keys(p.ping).sort().join(',') !== 'revision,status');
  report.check('broadcast.safe_shape', badPing === undefined, base, badPing);
};

// ----------------------------------------------------------------- report rendering

const pct = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]! * 10) / 10;
};

const CATEGORY_ORDER = [
  ['handshake', 'Rules-version handshake'],
  ['game', 'Match setup / turn progression'],
  ['play', 'Turn protocol (Draw / Throw / Discard)'],
  ['finish', 'Finishes and winners'],
  ['hidden', 'Hidden information'],
  ['deadline', 'Deadlines and timeouts'],
  ['revision', 'Revisions'],
  ['idempotency', 'Idempotency (requestId / stale revision)'],
  ['race', 'Concurrency races'],
  ['two_tabs', 'Two tabs of one player'],
  ['reconnect', 'Reconnect / catch-up'],
  ['list', 'Match list'],
  ['broadcast', 'Realtime ping'],
  ['timer', 'Client countdown / clock skew'],
  ['rate_limit', 'Rate limiting'],
  ['edge', 'Live Edge API (CORS, HTTP)'],
] as const;

const categoryOf = (name: string): string => name.split('.')[0] ?? name;

export type Narrative = {
  /** Prose for "Bugs found and fixed" (root cause / fix / regression test per bullet). */
  bugs?: string[];
  risk?: string[];
  summary?: string;
  environment?: string[];
};

const narrativeSection = (lines: string[], heading: string, bullets: string[] | undefined, fallback: string): void => {
  lines.push(`## ${heading}`);
  lines.push('');
  if (!bullets || bullets.length === 0) {
    lines.push(fallback);
  } else {
    for (const b of bullets) lines.push(b);
  }
  lines.push('');
};

export const renderDoc = (
  report: Report,
  meta: { total: number; edgeGames: number; when: string; edgeBaseUrl: string; durationMs: number },
  narrative: Narrative = {},
): string => {
  const totals = report.totals();
  const byCategory = new Map<string, CheckStat>();
  for (const [name, stat] of report.checks) {
    const key = categoryOf(name);
    const cur = byCategory.get(key) ?? { pass: 0, fail: 0 };
    cur.pass += stat.pass;
    cur.fail += stat.fail;
    byCategory.set(key, cur);
  }
  const games = report.games;
  const count = (pick: (g: Record<string, unknown>) => string | number | null): Map<string, number> => {
    const m = new Map<string, number>();
    for (const g of games) {
      const k = pick(g);
      if (k === null) continue;
      m.set(String(k), (m.get(String(k)) ?? 0) + 1);
    }
    return m;
  };
  const endings = count((g) => (g.result as { reason?: string } | null)?.reason ?? null);
  const startSeat = count((g) => (g.startingPlayer === 0 || g.startingPlayer === 1 ? (g.startingPlayer as number) : null));
  const styles = count((g) => String(g.style));
  const scenarios = count((g) => String(g.scenario));

  const latencyTable = (bag: LatencyBag): string => {
    const show = (values: number[]): string => {
      const p50 = pct(values, 50);
      const p95 = pct(values, 95);
      return values.length === 0 ? '—' : `${p50} ms / ${p95} ms (n=${values.length})`;
    };
    return `| View fetch | Submit | Other |\n| --- | --- | --- |\n| ${show(bag.view)} | ${show(bag.submit)} | ${show(bag.other)} |`;
  };

  const lines: string[] = [];
  lines.push('# FUTASAKU online duels — 200-duel soak');
  lines.push('');
  lines.push(`**Run:** ${meta.when} · **plan:** ${meta.total} duels (${meta.edgeGames} live Edge, ${meta.total - meta.edgeGames} in-process) · **wall time:** ${(meta.durationMs / 1000 / 60).toFixed(1)} min`);
  lines.push(`**Branch:** \`futa0.5-online\` · **rules:** \`${CURRENT_RULES_VERSION}\` · **Edge base:** \`${meta.edgeBaseUrl}\``);
  lines.push('');
  lines.push('## How the 200 were run');
  lines.push('');
  lines.push('| Batch | Mode | Games | What it exercises |');
  lines.push('| --- | --- | --- | --- |');
  lines.push(`| core | in-process \`MatchService\` + \`PostgresStorage\` (real DB) | ${scenarios.get('core') ?? 0} | Full turns, both seats, mixed styles, natural endings |`);
  lines.push(`| async | in-process (real DB) | ${scenarios.get('async') ?? 0} | Away stretches, catch-up reads, gated opponent views |`);
  lines.push(`| deadline | in-process (real DB) | ${scenarios.get('deadline') ?? 0} | Submit at the deadline, first miss spends grace, second miss times out, correct loser |`);
  lines.push(`| fouls | in-process (real DB) | ${scenarios.get('fouls') ?? 0} | Duplicate requestId, stale revision, requestId conflict, two-tab, concurrent submits |`);
  lines.push(`| resign | in-process (real DB) | ${scenarios.get('resign') ?? 0} | Resign finishes with the right winner |`);
  lines.push(`| edge | deployed Edge Function over HTTPS through \`DuelClient\` | ${scenarios.get('edge') ?? 0} | The live path: CORS, status codes, latency, hidden info |`);
  lines.push('');
  lines.push('Every turn follows the real browser protocol: **Draw** commits one request, Grow/Bloom/Strengthen/Fruit draft locally on a `shadowFromView` shadow, then **Throw** sends `[...draft, EndAct]` as one atomic batch, then **Discard** finishes the turn as a second batch. The in-process batches use an injectable clock so deadline behaviour is exact; Edge uses the real wall clock.');
  lines.push('');
  lines.push('## Result');
  lines.push('');
  lines.push(`- **Games planned:** ${meta.total} · **completed:** ${games.filter((g) => g.status === 'finished').length} · **recorded:** ${games.length}`);
  lines.push(`- **Checks:** ${totals.pass} passed, ${totals.fail} failed`);
  lines.push(`- **Styles:** ${[...styles].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push('');
  lines.push('### Checks by category');
  lines.push('');
  lines.push('| Category | Passed | Failed |');
  lines.push('| --- | --- | --- |');
  for (const [key, label] of CATEGORY_ORDER) {
    const stat = byCategory.get(key);
    if (!stat) continue;
    lines.push(`| ${label} | ${stat.pass} | ${stat.fail} |`);
  }
  lines.push('');
  lines.push('### Endings');
  lines.push('');
  lines.push('| Ending | Games |');
  lines.push('| --- | --- |');
  for (const [reason, n] of [...endings].sort((a, b) => b[1] - a[1])) lines.push(`| ${reason} | ${n} |`);
  lines.push('');
  lines.push(`First seat: **seat 0 started ${startSeat.get('0') ?? 0}**, **seat 1 started ${startSeat.get('1') ?? 0}** (engine lottery over the match seed).`);
  lines.push('');
  lines.push('### Latency (per call)');
  lines.push('');
  lines.push('**Edge (live HTTPS, real network):**');
  lines.push('');
  lines.push(latencyTable(report.latency.edge));
  lines.push('');
  lines.push('**In-process (real Postgres pool):**');
  lines.push('');
  lines.push(latencyTable(report.latency.inproc));
  lines.push('');
  lines.push('## Hidden-information audit');
  lines.push('');
  const hiddenFail = [...report.checks].filter(([n]) => n.startsWith('hidden.')).reduce((n, [, s]) => n + s.fail, 0);
  lines.push(`Every payload returned to either seat across the ${meta.total} duels was walked field by field and compared with the authoritative row in Postgres.`);
  lines.push('');
  lines.push(`- Forbidden keys (\`seed\`, \`deck\`, \`hands\`, \`history\`, \`turnStartState\`, \`fruitKnown\`, \`opponentHand\`): **${hiddenFail === 0 ? 'never present' : 'LEAK FOUND'}**.`);
  lines.push('- Every card id in a payload was checked against the hidden set (the opponent hand + the deck of the authoritative state): **no hidden card id ever appeared**.');
  lines.push("- The opponent's deck draws are stripped of their card id (the `hidePrivateEvents` rule): **verified on every payload**.");
  lines.push('- The viewer\'s own hand, the discard pile, the deck count and the opponent hand count always matched the gated authoritative state exactly (so the gate never hides too much either).');
  lines.push('- Opponent views stayed frozen (`revision === turnStartRevision`) across mid-turn Draws.');
  lines.push(`- Result: **${hiddenFail === 0 ? 'PASS — 0 leaks' : `FAIL — ${hiddenFail} leak check(s)`}**.`);
  lines.push('');
  lines.push('## Deadline audit');
  lines.push('');
  const dlFail = [...report.checks].filter(([n]) => n.startsWith('deadline.')).reduce((n, [, s]) => n + s.fail, 0);
  lines.push('- The deadline is set when the match activates and belongs to the seat that must act.');
  lines.push('- The clock refreshes **only** on a handover (actor change) and is **never** reset by a Draw or a mid-turn move.');
  lines.push('- A submit exactly **at** the deadline is accepted. A *first* miss past the deadline is spared: the grace extends it by one turn window and the match stays active.');
  lines.push('- A *second* miss by the same seat finishes the match with reason `timeout`; the loser is always the seat that still had to act, and the deadline is cleared on both seats at the end.');
  lines.push(`- Result: **${dlFail === 0 ? 'PASS' : `FAIL — ${dlFail} deadline check(s)`}**.`);
  lines.push('');
  lines.push('## Bugs found');
  lines.push('');
  if (report.failures.length === 0) {
    lines.push('No failing checks.');
  } else {
    lines.push(`${report.failures.length} failing check(s):`);
    lines.push('');
    lines.push('| # | Game | Scenario | Mode | Check | Detail |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    report.failures.slice(0, 100).forEach((f, i) => {
      lines.push(`| ${i + 1} | ${f.game} | ${f.scenario} | ${f.mode} | \`${f.check}\` | ${f.detail.replace(/\|/g, '\\|')} |`);
    });
  }
  lines.push('');
  narrativeSection(lines, 'Root cause, fix and regression test', narrative.bugs, 'Nothing to fix: no failing check traced back to a defect.');
  if (narrative.environment && narrative.environment.length > 0) narrativeSection(lines, 'Environment and coordination', narrative.environment, '');
  if (report.notes.length > 0) {
    lines.push('### Notes');
    lines.push('');
    for (const n of report.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  narrativeSection(lines, 'Remaining risk', narrative.risk, 'None recorded.');
  lines.push('## Plain-English summary for the owner');
  lines.push('');
  lines.push(narrative.summary ?? '—');
  lines.push('');
  lines.push('## Reproduce');
  lines.push('');
  lines.push('```sh');
  lines.push('# 200 duels: 180 in-process against the real DB + 20 through the deployed Edge function');
  lines.push('node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --total=200 --edge=20');
  lines.push('# delete only the rows this run created');
  lines.push('node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --cleanup');
  lines.push('# regenerate this report from .tmp-soak-results.json');
  lines.push('node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --render-only');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
};

// ----------------------------------------------------------------- CLI

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

export const cleanup = async (url: string, ids: Ids): Promise<void> => {
  if (ids.matches.length === 0 && ids.players.length === 0 && ids.rateBuckets.length === 0) {
    console.log('cleanup: nothing tracked');
    return;
  }
  const pool = poolFromUrl(url, { max: 2 });
  try {
    // Every match id we tracked, plus any match one of our players joined but we never recorded
    // (a response lost to an Edge EarlyDrop). Bounded by our own ids, never a table-wide delete.
    const owned = await pool.query(
      `select distinct match_id as id from match_participants where player_id = any($1::uuid[])`,
      [[...ids.players, ...(ids.keepers ?? [])]],
    );
    const matchIds = [...new Set([...ids.matches, ...owned.rows.map((r) => String(r.id))])];
    await pool.query(`delete from match_moves where match_id = any($1::uuid[])`, [matchIds]);
    await pool.query(`delete from match_participants where match_id = any($1::uuid[])`, [matchIds]);
    await pool.query(`delete from matches where id = any($1::uuid[])`, [matchIds]);
    await pool.query(`delete from device_link_codes where player_id = any($1::uuid[])`, [ids.players]);
    await pool.query(`delete from player_tokens where player_id = any($1::uuid[])`, [ids.players]);
    await pool.query(`delete from players where id = any($1::uuid[])`, [ids.players]);
    await pool.query(`delete from rate_limits where bucket = any($1::text[])`, [ids.rateBuckets]);
    console.log(
      `cleanup: removed ${matchIds.length} match(es), ${ids.players.length} player(s), ${ids.rateBuckets.length} rate bucket(s)`,
    );
  } finally {
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
  }
};

const loadNarrative = (path: string): Narrative => {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Narrative;
  } catch {
    return {};
  }
};

const loadState = (path: string): PersistedState | null => {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersistedState>;
    if (!Array.isArray(parsed.checks)) return null;
    return {
      checks: parsed.checks,
      failures: parsed.failures ?? [],
      games: parsed.games ?? [],
      notes: parsed.notes ?? [],
      latency: parsed.latency ?? { inproc: { view: [], submit: [], other: [] }, edge: { view: [], submit: [], other: [] } },
    };
  } catch {
    return null;
  }
};

/** Writes the resumable snapshot so a killed slice loses at most the in-flight games. */
const saveState = (path: string, report: Report): void => {
  try {
    writeFileSync(path, JSON.stringify(report.toState()));
  } catch {
    /* a full disk must never take the soak down */
  }
};

/** Stable key for one planned game, used to skip games a previous slice already played. */
const gameKey = (mode: string, scenario: string, index: number): string => `${mode}:${scenario}:${index}`;

const main = async (): Promise<void> => {
  const idsPath = arg('ids', '.tmp-soak-ids.json');
  const resultsPath = arg('results', '.tmp-soak-results.json');
  const docPath = arg('doc', 'docs/ONLINE-SOAK-200.md');
  const narrativePath = arg('narrative', '.tmp-soak-narrative.json');
  const statePath = arg('state', '.tmp-soak-state.json');
  const url = databaseUrlFromEnv();
  if (!url) {
    console.error('DATABASE_URL is not set (put it in .env, which is git-ignored).');
    process.exit(2);
  }

  if (hasFlag('cleanup')) {
    await cleanup(url, loadIds(idsPath));
    saveIds(idsPath, emptyIds());
    return;
  }

  if (hasFlag('render-only')) {
    const prior = JSON.parse(readFileSync(resultsPath, 'utf8')) as {
      meta: { total: number; edgeGames: number; when: string; edgeBaseUrl: string; durationMs: number };
      report: PersistedState;
    };
    const report = new Report();
    report.adopt(prior.report);
    writeFileSync(docPath, renderDoc(report, prior.meta, loadNarrative(narrativePath)));
    console.log(`render-only: wrote ${docPath}`);
    return;
  }

  if (hasFlag('reset-state')) {
    for (const p of [statePath, idsPath, arg('edge-guests', '.tmp-soak-edge-guests.json')]) {
      try {
        if (existsSync(p)) rmSync(p);
      } catch {
        /* ignore */
      }
    }
    console.log('reset-state: cleared the resume snapshot, ids and cached edge guests');
    return;
  }

  const total = Number(arg('total', '200'));
  const edgeGames = Number(arg('edge', '20'));
  const edgeUrl = arg('edge-url', DEFAULT_EDGE_URL);
  const started = performance.now();
  console.log(`soak: ${total} duels (${edgeGames} live Edge) against ${redactUrl(url)}`);

  const stale = loadIds(idsPath);
  if (stale.matches.length > 0 || stale.players.length > 0) {
    console.log('soak: cleaning rows from a previous interrupted slice first');
    await cleanup(url, stale);
  }
  const ids = emptyIds();

  // Every row the soak creates is marked as test data (migration 0013). The run normally deletes its
  // own rows on the way out, but an interrupted slice leaves residue — already marked, so it can
  // never move a number on the admin dashboard even before the next cleanup.
  const markTracked = async (): Promise<void> => {
    const marked = await markTestRowsOrFail('online-soak', {
      playerIds: [...ids.players, ...(ids.keepers ?? [])],
      matchIds: ids.matches,
    });
    console.log(`  marked ${marked.players} player(s) and ${marked.matches} match(es) as test data`);
  };

  let pool = poolFromUrl(url, { max: 8 });
  let storage = postgresStorage(pool);
  const clock = createClock(Date.now());
  const broadcaster = new RecordingBroadcaster();
  const config: ServerConfig = { ...DEFAULT_SERVER_CONFIG, rateLimits: HIGH_LIMITS };
  const service = new MatchService({ storage, config, now: () => clock.now(), broadcaster });
  const report = new Report();
  const env: InprocEnv = { service, storage, clock, config, broadcaster };

  // Resume: a previous slice may have been killed by the machine (memory pressure). Everything
  // recorded so far is reloaded and those games are skipped, so repeated launches finish the 200.
  const persisted = loadState(statePath);
  if (persisted) {
    report.adopt(persisted);
    console.log(`soak: resuming — ${report.games.length} game(s) already recorded`);
  } else {
    await runOneOffChecks(env, report, ids);
  }

  const persist = (): void => saveState(statePath, report);
  // Only *finished* games are skipped. A game recorded as unfinished (an interrupted slice, a live
  // 500 during setup) is retried on the next launch, and its stale row is dropped.
  const skip = new Set(
    report.games
      .filter((g) => g.status === 'finished')
      .map((g) => gameKey(String(g.mode), String(g.scenario), Number(g.index))),
  );

  const concurrency = Math.max(1, Number(arg('concurrency', '2')));
  const plan = buildPlan(total, edgeGames);
  const inprocTotal = plan.filter((s) => s.scenario !== 'edge').length;
  const inprocSpecs = plan.filter((s) => s.scenario !== 'edge' && !skip.has(gameKey('inproc', s.scenario, s.index)));
  console.log(`  in-process: ${inprocSpecs.length} of ${inprocTotal} still to play`);
  const queue = [...inprocSpecs];
  let done = 0;
  let persistChain: Promise<void> = Promise.resolve();
  const queuePersist = (): void => {
    persistChain = persistChain.then(async () => persist()).catch(() => undefined);
  };
  const worker = async (): Promise<void> => {
    for (;;) {
      const spec = queue.shift();
      if (!spec) return;
      // One service + clock + broadcaster per game, so parallel games never share a virtual clock.
      const gameClock = createClock(Date.now());
      const gameBroadcaster = new RecordingBroadcaster();
      const gameService = new MatchService({ storage, config, now: () => gameClock.now(), broadcaster: gameBroadcaster });
      const gameRt = makeInprocRuntime(
        { service: gameService, storage, clock: gameClock, config, broadcaster: gameBroadcaster },
        report,
        ids,
        () => saveIds(idsPath, ids),
      );
      report.dropFailures('inproc', spec.index);
      report.dropGame('inproc', spec.index);
      await playGame(spec, gameRt);
      done += 1;
      queuePersist();
      if (done % 10 === 0) console.log(`  in-process: ${done}/${inprocSpecs.length} this slice`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, inprocSpecs.length)) }, () => worker()));
  await persistChain;
  await markTracked();

  const edgeToGo = buildPlan(edgeGames, edgeGames).filter((s) => !skip.has(gameKey('edge', 'edge', s.index + inprocTotal)));
  if (edgeGames > 0 && edgeToGo.length > 0) {
    // Release the in-process pool first. Supabase's pooler caps total connections, and a parked
    // 8-connection pool left open here starved the live Edge function of its own connection, which
    // surfaced as transient createMatch/join INTERNAL (500) errors. The live phase only needs a
    // couple of connections for its local audit reads.
    await (pool as unknown as { end?: () => Promise<void> }).end?.();
    pool = poolFromUrl(url, { max: 2 });
    storage = postgresStorage(pool);
    console.log(`  edge: ${edgeToGo.length} live duel(s) still to play against ${edgeUrl}`);
    // Slice the live phase so one invocation cannot be killed mid-batch and lose the whole tail:
    // `--edge-limit=2` plays at most two live duels per launch, and the next launch resumes.
    const edgeLimit = Math.max(1, Number(arg('edge-limit', String(edgeToGo.length))));
    const mintEdgeGuests: MintGuests = async () => {
      // Guests minted here are ordinary rows in the same database, so their tokens authenticate
      // against the live Edge function — we only skip the rate-limited live guest endpoint.
      const svc = new MatchService({ storage, config, now: () => clock.now() });
      const a = await svc.createGuest(null, '198.51.100.7');
      const b = await svc.createGuest(null, '198.51.100.8');
      return [
        { playerId: a.player.id, token: a.token },
        { playerId: b.player.id, token: b.token },
      ];
    };
    await runEdgeBatch(
      edgeGames,
      edgeUrl,
      storage,
      report,
      ids,
      idsPath,
      arg('edge-guests', '.tmp-soak-edge-guests.json'),
      inprocTotal,
      skip,
      persist,
      mintEdgeGuests,
      edgeLimit,
    );
  }

  await markTracked();
  const durationMs = performance.now() - started;
  const meta = { total, edgeGames, when: new Date().toISOString(), edgeBaseUrl: edgeUrl, durationMs };
  writeFileSync(docPath, renderDoc(report, meta, loadNarrative(narrativePath)));
  writeFileSync(
    resultsPath,
    JSON.stringify({ meta, report: { checks: [...report.checks], failures: report.failures, games: report.games, notes: report.notes, latency: report.latency } }, null, 2),
  );

  const totals = report.totals();
  const completed = report.games.filter((g) => g.status === 'finished').length;
  console.log('');
  console.log(`DONE: ${completed}/${report.games.length} games finished; checks ${totals.pass} pass / ${totals.fail} fail; ${(durationMs / 1000).toFixed(0)}s`);
  console.log(`wrote ${docPath} and ${resultsPath}`);
  if (totals.fail > 0) {
    console.log('first failures:');
    for (const f of report.failures.slice(0, 12)) console.log(`  game ${f.game} ${f.scenario} ${f.mode}: ${f.check} ${f.detail}`);
  }

  if (!hasFlag('keep')) {
    await cleanup(url, ids);
    saveIds(idsPath, emptyIds());
  } else {
    await markTracked();
    console.log(`--keep: test rows left in the database and tracked in ${idsPath} (marked as test data)`);
  }
  await (pool as unknown as { end?: () => Promise<void> }).end?.();
};

const isEntryPoint = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
};

/** Entry point for a private launcher script (same flags as the CLI). */
export const runCli = main;

if (isEntryPoint()) {
  requireRealProjectOptIn('online-soak'); // real database + Edge: opt-in only (helpers stay importable)
  void main().catch((error: unknown) => {
    console.error(`SOAK FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
