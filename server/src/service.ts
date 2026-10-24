// The match service: identity, match lifecycle and the authoritative action pipeline.
//
// Every rule decision is delegated to the shared engine (src/engine). This file only wires the
// storage, the identity and the network-facing payloads together. It never trusts a client's
// claimed seat: the seat always comes from `match_participants` for the authenticated player.
import {
  IllegalActionError,
  RULES_VERSIONS,
  applyAs,
  eventsOf,
  hidePrivateEvents,
  legalActions,
  matchSetup,
  scores,
  stateFromSetup,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Event, Player, State } from '../../src/engine/index.js';
import { safePublish } from './broadcast.js';
import type { MatchBroadcaster } from './broadcast.js';
import { DEFAULT_SERVER_CONFIG, clientVersionOk } from './config.js';
import type { ServerConfig } from './config.js';
import { assertDisplayName } from './display-name.js';
import { ApiError, engineCodeToApi } from './errors.js';
import { playerTag } from '../../src/player-tag.js';
import { hashToken, newId, newInviteCode, newSeed, newToken, normalizeInviteCode } from './ids.js';
import { natureName } from './nature-names.js';
import type {
  MatchListEntry,
  MatchSummary,
  MatchViewPayload,
  OnlineGameResult,
  PlayerSummary,
  SubmitActionRequest,
  SubmitActionResponse,
} from './protocol.js';
import { fromEngineResult } from './protocol.js';
import { actorChanged, gatedRevisionFor, gatedStateFor, turnBoundaryAdvanced } from './turn-boundary.js';
import { graceSpentBetween } from './grace.js';
import type { WorldEconomyService } from './seeds/service.js';
import { playerSummary } from './storage/types.js';
import type { Decision, MatchRecord, Participant, PlayerRecord, Storage } from './storage/types.js';

const MAX_REQUEST_ID = 200;
const GUEST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/**
 * Bounded attempts when a freshly generated invite code is already taken (P-13). The storage
 * adapter only reports `DUPLICATE_INVITE_CODE` for a genuine unique violation on
 * `matches.invite_code`, so this retries a real collision — never an unrelated failure. After the
 * last attempt creation fails with a friendly error instead of looping forever.
 */
export const MAX_INVITE_CODE_ATTEMPTS = 5;

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
  economy?: WorldEconomyService;
  config?: ServerConfig;
  /** Injectable clock (epoch ms). Defaults to the real one. */
  now?: () => number;
  broadcaster?: MatchBroadcaster;
};

export class MatchService {
  private readonly storage: Storage;
  private readonly config: ServerConfig;
  private readonly now: () => number;
  private readonly broadcaster: MatchBroadcaster | undefined;
  private readonly economy: WorldEconomyService | undefined;

  constructor(options: ServiceOptions) {
    this.storage = options.storage;
    this.config = options.config ?? DEFAULT_SERVER_CONFIG;
    this.now = options.now ?? (() => Date.now());
    this.broadcaster = options.broadcaster;
    this.economy = options.economy;
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

  /** Reject clients older than minClientVersion (P-5). */
  assertClientVersion(clientVersion: string | null | undefined): void {
    if (clientVersion === null || clientVersion === undefined || clientVersion === '') return;
    if (!clientVersionOk(clientVersion, this.config.minClientVersion)) {
      throw new ApiError('CLIENT_TOO_OLD', 'Reload to update FUTASAKU.');
    }
  }

  /** Refuse to host a match whose rules this build cannot replay (P-14). */
  assertRulesSupported(rulesVersion: string): void {
    if (!Object.hasOwn(RULES_VERSIONS, rulesVersion)) {
      throw new ApiError('UNSUPPORTED_RULES', 'This build cannot replay that match.');
    }
  }

  // ---- identity ----

  async createGuest(
    _displayName: string | null = null,
    clientIp: string | null = null,
    testTraffic = false,
  ): Promise<{ player: PlayerSummary; token: string }> {
    await this.rateLimit(`guest:ip:${clientIp ?? 'unknown'}`, HOUR_MS, this.config.rateLimits.guestPerIpPerHour);
    const now = this.now();
    const id = newId();
    // Nature names only — no free-text moderation surface (rule 8).
    const player: PlayerRecord = {
      id,
      kind: 'guest',
      displayName: natureName(id),
      createdAt: now,
      upgradedAt: null,
      // Only when the caller is an automated harness (the header in fetch-app.ts). This marker is the
      // durable answer the dashboard trusts; it is never inferred, and a real player's browser cannot
      // reach this branch.
      ...(testTraffic ? { isTest: true, testReason: 'Tagged at creation by an automated test harness.' } : {}),
    };
    await this.storage.createPlayer(player);
    const token = await this.issueToken(player.id, now);
    return { player: playerSummary(player), token };
  }

  async getMe(player: PlayerRecord): Promise<PlayerSummary> {
    return playerSummary(player);
  }

  /**
   * A signed-in player chooses their own name. The typed name is NORMALISED and STORED — the old
   * "nature names only" rule is gone now that accounts exist (server/src/display-name.ts holds the
   * one decision: trim, collapse spaces, charset, blocklist). Only an account may do this; a guest
   * keeps its generated nature name until it signs in. The #tag comes from the player id, so a
   * rename never moves it.
   */
  async renameMe(player: PlayerRecord, displayName: string): Promise<PlayerSummary> {
    if (player.kind !== 'account') {
      throw new ApiError('FORBIDDEN', 'Sign in with Google to choose your own name.');
    }
    const name = assertDisplayName(displayName);
    const updated: PlayerRecord = { ...player, displayName: name };
    await this.storage.updatePlayer(updated);
    return playerSummary(updated);
  }

  /** The upgrade path: a guest becomes a permanent account without losing its id or its matches. */
  async upgradePlayer(player: PlayerRecord, displayName: string): Promise<PlayerSummary> {
    if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.length > 40) {
      throw new ApiError('INVALID_REQUEST', 'Pick a display name of 1 to 40 characters.');
    }
    const upgraded: PlayerRecord = {
      ...player,
      kind: 'account',
      displayName: natureName(`${player.id}:${displayName.trim()}`),
      upgradedAt: this.now(),
    };
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

  async createLinkCode(player: PlayerRecord): Promise<{ code: string; expiresAt: number }> {
    await this.rateLimit(`link:player:${player.id}`, HOUR_MS, this.config.rateLimits.linkCodePerPlayerPerHour);
    const now = this.now();
    // A DEVICE LINK code is a different concept from a match invite code: redeeming it mints a new
    // token for another player (account takeover), so it uses the longer `linkCodeLength` and must
    // never be coupled to `inviteCodeLength`.
    const code = newInviteCode(this.config.linkCodeLength);
    await this.storage.createLinkCode({
      id: newId(),
      codeHash: hashToken(code),
      playerId: player.id,
      createdAt: now,
      expiresAt: now + this.config.linkCodeTtlMs,
      usedAt: null,
    });
    return { code, expiresAt: now + this.config.linkCodeTtlMs };
  }

  /** Issues a NEW token for the same player. Never moves an existing token (P-3). */
  async redeemLinkCode(code: string, clientIp: string | null = null): Promise<{ player: PlayerSummary; token: string }> {
    await this.rateLimit(`link:ip:${clientIp ?? 'unknown'}`, HOUR_MS, this.config.rateLimits.linkRedeemPerIpPerHour);
    const normalized = normalizeInviteCode(code);
    if (normalized.length === 0) throw new ApiError('INVALID_REQUEST', 'A link code is required.');
    const redeemed = await this.storage.redeemLinkCode(hashToken(normalized), this.now());
    // Same friendly error for wrong and expired (P-13).
    if (!redeemed) throw new ApiError('NOT_FOUND', 'That link code is not valid.');
    const player = await this.storage.playerById(redeemed.playerId);
    if (!player) throw new ApiError('NOT_FOUND', 'That link code is not valid.');
    const token = await this.issueToken(player.id, this.now());
    return { player: playerSummary(player), token };
  }

  private async issueToken(playerId: string, now: number): Promise<string> {
    const token = newToken();
    await this.storage.issueToken({ id: newId(), playerId, tokenHash: hashToken(token), createdAt: now, revokedAt: null });
    return token;
  }

  private async rateLimit(bucket: string, windowMs: number, max: number): Promise<void> {
    const now = this.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const hit = await this.storage.hitRateLimit(bucket, windowStart, max);
    if (!hit.ok) throw new ApiError('RATE_LIMITED', 'Too many requests. Try again in a moment.');
  }

  // ---- match lifecycle ----

  /**
   * A fresh `waiting` match record (no storage write). Shared by invite creation and the parked
   * Find-Opponent path so both get the same seed/config/expiry. `expiresAt` is the waiting-match
   * window (`waitingExpireMs`, 48h in production) — the same window a parked search reuses, since
   * a parked search is exactly a waiting open-queue match.
   */
  private buildWaitingMatch(now: number, openQueue: boolean): MatchRecord {
    const setup = matchSetup(newSeed(), this.config.rulesVersion);
    return {
      id: newId(),
      inviteCode: newInviteCode(this.config.inviteCodeLength),
      rulesVersion: setup.rulesVersion,
      seed: setup.seed,
      config: setup.config,
      startingPlayer: setup.startingPlayer,
      status: 'waiting',
      revision: 0,
      state: stateFromSetup(setup),
      result: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      turnDeadlineAt: null,
      turnTimeoutMs: this.config.turnTimeoutMs,
      graceUsed: [0, 0],
      gracePeriods: this.config.gracePeriodsPerPlayer,
      graceExtensionMs: this.config.graceExtensionMs,
      turnStartRevision: 0,
      turnStartState: null,
      expiresAt: now + this.config.waitingExpireMs,
      openQueue,
    };
  }

  async createMatch(
    player: PlayerRecord,
    options: { openQueue?: boolean } = {},
    clientIp: string | null = null,
  ): Promise<{ match: MatchSummary; player: MatchViewPayload }> {
    // Creation is the one lifecycle write with no natural cap besides the open-match limit, so it
    // carries a bounded per-player AND per-IP rate limit (a create/cancel loop is the abuse it
    // stops). Both buckets are Postgres-backed, so the limit holds across Edge isolates.
    await this.rateLimit(`create:player:${player.id}`, HOUR_MS, this.config.rateLimits.createPerPlayerPerHour);
    await this.rateLimit(`create:ip:${clientIp ?? 'unknown'}`, HOUR_MS, this.config.rateLimits.createPerIpPerHour);

    const existing = await this.storage.matchesOfPlayer(player.id);
    if (existing.filter((m) => m.status !== 'finished').length >= this.config.maxOpenMatchesPerPlayer) {
      throw new ApiError('TOO_MANY_MATCHES', 'Finish or leave a match before starting another.');
    }

    const now = this.now();
    const openQueue = !!options.openQueue;

    let created: MatchRecord | null = null;
    for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS && created === null; attempt++) {
      const candidate = this.buildWaitingMatch(now, openQueue);
      const result = await this.storage.createMatch(candidate);
      if (result.ok) created = candidate;
      else if (result.code === 'DUPLICATE_INVITE_CODE') {
        // A real collision: generate a fresh code and retry. Warn only when a retry is needed, so
        // the collision rate is visible in the logs. Never log the code itself.
        console.warn(`createMatch: invite code collision, retrying (attempt ${attempt + 1}/${MAX_INVITE_CODE_ATTEMPTS})`);
      } else throw new ApiError('INTERNAL', 'Could not create the match.');
    }
    if (!created) throw new ApiError('INTERNAL', 'Could not start a duel right now. Please try again.');

    const seated = await this.storage.addParticipant({
      matchId: created.id,
      playerId: player.id,
      seat: 0,
      joinedAt: now,
      lastSeenAt: now,
    });
    if (!seated.ok) throw new ApiError('INTERNAL', 'Could not seat the match creator.');

    return { match: await this.summary(created), player: await this.payload(created, 0, []) };
  }

  /**
   * Phase 7 Find Opponent. One atomic storage step guarantees the player is never left with
   * nothing: it joins the oldest waiting open-queue match (FIFO), or parks this search when nobody
   * is waiting, or returns the player's own parked search so a repeat tap never creates a second.
   * A parked search is intentional and long-lived; it expires on the waiting-match window only.
   * A player at the per-player cap is refused (friendly TOO_MANY_MATCHES), never silently stuck.
   */
  async findOpponent(
    player: PlayerRecord,
    clientIp: string | null = null,
  ): Promise<{ match: MatchSummary; player: MatchViewPayload; paired: boolean }> {
    await this.rateLimit(`join:player:${player.id}`, HOUR_MS, this.config.rateLimits.joinPerPlayerPerHour);
    await this.rateLimit(`join:ip:${clientIp ?? 'unknown'}`, HOUR_MS, this.config.rateLimits.joinPerIpPerHour);

    const now = this.now();
    for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
      const result = await this.storage.claimOpenQueueOrPark({
        playerId: player.id,
        parked: this.buildWaitingMatch(now, true),
        now,
        turnTimeoutMs: this.config.turnTimeoutMs,
        maxOpenMatches: this.config.maxOpenMatchesPerPlayer,
      });
      if (!result.ok) {
        if (result.code === 'DUPLICATE_INVITE_CODE') {
          // A real invite-code collision: build a fresh code and retry. Warn only when a retry is
          // actually needed; never log the code itself.
          console.warn(`findOpponent: invite code collision, retrying (attempt ${attempt + 1}/${MAX_INVITE_CODE_ATTEMPTS})`);
          continue;
        }
        // A racing searcher took the free seat first; the next attempt re-reads the queue.
        if (result.code === 'MATCH_FULL') continue;
        if (result.code === 'TOO_MANY_MATCHES') {
          throw new ApiError('TOO_MANY_MATCHES', 'Finish or leave a match before starting another.');
        }
        throw new ApiError('INTERNAL', 'Could not find an opponent.');
      }
      if (result.paired) {
        // The parked player's page learns about the activation from this ping.
        await safePublish(this.broadcaster, result.match.id, { revision: result.match.revision, status: result.match.status });
      }
      return {
        match: await this.summary(result.match),
        player: await this.payload(result.match, result.seat, []),
        paired: result.paired,
      };
    }
    throw new ApiError('INTERNAL', 'Could not find an opponent right now. Please try again.');
  }

  /** Stop a parked search: retire it so no later searcher is matched into it. Calm no-op otherwise. */
  async cancelSearch(player: PlayerRecord): Promise<{ cancelled: boolean }> {
    await this.rateLimit(`join:player:${player.id}`, HOUR_MS, this.config.rateLimits.joinPerPlayerPerHour);
    return { cancelled: await this.storage.cancelOpenQueueMatch(player.id, this.now()) };
  }

  /**
   * Cancel the caller's own WAITING match (the invite screen's "Cancel match" — an invite nobody
   * ever joined, or a parked search). Only the owner may cancel; the match must be `waiting` with
   * the caller as its sole participant. Idempotent, and a cancelled match can no longer be joined
   * (its code resolves to nothing). Reuses the join budget so it cannot be hammered.
   */
  async cancelWaitingMatch(player: PlayerRecord, matchId: string): Promise<{ cancelled: boolean }> {
    await this.rateLimit(`join:player:${player.id}`, HOUR_MS, this.config.rateLimits.joinPerPlayerPerHour);
    if (typeof matchId !== 'string' || matchId.length === 0) {
      throw new ApiError('INVALID_REQUEST', 'A match id is required.');
    }
    return { cancelled: await this.storage.cancelWaitingMatch(player.id, matchId) };
  }

  async joinMatch(
    player: PlayerRecord,
    inviteCode: string,
    clientIp: string | null = null,
  ): Promise<{ match: MatchSummary; player: MatchViewPayload }> {
    await this.rateLimit(`join:player:${player.id}`, HOUR_MS, this.config.rateLimits.joinPerPlayerPerHour);
    await this.rateLimit(`join:ip:${clientIp ?? 'unknown'}`, HOUR_MS, this.config.rateLimits.joinPerIpPerHour);

    const code = normalizeInviteCode(typeof inviteCode === 'string' ? inviteCode : '');
    if (code.length === 0) throw new ApiError('INVALID_REQUEST', 'An invite code is required.');
    const match = await this.storage.matchByInviteCode(code);
    // Same error for wrong and expired (P-13).
    if (!match) throw new ApiError('MATCH_NOT_FOUND', 'No match has that invite code.');

    const expired = await this.storage.applyExpiry(match.id, this.now());
    const current = expired ?? match;
    if (current.status === 'finished') {
      if (match.status === 'waiting' || current.result === null) {
        throw new ApiError('MATCH_NOT_FOUND', 'No match has that invite code.');
      }
      throw new ApiError('MATCH_FINISHED', 'That match has already finished.');
    }

    const existing = await this.storage.participantOf(current.id, player.id);
    if (existing) {
      return { match: await this.summary(current), player: await this.payload(current, existing.seat, []) };
    }

    const participants = await this.storage.participantsOf(current.id);
    if (participants.length >= 2) throw new ApiError('MATCH_FULL', 'That match already has two players.');
    const seat: Player = participants.some((p) => p.seat === 0) ? 1 : 0;
    const now = this.now();

    const added = await this.storage.addParticipant({
      matchId: current.id,
      playerId: player.id,
      seat,
      joinedAt: now,
      lastSeenAt: now,
    });
    if (!added.ok) throw new ApiError('MATCH_FULL', 'That match already has two players.');

    const after = await this.storage.participantsOf(current.id);
    const resolved =
      after.length === 2
        ? ((await this.storage.activateMatch(current.id, now, this.config.turnTimeoutMs)) ?? current)
        : current;

    await safePublish(this.broadcaster, resolved.id, { revision: resolved.revision, status: resolved.status });
    return { match: await this.summary(resolved), player: await this.payload(resolved, seat, []) };
  }

  /**
   * A mutual rematch of a finished standard duel (owner, 2026-10-22: "they both press rematch =
   * they're straight in a new game"). The first press creates the rematch match, tagged with the
   * finished match's id, and waits on it; the second press, by the other player, takes seat 1 and
   * the match goes active for both. A repeated press returns the same match, and the storage's
   * one-rematch-per-match rule turns two simultaneous presses into one match.
   */
  async rematch(player: PlayerRecord, matchId: string): Promise<{ match: MatchSummary; player: MatchViewPayload }> {
    await this.rateLimit(`join:player:${player.id}`, HOUR_MS, this.config.rateLimits.joinPerPlayerPerHour);
    if (typeof matchId !== 'string' || matchId.length === 0) throw new ApiError('INVALID_REQUEST', 'A match id is required.');
    const finished = await this.requireParticipantFresh(player, matchId);
    if (finished.status !== 'finished') throw new ApiError('MATCH_NOT_FINISHED', 'Finish this match before a rematch.');
    for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
      const existing = await this.storage.rematchOf(matchId);
      if (existing) return this.takeRematchSeat(player, existing);
      const open = (await this.storage.matchesOfPlayer(player.id)).filter((m) => m.status !== 'finished').length;
      if (open >= this.config.maxOpenMatchesPerPlayer) {
        throw new ApiError('TOO_MANY_MATCHES', 'Finish or leave a match before starting another.');
      }
      const now = this.now();
      const created = this.buildWaitingMatch(now, false);
      const result = await this.storage.createRematch(created, matchId, player.id, now);
      if (result.ok) return { match: await this.summary(created), player: await this.payload(created, 0, []) };
      // The other player's press won the race (or an invite code collided): read theirs, or retry.
      if (result.code !== 'REMATCH_EXISTS' && result.code !== 'DUPLICATE_INVITE_CODE') {
        throw new ApiError('INTERNAL', 'Could not start the rematch.');
      }
    }
    throw new ApiError('INTERNAL', 'Could not start the rematch right now. Please try again.');
  }

  /** The second press of a rematch: the player's own seat if they have one, otherwise seat 1. */
  private async takeRematchSeat(player: PlayerRecord, match: MatchRecord): Promise<{ match: MatchSummary; player: MatchViewPayload }> {
    const now = this.now();
    const current = (await this.storage.applyExpiry(match.id, now)) ?? match;
    const mine = await this.storage.participantOf(current.id, player.id);
    if (mine) return { match: await this.summary(current), player: await this.payload(current, mine.seat, []) };
    if (current.status !== 'waiting') throw new ApiError('MATCH_EXPIRED', 'That rematch is no longer open.');
    const added = await this.storage.addParticipant({ matchId: current.id, playerId: player.id, seat: 1, joinedAt: now, lastSeenAt: now });
    if (!added.ok && added.code !== 'ALREADY_JOINED') throw new ApiError('MATCH_FULL', 'That rematch already has two players.');
    const resolved = (await this.storage.activateMatch(current.id, now, this.config.turnTimeoutMs)) ?? current;
    await safePublish(this.broadcaster, resolved.id, { revision: resolved.revision, status: resolved.status });
    return { match: await this.summary(resolved), player: await this.payload(resolved, 1, []) };
  }

  // ---- reading a match ----

  async getMatch(player: PlayerRecord, matchId: string): Promise<MatchSummary> {
    const match = await this.requireParticipantFresh(player, matchId);
    return this.summary(match);
  }

  async listMyMatches(player: PlayerRecord): Promise<MatchListEntry[]> {
    const rows = await this.storage.listMatchesForPlayer(player.id);
    const now = this.now();
    const out: MatchListEntry[] = [];
    for (const row of rows) {
      let match = row.match;
      if (
        (match.status === 'active' && match.turnDeadlineAt !== null && now > match.turnDeadlineAt) ||
        (match.status === 'waiting' && match.expiresAt !== null && now > match.expiresAt)
      ) {
        const before = match;
        match = (await this.storage.applyExpiry(match.id, now)) ?? match;
        await this.publishGraceChange(before, match);
      }
      this.assertRulesSupported(match.rulesVersion);
      const gated = gatedStateFor(match, row.mySeat);
      const rev = gatedRevisionFor(match, row.mySeat);
      out.push({
        matchId: match.id,
        status: match.status,
        mySeat: row.mySeat,
        turnPlayer: match.status === 'waiting' ? null : gated.turnPlayer,
        turnDeadlineAt: match.status === 'finished' ? null : match.turnDeadlineAt,
        opponentName: row.opponentName,
        opponentTag: row.opponentId ? playerTag(row.opponentId) : null,
        lastActivityAt: match.updatedAt,
        unseenTurn: match.status === 'active' && gated.turnPlayer === row.mySeat && row.lastSeenAt < match.updatedAt,
        revision: rev,
        graceUsed: match.graceUsed,
        gracePeriods: match.gracePeriods,
        result: match.result,
      });
    }
    // Your turn first, then waiting, then finished (latest activity).
    const rank = (e: MatchListEntry): number => {
      if (e.status === 'active' && e.turnPlayer === e.mySeat) return 0;
      if (e.status === 'waiting') return 1;
      if (e.status === 'active') return 2;
      return 3;
    };
    out.sort((a, b) => rank(a) - rank(b) || b.lastActivityAt - a.lastActivityAt);
    return out;
  }

  /**
   * The player-specific view. `sinceRevision` lets a reconnecting client fetch only new events;
   * 0 (the default) returns the whole public history for Match Intel. Hidden information is
   * removed by the engine's single rule (`hidePrivateEvents`).
   */
  async viewPayload(player: PlayerRecord, matchId: string, sinceRevision = 0): Promise<MatchViewPayload> {
    const match = await this.requireParticipantFresh(player, matchId);
    // A finished match settles on every view (idempotent): the retry is what makes a transient
    // economy failure self-heal. Its report is this player's own award, or nothing.
    const settled = match.status === 'finished' ? await this.safeSettleOnline(match) : null;
    this.assertRulesSupported(match.rulesVersion);
    const seat = await this.seatOf(player, matchId);
    await this.storage.touchParticipant(matchId, player.id, this.now());
    const visibleRevision = gatedRevisionFor(match, seat);
    const moves = await this.storage.movesOf(matchId, sinceRevision);
    const visibleMoves = moves.filter((m) => m.revision <= visibleRevision);
    return this.payload(match, seat, visibleMoves.flatMap((m) => m.events), settled?.get(player.id) ?? null);
  }

  async resign(player: PlayerRecord, matchId: string): Promise<{ match: MatchSummary; player: MatchViewPayload }> {
    const match = await this.requireParticipantFresh(player, matchId);
    if (match.status === 'finished') throw new ApiError('MATCH_FINISHED', 'This match is over.');
    if (match.status !== 'active') throw new ApiError('MATCH_NOT_ACTIVE', 'Waiting for an opponent to join.');
    const seat = await this.seatOf(player, matchId);
    const winner: Player = seat === 0 ? 1 : 0;
    const result: OnlineGameResult = { winner, reason: 'resigned', scores: scores(match.state) };
    const finished = await this.storage.resignMatch(matchId, player.id, this.now(), result);
    if (!finished) throw new ApiError('INTERNAL', 'Could not resign.');
    await safePublish(this.broadcaster, matchId, { revision: finished.revision, status: finished.status });
    return { match: await this.summary(finished), player: await this.payload(finished, seat, []) };
  }

  async sweep(
    clientIp: string | null = null,
    options: { internal?: boolean } = {},
  ): Promise<{ timedOut: number; expiredWaiting: number; deletedGuests: number; graceExtended: number }> {
    // An authenticated cron/CI sweep gets its own bucket so a player's per-IP budget (or a shared
    // "unknown" bucket) can never block routine housekeeping. It is still rate limited.
    const bucket = options.internal === true ? 'sweep:internal' : `sweep:ip:${clientIp ?? 'unknown'}`;
    await this.rateLimit(bucket, HOUR_MS, this.config.rateLimits.sweepPerIpPerHour);
    // Territory challenges: an unanswered 24 h challenge forfeits, and an accepted one older than
    // 7 days closes stale. The same daily housekeeping call that clears matches applies both.
    await this.economy?.expireChallenges(this.now()).catch(() => 0);
    const result = await this.storage.sweep(this.now(), GUEST_MAX_AGE_MS);
    // A sweeper-spent grace is the same visible state change as a lazily-spent one, and a match the
    // sweeper just finished by timeout is a TERMINAL change the other device must be woken for —
    // exactly like a completed turn. Both ride the same ping path.
    for (const matchId of result.graceExtendedIds) {
      const match = await this.storage.matchById(matchId);
      if (match) await safePublish(this.broadcaster, matchId, { revision: match.revision, status: match.status });
    }
    for (const matchId of result.timedOutIds) {
      const match = await this.storage.matchById(matchId);
      if (match) {
        await safePublish(this.broadcaster, matchId, { revision: match.revision, status: match.status });
      }
    }
    if (result.deletedGuests > 0) {
      // Housekeeping log for operators (no secrets).
      console.info(`sweep: deleted ${result.deletedGuests} guest account(s) with no matches`);
    }
    // The wire response stays lean: the ids were only needed to fire the pings above.
    return {
      timedOut: result.timedOut,
      expiredWaiting: result.expiredWaiting,
      deletedGuests: result.deletedGuests,
      graceExtended: result.graceExtended,
    };
  }

  // ---- the authoritative action pipeline ----

  async submitAction(player: PlayerRecord, matchId: string, request: SubmitActionRequest): Promise<SubmitActionResponse> {
    await this.rateLimit(`actions:player:${player.id}`, MINUTE_MS, this.config.rateLimits.actionsPerPlayerPerMinute);

    const { expectedRevision, requestId } = request ?? {};
    if (!Number.isInteger(expectedRevision) || (expectedRevision as number) < 0) {
      throw new ApiError('INVALID_REQUEST', 'expectedRevision must be a non-negative integer.');
    }
    if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > MAX_REQUEST_ID) {
      throw new ApiError('INVALID_REQUEST', `requestId must be a string of 1 to ${MAX_REQUEST_ID} characters.`);
    }

    const { actions, asBatch } = this.normalizeActions(request);
    await this.requireParticipant(player, matchId);

    const before = await this.storage.matchById(matchId);
    const beforeStatus = before?.status;
    const beforeBoundary = before?.turnStartRevision;

    const result = asBatch
      ? await this.storage.commitBatch({
          matchId,
          playerId: player.id,
          expectedRevision: expectedRevision as number,
          requestId,
          now: this.now(),
          actions,
          decideOne: ({ match, seat, action }): Decision => this.decide(match, seat, action),
        })
      : await this.storage.commitMove({
          matchId,
          playerId: player.id,
          expectedRevision: expectedRevision as number,
          requestId,
          now: this.now(),
          decide: ({ match, seat }): Decision => this.decide(match, seat, actions[0]!),
        });

    if (!result.ok) throw this.commitError(result.code, result.reason);

    const boundaryMoved =
      !result.replayed &&
      (result.match.status !== beforeStatus || result.match.turnStartRevision !== beforeBoundary);
    if (boundaryMoved || result.match.status === 'finished') {
      await safePublish(this.broadcaster, matchId, { revision: result.match.turnStartRevision, status: result.match.status });
    }
    // The commit's own expiry step may have spent a grace before applying the action.
    if (!result.replayed) await this.publishGraceChange(before, result.match);
    // Finished engine matches earn Seeds, exactly once per player. A result replay repairs a
    // transient settlement failure without touching the deterministic game state.
    if (result.match.status === 'finished') await this.safeSettleOnline(result.match);

    const events = result.moves.flatMap((m) => m.events);
    return {
      ok: true,
      replayed: result.replayed,
      player: await this.payload(result.match, result.move.seat, events),
      serverNow: this.now(),
    };
  }

  private normalizeActions(request: SubmitActionRequest): { actions: Action[]; asBatch: boolean } {
    if (Array.isArray(request.actions)) {
      if (request.actions.length < 1 || request.actions.length > this.config.maxBatchActions) {
        throw new ApiError('INVALID_REQUEST', `actions must be 1 to ${this.config.maxBatchActions} items.`);
      }
      for (const a of request.actions) {
        if (!isActionShaped(a)) throw new ApiError('INVALID_REQUEST', 'action must be a semantic move object.');
      }
      return { actions: request.actions, asBatch: true };
    }
    if (!isActionShaped(request.action)) throw new ApiError('INVALID_REQUEST', 'action must be a semantic move object.');
    return { actions: [request.action], asBatch: false };
  }

  // ---- internals ----

  /** The pure rules step, run inside the storage's atomic section. */
  private decide(match: MatchRecord, seat: Player, action: Action): Decision {
    this.assertRulesSupported(match.rulesVersion);
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
    const next = withoutHistory(after);
    const finished = next.phase === 'GAME_OVER';
    return {
      kind: 'apply',
      nextState: next,
      events: eventsOf(match.state, action, after),
      action,
      status: finished ? 'finished' : 'active',
      result: finished && next.result ? fromEngineResult(next.result) : null,
      refreshDeadline: actorChanged(match.state, next),
      advanceTurnBoundary: turnBoundaryAdvanced(match.state, next),
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
      case 'TIMED_OUT':
        return new ApiError('TIMED_OUT', reason);
      default:
        return new ApiError('ILLEGAL_ACTION', reason);
    }
  }

  /** Assembles the wire payload for one seat from an authoritative match and raw events. */
  private async payload(
    match: MatchRecord,
    seat: Player,
    events: readonly Event[],
    /** This seat's settled award for the duel, when the finished view just asked the economy. */
    seeds: { awarded: number; reason: string | null } | null = null,
  ): Promise<MatchViewPayload> {
    const source = gatedStateFor(match, seat);
    const revision = gatedRevisionFor(match, seat);
    const view = viewFor(source, seat);
    const canAct =
      match.status === 'active' &&
      source.actor === seat &&
      source.phase !== 'GAME_OVER' &&
      revision === match.revision; // mid-turn opponent never gets legal actions from gated state alone
    const participants = await this.storage.participantsOf(match.id);
    const opp = participants.find((p) => p.seat !== seat) ?? null;
    const oppPlayer = opp ? await this.storage.playerById(opp.playerId) : null;
    return {
      matchId: match.id,
      rulesVersion: match.rulesVersion,
      status: match.status,
      revision,
      turnStartRevision: match.turnStartRevision,
      seat,
      startingPlayer: source.startingPlayer ?? 0,
      turnPlayer: source.turnPlayer,
      actor: source.actor,
      view,
      legalActions: canAct ? legalActions(view) : [],
      events: hidePrivateEvents(events, seat),
      turnDeadlineAt: match.status === 'finished' ? null : match.turnDeadlineAt,
      graceUsed: match.graceUsed,
      gracePeriods: match.gracePeriods,
      opponent: opp
        ? { seat: opp.seat, playerId: opp.playerId, displayName: oppPlayer?.displayName ?? null }
        : null,
      result: match.result,
      // Present only when this seat's finish was settled and the economy reported it. A resign or a
      // timeout never settles, so those cards carry no field and show no Seeds line.
      ...(seeds ? { seeds } : {}),
      serverNow: this.now(),
    };
  }

  private async requireParticipant(player: PlayerRecord, matchId: string): Promise<MatchRecord> {
    const match = await this.storage.matchById(matchId);
    if (!match) throw new ApiError('MATCH_NOT_FOUND', 'Unknown match.');
    const participant = await this.storage.participantOf(matchId, player.id);
    if (!participant) throw new ApiError('NOT_A_PARTICIPANT', 'You are not in this match.');
    return match;
  }

  /** Participant check + lazy expiry (same decision point as writes). */
  private async requireParticipantFresh(player: PlayerRecord, matchId: string): Promise<MatchRecord> {
    const before = await this.requireParticipant(player, matchId);
    const fresh = await this.storage.applyExpiry(matchId, this.now());
    if (!fresh) throw new ApiError('MATCH_NOT_FOUND', 'Unknown match.');
    const participant = await this.storage.participantOf(matchId, player.id);
    if (!participant) throw new ApiError('NOT_A_PARTICIPANT', 'You are not in this match.');
    await this.publishGraceChange(before, fresh);
    // A poll that discovers a deadline the match already passed must ANNOUNCE the finish on the same
    // ping path a completed turn uses, so the other device learns at once instead of waiting for its
    // own next fetch. (A committing finish is announced by `submitAction`, never twice.)
    if (before.status !== 'finished' && fresh.status === 'finished') {
      await safePublish(this.broadcaster, fresh.id, { revision: fresh.revision, status: fresh.status });
      await this.safeSettleOnline(fresh);
    }
    return fresh;
  }

  /**
   * A spent grace is a state change both players must be able to see (it is never a secret), so it
   * goes out on the existing status-change ping path — exactly the path a completed turn uses.
   * Never fired for a mid-turn action: the move itself does not touch the grace flags.
   */
  private async publishGraceChange(before: MatchRecord | null, after: MatchRecord): Promise<void> {
    if (!graceSpentBetween(before, after)) return;
    await safePublish(this.broadcaster, after.id, { revision: after.revision, status: after.status });
  }

  private async seatOf(player: PlayerRecord, matchId: string): Promise<Player> {
    const participant: Participant | null = await this.storage.participantOf(matchId, player.id);
    if (!participant) throw new ApiError('NOT_A_PARTICIPANT', 'You are not in this match.');
    return participant.seat;
  }

  /**
   * Economy failures never roll back a completed duel. A later finished view retries safely.
   * Returns what each seat was paid (empty when nothing settled, or when the economy is absent or
   * failing) so the finished view can report a seat's own award instead of the client guessing one.
   */
  private async safeSettleOnline(match: MatchRecord): Promise<Map<string, { awarded: number; reason: string | null }>> {
    if (!this.economy) return new Map();
    try {
      return await this.economy.settleOnline(match);
    } catch (error) {
      console.warn(`Seeds settlement pending for match ${match.id}: ${String(error)}`);
      return new Map();
    }
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
      turnStartRevision: match.turnStartRevision,
      turnDeadlineAt: match.status === 'finished' ? null : match.turnDeadlineAt,
      expiresAt: match.status === 'waiting' ? match.expiresAt : null,
      graceUsed: match.graceUsed,
      gracePeriods: match.gracePeriods,
      seats,
      result: match.result,
      serverNow: this.now(),
    };
  }
}
