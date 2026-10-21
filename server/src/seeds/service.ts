import type { Action } from '../../../src/engine/index.js';
import { CURRENT_RULES_VERSION, matchSetup, stateFromSetup } from '../../../src/engine/index.js';
import { campaignLevelById } from '../../../src/campaign/index.js';
import { CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { playerTag } from '../../../src/player-tag.js';
import { ApiError } from '../errors.js';
import { newId, newInviteCode, newSeed } from '../ids.js';
import type { MatchRecord, PlayerRecord, Storage } from '../storage/types.js';
import { WORLD_CELLS, WORLD_VERSION, territoryColour } from '../world.js';
import { SEED_ECONOMY, WORLD_CHALLENGE_LIST_WINDOW_MS } from './config.js';
import type {
  ChallengeSendFailure,
  WorldChallenge,
  WorldChallengeWire,
  WorldChallengesPayload,
  WorldEconomyStore,
} from './types.js';
import { verifyCampaignProof, verifyTrainingProof } from './verify.js';

/** A linked territory duel follows the ordinary 24-hour turn clock. */
const TERRITORY_TURN_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** One retry for a genuine invite-code collision is plenty for a challenge-created duel. */
const MAX_INVITE_ATTEMPTS = 5;

export type SendChallengeOutcome =
  | { ok: true; challenge: WorldChallengeWire; replayed: boolean }
  | { ok: false; code: ChallengeSendFailure };

export class WorldEconomyService {
  constructor(
    readonly store: WorldEconomyStore,
    private readonly matches: Storage,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async world() {
    // A forfeit must reach the PUBLIC map even when neither participant is signed in to read their
    // challenge list. The lazy sweep is a handful of indexed rows; a failure never breaks the map
    // (the daily `/v1/sweep` path still applies it), because a read must not fail on housekeeping.
    await this.store.expireChallenges(this.now()).catch(() => 0);
    const snapshot = await this.store.world();
    return {
      version: WORLD_VERSION, revision: snapshot.revision, cells: WORLD_CELLS,
      claims: snapshot.claims.map((claim) => ({
        cellId: claim.cellId, ownerId: claim.ownerId, ownerName: claim.ownerName,
        // Only a level NUMBER crosses the wire: no id, no email, no progress detail. `null` when the
        // owner has no recorded campaign receipts, so the pane shows nothing rather than "LEVEL 1".
        ownerLevel: claim.ownerLevel,
        ownerTag: playerTag(claim.ownerId), colour: territoryColour(claim.ownerId), claimedAt: claim.claimedAt,
      })),
      cost: SEED_ECONOMY.tileCost,
    };
  }

  wallet(player: PlayerRecord) { return this.store.wallet(player.id); }

  async claim(player: PlayerRecord, cellId: string, requestId: string) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new ApiError('INVALID_REQUEST', 'A claim request ID is required.');
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:claim:${player.id}`, bucket, 120)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before claiming again.');
    }
    const result = await this.store.claim(player.id, cellId, requestId, this.now());
    return result;
  }

  async acknowledge(player: PlayerRecord): Promise<void> { await this.store.acknowledgeInvitation(player.id); }

  async settleOnline(match: MatchRecord): Promise<void> {
    if (match.status !== 'finished' || match.state.phase !== 'GAME_OVER' || !match.result ||
      match.result.reason === 'resigned' || match.result.reason === 'timeout') return;
    const seats = await this.matches.participantsOf(match.id);
    if (seats.length !== 2 || seats[0]!.playerId === seats[1]!.playerId) return;
    for (const seat of seats) {
      const opponent = seats.find((p) => p.seat !== seat.seat)!;
      await this.store.settle({
        playerId: seat.playerId,
        sourceKey: `duel:${match.id}`,
        mode: match.openQueue ? 'queue' : 'friend',
        outcome: match.result.winner === null ? 'draw' : match.result.winner === seat.seat ? 'win' : 'loss',
        opponentId: opponent.playerId,
        now: match.finishedAt ?? this.now(),
      });
    }
  }

  async campaign(player: PlayerRecord, levelId: string, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION) {
    const level = campaignLevelById(levelId);
    if (!level) throw new ApiError('INVALID_REQUEST', 'That Campaign level is not available.');
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:proof:${player.id}`, bucket, 90)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before verifying another match.');
    }
    const verified = verifyCampaignProof(levelId, actions, botVersion);
    if (!verified || verified.winner !== 0) throw new ApiError('INVALID_REQUEST', 'That Campaign result could not be verified.');
    return this.store.settle({
      playerId: player.id, sourceKey: `campaign:${levelId}`, mode: 'campaign', outcome: 'win',
      opponentId: null, now: this.now(), campaignLevel: level.number,
    });
  }

  async issueTraining(player: PlayerRecord, botLevel: number) {
    if (!Number.isInteger(botLevel) || botLevel < 1 || botLevel > 9) throw new ApiError('INVALID_REQUEST', 'Invalid Training level.');
    const now = this.now();
    const day = Math.floor(now / 3_600_000) * 3_600_000;
    const limit = await this.matches.hitRateLimit(`seeds:ticket:${player.id}`, day, 12);
    if (!limit.ok) throw new ApiError('RATE_LIMITED', 'Training rewards are temporarily unavailable.');
    const ticket = { id: newId(), playerId: player.id, seed: newSeed(), botLevel, createdAt: now,
      expiresAt: now + 7 * 86_400_000, usedAt: null };
    await this.store.issueTrainingTicket(ticket);
    return { id: ticket.id, seed: ticket.seed, botLevel: ticket.botLevel, expiresAt: ticket.expiresAt };
  }

  async training(player: PlayerRecord, ticketId: string, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION) {
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:proof:${player.id}`, bucket, 90)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before verifying another match.');
    }
    const ticket = await this.store.trainingTicket(ticketId);
    if (!ticket || ticket.playerId !== player.id || ticket.expiresAt < this.now()) {
      throw new ApiError('INVALID_REQUEST', 'That Training ticket is no longer available.');
    }
    const verified = verifyTrainingProof(ticket.seed, ticket.botLevel, actions, botVersion);
    if (!verified) throw new ApiError('INVALID_REQUEST', 'That Training result could not be verified.');
    return this.store.settle({
      playerId: player.id, sourceKey: `training:${ticket.id}`, trainingTicketId: ticket.id,
      mode: 'training', outcome: verified.winner === null ? 'draw' : verified.winner === 0 ? 'win' : 'loss',
      opponentId: null, now: this.now(),
    });
  }

  // ---- Territory challenges (docs/TERRITORY-CHALLENGES.md) ------------------

  /** Apply due forfeits (24 h) and stale closes (7 d). Also called by the daily sweeper. */
  expireChallenges(now: number = this.now()): Promise<number> {
    return this.store.expireChallenges(now);
  }

  private async challengeWire(c: WorldChallenge, viewerId: string, now: number): Promise<WorldChallengeWire> {
    const [challenger, defender] = await Promise.all([
      this.matches.playerById(c.challengerId),
      this.matches.playerById(c.defenderId),
    ]);
    const match = c.matchId === null ? null : await this.matches.matchById(c.matchId);
    // Only a finished duel has a winner to name; a running match or a draw reports none.
    let matchWinnerId: string | null = null;
    if (match?.status === 'finished' && match.result && match.result.winner !== null) {
      const participants = await this.matches.participantsOf(match.id);
      matchWinnerId = participants.find((p) => p.seat === match.result!.winner)?.playerId ?? null;
    }
    return {
      id: c.id,
      cellId: c.cellId,
      challengerId: c.challengerId,
      defenderId: c.defenderId,
      challengerName: challenger?.displayName ?? null,
      defenderName: defender?.displayName ?? null,
      fromMe: c.challengerId === viewerId,
      status: c.status,
      stake: c.stake,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      respondedAt: c.respondedAt,
      matchId: c.matchId,
      // Only a FINISHED linked duel may be confirmed. The client uses this to offer TAKE THE GROUND.
      matchFinished: match?.status === 'finished' && match.result !== null,
      matchWinnerId,
      winnerId: c.winnerId,
      resolvedAt: c.resolvedAt,
      remainingMs: c.status === 'pending' ? Math.max(0, c.expiresAt - now) : 0,
      serverNow: now,
    };
  }

  async challenges(player: PlayerRecord): Promise<WorldChallengesPayload> {
    const now = this.now();
    await this.store.expireChallenges(now);
    const rows = await this.store.challengesInvolving(player.id, now - WORLD_CHALLENGE_LIST_WINDOW_MS);
    const wires = await Promise.all(rows.map((c) => this.challengeWire(c, player.id, now)));
    return {
      // An answered challenge is history for the defender; only what still needs a decision (or a
      // duel) is incoming. The challenger sees their whole recent history, so a forfeit is visible.
      incoming: wires.filter((w) => w.defenderId === player.id && (w.status === 'pending' || w.status === 'accepted')),
      outgoing: wires.filter((w) => w.challengerId === player.id),
      serverNow: now,
    };
  }

  async sendChallenge(player: PlayerRecord, cellId: string, requestId: string): Promise<SendChallengeOutcome> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new ApiError('INVALID_REQUEST', 'A challenge request ID is required.');
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:challenge:${player.id}`, bucket, 120)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before challenging again.');
    }
    const now = this.now();
    const result = await this.store.sendChallenge({
      challengerId: player.id,
      cellId,
      requestId,
      // The stake is one tile's price: both sides wager the same value (docs/TERRITORY-CHALLENGES.md).
      stake: SEED_ECONOMY.tileCost,
      now,
    });
    if (!result.ok) return result;
    return { ok: true, challenge: await this.challengeWire(result.challenge, player.id, now), replayed: result.replayed };
  }

  async respond(player: PlayerRecord, id: string, accept: boolean): Promise<{ challenge: WorldChallengeWire; matchId: string | null }> {
    const now = this.now();
    // Expire first: a late answer must never accept (or decline) a challenge that already forfeited.
    await this.store.expireChallenges(now);
    const existing = await this.store.challenge(id);
    if (!existing || existing.defenderId !== player.id) throw new ApiError('CHALLENGE_NOT_FOUND', 'That challenge is not yours.');
    // The original answer replays instead of failing: a retried tap is not a second decision.
    if ((existing.status === 'accepted' && accept) || (existing.status === 'declined' && !accept)) {
      return { challenge: await this.challengeWire(existing, player.id, now), matchId: existing.matchId };
    }
    if (existing.status !== 'pending') throw new ApiError('CHALLENGE_CLOSED', 'That challenge has closed.');

    const matchId = accept ? (await this.createTerritoryMatch(existing.challengerId, player.id, now)).id : null;
    const result = await this.store.respondChallenge({ id, defenderId: player.id, accept, matchId, now });
    if (!result.ok) {
      if (result.code === 'CHALLENGE_NOT_FOUND') throw new ApiError('CHALLENGE_NOT_FOUND', 'That challenge is not yours.');
      throw new ApiError('CHALLENGE_CLOSED', 'That challenge has closed.');
    }
    return { challenge: await this.challengeWire(result.challenge, player.id, now), matchId: result.challenge.matchId };
  }

  /**
   * `POST /v1/world/challenges/:id/confirm` — the ONLY place a paid tile changes hands after a duel.
   * The match must be FINISHED; the winner is read from its result (a draw has no winner). The store
   * locks the challenge row, so two simultaneous confirmations apply exactly one settlement and the
   * second returns the stored result.
   */
  async confirm(player: PlayerRecord, id: string): Promise<{
    settled: boolean;
    winnerId: string | null;
    cellId: string;
    replayed: boolean;
    challenge: WorldChallengeWire;
  }> {
    const now = this.now();
    // Expire first so an accepted-but-7-days-stale challenge can never settle after its refund.
    await this.store.expireChallenges(now);
    const c = await this.store.challenge(id);
    if (!c || (c.challengerId !== player.id && c.defenderId !== player.id)) {
      throw new ApiError('CHALLENGE_NOT_FOUND', 'That challenge is not yours.');
    }
    if (c.status === 'resolved') {
      // First-confirmed-wins: return the stored settlement, never apply it again.
      return { settled: false, winnerId: c.winnerId, cellId: c.cellId, replayed: true, challenge: await this.challengeWire(c, player.id, now) };
    }
    if (c.status !== 'accepted' || c.matchId === null) throw new ApiError('CHALLENGE_CLOSED', 'That challenge has closed.');
    const match = await this.matches.matchById(c.matchId);
    if (!match || match.status !== 'finished' || !match.result) {
      throw new ApiError('MATCH_NOT_FINISHED', 'The linked duel is not finished yet.');
    }
    const participants = await this.matches.participantsOf(c.matchId);
    const winnerSeat = match.result.winner;
    const winnerId = winnerSeat === null ? null : participants.find((p) => p.seat === winnerSeat)?.playerId ?? null;
    const result = await this.store.settleChallenge({ id, playerId: player.id, winnerId, now });
    if (!result.ok) {
      if (result.code === 'NOT_PARTICIPANT') throw new ApiError('CHALLENGE_NOT_FOUND', 'That challenge is not yours.');
      throw new ApiError('CHALLENGE_CLOSED', 'That challenge has closed.');
    }
    return {
      settled: result.settled,
      winnerId: result.winnerId,
      cellId: result.cellId,
      replayed: result.replayed,
      challenge: await this.challengeWire(result.challenge, player.id, now),
    };
  }

  /**
   * The linked duel. It is the ordinary match engine, seated and active from the moment the defender
   * accepts; `kind = 'territory'` is the only difference. Nothing in the engine changes.
   */
  private async createTerritoryMatch(challengerId: string, defenderId: string, now: number): Promise<MatchRecord> {
    for (let attempt = 0; attempt < MAX_INVITE_ATTEMPTS; attempt++) {
      const setup = matchSetup(newSeed(), CURRENT_RULES_VERSION);
      const candidate: MatchRecord = {
        id: newId(),
        inviteCode: newInviteCode(8),
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
        turnTimeoutMs: TERRITORY_TURN_TIMEOUT_MS,
        graceUsed: [0, 0],
        gracePeriods: 1,
        graceExtensionMs: TERRITORY_TURN_TIMEOUT_MS,
        turnStartRevision: 0,
        turnStartState: null,
        expiresAt: now + TERRITORY_TURN_TIMEOUT_MS,
        openQueue: false,
        kind: 'territory',
      };
      const created = await this.matches.createMatch(candidate);
      if (!created.ok) {
        if (created.code === 'DUPLICATE_INVITE_CODE') continue;
        throw new ApiError('INTERNAL', 'Could not start the territory duel.');
      }
      for (const [playerId, seat] of [[challengerId, 0], [defenderId, 1]] as const) {
        const seated = await this.matches.addParticipant({ matchId: candidate.id, playerId, seat, joinedAt: now, lastSeenAt: now });
        if (!seated.ok) throw new ApiError('INTERNAL', 'Could not seat the territory duel.');
      }
      const active = await this.matches.activateMatch(candidate.id, now, TERRITORY_TURN_TIMEOUT_MS);
      if (!active) throw new ApiError('INTERNAL', 'Could not start the territory duel.');
      return active;
    }
    throw new ApiError('INTERNAL', 'Could not start the territory duel.');
  }
}
