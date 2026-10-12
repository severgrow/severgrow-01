// The match service: identity, match lifecycle and the authoritative action pipeline.
//
// Every rule decision is delegated to the shared engine (src/engine). This file only wires the
// storage, the identity and the network-facing payloads together. It never trusts a client's
// claimed seat: the seat always comes from `match_participants` for the authenticated player.
import {
  IllegalActionError,
  applyAs,
  eventsOf,
  hidePrivateEvents,
  legalActions,
  matchSetup,
  stateFromSetup,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Event, Player, State } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG } from './config.js';
import type { ServerConfig } from './config.js';
import { ApiError, engineCodeToApi } from './errors.js';
import { hashToken, newId, newInviteCode, newSeed, newToken, normalizeInviteCode } from './ids.js';
import type { MatchSummary, MatchViewPayload, PlayerSummary, SubmitActionRequest, SubmitActionResponse } from './protocol.js';
import { playerSummary } from './storage/types.js';
import type { Decision, MatchRecord, Participant, PlayerRecord, Storage } from './storage/types.js';

const MAX_REQUEST_ID = 200;

/** Drops the event history before persisting: authoritative rows stay small; events live in match_moves. */
const withoutHistory = (state: State): State => {
  if (state.history === undefined) return state;
  const { history: _discarded, ...rest } = state;
  return rest;
};

const isActionShaped = (value: unknown): value is Action =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { t?: unknown }).t === 'string';

export type ServiceOptions = {
  storage: Storage;
  config?: ServerConfig;
  /** Injectable clock (epoch ms). Defaults to the real one. */
  now?: () => number;
};

export class MatchService {
  private readonly storage: Storage;
  private readonly config: ServerConfig;
  private readonly now: () => number;

  constructor(options: ServiceOptions) {
    this.storage = options.storage;
    this.config = options.config ?? DEFAULT_SERVER_CONFIG;
    this.now = options.now ?? (() => Date.now());
  }

  get rulesVersion(): string {
    return this.config.rulesVersion;
  }

  /** Epoch ms from the injectable clock (also returned as `serverNow` on every response later). */
  serverNow(): number {
    return this.now();
  }

  /** Real storage round-trip for health checks. */
  pingStorage(): Promise<void> {
    return this.storage.ping();
  }

  // ---- identity ----

  async createGuest(displayName: string | null = null): Promise<{ player: PlayerSummary; token: string }> {
    const now = this.now();
    const player: PlayerRecord = { id: newId(), kind: 'guest', displayName, createdAt: now, upgradedAt: null };
    await this.storage.createPlayer(player);
    const token = await this.issueToken(player.id, now);
    return { player: playerSummary(player), token };
  }

  /** The upgrade path: a guest becomes a permanent account without losing its id or its matches. */
  async upgradePlayer(player: PlayerRecord, displayName: string): Promise<PlayerSummary> {
    if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.length > 40) {
      throw new ApiError('INVALID_REQUEST', 'Pick a display name of 1 to 40 characters.');
    }
    const upgraded: PlayerRecord = { ...player, kind: 'account', displayName: displayName.trim(), upgradedAt: this.now() };
    await this.storage.updatePlayer(upgraded);
    return playerSummary(upgraded);
  }

  /** Resolves a bearer token to its player. Never accepts a player id from the client. */
  async authenticate(token: string | null): Promise<PlayerRecord> {
    if (typeof token !== 'string' || token.length < 16) throw new ApiError('UNAUTHORIZED', 'A valid token is required.');
    const player = await this.storage.playerByTokenHash(hashToken(token));
    if (!player) throw new ApiError('UNAUTHORIZED', 'A valid token is required.');
    return player;
  }

  private async issueToken(playerId: string, now: number): Promise<string> {
    const token = newToken();
    await this.storage.issueToken({ id: newId(), playerId, tokenHash: hashToken(token), createdAt: now, revokedAt: null });
    return token;
  }

  // ---- match lifecycle ----

  async createMatch(player: PlayerRecord): Promise<{ match: MatchSummary; player: MatchViewPayload }> {
    const existing = await this.storage.matchesOfPlayer(player.id);
    if (existing.filter((m) => m.status !== 'finished').length >= this.config.maxOpenMatchesPerPlayer) {
      throw new ApiError('TOO_MANY_MATCHES', 'Finish or leave a match before starting another.');
    }

    const now = this.now();
    const setup = matchSetup(newSeed(), this.config.rulesVersion);
    const state = stateFromSetup(setup);

    let created: MatchRecord | null = null;
    for (let attempt = 0; attempt < 5 && created === null; attempt++) {
      const candidate: MatchRecord = {
        id: newId(),
        inviteCode: newInviteCode(this.config.inviteCodeLength),
        rulesVersion: setup.rulesVersion,
        seed: setup.seed,
        config: setup.config,
        startingPlayer: setup.startingPlayer,
        status: 'waiting',
        revision: 0,
        state,
        result: null,
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
      };
      const result = await this.storage.createMatch(candidate);
      if (result.ok) created = candidate;
      else if (result.code !== 'DUPLICATE_INVITE_CODE') throw new ApiError('INTERNAL', 'Could not create the match.');
    }
    if (!created) throw new ApiError('INTERNAL', 'Could not allocate an invite code.');

    const seated = await this.storage.addParticipant({ matchId: created.id, playerId: player.id, seat: 0, joinedAt: now });
    if (!seated.ok) throw new ApiError('INTERNAL', 'Could not seat the match creator.');

    return { match: await this.summary(created), player: await this.payload(created, 0, []) };
  }

  async joinMatch(player: PlayerRecord, inviteCode: string): Promise<{ match: MatchSummary; player: MatchViewPayload }> {
    const code = normalizeInviteCode(typeof inviteCode === 'string' ? inviteCode : '');
    if (code.length === 0) throw new ApiError('INVALID_REQUEST', 'An invite code is required.');
    const match = await this.storage.matchByInviteCode(code);
    if (!match) throw new ApiError('MATCH_NOT_FOUND', 'No match has that invite code.');
    if (match.status === 'finished') throw new ApiError('MATCH_FINISHED', 'That match has already finished.');

    const existing = await this.storage.participantOf(match.id, player.id);
    if (existing) {
      // Joining again is harmless: return the seat already held.
      return { match: await this.summary(match), player: await this.payload(match, existing.seat, []) };
    }

    const participants = await this.storage.participantsOf(match.id);
    if (participants.length >= 2) throw new ApiError('MATCH_FULL', 'That match already has two players.');
    const seat: Player = participants.some((p) => p.seat === 0) ? 1 : 0;

    const added = await this.storage.addParticipant({ matchId: match.id, playerId: player.id, seat, joinedAt: this.now() });
    if (!added.ok) throw new ApiError('MATCH_FULL', 'That match already has two players.');

    const after = await this.storage.participantsOf(match.id);
    const resolved = after.length === 2 ? ((await this.storage.activateMatch(match.id, this.now())) ?? match) : match;
    return { match: await this.summary(resolved), player: await this.payload(resolved, seat, []) };
  }

  // ---- reading a match ----

  async getMatch(player: PlayerRecord, matchId: string): Promise<MatchSummary> {
    const match = await this.requireParticipant(player, matchId);
    return this.summary(match);
  }

  /**
   * The player-specific view. `sinceRevision` lets a reconnecting client fetch only new events;
   * 0 (the default) returns the whole public history for Match Intel. Hidden information is
   * removed by the engine's single rule (`hidePrivateEvents`).
   */
  async viewPayload(player: PlayerRecord, matchId: string, sinceRevision = 0): Promise<MatchViewPayload> {
    const match = await this.requireParticipant(player, matchId);
    const seat = await this.seatOf(player, matchId);
    const moves = await this.storage.movesOf(matchId, sinceRevision);
    return this.payload(match, seat, moves.flatMap((m) => m.events));
  }

  // ---- the authoritative action pipeline ----

  async submitAction(player: PlayerRecord, matchId: string, request: SubmitActionRequest): Promise<SubmitActionResponse> {
    const { expectedRevision, requestId, action } = request ?? {};
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new ApiError('INVALID_REQUEST', 'expectedRevision must be a non-negative integer.');
    }
    if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > MAX_REQUEST_ID) {
      throw new ApiError('INVALID_REQUEST', `requestId must be a string of 1 to ${MAX_REQUEST_ID} characters.`);
    }
    if (!isActionShaped(action)) throw new ApiError('INVALID_REQUEST', 'action must be a semantic move object.');

    await this.requireParticipant(player, matchId);

    const result = await this.storage.commitMove({
      matchId,
      playerId: player.id,
      expectedRevision,
      requestId,
      now: this.now(),
      decide: ({ match, seat }): Decision => this.decide(match, seat, action),
    });
    if (!result.ok) throw this.commitError(result.code, result.reason);

    return { ok: true, replayed: result.replayed, player: await this.payload(result.match, result.move.seat, result.move.events) };
  }

  // ---- internals ----

  /** The pure rules step, run inside the storage's atomic section. */
  private decide(match: MatchRecord, seat: Player, action: Action): Decision {
    if (match.status === 'finished' || match.state.phase === 'GAME_OVER') {
      return { kind: 'reject', code: 'MATCH_FINISHED', reason: 'This match is over.' };
    }
    if (match.status !== 'active') {
      return { kind: 'reject', code: 'MATCH_NOT_ACTIVE', reason: 'Waiting for an opponent to join.' };
    }
    if (match.revision >= this.config.maxMovesPerMatch) {
      return { kind: 'reject', code: 'TOO_MANY_MOVES', reason: 'This match has too many moves.' };
    }
    let after: State;
    try {
      after = applyAs(match.state, seat, action);
    } catch (error) {
      if (error instanceof IllegalActionError) {
        const mapped = engineCodeToApi(error.code);
        return { kind: 'reject', code: mapped.code, reason: mapped.message };
      }
      throw error;
    }
    return {
      kind: 'apply',
      nextState: withoutHistory(after),
      events: eventsOf(match.state, action, after),
      action,
      status: after.phase === 'GAME_OVER' ? 'finished' : 'active',
      result: after.result,
    };
  }

  private commitError(code: string, reason: string): ApiError {
    switch (code) {
      case 'MATCH_NOT_FOUND':
        return new ApiError('MATCH_NOT_FOUND', 'Unknown match.');
      case 'NOT_A_PARTICIPANT':
        return new ApiError('NOT_A_PARTICIPANT', 'You are not in this match.');
      case 'STALE_REVISION':
        return new ApiError('STALE_REVISION', reason);
      case 'REQUEST_ID_CONFLICT':
        return new ApiError('REQUEST_ID_CONFLICT', reason);
      case 'MATCH_FINISHED':
        return new ApiError('MATCH_FINISHED', reason);
      case 'MATCH_NOT_ACTIVE':
        return new ApiError('MATCH_NOT_ACTIVE', reason);
      case 'TOO_MANY_MOVES':
        return new ApiError('TOO_MANY_MOVES', reason);
      case 'NOT_YOUR_TURN':
        return new ApiError('NOT_YOUR_TURN', reason);
      default:
        return new ApiError('ILLEGAL_ACTION', reason);
    }
  }

  /** Assembles the wire payload for one seat from an authoritative match and raw events. */
  private async payload(match: MatchRecord, seat: Player, events: readonly Event[]): Promise<MatchViewPayload> {
    const view = viewFor(match.state, seat);
    const canAct = match.status === 'active' && match.state.actor === seat && match.state.phase !== 'GAME_OVER';
    return {
      matchId: match.id,
      rulesVersion: match.rulesVersion,
      status: match.status,
      revision: match.revision,
      seat,
      turnPlayer: match.state.turnPlayer,
      view,
      legalActions: canAct ? legalActions(view) : [],
      events: hidePrivateEvents(events, seat),
    };
  }

  private async requireParticipant(player: PlayerRecord, matchId: string): Promise<MatchRecord> {
    const match = await this.storage.matchById(matchId);
    if (!match) throw new ApiError('MATCH_NOT_FOUND', 'Unknown match.');
    const participant = await this.storage.participantOf(matchId, player.id);
    if (!participant) throw new ApiError('NOT_A_PARTICIPANT', 'You are not in this match.');
    return match;
  }

  private async seatOf(player: PlayerRecord, matchId: string): Promise<Player> {
    const participant: Participant | null = await this.storage.participantOf(matchId, player.id);
    if (!participant) throw new ApiError('NOT_A_PARTICIPANT', 'You are not in this match.');
    return participant.seat;
  }

  private async summary(match: MatchRecord): Promise<MatchSummary> {
    const participants = await this.storage.participantsOf(match.id);
    const seats: MatchSummary['seats'] = [];
    for (const p of participants) {
      const record = await this.storage.playerById(p.playerId);
      seats.push({ seat: p.seat, playerId: p.playerId, displayName: record?.displayName ?? null });
    }
    return {
      matchId: match.id,
      inviteCode: match.inviteCode,
      status: match.status,
      revision: match.revision,
      seats,
      result: match.result,
    };
  }
}
