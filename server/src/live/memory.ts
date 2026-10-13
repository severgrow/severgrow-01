// Live duels — in-memory adapter (dev and tests). Each `transact` is serialized by a mutex, reads
// go through, and ALL writes are buffered and applied in one synchronous step at the end, after a
// compare-and-set on every match it read. A base commit that landed in between (another request
// moved the match) makes the step retry from scratch, exactly like a lock wait in Postgres.
import type { MemoryStorage } from '../storage/memory.js';
import type { Challenge, LiveMatch, LivePlayer, LiveStore, LiveTx, LockedMatch, PresenceStatus } from './types.js';
import { defaultLiveMatch, defaultLivePlayer, liveManaged } from './types.js';

const copy = <T>(v: T): T => structuredClone(v);

class Conflict extends Error {}

type Snapshot = { revision: number; turnDeadlineAt: number | null; status: string };

export class MemoryLiveStore implements LiveStore {
  private readonly players = new Map<string, LivePlayer>();
  private readonly lives = new Map<string, LiveMatch>();
  private readonly challenges = new Map<string, Challenge>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly base: MemoryStorage) {}

  private livePlayer(id: string): LivePlayer {
    return copy(this.players.get(id) ?? defaultLivePlayer(id));
  }

  private liveMatch(id: string): LiveMatch {
    return copy(this.lives.get(id) ?? defaultLiveMatch(id));
  }

  transact<T>(fn: (tx: LiveTx) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.attempt(fn);
        } catch (error) {
          if (error instanceof Conflict && attempt < 8) continue;
          throw error;
        }
      }
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async attempt<T>(fn: (tx: LiveTx) => Promise<T>): Promise<T> {
    const seen = new Map<string, Snapshot>();
    const lives = new Map<string, LiveMatch>();
    const clocks = new Map<string, { turnTimeoutMs: number; turnDeadlineAt: number | null }>();
    const players = new Map<string, LivePlayer>();
    const challenges = new Map<string, Challenge>();
    const tx: LiveTx = {
      match: async (matchId) => {
        const m = await this.base.matchById(matchId);
        if (!m) return null;
        seen.set(matchId, { revision: m.revision, turnDeadlineAt: m.turnDeadlineAt, status: m.status });
        const parts = await this.base.participantsOf(matchId);
        const clock = clocks.get(matchId);
        const locked: LockedMatch = {
          match: {
            id: m.id,
            status: m.status,
            revision: m.revision,
            state: m.state,
            turnDeadlineAt: clock ? clock.turnDeadlineAt : m.turnDeadlineAt,
            turnTimeoutMs: clock ? clock.turnTimeoutMs : m.turnTimeoutMs,
            turnStartRevision: m.turnStartRevision,
          },
          live: copy(lives.get(matchId) ?? this.liveMatch(matchId)),
          participants: parts.map((p) => ({ playerId: p.playerId, seat: p.seat })),
        };
        return locked;
      },
      players: async (ids) =>
        [...new Set(ids)].sort().map((id) => copy(players.get(id) ?? this.livePlayer(id))),
      challenge: async (id) => {
        const c = challenges.get(id) ?? this.challenges.get(id);
        return c ? copy(c) : null;
      },
      pendingForMatch: async (matchId) => this.mergedChallenges(challenges).filter((c) => c.matchId === matchId && c.status === 'pending'),
      sentSince: async (matchId, from, since) =>
        this.mergedChallenges(challenges).filter((c) => c.matchId === matchId && c.fromPlayer === from && c.createdAt >= since),
      saveLive: async (live) => {
        lives.set(live.matchId, copy(live));
      },
      saveClock: async (matchId, clock) => {
        clocks.set(matchId, { ...clock });
      },
      savePlayer: async (p) => {
        players.set(p.playerId, copy(p));
      },
      insertChallenge: async (c) => {
        challenges.set(c.id, copy(c));
      },
      saveChallenge: async (c) => {
        challenges.set(c.id, copy(c));
      },
    };
    const result = await fn(tx);
    // Commit: validate every match read is unchanged, then apply all writes synchronously.
    for (const [matchId, snap] of seen) {
      const cur = this.base.livePeek(matchId);
      if (!cur) continue;
      if (cur.revision !== snap.revision || cur.turnDeadlineAt !== snap.turnDeadlineAt || cur.status !== snap.status) {
        throw new Conflict('match moved during a live step');
      }
    }
    // Pending-uniqueness per match (the Postgres partial unique index).
    const merged = this.mergedChallenges(challenges);
    const pendingByMatch = new Map<string, number>();
    for (const c of merged) if (c.status === 'pending') pendingByMatch.set(c.matchId, (pendingByMatch.get(c.matchId) ?? 0) + 1);
    if ([...pendingByMatch.values()].some((n) => n > 1)) throw new Conflict('two pending challenges in one match');
    for (const [id, live] of lives) this.lives.set(id, live);
    for (const [id, p] of players) this.players.set(id, p);
    for (const [id, c] of challenges) this.challenges.set(id, c);
    const touched = new Set([...lives.keys(), ...clocks.keys()]);
    for (const matchId of touched) {
      const clock = clocks.get(matchId);
      this.base.liveSetClock(matchId, {
        ...(clock ?? {}),
        liveManaged: liveManaged(this.liveMatch(matchId)),
      });
    }
    return result;
  }

  private mergedChallenges(overlay: Map<string, Challenge>): Challenge[] {
    const all = new Map(this.challenges);
    for (const [id, c] of overlay) all.set(id, c);
    return [...all.values()].map(copy);
  }

  async player(playerId: string): Promise<LivePlayer> {
    return this.livePlayer(playerId);
  }

  async liveOf(matchId: string): Promise<LiveMatch> {
    return this.liveMatch(matchId);
  }

  async setPresence(playerId: string, status: PresenceStatus, matchId: string | null, now: number): Promise<void> {
    const p = this.livePlayer(playerId);
    this.players.set(playerId, { ...p, presence: status, presenceAt: now, presenceMatchId: matchId });
  }

  async setChallengesEnabled(playerId: string, enabled: boolean): Promise<void> {
    const p = this.livePlayer(playerId);
    this.players.set(playerId, { ...p, challengesEnabled: enabled });
  }

  async challengesInvolving(playerId: string, since: number): Promise<Challenge[]> {
    return [...this.challenges.values()]
      .filter((c) => (c.toPlayer === playerId && c.status === 'pending') || ((c.fromPlayer === playerId || c.toPlayer === playerId) && c.createdAt >= since))
      .map(copy);
  }

  async dueMatchIds(now: number): Promise<string[]> {
    const out: string[] = [];
    for (const [id, live] of this.lives) {
      if (!liveManaged(live)) continue;
      const m = await this.base.matchById(id);
      if (m && m.status === 'active' && m.turnDeadlineAt !== null && now > m.turnDeadlineAt) out.push(id);
      else if (m && m.status === 'finished' && live.liveSince !== null) out.push(id);
    }
    return out;
  }

  async needsTick(matchId: string, now: number): Promise<boolean> {
    const live = this.lives.get(matchId);
    if (!live || !liveManaged(live)) return false;
    const m = await this.base.matchById(matchId);
    return !!m && ((m.status === 'active' && m.turnDeadlineAt !== null && now > m.turnDeadlineAt) || m.status === 'finished');
  }
}
