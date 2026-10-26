import { ApiError } from '../errors.js';
import { newId } from '../ids.js';
import type { PgClient, PgPool, PgRow } from '../storage/postgres.js';
import {
  assertSendAllowed,
  CHAT_DAILY_LIMIT,
  CHAT_MATCH_LIMIT,
  CHAT_PAGE_SIZE,
} from './rules.js';
import type { ChatMessage, ChatStore } from './types.js';
const message = (r: PgRow, player: string): ChatMessage =>
  ({
    id: String(r.id),
    sequence: Number(r.sequence),
    mine: r.sender_id === player,
    createdAt: Number(r.created_at),
    requestId: String(r.request_id),
    text: r.text == null ? null : String(r.text),
    phrase: r.phrase == null ? null : String(r.phrase),
  }) as ChatMessage;
const fail = (): never => {
  throw new ApiError('NOT_FOUND', 'Chat not found.');
};

/** Match row is locked just like commitMove/commitBatch/resign/live autoplay. Pair lock
 * serializes cross-match blocking; sender lock serializes the global spam budget. */
export const postgresChatStore = (pool: PgPool): ChatStore => ({
  async execute(player, matchId, op, now) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const row = (
        await c.query('select * from matches where id=$1 for update', [matchId])
      ).rows[0];
      if (!row) return fail();
      const participants = (
        await c.query(
          'select player_id,seat from match_participants where match_id=$1',
          [matchId],
        )
      ).rows;
      const me = participants.find((p) => p.player_id === player);
      const opponent = participants.find((p) => p.player_id !== player);
      if (!me || !opponent) return fail();
      const other = String(opponent.player_id);
      // All chat operations take locks in the same order (match → pair → sender).
      await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `chat:pair:${[player, other].sort().join(':')}`,
      ]);
      const blocks = (
        await c.query(
          'select blocker_id from match_chat_blocks where (blocker_id=$1 and blocked_id=$2) or (blocker_id=$2 and blocked_id=$1)',
          [player, other],
        )
      ).rows;
      let blockedByMe = blocks.some((b) => b.blocker_id === player);
      const blockedByOther = blocks.some((b) => b.blocker_id === other);
      const state = (
        typeof row.state === 'string' ? JSON.parse(row.state) : row.state
      ) as { actor: number; phase: string };
      const context = {
        status: String(row.status),
        phase: state.phase,
        actor: state.actor,
        seat: Number(me.seat),
        turnRevision: Number(row.turn_start_revision),
        deadline:
          row.turn_deadline_at == null ? null : Number(row.turn_deadline_at),
        blocked: blockedByMe || blockedByOther,
      };
      let sent: ChatMessage | undefined;
      if (op.kind === 'send') {
        const old = (
          await c.query(
            'select * from match_messages where match_id=$1 and sender_id=$2 and request_id=$3',
            [matchId, player, op.requestId],
          )
        ).rows[0];
        if (old) {
          if (old.text !== op.content.text || old.phrase !== op.content.phrase)
            throw new ApiError(
              'REQUEST_ID_CONFLICT',
              'That request ID belongs to another message.',
            );
          sent = message(old, player);
        } else {
          assertSendAllowed(context, op.turnRevision, now);
          await c.query(
            'select pg_advisory_xact_lock(hashtextextended($1,0))',
            [`chat:sender:${player}`],
          );
          await enforceBudget(c, player, matchId, now);
          const r = (
            await c.query(
              'insert into match_messages(id,match_id,sender_id,text,phrase,request_id,created_at) values($1,$2,$3,$4,$5,$6,$7) returning *',
              [
                newId(),
                matchId,
                player,
                op.content.text,
                op.content.phrase,
                op.requestId,
                now,
              ],
            )
          ).rows[0]!;
          sent = message(r, player);
        }
      } else if (op.kind === 'block') {
        if (op.value)
          await c.query(
            'insert into match_chat_blocks(blocker_id,blocked_id) values($1,$2) on conflict do nothing',
            [player, other],
          );
        else
          await c.query(
            'delete from match_chat_blocks where blocker_id=$1 and blocked_id=$2',
            [player, other],
          );
        blockedByMe = op.value;
      } else if (op.kind === 'mute') {
        await c.query(
          'insert into match_chat_preferences(match_id,player_id,muted) values($1,$2,$3) on conflict(match_id,player_id) do update set muted=excluded.muted',
          [matchId, player, op.value],
        );
      } else if (op.kind === 'report') {
        const target = (
          await c.query(
            'select * from match_messages where match_id=$1 and id=$2 and sender_id=$3',
            [matchId, op.messageId, other],
          )
        ).rows[0];
        if (!target) return fail();
        await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
          `chat:sender:${player}`,
        ]);
        const count = Number(
          (
            await c.query(
              'select count(*) as n from match_chat_reports where reporter_id=$1 and created_at>$2',
              [player, now - 3600000],
            )
          ).rows[0]!.n,
        );
        const existing =
          (
            await c.query(
              'select 1 from match_chat_reports where message_id=$1 and reporter_id=$2',
              [op.messageId, player],
            )
          ).rows.length > 0;
        if (!existing) {
          if (count >= 10)
            throw new ApiError(
              'RATE_LIMITED',
              'Please wait before reporting again.',
            );
          await c.query(
            'insert into match_chat_reports(message_id,reporter_id,created_at) values($1,$2,$3)',
            [op.messageId, player, now],
          );
          // Real existing admin queue, preserved evidence even after message retention cleanup.
          await c.query(
            'insert into feedback_reports(id,created_at,kind,player_id,message,context,build,user_agent) values($1,$2,$3,$4,$5,$6,null,null)',
            [
              newId(),
              now,
              'report',
              player,
              `Match chat: ${op.reason}`,
              JSON.stringify({
                source: 'match-chat',
                matchId,
                messageId: op.messageId,
                reportedPlayerId: other,
                text: target.text,
                phrase: target.phrase,
                sentAt: Number(target.created_at),
              }),
            ],
          );
        }
        // Reporting ALWAYS mutes the reporter for this match, in the same transaction as the
        // report (owner, 2026-10-26). Server-side, so it survives a reload and a second device.
        await c.query(
          'insert into match_chat_preferences(match_id,player_id,muted) values($1,$2,true) on conflict(match_id,player_id) do update set muted=true',
          [matchId, player],
        );
      }
      const preferences = (
        await c.query(
          'select player_id, muted from match_chat_preferences where match_id=$1 and player_id in ($2,$3)',
          [matchId, player, other],
        )
      ).rows;
      const muted = preferences.some(
        (r) => r.player_id === player && r.muted === true,
      );
      const opponentMuted = preferences.some(
        (r) => r.player_id === other && r.muted === true,
      );
      const after = op.kind === 'history' ? op.after : undefined;
      const before = op.kind === 'history' ? op.before : undefined;
      const rows = (
        await c.query(
          `select * from match_messages where match_id=$1 ${after !== undefined ? 'and sequence>$2' : before !== undefined ? 'and sequence<$2' : ''} order by sequence ${after !== undefined ? 'asc' : 'desc'} limit ${CHAT_PAGE_SIZE + 1}`,
          after !== undefined || before !== undefined
            ? [matchId, after ?? before]
            : [matchId],
        )
      ).rows;
      const hasMore = rows.length > CHAT_PAGE_SIZE;
      const messages = rows
        .slice(0, CHAT_PAGE_SIZE)
        .map((r) => message(r, player));
      if (after === undefined) messages.reverse();
      context.blocked = blockedByMe || blockedByOther;
      let canSend = true;
      try {
        assertSendAllowed(context, context.turnRevision, now);
      } catch {
        canSend = false;
      }
      await c.query('commit');
      return {
        messages,
        hasMore,
        canSend,
        turnRevision: context.turnRevision,
        muted,
        opponentMuted,
        blocked: context.blocked,
        blockedByMe,
        ...(sent ? { sent } : {}),
      };
    } catch (error) {
      await c.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      c.release?.();
    }
  },
});
const enforceBudget = async (
  c: PgClient,
  player: string,
  match: string,
  now: number,
): Promise<void> => {
  const r = (
    await c.query(
      'select count(*) as day, count(*) filter(where created_at>$3) as burst, max(created_at) as latest from match_messages where sender_id=$1 and created_at>$2',
      [player, now - 86400000, now - 10000],
    )
  ).rows[0]!;
  if (
    Number(r.day) >= CHAT_DAILY_LIMIT ||
    Number(r.burst) >= 5 ||
    (r.latest != null && now - Number(r.latest) < 1000)
  )
    throw new ApiError('RATE_LIMITED', 'Give your opponent a moment.');
  if (
    Number(
      (
        await c.query(
          'select count(*) as n from match_messages where match_id=$1',
          [match],
        )
      ).rows[0]!.n,
    ) >= CHAT_MATCH_LIMIT
  )
    throw new ApiError(
      'RATE_LIMITED',
      'This match has reached its chat limit.',
    );
};
