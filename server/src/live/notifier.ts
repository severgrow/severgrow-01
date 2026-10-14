// Live duels — per-player pings on the Realtime broadcast channel `player:<id>`.
// The payload is ONLY { challengeId, fromName, kind }: a hint to fetch, never the data itself.
// Failing to publish never fails the request (the client also polls every 4 s while visible).
import { createSupabaseBroadcaster } from '../broadcast-supabase.js';
import type { MatchPing } from '../broadcast.js';

export type ChallengePing = { challengeId: string; fromName: string | null; kind: 'live' | 'rematch' };

export type LiveNotifier = { publish(topic: string, payload: ChallengePing): Promise<void> };

/** Records pings for tests; never throws unless asked to. */
export class RecordingNotifier implements LiveNotifier {
  readonly published: { topic: string; payload: ChallengePing }[] = [];
  failNext = false;
  async publish(topic: string, payload: ChallengePing): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('notify failed (test)');
    }
    this.published.push({ topic, payload: { ...payload } });
  }
}

/** Supabase Realtime REST broadcast, event `challenge`. Fire-and-forget. */
export const supabaseLiveNotifier = (options: { url: string; key: string; onError?: (e: unknown) => void }): LiveNotifier => {
  const b = createSupabaseBroadcaster({ url: options.url, key: options.key, event: 'challenge', ...(options.onError ? { onError: options.onError } : {}) });
  return {
    async publish(topic, payload) {
      // The broadcaster is typed for match pings; the wire body is the same envelope.
      await b.publish(topic, payload as unknown as MatchPing);
    },
  };
};
