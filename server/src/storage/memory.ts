// In-memory storage: the reference implementation of the Storage atomicity contract, used for
// local development and tests. `commitMove` runs entirely synchronously (no await between the
// checks and the writes), so in Node's single-threaded model it is atomic, exactly like the
// row lock the Postgres adapter takes.
import type { Player } from '../../../src/engine/index.js';
import { scores } from '../../../src/engine/index.js';
import { hasGrace, spendGrace } from '../grace.js';
import type { OnlineGameResult } from '../protocol.js';
import type {
  CommitBatchInput,
  CommitInput,
  CommitResult,
  DeviceLinkCode,
  Fail,
  MatchListRow,
  MatchRecord,
  MoveRecord,
  OpenQueueSeat,
  Participant,
  PlayerRecord,
  Storage,
  SweepResult,
  TokenRecord,
  WorldTile,
  WorldTileClaim,
} from './types.js';

/** Every read and write crosses a copy boundary, so callers can never mutate stored state. */
const copy = <T>(value: T): T => structuredClone(value);

const timeoutResult = (match: MatchRecord): OnlineGameResult => {
  const actor = match.state.actor;
  const winner: Player = actor === 0 ? 1 : 0;
  return { winner, reason: 'timeout', scores: scores(match.state) };
};

const finishTimeout = (match: MatchRecord, now: number): MatchRecord => ({
  ...match,
  status: 'finished',
  result: timeoutResult(match),
  turnDeadlineAt: null,
  expiresAt: null,
  turnStartState: copy(match.state),
  turnStartRevision: match.revision,
  updatedAt: now,
  finishedAt: now,
});

const finishExpiredWaiting = (match: MatchRecord, now: number): MatchRecord => ({
  ...match,
  status: 'finished',
  result: null,
  turnDeadlineAt: null,
  expiresAt: null,
  updatedAt: now,
  finishedAt: now,
});

export class MemoryStorage implements Storage {
  private readonly players = new Map<string, PlayerRecord>();
  private readonly tokensByHash = new Map<string, TokenRecord>();
  private readonly matches = new Map<string, MatchRecord>();
  private readonly inviteIndex = new Map<string, string>();
  private readonly participants = new Map<string, Participant[]>();
  private readonly moves = new Map<string, MoveRecord[]>();
  private readonly rateLimits = new Map<string, { windowStart: number; count: number }>();
  private readonly linkCodes = new Map<string, DeviceLinkCode>();

  // ---- players and tokens ----

  async createPlayer(player: PlayerRecord): Promise<void> {
    this.players.set(player.id, copy(player));
  }

  async playerById(id: string): Promise<PlayerRecord | null> {
    const player = this.players.get(id);
    return player ? copy(player) : null;
  }

  async updatePlayer(player: PlayerRecord): Promise<void> {
    this.players.set(player.id, copy(player));
  }

  async issueToken(token: TokenRecord): Promise<void> {
    this.tokensByHash.set(token.tokenHash, copy(token));
  }

  async playerByTokenHash(tokenHash: string): Promise<PlayerRecord | null> {
    const token = this.tokensByHash.get(tokenHash);
    if (!token || token.revokedAt !== null) return null;
    const player = this.players.get(token.playerId);
    return player ? copy(player) : null;
  }

  /** Accounts (docs/ACCOUNTS.md): sign a player out of every device but one. */
  async revokeTokensOfPlayer(playerId: string, keepTokenHash: string, now: number): Promise<number> {
    let n = 0;
    for (const t of this.tokensByHash.values()) {
      if (t.playerId === playerId && t.tokenHash !== keepTokenHash && t.revokedAt === null) {
        t.revokedAt = now;
        n += 1;
      }
    }
    return n;
  }

  // ---- matches ----

  async createMatch(match: MatchRecord): Promise<{ ok: true } | Fail> {
    if (this.inviteIndex.has(match.inviteCode)) return { ok: false, code: 'DUPLICATE_INVITE_CODE', reason: 'Invite code already exists.' };
    this.matches.set(match.id, copy({ ...match, openQueue: !!match.openQueue }));
    this.inviteIndex.set(match.inviteCode, match.id);
    this.participants.set(match.id, []);
    this.moves.set(match.id, []);
    return { ok: true };
  }

  async findOpenQueueMatch(playerId: string): Promise<MatchRecord | null> {
    const waiting = [...this.matches.values()]
      .filter((m) => m.status === 'waiting' && m.openQueue)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const match of waiting) {
      const parts = this.participants.get(match.id) ?? [];
      if (parts.some((p) => p.playerId === playerId)) continue;
      if (parts.length === 1) return copy(match);
    }
    return null;
  }

  /** Raw (non-copied) own-parked lookup for the synchronous critical sections below. */
  private ownParked(playerId: string): MatchRecord | null {
    const own = [...this.matches.values()]
      .filter((m) => m.status === 'waiting' && m.openQueue)
      .filter((m) => (this.participants.get(m.id) ?? []).some((p) => p.playerId === playerId))
      .sort((a, b) => a.createdAt - b.createdAt);
    return own[0] ?? null;
  }

  async openQueueMatchOfPlayer(playerId: string): Promise<MatchRecord | null> {
    const own = this.ownParked(playerId);
    return own ? copy(own) : null;
  }

  private openMatchCountFor(playerId: string): number {
    let count = 0;
    for (const [matchId, list] of this.participants) {
      if (!list.some((p) => p.playerId === playerId)) continue;
      const match = this.matches.get(matchId);
      if (match && match.status !== 'finished') count += 1;
    }
    return count;
  }

  // Atomic in memory: no await runs between the checks and the writes (Node is single-threaded),
  // exactly like the Postgres adapter's advisory-locked transaction.
  async claimOpenQueueOrPark(input: {
    playerId: string;
    parked: MatchRecord;
    now: number;
    turnTimeoutMs: number;
    maxOpenMatches: number;
  }): Promise<OpenQueueSeat> {
    // 0. Lazily expire parked searches past their window so an expired search is never matched.
    for (const [id, match] of this.matches) {
      if (match.status === 'waiting' && match.expiresAt !== null && input.now > match.expiresAt) {
        this.matches.set(id, copy(finishExpiredWaiting(match, input.now)));
      }
    }

    // 1. Already parked: return the player's own search so a re-tap never creates a second entry.
    const own = this.ownParked(input.playerId);
    if (own) {
      const seat = (this.participants.get(own.id) ?? []).find((p) => p.playerId === input.playerId)!.seat;
      return { ok: true, match: copy(own), seat, paired: false };
    }

    // 2. CAP: a player at the per-player limit may not park or accept another match.
    if (this.openMatchCountFor(input.playerId) >= input.maxOpenMatches) {
      return { ok: false, code: 'TOO_MANY_MATCHES', reason: 'Finish or leave a match before starting another.' };
    }

    // 3. Join the oldest waiting open-queue match with one free seat (FIFO), atomically.
    const waiting = [...this.matches.values()]
      .filter((m) => m.status === 'waiting' && m.openQueue)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const match of waiting) {
      const parts = this.participants.get(match.id) ?? [];
      if (parts.some((p) => p.playerId === input.playerId)) continue;
      if (parts.length !== 1) continue;
      const seat: Player = parts.some((p) => p.seat === 0) ? 1 : 0;
      const next: Participant[] = [
        ...parts,
        { matchId: match.id, playerId: input.playerId, seat, joinedAt: input.now, lastSeenAt: input.now },
      ];
      this.participants.set(match.id, next);
      const activated: MatchRecord = {
        ...match,
        status: 'active',
        updatedAt: input.now,
        turnTimeoutMs: input.turnTimeoutMs,
        turnDeadlineAt: input.now + input.turnTimeoutMs,
        turnStartRevision: match.revision,
        turnStartState: copy(match.state),
        expiresAt: null,
      };
      this.matches.set(match.id, copy(activated));
      return { ok: true, match: copy(activated), seat, paired: true };
    }

    // 4. Nobody is waiting: park the player's search.
    if (this.inviteIndex.has(input.parked.inviteCode)) {
      return { ok: false, code: 'DUPLICATE_INVITE_CODE', reason: 'Invite code already exists.' };
    }
    const parked = { ...input.parked, openQueue: true };
    this.matches.set(parked.id, copy(parked));
    this.inviteIndex.set(parked.inviteCode, parked.id);
    this.participants.set(parked.id, [
      { matchId: parked.id, playerId: input.playerId, seat: 0, joinedAt: input.now, lastSeenAt: input.now },
    ]);
    this.moves.set(parked.id, []);
    return { ok: true, match: copy(parked), seat: 0, paired: false };
  }

  async cancelOpenQueueMatch(playerId: string, _now: number): Promise<boolean> {
    const own = this.ownParked(playerId);
    if (!own) return false;
    const parts = this.participants.get(own.id) ?? [];
    if (parts.length !== 1 || !parts.some((p) => p.playerId === playerId)) return false;
    this.matches.delete(own.id);
    this.inviteIndex.delete(own.inviteCode);
    this.participants.delete(own.id);
    this.moves.delete(own.id);
    return true;
  }

  async cancelWaitingMatch(playerId: string, matchId: string): Promise<boolean> {
    const match = this.matches.get(matchId);
    // Only a WAITING match the caller is the sole participant of: never an active/finished match
    // and never somebody else's. Retiring also drops the invite-code index entry, so no later join
    // can resolve the code.
    if (!match || match.status !== 'waiting') return false;
    const parts = this.participants.get(matchId) ?? [];
    if (parts.length !== 1 || parts[0]?.playerId !== playerId) return false;
    this.matches.delete(matchId);
    this.inviteIndex.delete(match.inviteCode);
    this.participants.delete(matchId);
    this.moves.delete(matchId);
    return true;
  }

  async matchById(id: string): Promise<MatchRecord | null> {
    const match = this.matches.get(id);
    return match ? copy(match) : null;
  }

  async matchByInviteCode(code: string): Promise<MatchRecord | null> {
    const id = this.inviteIndex.get(code);
    if (!id) return null;
    return this.matchById(id);
  }

  async matchesOfPlayer(playerId: string): Promise<MatchRecord[]> {
    const out: MatchRecord[] = [];
    for (const [matchId, list] of this.participants) {
      if (!list.some((p) => p.playerId === playerId)) continue;
      const match = this.matches.get(matchId);
      if (match) out.push(copy(match));
    }
    return out;
  }

  async listMatchesForPlayer(playerId: string): Promise<MatchListRow[]> {
    const out: MatchListRow[] = [];
    for (const [matchId, list] of this.participants) {
      const mine = list.find((p) => p.playerId === playerId);
      if (!mine) continue;
      const match = this.matches.get(matchId);
      if (!match) continue;
      const opp = list.find((p) => p.playerId !== playerId) ?? null;
      const oppPlayer = opp ? this.players.get(opp.playerId) : null;
      out.push({
        match: copy(match),
        mySeat: mine.seat,
        lastSeenAt: mine.lastSeenAt,
        opponentId: opp?.playerId ?? null,
        opponentName: oppPlayer?.displayName ?? null,
      });
    }
    return out;
  }

  async addParticipant(participant: Participant): Promise<{ ok: true } | Fail> {
    const list = this.participants.get(participant.matchId) ?? [];
    if (list.some((p) => p.playerId === participant.playerId)) return { ok: false, code: 'ALREADY_JOINED', reason: 'Already in this match.' };
    if (list.some((p) => p.seat === participant.seat)) return { ok: false, code: 'SEAT_TAKEN', reason: 'That seat is taken.' };
    if (list.length >= 2) return { ok: false, code: 'MATCH_FULL', reason: 'This match is full.' };
    list.push(copy(participant));
    this.participants.set(participant.matchId, list);
    return { ok: true };
  }

  async participantsOf(matchId: string): Promise<Participant[]> {
    return copy(this.participants.get(matchId) ?? []);
  }

  async activateMatch(matchId: string, now: number, turnTimeoutMs: number): Promise<MatchRecord | null> {
    const match = this.matches.get(matchId);
    if (!match) return null;
    if (match.status !== 'waiting') return copy(match);
    const next: MatchRecord = {
      ...match,
      status: 'active',
      updatedAt: now,
      turnTimeoutMs,
      turnDeadlineAt: now + turnTimeoutMs,
      turnStartRevision: match.revision,
      turnStartState: copy(match.state),
      expiresAt: null,
    };
    this.matches.set(matchId, copy(next));
    return copy(next);
  }

  async participantOf(matchId: string, playerId: string): Promise<Participant | null> {
    const found = (this.participants.get(matchId) ?? []).find((p) => p.playerId === playerId);
    return found ? copy(found) : null;
  }

  async touchParticipant(matchId: string, playerId: string, now: number): Promise<void> {
    const list = this.participants.get(matchId);
    if (!list) return;
    const idx = list.findIndex((p) => p.playerId === playerId);
    if (idx < 0) return;
    list[idx] = { ...list[idx]!, lastSeenAt: now };
  }

  async ping(): Promise<void> {
    // In-memory: nothing to reach; always "healthy".
  }

  async movesOf(matchId: string, sinceRevision: number): Promise<MoveRecord[]> {
    return copy((this.moves.get(matchId) ?? []).filter((m) => m.revision > sinceRevision));
  }

  async applyExpiry(matchId: string, now: number): Promise<MatchRecord | null> {
    const match = this.matches.get(matchId);
    if (!match) return null;
    const next = this.expiryDecision(match, now);
    if (next !== match) this.matches.set(matchId, copy(next));
    return copy(next);
  }

  private expiryDecision(match: MatchRecord, now: number): MatchRecord {
    if (match.status === 'active' && !match.liveManaged && match.turnDeadlineAt !== null && now > match.turnDeadlineAt) {
      // The single decision point: spare the seat its first timeout, or finish on a later one.
      const seat = match.state.actor;
      return hasGrace(match, seat) ? spendGrace(match, seat, now) : finishTimeout(match, now);
    }
    if (match.status === 'waiting' && match.expiresAt !== null && now > match.expiresAt) {
      return finishExpiredWaiting(match, now);
    }
    return match;
  }

  async resignMatch(matchId: string, playerId: string, now: number, result: OnlineGameResult): Promise<MatchRecord | null> {
    const match = this.matches.get(matchId);
    if (!match) return null;
    const participants = this.participants.get(matchId) ?? [];
    if (!participants.some((p) => p.playerId === playerId)) return null;
    if (match.status === 'finished') return copy(match);
    const next: MatchRecord = {
      ...match,
      status: 'finished',
      result,
      turnDeadlineAt: null,
      expiresAt: null,
      turnStartState: copy(match.state),
      turnStartRevision: match.revision,
      updatedAt: now,
      finishedAt: now,
    };
    this.matches.set(matchId, copy(next));
    return copy(next);
  }

  async sweep(now: number, guestMaxAgeMs: number): Promise<SweepResult> {
    let timedOut = 0;
    let expiredWaiting = 0;
    const graceExtendedIds: string[] = [];
    const timedOutIds: string[] = [];
    for (const [id, match] of this.matches) {
      const next = this.expiryDecision(match, now);
      if (next === match) continue;
      this.matches.set(id, copy(next));
      if (next.status === 'finished' && match.status === 'active') {
        timedOut += 1;
        timedOutIds.push(id);
      } else if (next.status === 'finished' && match.status === 'waiting') {
        expiredWaiting += 1;
        timedOutIds.push(id);
      } else if (match.status === 'active' && next.graceUsed[0] !== match.graceUsed[0]) graceExtendedIds.push(id);
      else if (match.status === 'active' && next.graceUsed[1] !== match.graceUsed[1]) graceExtendedIds.push(id);
    }
    let deletedGuests = 0;
    for (const [id, player] of [...this.players]) {
      if (player.kind !== 'guest') continue;
      if (now - player.createdAt < guestMaxAgeMs) continue;
      const inMatch = [...this.participants.values()].some((list) => list.some((p) => p.playerId === id));
      if (inMatch) continue;
      this.players.delete(id);
      for (const [hash, token] of [...this.tokensByHash]) {
        if (token.playerId === id) this.tokensByHash.delete(hash);
      }
      deletedGuests += 1;
    }
    return { timedOut, expiredWaiting, deletedGuests, graceExtended: graceExtendedIds.length, graceExtendedIds, timedOutIds };
  }

  async hitRateLimit(bucket: string, windowStart: number, max: number): Promise<{ ok: boolean; count: number }> {
    const key = `${bucket}@${windowStart}`;
    const cur = this.rateLimits.get(key) ?? { windowStart, count: 0 };
    const count = cur.count + 1;
    this.rateLimits.set(key, { windowStart, count });
    return { ok: count <= max, count };
  }

  async createLinkCode(code: DeviceLinkCode): Promise<void> {
    this.linkCodes.set(code.codeHash, copy(code));
  }

  async redeemLinkCode(codeHash: string, now: number): Promise<{ playerId: string } | null> {
    const row = this.linkCodes.get(codeHash);
    if (!row || row.usedAt !== null || now > row.expiresAt) return null;
    this.linkCodes.set(codeHash, { ...row, usedAt: now });
    return { playerId: row.playerId };
  }

  // ---- the shared world map (the world-map seed spike) ----

  /** Stored tile: no name (the current display name is projected on read, never copied). */
  private readonly worldTiles = new Map<number, Omit<WorldTile, 'ownerName'>>();

  async listWorldTiles(): Promise<WorldTile[]> {
    return [...this.worldTiles.values()]
      .sort((a, b) => a.cell - b.cell)
      .map((tile) => ({ ...copy(tile), ownerName: this.players.get(tile.ownerId)?.displayName ?? null }));
  }

  async worldTileForMatch(matchId: string): Promise<WorldTile | null> {
    const tile = [...this.worldTiles.values()].find((t) => t.matchId === matchId);
    if (!tile) return null;
    return { ...copy(tile), ownerName: this.players.get(tile.ownerId)?.displayName ?? null };
  }

  async claimWorldTile(claim: WorldTileClaim): Promise<'placed' | 'conflict'> {
    // One cell per tile AND one tile per match: either collision is a lost race, not an error.
    if (this.worldTiles.has(claim.cell)) return 'conflict';
    if ([...this.worldTiles.values()].some((t) => t.matchId === claim.matchId)) return 'conflict';
    this.worldTiles.set(claim.cell, copy(claim));
    return 'placed';
  }

  async takeOverWorldTile(claim: WorldTileClaim, fromOwnerId: string): Promise<'placed' | 'conflict'> {
    const current = this.worldTiles.get(claim.cell);
    if (!current || current.ownerId !== fromOwnerId) return 'conflict';
    if (current.matchId !== claim.matchId && [...this.worldTiles.values()].some((t) => t.matchId === claim.matchId)) {
      return 'conflict';
    }
    this.worldTiles.set(claim.cell, copy(claim));
    return 'placed';
  }

  /** Live duels (server/src/live/memory.ts): a synchronous read and clock write for its atomic step. */
  livePeek = (id: string): MatchRecord | null => this.matches.get(id) ?? null;
  liveSetClock(id: string, patch: Partial<Pick<MatchRecord, 'turnTimeoutMs' | 'turnDeadlineAt' | 'liveManaged'>>): void {
    const m = this.matches.get(id);
    if (m) this.matches.set(id, copy({ ...m, ...patch }));
  }

  // ---- the atomic commit pipeline (no awaits inside: one synchronous critical section) ----

  async commitMove(input: CommitInput): Promise<CommitResult> {
    return this.runCommit({
      matchId: input.matchId,
      playerId: input.playerId,
      expectedRevision: input.expectedRevision,
      requestId: input.requestId,
      now: input.now,
      batch: false,
      steps: 1,
      decideAt: (match, seat) => input.decide({ match, seat }),
    });
  }

  async commitBatch(input: CommitBatchInput): Promise<CommitResult> {
    return this.runCommit({
      matchId: input.matchId,
      playerId: input.playerId,
      expectedRevision: input.expectedRevision,
      requestId: input.requestId,
      now: input.now,
      batch: true,
      steps: input.actions.length,
      decideAt: (match, seat, index) => input.decideOne({ match, seat, action: input.actions[index]! }),
    });
  }

  private runCommit(input: {
    matchId: string;
    playerId: string;
    expectedRevision: number;
    requestId: string;
    now: number;
    batch: boolean;
    steps: number;
    decideAt: (match: MatchRecord, seat: Player, index: number) => import('./types.js').Decision;
  }): CommitResult {
    let stored = this.matches.get(input.matchId);
    if (!stored) return { ok: false, code: 'MATCH_NOT_FOUND', reason: 'Unknown match.' };

    // ONE expiry decision point inside the lock.
    stored = this.expiryDecision(stored, input.now);
    this.matches.set(input.matchId, copy(stored));

    // Identity and idempotency come BEFORE the lifecycle checks: a client that retries the very
    // request that ended the game (its requestId is stable) must get the stored outcome back, not a
    // confusing MATCH_FINISHED. A *new* request on a finished match is still rejected below.
    const participants = this.participants.get(input.matchId) ?? [];
    const participant = participants.find((p) => p.playerId === input.playerId);
    if (!participant) return { ok: false, code: 'NOT_A_PARTICIPANT', reason: 'You are not in this match.' };
    const seat: Player = participant.seat;

    const log = this.moves.get(input.matchId) ?? [];
    const priorKey = input.batch ? `${input.requestId}#0` : input.requestId;
    const prior = log.find((m) => m.requestId === priorKey);
    if (prior) {
      if (prior.seat !== seat) return { ok: false, code: 'REQUEST_ID_CONFLICT', reason: 'That request id belongs to another move.' };
      const batchMoves = input.batch
        ? log.filter((m) => m.requestId.startsWith(`${input.requestId}#`))
        : [prior];
      const last = batchMoves[batchMoves.length - 1]!;
      return { ok: true, replayed: true, match: copy(stored), move: copy(last), moves: copy(batchMoves) };
    }

    if (stored.status === 'finished' && stored.result?.reason === 'timeout') {
      return { ok: false, code: 'TIMED_OUT', reason: 'This turn timed out.' };
    }
    if (stored.status === 'finished') {
      return { ok: false, code: 'MATCH_FINISHED', reason: 'This match is over.' };
    }
    if (stored.status === 'waiting') {
      return { ok: false, code: 'MATCH_NOT_ACTIVE', reason: 'Waiting for an opponent to join.' };
    }

    for (const m of log) {
      if (m.requestId === input.requestId || m.requestId.startsWith(`${input.requestId}#`)) {
        if (m.seat !== seat) return { ok: false, code: 'REQUEST_ID_CONFLICT', reason: 'That request id belongs to another move.' };
      }
    }

    if (stored.revision !== input.expectedRevision) {
      return { ok: false, code: 'STALE_REVISION', reason: `Expected revision ${input.expectedRevision}, current is ${stored.revision}.` };
    }

    const applied: MoveRecord[] = [];
    let current = stored;

    for (let i = 0; i < input.steps; i++) {
      // The game can end *inside* a batch: the browser sends [...draft, EndAct], and a
      // Strangle-winning Bloom is a draft action. Apply the move that ended the game and drop
      // the rest of the turn instead of rejecting the whole batch (which lost the winning move
      // and left the match active forever). A batch that starts on a finished match is still
      // rejected above, before the loop.
      if (current.status === 'finished') break;
      const decision = input.decideAt(copy(current), seat, i);
      if (decision.kind === 'reject') return { ok: false, code: decision.code, reason: decision.reason };

      const revision = current.revision + 1;
      const requestId = input.batch ? `${input.requestId}#${i}` : input.requestId;
      const move: MoveRecord = {
        matchId: input.matchId,
        revision,
        seat,
        playerId: input.playerId,
        action: decision.action,
        events: decision.events,
        requestId,
        createdAt: input.now,
      };
      applied.push(move);

      let turnDeadlineAt = current.turnDeadlineAt;
      let turnStartRevision = current.turnStartRevision;
      let turnStartState = current.turnStartState;
      if (decision.status === 'finished') {
        turnDeadlineAt = null;
        turnStartRevision = revision;
        turnStartState = copy(decision.nextState);
      } else {
        if (decision.advanceTurnBoundary) {
          turnStartRevision = revision;
          turnStartState = copy(decision.nextState);
        }
        if (decision.refreshDeadline) {
          turnDeadlineAt = input.now + current.turnTimeoutMs;
        }
      }

      current = {
        ...current,
        revision,
        state: decision.nextState,
        status: decision.status,
        result: decision.result,
        updatedAt: input.now,
        finishedAt: decision.status === 'finished' ? input.now : current.finishedAt,
        turnDeadlineAt,
        turnStartRevision,
        turnStartState,
      };
    }

    this.matches.set(input.matchId, copy(current));
    this.moves.set(input.matchId, [...log, ...applied.map(copy)]);
    const last = applied[applied.length - 1]!;
    return { ok: true, replayed: false, match: copy(current), move: copy(last), moves: copy(applied) };
  }
}
