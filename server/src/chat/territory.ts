// TERRITORY CHAT (owner, 2026-10-28): "a simple global chat … one shared channel for everyone
// currently in Territory. Cap the visible history at 30 messages (drop oldest). No extra features."
//
// It reuses what duel chat already has, rather than a new system:
//   - the text rules (`contentFrom`: one line, 1–280 characters, no control or bidi characters),
//   - the player-to-player block list (`match_chat_blocks`): blocking someone here also blocks them in
//     duel chat, and the other way round — one list, one meaning,
//   - the server's own rate limiter (`hitRateLimit`).
// What is new is only what a shared channel needs: the sender's nickname and #tag on each message
// (a duel chat only ever says "mine" or not), and a store that keeps the newest 30 and nothing older.
// A report copies the reported line, so it survives the message rolling out of the window.
// No sender id ever leaves the API: a block or a report names the MESSAGE, and the server finds the sender.
import { ApiError } from '../errors.js';
import { newId } from '../ids.js';
import type { MatchService } from '../service.js';
import type { PgPool, PgRow } from '../storage/postgres.js';
import type { Storage } from '../storage/types.js';
import { playerTag } from '../../../src/player-tag.js';
import { contentFrom, validId } from './rules.js';

/** The visible history: the newest 30 messages. Older ones are deleted, not hidden. */
export const TERRITORY_CHAT_KEEP = 30;
/** Sends per player per minute, and per UTC day. */
export const TERRITORY_CHAT_PER_MINUTE = 6;
export const TERRITORY_CHAT_PER_DAY = 200;

export type TerritoryMessage = {
  id: string;
  sequence: number;
  text: string;
  /** The sender's nickname and permanent #tag (src/player-tag.ts). */
  name: string;
  tag: string;
  mine: boolean;
  createdAt: number;
  requestId: string;
};
export type TerritoryChatPage = { messages: TerritoryMessage[] };
export type TerritoryReportReason = 'abuse' | 'spam' | 'other';

export type TerritoryChatStore = {
  /** The newest messages, oldest first, without anyone the reader has blocked. */
  history(player: string): Promise<TerritoryChatPage>;
  /** Idempotent by (sender, requestId); trims the channel to TERRITORY_CHAT_KEEP. */
  send(player: string, text: string, requestId: string, now: number): Promise<void>;
  /** Block the sender of a message (never yourself). */
  block(player: string, messageId: string): Promise<void>;
  /** Report a message (never your own); the line is copied with the report. */
  report(player: string, messageId: string, reason: TerritoryReportReason, now: number): Promise<void>;
};

const notFound = (): never => { throw new ApiError('NOT_FOUND', 'That message is gone.'); };
const notYours = (): never => { throw new ApiError('INVALID_REQUEST', 'That is your own message.'); };

// ---------------------------------------------------------------- memory (tests, local server)

export const memoryTerritoryChatStore = (storage: Storage): TerritoryChatStore => {
  type Row = { id: string; sequence: number; sender: string; text: string; requestId: string; createdAt: number };
  let rows: Row[] = [];
  let sequence = 0;
  const blocks = new Set<string>();
  const reports = new Map<string, { sender: string; text: string; reason: TerritoryReportReason; createdAt: number }>();
  const find = (id: string) => rows.find((row) => row.id === id) ?? notFound();
  return {
    async history(player) {
      const shown = rows.filter((row) => !blocks.has(`${player}:${row.sender}`));
      const messages: TerritoryMessage[] = [];
      for (const row of shown) {
        const who = await storage.playerById(row.sender);
        messages.push({
          id: row.id, sequence: row.sequence, text: row.text, name: who?.displayName ?? 'Player', tag: playerTag(row.sender),
          mine: row.sender === player, createdAt: row.createdAt, requestId: row.requestId,
        });
      }
      return { messages };
    },
    async send(player, text, requestId, now) {
      if (rows.some((row) => row.sender === player && row.requestId === requestId)) return;
      rows.push({ id: newId(), sequence: ++sequence, sender: player, text, requestId, createdAt: now });
      rows = rows.slice(-TERRITORY_CHAT_KEEP);
    },
    async block(player, messageId) {
      const row = find(messageId);
      if (row.sender === player) notYours();
      blocks.add(`${player}:${row.sender}`);
    },
    async report(player, messageId, reason, now) {
      const row = find(messageId);
      if (row.sender === player) notYours();
      const key = `${messageId}:${player}`;
      if (!reports.has(key)) reports.set(key, { sender: row.sender, text: row.text, reason, createdAt: now });
    },
  };
};

// ---------------------------------------------------------------- postgres (0018_territory_chat.sql)

const message = (row: PgRow, player: string): TerritoryMessage => ({
  id: String(row.id),
  sequence: Number(row.sequence),
  text: String(row.text),
  name: row.display_name == null ? 'Player' : String(row.display_name),
  tag: playerTag(String(row.sender_id)),
  mine: row.sender_id === player,
  createdAt: Number(row.created_at),
  requestId: String(row.request_id),
});

export const postgresTerritoryChatStore = (pool: PgPool): TerritoryChatStore => {
  const senderOf = async (messageId: string): Promise<string> => {
    const row = (await pool.query('select sender_id from territory_messages where id=$1', [messageId])).rows[0];
    return row ? String(row.sender_id) : notFound();
  };
  return {
    async history(player) {
      const { rows } = await pool.query(
        `select m.id, m.sequence, m.sender_id, m.text, m.request_id, m.created_at, p.display_name
           from territory_messages m join players p on p.id = m.sender_id
          where not exists (select 1 from match_chat_blocks b where b.blocker_id = $1 and b.blocked_id = m.sender_id)
          order by m.sequence desc limit $2`,
        [player, TERRITORY_CHAT_KEEP],
      );
      return { messages: rows.reverse().map((row) => message(row, player)) };
    },
    async send(player, text, requestId, now) {
      // One statement: insert (a replayed request id is a no-op), then keep only the newest 30.
      await pool.query(
        `with added as (
           insert into territory_messages(id, sender_id, text, request_id, created_at)
           values ($1, $2, $3, $4, $5) on conflict (sender_id, request_id) do nothing returning sequence
         )
         delete from territory_messages
          where sequence <= (select sequence from territory_messages order by sequence desc offset $6 limit 1)
            and exists (select 1 from added)`,
        [newId(), player, text, requestId, now, TERRITORY_CHAT_KEEP - 1],
      );
    },
    async block(player, messageId) {
      const sender = await senderOf(messageId);
      if (sender === player) notYours();
      await pool.query('insert into match_chat_blocks(blocker_id, blocked_id) values ($1, $2) on conflict do nothing', [player, sender]);
    },
    async report(player, messageId, reason, now) {
      const sender = await senderOf(messageId);
      if (sender === player) notYours();
      await pool.query(
        `insert into territory_chat_reports(message_id, reporter_id, sender_id, text, reason, created_at)
         select id, $2, sender_id, text, $3, $4 from territory_messages where id = $1
         on conflict do nothing`,
        [messageId, player, reason, now],
      );
    },
  };
};

// ---------------------------------------------------------------- route

/** GET /v1/territory/chat · POST /v1/territory/chat {text, requestId} · POST …/block {messageId} · POST …/report {messageId, reason} */
export const createTerritoryChatRouter =
  (deps: { store: TerritoryChatStore; service: MatchService; storage: Storage }) =>
  async (req: Request, path: string): Promise<{ status: number; body: unknown } | null> => {
    const route = /^\/v1\/territory\/chat(?:\/(block|report))?$/.exec(path);
    if (!route) return null;
    const player = await deps.service.authenticate(req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null);
    const now = deps.service.serverNow();
    const minute = Math.floor(now / 60_000) * 60_000;
    // The same per-player API budget duel chat uses.
    if (!(await deps.storage.hitRateLimit(`chat:api:${player.id}`, minute, 120)).ok) throw new ApiError('RATE_LIMITED', 'Please wait a moment.');
    if (req.method === 'GET' && !route[1]) {
      return { status: 200, body: { ok: true, ...(await deps.store.history(player.id)) } };
    }
    if (req.method !== 'POST') throw new ApiError('NOT_FOUND', 'Chat route not found.');
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > 4096) throw new ApiError('INVALID_REQUEST', 'Chat request is too large.');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    } catch {
      throw new ApiError('INVALID_REQUEST', 'Invalid JSON.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('INVALID_REQUEST', 'Invalid chat request.');
    if (route[1] === 'block' || route[1] === 'report') {
      if (!validId(body.messageId)) throw new ApiError('INVALID_REQUEST', 'Choose a message.');
      if (route[1] === 'block') {
        await deps.store.block(player.id, body.messageId);
        return { status: 200, body: { ok: true, ...(await deps.store.history(player.id)) } };
      }
      if (!['abuse', 'spam', 'other'].includes(String(body.reason))) throw new ApiError('INVALID_REQUEST', 'Invalid report.');
      await deps.store.report(player.id, body.messageId, body.reason as TerritoryReportReason, now);
      return { status: 200, body: { ok: true, reported: true } };
    }
    if (!validId(body.requestId)) throw new ApiError('INVALID_REQUEST', 'A unique request ID is required.');
    if (body.phrase != null) throw new ApiError('INVALID_REQUEST', 'Type a message.');
    const { text } = contentFrom(body);
    if (!(await deps.storage.hitRateLimit(`chat:territory:${player.id}`, minute, TERRITORY_CHAT_PER_MINUTE)).ok ||
      !(await deps.storage.hitRateLimit(`chat:territory:day:${player.id}`, Math.floor(now / 86_400_000) * 86_400_000, TERRITORY_CHAT_PER_DAY)).ok) {
      throw new ApiError('RATE_LIMITED', 'Slow down a little.');
    }
    await deps.store.send(player.id, text!, body.requestId, now);
    return { status: 200, body: { ok: true, ...(await deps.store.history(player.id)) } };
  };
