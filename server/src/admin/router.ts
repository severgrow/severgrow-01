// The admin dashboard API (docs/ADMIN.md). ONE router, one rule: every `/v1/admin/*` request is
// authorized SERVER-SIDE against the authenticated player's id before anything is read or written.
//
// What this file is careful about:
//   * there is no client-supplied flag, header, path segment, query parameter or email anywhere in
//     the authorization decision — only `config.adminPlayerIds` and the caller's own player id;
//   * a missing/invalid token is 401, a valid token whose player is not on the allow-list is 403,
//     and BOTH are refused before the store is touched, so no data can leak through an error shape;
//   * the response shapes live in `./types.ts`; this router never widens them, and the CSV export
//     uses the SAME field list as the JSON path (never "because CSV makes it easy");
//   * the only writes are report triage, the admin's own "last looked" cursor, and the audit row
//     that records them.
import { ApiError } from '../errors.js';
import { newId } from '../ids.js';
import type { ServerConfig } from '../config.js';
import type { PlayerRecord, Storage } from '../storage/types.js';
import { PLAYER_TAG_PATTERN, playerTag } from '../../../src/player-tag.js';
import type {
  AdminLedgerFilter,
  AdminMatchFilter,
  AdminPlayerQuery,
  AdminReportFilter,
  AdminReportRow,
  AdminStore,
  AdminTriageStatus,
} from './types.js';
import { CSV_MAX_ROWS, MAX_PAGE, TAG_SCAN_LIMIT, normalizeBuild } from './types.js';
import { clampLimit } from './util.js';

export type AdminOutcome = {
  status: number;
  body?: unknown;
  /** A non-JSON response (the CSV export). `fetch-app.ts` writes it verbatim. */
  raw?: { contentType: string; text: string };
};

export type AdminRouter = (req: Request, path: string) => Promise<AdminOutcome | null>;

const bearer = (req: Request): string | null => {
  const value = req.headers.get('authorization');
  return value && /^bearer /i.test(value) ? value.slice(7).trim() : null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const intParam = (url: URL, name: string): number | undefined => {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ApiError('INVALID_REQUEST', `${name} must be a number.`);
  return Math.floor(value);
};

const strParam = (url: URL, name: string, max = 200): string | undefined => {
  const raw = url.searchParams.get(name)?.trim();
  return raw ? raw.slice(0, max) : undefined;
};

/**
 * Read an optional integer query parameter ONCE, so a filter object can be built without ever
 * writing an explicitly-`undefined` property (`exactOptionalPropertyTypes` is on).
 */
const optionalInts = (url: URL, names: readonly string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const name of names) {
    const value = intParam(url, name);
    if (value !== undefined) out[name] = value;
  }
  return out;
};

const TRIAGE_STATUSES: readonly AdminTriageStatus[] = ['new', 'reviewing', 'resolved'];
export const ADMIN_NOTE_MAX = 2000;

/** A pasted player id. Only the SHAPE is checked; the store does the lookup. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One CSV cell: RFC 4180 quoting, plus a guard against a spreadsheet formula in player text. */
export const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  // A report message is player-authored. Excel/Sheets would EXECUTE a leading `=`, `+`, `-` or `@`,
  // so such a cell is prefixed with an apostrophe (the JSON path is untouched; this is a CSV-only
  // hardening and is stated in the docs).
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/** The CSV columns are EXACTLY the fields the JSON path returns — no extra column is added. */
const CSV_COLUMNS = ['id', 'created_at', 'kind', 'status', 'build', 'player_id', 'player_tag', 'player_name', 'message', 'context', 'user_agent', 'note'] as const;

export const reportsToCsv = (rows: readonly AdminReportRow[]): string => {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        new Date(row.createdAt).toISOString(),
        row.kind,
        row.status,
        row.build ?? '',
        row.playerId ?? '',
        row.playerTag ?? '',
        row.playerName ?? '',
        row.message,
        JSON.stringify(row.context ?? {}),
        row.userAgent ?? '',
        row.note,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
};

export type AdminRouterDeps = {
  store: AdminStore;
  /** Authenticates a bearer token; throws `UNAUTHORIZED` for a missing or bad token. */
  authenticate: (token: string | null) => Promise<PlayerRecord>;
  config: ServerConfig;
  now: () => number;
  rulesVersion: string;
  /** Storage, only for the rate limiter. Optional so a test can run without one. */
  storage?: Pick<Storage, 'hitRateLimit'> | null;
  /** A real database round trip for the health line, or null when there is nothing to ping. */
  pingDb?: (() => Promise<unknown>) | null;
  log?: (line: string) => void;
  /** Admin reads per hour, per admin. A runaway client can never turn into a database flood. */
  readsPerHour?: number;
};

/** True when `playerId` is on the allow-list. Compared case-insensitively as a uuid. */
export const isAdminPlayer = (playerId: string, allowlist: readonly string[]): boolean =>
  allowlist.includes(playerId.trim().toLowerCase());

export const createAdminRouter = (deps: AdminRouterDeps): AdminRouter => {
  const log = deps.log ?? (() => undefined);
  const readsPerHour = deps.readsPerHour ?? 1200;

  /**
   * The one place authorization happens. Returns the authenticated player, or throws.
   * The allow-list is read from the CONFIG (the `ADMIN_PLAYER_IDS` env var), never from the request.
   */
  const authorized = async (req: Request, path: string): Promise<PlayerRecord> => {
    const player = await deps.authenticate(bearer(req)); // 401 UNAUTHORIZED when missing/bad
    if (!isAdminPlayer(player.id, deps.config.adminPlayerIds)) {
      // No detail about WHO is allowed and nothing read from the store: an unauthorized caller
      // learns only that they are not an admin.
      log(`ADMIN_DENIED ${path} player:${player.id}`);
      throw new ApiError('FORBIDDEN', 'Access denied.');
    }
    if (deps.storage) {
      const hour = 60 * 60 * 1000;
      const now = deps.now();
      const hit = await deps.storage.hitRateLimit(`admin:reads:${player.id}`, Math.floor(now / hour) * hour, readsPerHour);
      if (!hit.ok) throw new ApiError('RATE_LIMITED', 'Too many dashboard requests. Wait a moment.');
    }
    return player;
  };

  const audit = async (entry: { actorId: string; action: string; targetType: string; targetId: string; detail: Record<string, unknown>; now: number }): Promise<void> => {
    await deps.store.audit({
      id: newId(),
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      detail: entry.detail,
      createdAt: entry.now,
    });
  };

  return async (req, path) => {
    if (!path.startsWith('/v1/admin')) return null;
    const url = new URL(req.url, 'http://admin.local');
    const player = await authorized(req, path);
    const now = deps.now();

    // ---------------------------------------------------------------- identity / what's new
    if (req.method === 'GET' && path === '/v1/admin/session') {
      return {
        status: 200,
        body: {
          ok: true,
          admin: { id: player.id, displayName: player.displayName, tag: playerTag(player.id) },
          rulesVersion: deps.rulesVersion,
          limits: { maxPage: MAX_PAGE, csvMaxRows: CSV_MAX_ROWS, tagScanLimit: TAG_SCAN_LIMIT, readsPerHour },
          serverNow: now,
        },
      };
    }

    if (req.method === 'GET' && path === '/v1/admin/whats-new') {
      const seenAt = await deps.store.readSeen(player.id);
      const counters = await deps.store.countsSince(seenAt ?? 0, now);
      return { status: 200, body: { ok: true, seenAt, counters, serverNow: now } };
    }

    if (req.method === 'POST' && path === '/v1/admin/seen') {
      let body: Record<string, unknown> = {};
      try {
        body = asRecord(await req.json());
      } catch {
        body = {};
      }
      const requested = typeof body.at === 'number' && Number.isFinite(body.at) ? Math.floor(body.at) : now;
      // Never in the future, never before the value already stored (the store takes the max).
      const at = Math.max(0, Math.min(requested, now));
      const previous = await deps.store.readSeen(player.id);
      await deps.store.writeSeen(player.id, at);
      await audit({ actorId: player.id, action: 'whats_new.seen', targetType: 'admin_seen', targetId: player.id, detail: { from: previous, to: at }, now });
      return { status: 200, body: { ok: true, seenAt: Math.max(previous ?? 0, at), serverNow: now } };
    }

    // ---------------------------------------------------------------- overview + operations
    if (req.method === 'GET' && path === '/v1/admin/overview') {
      const overview = await deps.store.overview(now);
      let health = overview.health;
      if (deps.pingDb) {
        const started = Date.now();
        try {
          await deps.pingDb();
          health = { dbOk: true, dbMs: Date.now() - started };
        } catch {
          health = { dbOk: false, dbMs: null };
        }
      }
      return { status: 200, body: { ok: true, ...overview, rulesVersion: deps.rulesVersion, health } };
    }

    if (req.method === 'GET' && path === '/v1/admin/ops') {
      // SEQUENTIAL, not Promise.all: two store methods in flight at once is the same parallel batch
      // that hangs the deployed Edge runtime (postgres.js + the transaction pooler) for the other
      // admin screens — see the `sequential` note in admin/postgres.ts. The Ops screen is the only
      // route that aggregates four store reads, so it is the only one that needs this here.
      const stuck = await deps.store.stuck(now, {
        guestMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
        waitingExpireMs: deps.config.waitingExpireMs,
        turnTimeoutMs: deps.config.turnTimeoutMs,
      });
      const rulesDrift = await deps.store.rulesVersionCounts();
      const builds = await deps.store.overview(now);
      const funnel = await deps.store.funnel(now);
      return {
        status: 200,
        body: {
          ok: true,
          stuck,
          rulesDrift: { current: deps.rulesVersion, versions: rulesDrift },
          builds: builds.reports.byBuild,
          funnel,
          serverNow: now,
        },
      };
    }

    // ---------------------------------------------------------------- reports
    if (req.method === 'GET' && (path === '/v1/admin/reports' || path === '/v1/admin/reports.csv')) {
      const kind = strParam(url, 'kind', 10);
      if (kind && kind !== 'report' && kind !== 'crash') throw new ApiError('INVALID_REQUEST', 'kind must be "report" or "crash".');
      const status = strParam(url, 'status', 12);
      if (status && !TRIAGE_STATUSES.includes(status as AdminTriageStatus)) throw new ApiError('INVALID_REQUEST', 'status must be new, reviewing or resolved.');
      // A build in the URL may be a raw stored string or a normalised key; normalise it, so the
      // filter matches the same rows the Builds panel groups.
      const buildParam = strParam(url, 'build', 200);
      const times = optionalInts(url, ['since', 'until']);
      const cursor = strParam(url, 'cursor', 120);
      const filter: AdminReportFilter = {
        limit: clampLimit(intParam(url, 'limit') ?? 25),
        ...(kind ? { kind: kind as 'report' | 'crash' } : {}),
        ...(status ? { status: status as AdminTriageStatus } : {}),
        ...(buildParam ? { build: normalizeBuild(buildParam).key } : {}),
        ...(cursor ? { cursor } : {}),
        ...(times.since !== undefined ? { since: times.since } : {}),
        ...(times.until !== undefined ? { until: times.until } : {}),
      };
      if (path === '/v1/admin/reports.csv') {
        // The CSV is capped; the cap is in the session payload and in docs/ADMIN.md.
        const page = await deps.store.reports({ ...filter, limit: CSV_MAX_ROWS });
        const rows = page.rows.slice(0, CSV_MAX_ROWS);
        log(`ADMIN_CSV player:${player.id} rows:${rows.length} of:${page.total}`);
        return { status: 200, raw: { contentType: 'text/csv; charset=utf-8', text: reportsToCsv(rows) } };
      }
      const page = await deps.store.reports(filter);
      return { status: 200, body: { ok: true, ...page, serverNow: now } };
    }

    const triageRoute = /^\/v1\/admin\/reports\/([^/]+)\/triage$/.exec(path);
    if (triageRoute && req.method === 'POST') {
      const reportId = decodeURIComponent(triageRoute[1]!);
      const body = asRecord(await req.json().catch(() => ({})));
      const status = body.status;
      if (typeof status !== 'string' || !TRIAGE_STATUSES.includes(status as AdminTriageStatus)) {
        throw new ApiError('INVALID_REQUEST', 'status must be new, reviewing or resolved.');
      }
      const note = typeof body.note === 'string' ? body.note.slice(0, ADMIN_NOTE_MAX) : '';
      const result = await deps.store.triage({ reportId, status: status as AdminTriageStatus, note, actorId: player.id, now });
      if (result === null) throw new ApiError('NOT_FOUND', 'That report does not exist.');
      // The audit row records the change itself. `note` is NOT copied into the detail: the note is
      // already on the report, and duplicating player-adjacent text into a second table is how
      // private text ends up somewhere nobody expected.
      await audit({
        actorId: player.id,
        action: 'report.triage',
        targetType: 'feedback_report',
        targetId: reportId,
        detail: { from: result.previous, to: status, changed: result.changed, noteLength: note.length },
        now,
      });
      return { status: 200, body: { ok: true, reportId, status, noteLength: note.length, previous: result.previous, changed: result.changed, serverNow: now } };
    }

    // ---------------------------------------------------------------- player lookup
    if (req.method === 'GET' && path === '/v1/admin/player') {
      const q = strParam(url, 'q', 120);
      if (!q) throw new ApiError('INVALID_REQUEST', 'Enter a nickname, a tag or a player id.');
      // "MapleFox #7QK2" and plain "7QK2" are both tag searches; a pasted uuid is an id search;
      // anything else is a display-name search. A four-character NAME is therefore read as a tag —
      // stated in the UI, because the tag is a hash of the id and cannot be told apart from a name.
      const tagged = /^(.*?)\s*#\s*([0-9A-HJKMNP-TV-Z]{4})$/.exec(q);
      const bare = q.replace(/^#/, '').toUpperCase();
      const query: AdminPlayerQuery = UUID_PATTERN.test(q)
        ? { id: q.toLowerCase() }
        : tagged
          ? { tag: tagged[2]! }
          : PLAYER_TAG_PATTERN.test(bare)
            ? { tag: bare }
            : { name: q };
      const found = await deps.store.playerLookup(query);
      if (!found) return { status: 200, body: { ok: true, player: null, query, serverNow: now } };
      return { status: 200, body: { ok: true, ...found, serverNow: now } };
    }

    // ---------------------------------------------------------------- matches
    if (req.method === 'GET' && path === '/v1/admin/matches') {
      const mode = strParam(url, 'mode', 10);
      if (mode && mode !== 'queue' && mode !== 'friend' && mode !== 'live') throw new ApiError('INVALID_REQUEST', 'mode must be queue, friend or live.');
      const status = strParam(url, 'status', 10);
      if (status && status !== 'waiting' && status !== 'active' && status !== 'finished') throw new ApiError('INVALID_REQUEST', 'status must be waiting, active or finished.');
      const playerId = strParam(url, 'playerId', 60);
      const cursor = strParam(url, 'cursor', 120);
      const times = optionalInts(url, ['since', 'until']);
      const filter: AdminMatchFilter = {
        limit: clampLimit(intParam(url, 'limit') ?? 25),
        ...(mode ? { mode: mode as 'queue' | 'friend' | 'live' } : {}),
        ...(status ? { status: status as 'waiting' | 'active' | 'finished' } : {}),
        ...(playerId ? { playerId } : {}),
        ...(cursor ? { cursor } : {}),
        ...(times.since !== undefined ? { since: times.since } : {}),
        ...(times.until !== undefined ? { until: times.until } : {}),
      };
      return { status: 200, body: { ok: true, ...(await deps.store.matches(filter)), serverNow: now } };
    }

    const matchRoute = /^\/v1\/admin\/matches\/([^/]+)$/.exec(path);
    if (matchRoute && req.method === 'GET') {
      const detail = await deps.store.matchDetail(decodeURIComponent(matchRoute[1]!), 200);
      if (!detail) throw new ApiError('NOT_FOUND', 'That match does not exist.');
      return { status: 200, body: { ok: true, ...detail, serverNow: now } };
    }

    // ---------------------------------------------------------------- seeds, world, campaign
    if (req.method === 'GET' && path === '/v1/admin/ledger') {
      const playerId = strParam(url, 'playerId', 60);
      const category = strParam(url, 'category', 40);
      const cursor = strParam(url, 'cursor', 120);
      const times = optionalInts(url, ['since', 'until']);
      const filter: AdminLedgerFilter = {
        limit: clampLimit(intParam(url, 'limit') ?? 50),
        ...(playerId ? { playerId } : {}),
        ...(category ? { category } : {}),
        ...(cursor ? { cursor } : {}),
        ...(times.since !== undefined ? { since: times.since } : {}),
        ...(times.until !== undefined ? { until: times.until } : {}),
      };
      return { status: 200, body: { ok: true, ...(await deps.store.ledger(filter)), serverNow: now } };
    }

    if (req.method === 'GET' && path === '/v1/admin/economy') {
      return { status: 200, body: { ok: true, economy: await deps.store.economy(now), serverNow: now } };
    }

    if (req.method === 'GET' && path === '/v1/admin/world') {
      return { status: 200, body: { ok: true, world: await deps.store.world(now), serverNow: now } };
    }

    if (req.method === 'GET' && path === '/v1/admin/campaign') {
      return { status: 200, body: { ok: true, campaign: await deps.store.campaign(), serverNow: now } };
    }

    throw new ApiError('NOT_FOUND', 'Unknown endpoint.');
  };
};
