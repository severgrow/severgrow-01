// Submit with stable requestId; retry network; 409 refetches (P-20). Never loses a draft on offline.

import { DuelClient, DuelError } from '../../../server/src/client.js';
import type { Action } from '../../../src/engine/index.js';
import type { MatchViewPayload, SubmitActionResponse } from '../../../server/src/protocol.js';
import { CURRENT_RULES_VERSION } from '../../../src/engine/index.js';

export type SubmitOutcome =
  | { ok: true; response: SubmitActionResponse }
  | {
      ok: false;
      code: string;
      message: string;
      /** Fresh view after a 409 / conflict, if recovered. */
      player?: MatchViewPayload;
      /** Keep the local draft (offline / transient). */
      keepDraft: boolean;
    };

export type RetrySubmitOptions = {
  client: DuelClient;
  token: string;
  matchId: string;
  expectedRevision: number;
  requestId: string;
  /** Mid-turn draft actions + EndAct (Throw), or a single Draw. */
  actions: Action[];
  /** Rules version the client believes this match uses. */
  rulesVersion: string;
  maxAttempts?: number;
  /** Delay between retries (ms). Tests can pass 0. */
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Called to refetch after STALE_REVISION / conflict. */
  refetch?: () => Promise<{ player: MatchViewPayload; serverNow: number }>;
};

const defaultSleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

export const newRequestId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `req_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
};

const isTransient = (error: unknown): boolean => {
  if (!(error instanceof DuelError)) return true;
  if (error.code === 'CLIENT_TOO_OLD') return false;
  if (error.code === 'STALE_REVISION' || error.code === 'REQUEST_ID_CONFLICT') return false;
  if (error.status === 0 || error.status >= 500) return true;
  if (error.code === 'HTTP_ERROR' && (error.status === 0 || error.status >= 500)) return true;
  // Network / offline often surfaces as status 0
  return error.status === 0;
};

/**
 * Submit once with retries on transient failures, always using the SAME requestId.
 * On 409 STALE_REVISION, refetch and tell the caller to rebuild the draft.
 */
export const submitWithRetries = async (options: RetrySubmitOptions): Promise<SubmitOutcome> => {
  if (options.rulesVersion !== CURRENT_RULES_VERSION && options.rulesVersion !== '') {
    // Client never sends moves with a mismatching rules version (P-5).
    return {
      ok: false,
      code: 'RULES_MISMATCH',
      message: 'Reload to update FUTASAKU',
      keepDraft: true,
    };
  }

  const maxAttempts = options.maxAttempts ?? 3;
  const delay = options.retryDelayMs ?? 400;
  const sleep = options.sleep ?? defaultSleep;
  const body =
    options.actions.length === 1
      ? {
          expectedRevision: options.expectedRevision,
          requestId: options.requestId,
          action: options.actions[0]!,
        }
      : {
          expectedRevision: options.expectedRevision,
          requestId: options.requestId,
          actions: options.actions,
        };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await options.client.submitAction(options.token, options.matchId, body);
      return { ok: true, response };
    } catch (error) {
      lastError = error;
      if (error instanceof DuelError && error.code === 'CLIENT_TOO_OLD') {
        return { ok: false, code: error.code, message: error.message, keepDraft: true };
      }
      if (error instanceof DuelError && (error.code === 'STALE_REVISION' || error.status === 409)) {
        let player: MatchViewPayload | undefined;
        if (options.refetch) {
          try {
            const fresh = await options.refetch();
            player = fresh.player;
          } catch {
            /* ignore refetch failure */
          }
        }
        return {
          ok: false,
          code: error.code,
          message: 'Your state changed. Your cards are back.',
          ...(player ? { player } : {}),
          keepDraft: false,
        };
      }
      if (!isTransient(error) || attempt === maxAttempts - 1) break;
      await sleep(delay);
    }
  }

  if (lastError instanceof DuelError) {
    return {
      ok: false,
      code: lastError.code,
      message: lastError.message,
      keepDraft: isTransient(lastError),
    };
  }
  return {
    ok: false,
    code: 'OFFLINE',
    message: 'Reconnecting',
    keepDraft: true,
  };
};
