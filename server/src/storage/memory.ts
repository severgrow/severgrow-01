// In-memory storage: the reference implementation of the Storage atomicity contract, used for
// local development and tests. `commitMove` runs entirely synchronously (no await between the
// checks and the writes), so in Node's single-threaded model it is atomic, exactly like the
// row lock the Postgres adapter takes.
import type { Player } from '../../../src/engine/index.js';
import type {
  CommitInput,
  CommitResult,
  Fail,
  MatchRecord,
  MoveRecord,
  Participant,
  PlayerRecord,
  Storage,
  TokenRecord,
} from './types.js';

/** Every read and write crosses a copy boundary, so callers can never mutate stored state. */
const copy = <T>(value: T): T => structuredClone(value);

export class MemoryStorage implements Storage {
  private readonly players = new Map<string, PlayerRecord>();
  private readonly tokensByHash = new Map<string, TokenRecord>();
  private readonly matches = new Map<string, MatchRecord>();
  private readonly inviteIndex = new Map<string, string>();
  private readonly participants = new Map<string, Participant[]>();
  private readonly moves = new Map<string, MoveRecord[]>();

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

  // ---- matches ----

  async createMatch(match: MatchRecord): Promise<{ ok: true } | Fail> {
    if (this.inviteIndex.has(match.inviteCode)) return { ok: false, code: 'DUPLICATE_INVITE_CODE', reason: 'Invite code already exists.' };
    this.matches.set(match.id, copy(match));
    this.inviteIndex.set(match.inviteCode, match.id);
    this.participants.set(match.id, []);
    this.moves.set(match.id, []);
    return { ok: true };
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

  async activateMatch(matchId: string, now: number): Promise<MatchRecord | null> {
    const match = this.matches.get(matchId);
    if (!match) return null;
    const next: MatchRecord = match.status === 'waiting' ? { ...match, status: 'active', updatedAt: now } : match;
    this.matches.set(matchId, copy(next));
    return copy(next);
  }

  async participantOf(matchId: string, playerId: string): Promise<Participant | null> {
    const found = (this.participants.get(matchId) ?? []).find((p) => p.playerId === playerId);
    return found ? copy(found) : null;
  }

  async ping(): Promise<void> {
    // In-memory: nothing to reach; always "healthy".
  }

  async movesOf(matchId: string, sinceRevision: number): Promise<MoveRecord[]> {
    return copy((this.moves.get(matchId) ?? []).filter((m) => m.revision > sinceRevision));
  }

  // ---- the atomic commit pipeline (no awaits inside: one synchronous critical section) ----

  async commitMove(input: CommitInput): Promise<CommitResult> {
    const stored = this.matches.get(input.matchId);
    if (!stored) return { ok: false, code: 'MATCH_NOT_FOUND', reason: 'Unknown match.' };

    const participants = this.participants.get(input.matchId) ?? [];
    const participant = participants.find((p) => p.playerId === input.playerId);
    if (!participant) return { ok: false, code: 'NOT_A_PARTICIPANT', reason: 'You are not in this match.' };
    const seat: Player = participant.seat;

    const log = this.moves.get(input.matchId) ?? [];
    const prior = log.find((m) => m.requestId === input.requestId);
    if (prior) {
      // Idempotent replay: return the recorded outcome, never apply twice.
      if (prior.seat !== seat) return { ok: false, code: 'REQUEST_ID_CONFLICT', reason: 'That request id belongs to another move.' };
      return { ok: true, replayed: true, match: copy(stored), move: copy(prior) };
    }

    if (stored.revision !== input.expectedRevision) {
      return { ok: false, code: 'STALE_REVISION', reason: `Expected revision ${input.expectedRevision}, current is ${stored.revision}.` };
    }

    const decision = input.decide({ match: copy(stored), seat });
    if (decision.kind === 'reject') return { ok: false, code: decision.code, reason: decision.reason };

    const revision = stored.revision + 1;
    const move: MoveRecord = {
      matchId: input.matchId,
      revision,
      seat,
      playerId: input.playerId,
      action: decision.action,
      events: decision.events,
      requestId: input.requestId,
      createdAt: input.now,
    };
    const next: MatchRecord = {
      ...stored,
      revision,
      state: decision.nextState,
      status: decision.status,
      result: decision.result,
      updatedAt: input.now,
      finishedAt: decision.status === 'finished' ? input.now : stored.finishedAt,
    };

    this.matches.set(input.matchId, copy(next));
    this.moves.set(input.matchId, [...log, copy(move)]);
    return { ok: true, replayed: false, match: copy(next), move: copy(move) };
  }
}
