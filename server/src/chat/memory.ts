import { ApiError } from '../errors.js';
import { newId } from '../ids.js';
import type { MemoryStorage } from '../storage/memory.js';
import type { FeedbackStore } from '../feedback/feedback.js';
import {
  assertSendAllowed,
  CHAT_DAILY_LIMIT,
  CHAT_MATCH_LIMIT,
  CHAT_PAGE_SIZE,
} from './rules.js';
import type { ChatContent, ChatMessage, ChatStore } from './types.js';
type Row = ChatContent & {
  id: string;
  sequence: number;
  matchId: string;
  sender: string;
  createdAt: number;
  requestId: string;
};
/** Local development/reference adapter. Authority check and insert execute synchronously. */
export const memoryChatStore = (
  storage: MemoryStorage,
  feedback: FeedbackStore,
): ChatStore => {
  const rows: Row[] = [];
  const muted = new Set<string>();
  const blocks = new Set<string>();
  const reports = new Map<string, number>();
  return {
    async execute(player, matchId, op, now) {
      const { match, participants } = storage.chatAuthority(matchId);
      const me = participants.find((p) => p.playerId === player);
      const other = participants.find((p) => p.playerId !== player)?.playerId;
      if (!match || !me || !other)
        throw new ApiError('NOT_FOUND', 'Chat not found.');
      const key = `${matchId}:${player}`;
      const blockKey = `${player}:${other}`;
      let blockedByMe = blocks.has(blockKey);
      const blockedByOther = blocks.has(`${other}:${player}`);
      const ctx = {
        status: match.status,
        phase: match.state.phase,
        actor: match.state.actor,
        seat: me.seat,
        turnRevision: match.turnStartRevision,
        deadline: match.turnDeadlineAt,
        blocked: blockedByMe || blockedByOther,
      };
      const wire = (r: Row): ChatMessage =>
        ({
          id: r.id,
          sequence: r.sequence,
          mine: r.sender === player,
          createdAt: r.createdAt,
          requestId: r.requestId,
          text: r.text,
          phrase: r.phrase,
        }) as ChatMessage;
      let sent: ChatMessage | undefined;
      if (op.kind === 'send') {
        const old = rows.find(
          (r) =>
            r.matchId === matchId &&
            r.sender === player &&
            r.requestId === op.requestId,
        );
        if (old) {
          if (old.text !== op.content.text || old.phrase !== op.content.phrase)
            throw new ApiError(
              'REQUEST_ID_CONFLICT',
              'That request ID belongs to another message.',
            );
          sent = wire(old);
        } else {
          assertSendAllowed(ctx, op.turnRevision, now);
          const recent = rows.filter(
            (r) => r.sender === player && r.createdAt > now - 86400000,
          );
          if (
            recent.length >= CHAT_DAILY_LIMIT ||
            recent.filter((r) => r.createdAt > now - 10000).length >= 5 ||
            recent.some((r) => now - r.createdAt < 1000) ||
            rows.filter((r) => r.matchId === matchId).length >= CHAT_MATCH_LIMIT
          )
            throw new ApiError('RATE_LIMITED', 'Give your opponent a moment.');
          const r: Row = {
            ...op.content,
            id: newId(),
            sequence: rows.length + 1,
            matchId,
            sender: player,
            createdAt: now,
            requestId: op.requestId,
          };
          rows.push(r);
          sent = wire(r);
        }
      } else if (op.kind === 'mute') {
        if (op.value) muted.add(key);
        else muted.delete(key);
      } else if (op.kind === 'block') {
        if (op.value) blocks.add(blockKey);
        else blocks.delete(blockKey);
        blockedByMe = op.value;
      } else if (op.kind === 'report') {
        const target = rows.find(
          (r) =>
            r.id === op.messageId &&
            r.matchId === matchId &&
            r.sender === other,
        );
        if (!target) throw new ApiError('NOT_FOUND', 'Message not found.');
        const reportKey = `${player}:${op.messageId}`;
        if (!reports.has(reportKey)) {
          if (
            [...reports].filter(
              ([k, v]) => k.startsWith(player + ':') && v > now - 3600000,
            ).length >= 10
          )
            throw new ApiError(
              'RATE_LIMITED',
              'Please wait before reporting again.',
            );
          reports.set(reportKey, now);
          await feedback.insert({
            id: newId(),
            createdAt: now,
            kind: 'report',
            playerId: player,
            message: `Match chat: ${op.reason}`,
            context: {
              source: 'match-chat',
              matchId,
              messageId: target.id,
              reportedPlayerId: other,
              text: target.text,
              phrase: target.phrase,
              sentAt: target.createdAt,
            },
            build: null,
            userAgent: null,
          });
        }
        // Reporting ALWAYS mutes the reporter for this match (owner, 2026-10-26), even if the same
        // report was already recorded. Server-side state, independent of this device.
        muted.add(key);
      }
      let selected = rows.filter((r) => r.matchId === matchId);
      const after = op.kind === 'history' ? op.after : undefined;
      const before = op.kind === 'history' ? op.before : undefined;
      if (after !== undefined)
        selected = selected.filter((r) => r.sequence > after);
      else if (before !== undefined)
        selected = selected.filter((r) => r.sequence < before);
      const hasMore = selected.length > CHAT_PAGE_SIZE;
      selected =
        after !== undefined
          ? selected.slice(0, CHAT_PAGE_SIZE)
          : selected.slice(-CHAT_PAGE_SIZE);
      ctx.blocked = blockedByMe || blockedByOther;
      let canSend = true;
      try {
        assertSendAllowed(ctx, ctx.turnRevision, now);
      } catch {
        canSend = false;
      }
      return {
        messages: selected.map(wire),
        hasMore,
        canSend,
        turnRevision: ctx.turnRevision,
        muted: muted.has(key),
        opponentMuted: muted.has(`${matchId}:${other}`),
        blocked: ctx.blocked,
        blockedByMe,
        ...(sent ? { sent } : {}),
      };
    },
  };
};
