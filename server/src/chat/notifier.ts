import { createSupabaseBroadcaster } from '../broadcast-supabase.js';
import type { MatchBroadcaster } from '../broadcast.js';
/** Same Supabase transport/channel as gameplay; only the event differs. Unlike the move's
 * fire-and-forget path, await this bounded delivery attempt so an Edge isolate cannot suspend
 * before sending it. Persistence succeeds even during a Realtime outage. */
export const chatNotifier = (
  url: string,
  key: string,
): MatchBroadcaster | undefined => {
  if (!url || !key) return undefined;
  return {
    async publish(matchId, ping) {
      const publisher = createSupabaseBroadcaster({
        url,
        key,
        event: 'chat',
        fetch: async (input, init) => {
          const response = await fetch(input, {
            ...init,
            signal: AbortSignal.timeout(1500),
          });
          if (!response.ok)
            throw new Error(
              `Realtime chat notification failed (${response.status})`,
            );
          return response;
        },
      });
      await publisher.publish(matchId, ping);
      await publisher.flush();
    },
  };
};
