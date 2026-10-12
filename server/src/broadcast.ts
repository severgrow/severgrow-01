// Live ping publisher (P-11). Broadcast failures must never fail a committed move.

export type MatchPing = { revision: number; status: string };

export type MatchBroadcaster = {
  publish(matchId: string, ping: MatchPing): Promise<void>;
};

/** Records pings for tests; never throws. */
export class RecordingBroadcaster implements MatchBroadcaster {
  readonly published: { matchId: string; ping: MatchPing }[] = [];
  failNext = false;

  async publish(matchId: string, ping: MatchPing): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('broadcast failed (test)');
    }
    this.published.push({ matchId, ping });
  }
}

export const noopBroadcaster: MatchBroadcaster = {
  async publish(): Promise<void> {
    /* intentional no-op */
  },
};

/** Fire-and-forget: swallow errors so a Realtime outage never rolls back a move. */
export const safePublish = async (
  broadcaster: MatchBroadcaster | undefined,
  matchId: string,
  ping: MatchPing,
): Promise<void> => {
  if (!broadcaster) return;
  try {
    await broadcaster.publish(matchId, ping);
  } catch {
    // P-11: ping is a hint; polling is truth.
  }
};
