import type { Action } from '../../../src/engine/index.js';
import { campaignLevelById } from '../../../src/campaign/index.js';
import { CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { playerTag } from '../../../src/player-tag.js';
import { ApiError } from '../errors.js';
import { newId, newSeed } from '../ids.js';
import type { MatchRecord, PlayerRecord, Storage } from '../storage/types.js';
import { WORLD_CELLS, WORLD_VERSION, territoryColour } from '../world.js';
import { SEED_ECONOMY } from './config.js';
import type { WorldEconomyStore } from './types.js';
import { verifyCampaignProof, verifyTrainingProof } from './verify.js';

export class WorldEconomyService {
  constructor(
    readonly store: WorldEconomyStore,
    private readonly matches: Storage,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async world() {
    const snapshot = await this.store.world();
    return {
      version: WORLD_VERSION, revision: snapshot.revision, cells: WORLD_CELLS,
      claims: snapshot.claims.map((claim) => ({
        cellId: claim.cellId, ownerId: claim.ownerId, ownerName: claim.ownerName,
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
}
