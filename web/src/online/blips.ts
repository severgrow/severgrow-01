// A BLIP IS NOT AN ERROR (owner, 2026-11-12: "Could not read the map" / "Chat is not reachable right
// now" "should never happen"). The transport already retries a read quietly (server/src/client.ts);
// on top of that, a polled screen (the world map, the territory chat) keeps what it last showed and
// says nothing until reads have failed this many times IN A ROW. Then the trouble is real and worth a
// line; the next good read clears it.
export const FAILURES_BEFORE_NOTICE = 3;

export const shouldReportFailure = (consecutiveFailures: number): boolean => consecutiveFailures >= FAILURES_BEFORE_NOTICE;

/** The wait before the next poll: the normal pace, or sooner after a failure (3 s, 6 s, ... capped). */
export const nextPollMs = (normalMs: number, consecutiveFailures: number): number =>
  consecutiveFailures > 0 ? Math.min(normalMs, 3_000 * consecutiveFailures) : normalMs;
