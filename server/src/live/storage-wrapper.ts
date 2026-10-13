// Live duels — wraps the base Storage so the live clock is decided at the SAME lazy points as the
// 24-hour deadline (every read/write of a match, plus the sweeper), with no change to the move
// pipeline itself.
//
// Normal (non-live) matches pay nothing on reads: the base expiry step skips live-managed rows, so
// the wrapper only steps in when the match it got back is live-managed and its deadline has passed.
// Writes pay one tiny indexed lookup so a move that arrives after a live deadline is preceded by
// the auto-played turn (and then refused as stale), exactly like a late move after a 24-hour
// timeout.
import type { CommitBatchInput, CommitInput, CommitResult, MatchRecord, Storage, SweepResult } from '../storage/types.js';

export type LiveTicker = {
  tickMatch(matchId: string, now: number): Promise<boolean>;
  tickDue(now: number): Promise<number>;
  needsTick(matchId: string, now: number): Promise<boolean>;
};

const overdue = (m: MatchRecord | null, now: number): boolean =>
  !!m && !!m.liveManaged && ((m.status === 'active' && m.turnDeadlineAt !== null && now > m.turnDeadlineAt) || m.status === 'finished');

export const liveAwareStorage = (inner: Storage, ticker: LiveTicker): Storage => {
  const beforeWrite = async (matchId: string, now: number): Promise<void> => {
    try {
      if (await ticker.needsTick(matchId, now)) await ticker.tickMatch(matchId, now);
    } catch {
      /* never block a move on the live layer */
    }
  };
  const afterWrite = async (result: CommitResult, matchId: string, now: number): Promise<void> => {
    if (result.ok && result.match.status === 'finished' && result.match.liveManaged) await ticker.tickMatch(matchId, now);
  };
  const overrides: Partial<Storage> = {
    async applyExpiry(matchId: string, now: number) {
      const m = await inner.applyExpiry(matchId, now);
      if (!overdue(m, now)) return m;
      await ticker.tickMatch(matchId, now);
      return inner.applyExpiry(matchId, now);
    },
    async commitMove(input: CommitInput) {
      await beforeWrite(input.matchId, input.now);
      const r = await inner.commitMove(input);
      await afterWrite(r, input.matchId, input.now);
      return r;
    },
    async commitBatch(input: CommitBatchInput) {
      await beforeWrite(input.matchId, input.now);
      const r = await inner.commitBatch(input);
      await afterWrite(r, input.matchId, input.now);
      return r;
    },
    async resignMatch(matchId, playerId, now, result) {
      const m = await inner.resignMatch(matchId, playerId, now, result);
      if (m?.liveManaged) await ticker.tickMatch(matchId, now);
      return m;
    },
    async sweep(now: number, guestMaxAgeMs: number): Promise<SweepResult> {
      const r = await inner.sweep(now, guestMaxAgeMs);
      try {
        await ticker.tickDue(now);
      } catch {
        /* the next lazy read retries */
      }
      return r;
    },
  };
  return new Proxy(inner, {
    get(target, key, receiver) {
      if (typeof key === 'string' && key in overrides) return (overrides as Record<string, unknown>)[key];
      const value = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
};
