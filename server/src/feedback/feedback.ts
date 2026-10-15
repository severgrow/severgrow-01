// Beta feedback: "Report a problem" and silent crash reports. Its own router and store, so nothing
// in the match pipeline changes. A report never fails the game: bad input is trimmed or refused
// with a stable code, and a bad/missing token just files the report without a player id.
import { pickClientIp } from '../client-ip.js';
import { ApiError } from '../errors.js';
import { newId } from '../ids.js';
import type { PgPool } from '../storage/postgres.js';
import type { PlayerRecord, Storage } from '../storage/types.js';

export type FeedbackKind = 'report' | 'crash';

export type FeedbackRecord = {
  id: string;
  createdAt: number;
  kind: FeedbackKind;
  playerId: string | null;
  message: string;
  context: Record<string, unknown>;
  build: string | null;
  userAgent: string | null;
};

export type FeedbackStore = {
  insert(record: FeedbackRecord): Promise<void>;
  /** Newest first (tests and the local dev server). */
  recent(limit: number): Promise<FeedbackRecord[]>;
};

export const MAX_MESSAGE = 2000;
export const MAX_CONTEXT_BYTES = 8 * 1024;
export const LIMITS = { reportPerHour: 20, crashPerHour: 30 } as const;

export class MemoryFeedbackStore implements FeedbackStore {
  readonly rows: FeedbackRecord[] = [];
  async insert(record: FeedbackRecord): Promise<void> {
    this.rows.push(structuredClone(record));
  }
  async recent(limit: number): Promise<FeedbackRecord[]> {
    return this.rows.slice(-limit).reverse().map((r) => structuredClone(r));
  }
}

export const postgresFeedbackStore = (pool: PgPool): FeedbackStore => ({
  async insert(r) {
    await pool.query(
      `insert into feedback_reports (id, created_at, kind, player_id, message, context, build, user_agent)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.id, r.createdAt, r.kind, r.playerId, r.message, JSON.stringify(r.context), r.build, r.userAgent],
    );
  },
  async recent(limit) {
    const { rows } = await pool.query('select * from feedback_reports order by created_at desc limit $1', [limit]);
    return rows.map((row) => ({
      id: String(row.id),
      createdAt: Number(row.created_at),
      kind: String(row.kind) as FeedbackKind,
      playerId: row.player_id == null ? null : String(row.player_id),
      message: String(row.message ?? ''),
      context: (typeof row.context === 'string' ? JSON.parse(row.context) : row.context) as Record<string, unknown>,
      build: row.build == null ? null : String(row.build),
      userAgent: row.user_agent == null ? null : String(row.user_agent),
    }));
  },
});

/** Keys that must never be stored, wherever they appear in the context (defence in depth). */
const SECRET_KEYS = /^(token|authorization|hand|deck|seed|state|invitecode|code|password|email)$/i;

/** Deep-copy the context, dropping secret-looking keys and anything past a few levels deep. */
export const cleanContext = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return undefined;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 40).map((v) => cleanContext(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
      if (SECRET_KEYS.test(k)) continue;
      const c = cleanContext(v, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined;
};

export type FeedbackRouter = (req: Request, path: string) => Promise<{ status: number; body: unknown } | null>;

export const createFeedbackRouter = (deps: {
  store: FeedbackStore;
  storage: Storage;
  authenticate: (token: string | null) => Promise<PlayerRecord>;
  now: () => number;
  limits?: { reportPerHour: number; crashPerHour: number };
}): FeedbackRouter => {
  const limits = deps.limits ?? LIMITS;
  return async (req, path) => {
    if (req.method !== 'POST' || path !== '/v1/feedback') return null;
    const raw = await req.arrayBuffer();
    // Hard cap on what we even read; within it, an oversized message/context is trimmed, not refused.
    if (raw.byteLength > 64 * 1024) throw new ApiError('INVALID_REQUEST', 'Report is too large.');
    let body: Record<string, unknown> = {};
    try {
      const parsed = raw.byteLength ? (JSON.parse(new TextDecoder().decode(raw)) as unknown) : {};
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      throw new ApiError('INVALID_REQUEST', 'Report is not valid JSON.');
    }
    const kind: FeedbackKind | null = body.kind === 'report' || body.kind === 'crash' ? body.kind : null;
    if (!kind) throw new ApiError('INVALID_REQUEST', 'kind must be "report" or "crash".');
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
    if (kind === 'report' && message.length === 0) throw new ApiError('INVALID_REQUEST', 'Please write what happened.');
    let context = cleanContext(body.context ?? {}) as Record<string, unknown>;
    if (typeof context !== 'object' || context === null || Array.isArray(context)) context = {};
    if (JSON.stringify(context).length > MAX_CONTEXT_BYTES) context = { truncated: true };

    // Optional identity: a valid token links the report to the player; anything else files it anonymously.
    let player: PlayerRecord | null = null;
    const auth = req.headers.get('authorization');
    if (auth && /^bearer /i.test(auth)) {
      try {
        player = await deps.authenticate(auth.slice(7).trim());
      } catch {
        player = null;
      }
    }
    const who = player ? `player:${player.id}` : `ip:${pickClientIp(req.headers) ?? 'unknown'}`;
    const now = deps.now();
    const hour = 60 * 60 * 1000;
    const max = kind === 'report' ? limits.reportPerHour : limits.crashPerHour;
    const hit = await deps.storage.hitRateLimit(`feedback:${kind}:${who}`, Math.floor(now / hour) * hour, max);
    if (!hit.ok) throw new ApiError('RATE_LIMITED', 'Too many reports. Try again later.');

    const id = newId();
    const build = typeof body.build === 'string' ? body.build.slice(0, 120) : null;
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 300) || null;
    await deps.store.insert({ id, createdAt: now, kind, playerId: player?.id ?? null, message, context, build, userAgent });
    return { status: 201, body: { ok: true, id, serverNow: now } };
  };
};

/** Several routers behind the one fetch-app hook: the first that owns the path answers. */
export const chainRouters =
  (...routers: FeedbackRouter[]): FeedbackRouter =>
  async (req, path) => {
    for (const r of routers) {
      const out = await r(req.clone(), path);
      if (out) return out;
    }
    return null;
  };
