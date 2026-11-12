import { ApiError } from '../errors.js';
import type { MatchService } from '../service.js';
import type { Storage } from '../storage/types.js';
import type { MatchBroadcaster } from '../broadcast.js';
import { contentFrom, validId } from './rules.js';
import type { ChatOperation, ChatStore } from './types.js';

export const createChatRouter =
  (deps: {
    store: ChatStore;
    service: MatchService;
    storage: Storage;
    notifier?: MatchBroadcaster;
  }) =>
  async (
    req: Request,
    path: string,
  ): Promise<{ status: number; body: unknown } | null> => {
    const route =
      /^\/v1\/matches\/([^/]+)\/chat(?:\/(mute|block|report))?$/.exec(path);
    if (!route) return null;
    const matchId = route[1]!;
    if (!validId(matchId)) throw new ApiError('NOT_FOUND', 'Chat not found.');
    const player = await deps.service.authenticate(
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null,
    );
    const now = deps.service.serverNow();
    const budget = await deps.storage.hitRateLimit(
      `chat:api:${player.id}`,
      Math.floor(now / 60000) * 60000,
      120,
    );
    if (!budget.ok) throw new ApiError('RATE_LIMITED', 'Please wait a moment.');
    const number = (v: unknown): number => {
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
        throw new ApiError('INVALID_REQUEST', 'Invalid chat cursor.');
      return v;
    };
    let operation: ChatOperation;
    if (req.method === 'GET' && !route[2]) {
      const url = new URL(req.url);
      const after = url.searchParams.get('after');
      const before = url.searchParams.get('before');
      if (after !== null && before !== null)
        throw new ApiError('INVALID_REQUEST', 'Use one cursor.');
      operation = {
        kind: 'history',
        ...(after !== null ? { after: number(Number(after)) } : {}),
        ...(before !== null ? { before: number(Number(before)) } : {}),
      };
    } else if (req.method === 'POST') {
      const bytes = await req.arrayBuffer();
      if (bytes.byteLength > 4096)
        throw new ApiError('INVALID_REQUEST', 'Chat request is too large.');
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes)) as Record<
          string,
          unknown
        >;
      } catch {
        throw new ApiError('INVALID_REQUEST', 'Invalid JSON.');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new ApiError('INVALID_REQUEST', 'Invalid chat request.');
      if (route[2] === 'mute' || route[2] === 'block') {
        if (typeof body.value !== 'boolean')
          throw new ApiError('INVALID_REQUEST', 'Choose on or off.');
        operation = { kind: route[2], value: body.value };
      } else if (route[2] === 'report') {
        if (
          !validId(body.messageId) ||
          !['abuse', 'spam', 'other'].includes(String(body.reason))
        )
          throw new ApiError('INVALID_REQUEST', 'Invalid report.');
        operation = {
          kind: 'report',
          messageId: body.messageId,
          reason: body.reason as 'abuse' | 'spam' | 'other',
        };
      } else {
        if (!validId(body.requestId))
          throw new ApiError(
            'INVALID_REQUEST',
            'A unique request ID is required.',
          );
        operation = {
          kind: 'send',
          requestId: body.requestId,
          turnRevision: number(body.turnRevision),
          content: contentFrom(body),
        };
      }
    } else throw new ApiError('NOT_FOUND', 'Chat route not found.');
    const result = await deps.store.execute(player.id, matchId, operation, now);
    if (
      (operation.kind === 'send' && result.sent) ||
      operation.kind === 'block'
    ) {
      // Public existing channel carries ONLY an invalidation hint. No text, sender, request ID,
      // unread count or chat metadata is ever broadcast. All reads remain bearer-authenticated.
      try {
        await deps.notifier?.publish(matchId, {
          revision: 0,
          status: 'changed',
        });
      } catch {
        /* persisted; reconnect fetch recovers */
      }
    }
    return { status: 200, body: { ok: true, ...result } };
  };
