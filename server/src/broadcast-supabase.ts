// Supabase Realtime broadcast publisher for the match ping (P-11).
//
// The ping is a hint: polling is always the truth, so a broadcast failure must never fail or delay
// a committed move. `publish` therefore returns immediately and reports errors only through the
// optional `onError` hook. The REST call is the documented "send without a WebSocket" path.
import type { MatchBroadcaster, MatchPing } from './broadcast.js';

export type SupabaseBroadcasterOptions = {
  /** Project URL, e.g. https://xxxx.supabase.co (no trailing slash). */
  url: string;
  /** Public anon / publishable key. */
  key: string;
  /** Event name on the channel (defaults to `ping`). */
  event?: string;
  /** Inject fetch (tests). Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Observe failures without affecting play. */
  onError?: (error: unknown) => void;
};

/** Body shape of `POST /realtime/v1/api/broadcast`. */
export type BroadcastBody = { messages: { topic: string; event: string; payload: unknown }[] };

/** Client library convention: the REST topic is the channel name without the `realtime:` prefix. */
export const broadcastBody = (matchId: string, event: string, ping: MatchPing): BroadcastBody => ({
  messages: [{ topic: matchId, event, payload: ping }],
});

/**
 * A broadcaster that never blocks the caller. The underlying request is fired and forgotten;
 * callers that need to await it in tests can use `flush`.
 */
export const createSupabaseBroadcaster = (options: SupabaseBroadcasterOptions): MatchBroadcaster & { flush: () => Promise<void> } => {
  const base = options.url.replace(/\/+$/, '');
  const endpoint = `${base}/realtime/v1/api/broadcast`;
  const event = options.event ?? 'ping';
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let inflight: Promise<void> = Promise.resolve();

  const publish = async (matchId: string, ping: MatchPing): Promise<void> => {
    if (!base || !options.key) return;
    try {
      await doFetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: options.key,
          authorization: `Bearer ${options.key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(broadcastBody(matchId, event, ping)),
      });
    } catch (error) {
      options.onError?.(error);
    }
  };

  return {
    async publish(matchId, ping) {
      // Fire and forget: reserve the socket for the move's own response, never the ping.
      inflight = publish(matchId, ping);
      // Resolve at once so a commit is never held back by the broadcast round-trip.
    },
    flush: () => inflight,
  };
};
