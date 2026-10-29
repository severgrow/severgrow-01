import {
  SEED_ECONOMY,
  WORLD_CHALLENGE_OPEN_LIMIT,
  WORLD_CHALLENGE_STALE_MS,
  WORLD_CHALLENGE_TTL_MS,
  campaignLevelOfSourceKey,
  utcDay,
} from './config.js';
import { newId } from '../ids.js';
import { planSeedReward } from './rewards.js';
import type {
  AdminCellResult,
  AdminSeedAdjustResult,
  ChallengeRespondResult,
  ChallengeSendResult,
  ChallengeSettleResult,
  ClaimResult,
  SellResult,
  RewardInput,
  RewardResult,
  SeedWallet,
  TrainingTicket,
  WorldChallenge,
  WorldClaim,
  WorldDispute,
  WorldEconomyStore,
  WorldSnapshot,
} from './types.js';
import { emptyWallet } from './types.js';
import { parseWorldCell, seenCellIds, worldNeighbours } from '../world.js';
import { stakedCellFor } from './stake.js';

type Receipt = { input: RewardInput; awarded: number; reason: string | null };
/**
 * One in-memory ledger entry. `id`/`category`/`createdAt` were added for the admin dashboard
 * (docs/ADMIN.md) so the dev store can answer the same questions the Postgres table can; the
 * existing fields keep their meaning.
 */
type LedgerEntry = { id: string; playerId: string; delta: number; category: string; sourceKey: string; balanceAfter: number; createdAt: number };

/** Synchronous critical sections under Node's event loop; the Postgres store uses row locks. */
export class MemoryWorldEconomyStore implements WorldEconomyStore {
  readonly claims = new Map<string, WorldClaim>();
  readonly receipts = new Map<string, Receipt>();
  readonly ledger: LedgerEntry[] = [];
  readonly tickets = new Map<string, TrainingTicket>();
  readonly purchases = new Map<string, string>();
  readonly wallets = new Map<string, SeedWallet>();
  readonly challenges = new Map<string, WorldChallenge>();
  /** `${challengerId}:${requestId}` → challenge id, the idempotency key of a send. */
  readonly challengeRequests = new Map<string, string>();
  revision = 0;

  private current(playerId: string): SeedWallet {
    let wallet = this.wallets.get(playerId);
    if (!wallet) { wallet = emptyWallet(); this.wallets.set(playerId, wallet); }
    return wallet;
  }
  async wallet(playerId: string): Promise<SeedWallet> { return { ...this.current(playerId) }; }
  /** Mirrors the Postgres read: each claim carries its owner's highest settled Campaign level. */
  async world(): Promise<WorldSnapshot> {
    const claims = [];
    for (const claim of this.claims.values()) {
      claims.push({ ...claim, ownerLevel: await this.campaignHighestLevel(claim.ownerId) });
    }
    return { revision: this.revision, claims };
  }
  async campaignHighestLevel(playerId: string): Promise<number | null> {
    let highest: number | null = null;
    for (const receipt of this.receipts.values()) {
      if (receipt.input.playerId !== playerId || receipt.input.mode !== 'campaign') continue;
      const level = campaignLevelOfSourceKey(receipt.input.sourceKey);
      if (level !== null && (highest === null || level > highest)) highest = level;
    }
    return highest;
  }
  async claim(playerId: string, cellId: string, requestId: string, now: number): Promise<ClaimResult> {
    const wallet = this.current(playerId);
    const previous = this.purchases.get(`${playerId}:${requestId}`);
    if (previous) return { ok: true, cellId: previous, revision: this.revision, wallet: { ...wallet }, replayed: true };
    const fail = (code: 'NO_FUNDS' | 'OCCUPIED' | 'NOT_ADJACENT' | 'INVALID_CELL'): ClaimResult =>
      ({ ok: false, code, revision: this.revision, wallet: { ...wallet } });
    // Anywhere on the SEEN map (owner, 2026-10-27: no longer next to your own tiles); land nobody can
    // see yet is not for sale. The seen map is a pure function of the claims (server/src/world.ts).
    if (!parseWorldCell(cellId) || !seenCellIds(this.claims.keys()).has(cellId)) return fail('INVALID_CELL');
    if (this.claims.has(cellId)) return fail('OCCUPIED');
    if (wallet.balance < SEED_ECONOMY.tileCost) return fail('NO_FUNDS');
    wallet.balance -= SEED_ECONOMY.tileCost;
    wallet.lifetimeSpent += SEED_ECONOMY.tileCost;
    this.ledger.push({ id: newId(), playerId, delta: -SEED_ECONOMY.tileCost, category: 'world_claim', sourceKey: `world:${requestId}`, balanceAfter: wallet.balance, createdAt: now });
    this.claims.set(cellId, { cellId, ownerId: playerId, ownerName: null, ownerLevel: null, claimedAt: now });
    this.purchases.set(`${playerId}:${requestId}`, cellId);
    return { ok: true, cellId, revision: ++this.revision, wallet: { ...wallet }, replayed: false };
  }
  async sell(playerId: string, cellId: string, requestId: string, now: number): Promise<SellResult> {
    const wallet = this.current(playerId);
    const prior = this.purchases.get(`sale:${playerId}:${requestId}`);
    if (prior) return { ok: true, cellId: prior, revision: this.revision, wallet: { ...wallet }, replayed: true };
    const fail = (code: 'NOT_OWNED' | 'CELL_BUSY' | 'INVALID_CELL'): SellResult => ({ ok: false, code, revision: this.revision, wallet: { ...wallet } });
    if (!parseWorldCell(cellId)) return fail('INVALID_CELL');
    if (this.claims.get(cellId)?.ownerId !== playerId) return fail('NOT_OWNED');
    if (this.openChallenges().some((c) => c.cellId === cellId || c.stakeCellId === cellId)) return fail('CELL_BUSY');
    this.claims.delete(cellId);
    wallet.balance += SEED_ECONOMY.tileSaleReturn;
    this.ledger.push({ id: newId(), playerId, delta: SEED_ECONOMY.tileSaleReturn, category: 'world_sale', sourceKey: `world-sale:${requestId}`, balanceAfter: wallet.balance, createdAt: now });
    this.purchases.set(`sale:${playerId}:${requestId}`, cellId);
    return { ok: true, cellId, revision: ++this.revision, wallet: { ...wallet }, replayed: false };
  }
  async settle(input: RewardInput): Promise<RewardResult> {
    const wallet = this.current(input.playerId);
    const receiptKey = `${input.playerId}:${input.sourceKey}`;
    const previous = this.receipts.get(receiptKey);
    if (previous) return { awarded: previous.awarded, reason: previous.reason, wallet: { ...wallet }, replayed: true };
    if (input.mode === 'training') {
      const ticket = this.tickets.get(input.trainingTicketId ?? '');
      if (!ticket || ticket.playerId !== input.playerId || ticket.usedAt !== null || ticket.expiresAt < input.now) {
        throw new Error('Invalid or expired Training ticket.');
      }
      ticket.usedAt = input.now;
    }
    const day = utcDay(input.now);
    const paid = [...this.receipts.values()].filter((r) => r.input.playerId === input.playerId && utcDay(r.input.now) === day && r.awarded > 0);
    const decision = planSeedReward(input, {
      modePaid: paid.filter((r) => r.input.mode === input.mode).length,
      pairPaid: paid.filter((r) => r.input.mode === input.mode && r.input.opponentId === input.opponentId).length,
      totalEarned: paid.filter((r) => r.input.mode !== 'campaign').reduce((n, r) => n + r.awarded, 0),
    });
    this.receipts.set(receiptKey, { input: { ...input }, awarded: decision.amount, reason: decision.reason });
    if (decision.amount) {
      wallet.balance += decision.amount;
      wallet.lifetimeEarned += decision.amount;
      this.ledger.push({ id: newId(), playerId: input.playerId, delta: decision.amount, category: input.mode, sourceKey: input.sourceKey, balanceAfter: wallet.balance, createdAt: input.now });
    }
    return { awarded: decision.amount, reason: decision.reason, wallet: { ...wallet }, replayed: false };
  }
  /** An admin grant (admin dashboard): idempotent by `sourceKey`, never below zero. */
  async grant(input: { playerId: string; amount: number; sourceKey: string; now: number }): Promise<{ balance: number; replayed: boolean }> {
    const wallet = this.current(input.playerId);
    if (this.ledger.some((e) => e.playerId === input.playerId && e.sourceKey === input.sourceKey)) return { balance: wallet.balance, replayed: true };
    wallet.balance += input.amount;
    wallet.lifetimeEarned += input.amount;
    this.ledger.push({ id: newId(), playerId: input.playerId, delta: input.amount, category: 'admin_grant', sourceKey: input.sourceKey, balanceAfter: wallet.balance, createdAt: input.now });
    return { balance: wallet.balance, replayed: false };
  }
  async acknowledgeInvitation(playerId: string): Promise<void> { this.current(playerId).worldInvitationSeen = true; }
  async issueTrainingTicket(ticket: TrainingTicket): Promise<void> { this.tickets.set(ticket.id, { ...ticket }); }
  async trainingTicket(id: string): Promise<TrainingTicket | null> { return this.tickets.get(id) ?? null; }

  // ---- Territory challenges -------------------------------------------------
  //
  // Every mutation below runs to completion without an `await`, exactly like the claim path above:
  // Node's single-threaded event loop gives the same all-or-nothing guarantee the Postgres store
  // gets from its transactions and row locks.
  //
  // 2026-10-29 (owner): a challenge is FREE. There is no escrow and no refund; each side risks a
  // TILE, and exactly one tile changes hands when the linked duel finishes. `stake_cell_id` is the
  // challenger's own auto-chosen tile. Older rows (`stakeCellId === null && stake > 0`) keep their
  // historical Seed behaviour so data written before the rule change still settles honestly.

  /** A legacy payout/refund. Lifetime counters are untouched: this moves value, it does not earn it. */
  private credit(playerId: string, amount: number, sourceKey: string, now: number): void {
    if (amount <= 0) return;
    const wallet = this.current(playerId);
    wallet.balance += amount;
    this.ledger.push({ id: newId(), playerId, delta: amount, category: 'world_challenge', sourceKey, balanceAfter: wallet.balance, createdAt: now });
  }
  private openChallenges(): WorldChallenge[] {
    return [...this.challenges.values()].filter((c) => c.status === 'pending' || c.status === 'accepted');
  }
  /** Re-own a held cell. Returns false when the expected holder no longer holds it. */
  private takeCell(cellId: string, expectedOwnerId: string, toPlayerId: string, now: number): boolean {
    const claim = this.claims.get(cellId);
    if (!claim || claim.ownerId !== expectedOwnerId) return false;
    this.claims.set(cellId, { ...claim, ownerId: toPlayerId, ownerName: null, ownerLevel: null, claimedAt: now });
    // The old purchase receipt still belongs to the old owner; it must not replay as a claim.
    for (const [key, id] of this.purchases) if (id === cellId) this.purchases.delete(key);
    return true;
  }

  async challenge(id: string): Promise<WorldChallenge | null> {
    const found = this.challenges.get(id);
    return found ? { ...found } : null;
  }

  async sendChallenge(input: { challengerId: string; cellId: string; requestId: string; now: number }): Promise<ChallengeSendResult> {
    const replayId = this.challengeRequests.get(`${input.challengerId}:${input.requestId}`);
    if (replayId) {
      const replay = this.challenges.get(replayId);
      if (replay) return { ok: true, challenge: { ...replay }, replayed: true };
    }
    const fail = (code: Extract<ChallengeSendResult, { ok: false }>['code']): ChallengeSendResult => ({ ok: false, code });
    if (!parseWorldCell(input.cellId)) return fail('INVALID_CELL');
    const target = this.claims.get(input.cellId);
    if (!target) return fail('NOT_OWNED');
    if (target.ownerId === input.challengerId) return fail('OWN_TILE');
    // The stake is a TILE, so the challenger must hold one. Their nearest own tile is chosen here,
    // deterministically, and persisted — no wallet is touched and no ledger row is written.
    const stakeCellId = stakedCellFor(input.challengerId, input.cellId, this.claims.values());
    if (stakeCellId === null) return fail('NO_TILE');
    const ownNeighbour = worldNeighbours(input.cellId)
      .some((id) => this.claims.get(id)?.ownerId === input.challengerId);
    if (!ownNeighbour) return fail('NOT_ADJACENT');
    if (this.openChallenges().some((c) => c.cellId === input.cellId)) return fail('CELL_BUSY');
    if (this.openChallenges().filter((c) => c.challengerId === input.challengerId).length >= WORLD_CHALLENGE_OPEN_LIMIT) return fail('TOO_MANY_OPEN');
    if (this.openChallenges().filter((c) => c.defenderId === target.ownerId).length >= WORLD_CHALLENGE_OPEN_LIMIT) return fail('DEFENDER_TOO_MANY');

    const id = newId();
    const challenge: WorldChallenge = {
      id,
      cellId: input.cellId,
      challengerId: input.challengerId,
      defenderId: target.ownerId,
      status: 'pending',
      stake: 0,
      stakeCellId,
      createdAt: input.now,
      expiresAt: input.now + WORLD_CHALLENGE_TTL_MS,
      respondedAt: null,
      matchId: null,
      winnerId: null,
      resolvedAt: null,
    };
    this.challenges.set(id, challenge);
    this.challengeRequests.set(`${input.challengerId}:${input.requestId}`, id);
    return { ok: true, challenge: { ...challenge }, replayed: false };
  }

  async respondChallenge(input: { id: string; defenderId: string; accept: boolean; matchId: string | null; now: number }): Promise<ChallengeRespondResult> {
    const challenge = this.challenges.get(input.id);
    if (!challenge || challenge.defenderId !== input.defenderId) return { ok: false, code: 'CHALLENGE_NOT_FOUND' };
    // A repeated answer is the original answer, not a second change.
    if (challenge.status === 'accepted' && input.accept) return { ok: true, challenge: { ...challenge }, replayed: true };
    if (challenge.status === 'declined' && !input.accept) return { ok: true, challenge: { ...challenge }, replayed: true };
    if (challenge.status !== 'pending') return { ok: false, code: 'CHALLENGE_CLOSED' };
    if (input.accept && !input.matchId) return { ok: false, code: 'CHALLENGE_CLOSED' };
    if (input.accept) {
      challenge.status = 'accepted';
      challenge.matchId = input.matchId;
      challenge.respondedAt = input.now;
    } else {
      challenge.status = 'declined';
      challenge.respondedAt = input.now;
      // Nothing is refunded for a tile-stake challenge: nothing was taken. Legacy Seed rows keep
      // their original refund so data from before 2026-10-29 still settles honestly.
      if (challenge.stakeCellId === null && challenge.stake > 0) {
        this.credit(challenge.challengerId, challenge.stake, `world-challenge:${challenge.id}:refund`, input.now);
      }
    }
    return { ok: true, challenge: { ...challenge }, replayed: false };
  }

  async settleChallenge(input: { id: string; playerId: string; winnerId: string | null; now: number }): Promise<ChallengeSettleResult> {
    const challenge = this.challenges.get(input.id);
    if (!challenge || (challenge.challengerId !== input.playerId && challenge.defenderId !== input.playerId)) {
      return { ok: false, code: 'CHALLENGE_NOT_FOUND' };
    }
    if (challenge.status === 'resolved') {
      // First-confirmed-wins: the second confirmation returns the stored result and touches nothing.
      return {
        ok: true, challenge: { ...challenge }, settled: false,
        winnerId: challenge.winnerId, cellId: challenge.cellId, replayed: true,
      };
    }
    if (challenge.status !== 'accepted') return { ok: false, code: 'CHALLENGE_CLOSED' };

    // THE WINNER TAKES THE LOSER'S TILE (owner, 2026-10-29), and exactly ONE tile moves:
    //   challenger wins → the contested tile (lost by the defender); the stake tile is kept.
    //   defender wins   → the challenger's stake tile (lost by the challenger); contested is kept.
    // A draw has no winner: nothing changes hands.
    if (input.winnerId === challenge.challengerId) {
      if (this.takeCell(challenge.cellId, challenge.defenderId, challenge.challengerId, input.now)) {
        this.revision += 1;
      }
    } else if (input.winnerId === challenge.defenderId) {
      if (challenge.stakeCellId !== null) {
        if (this.takeCell(challenge.stakeCellId, challenge.challengerId, challenge.defenderId, input.now)) {
          this.revision += 1;
        }
      } else if (challenge.stake > 0) {
        // Legacy Seed-stake row: its recorded stake is the only thing the defender can still take.
        this.credit(challenge.defenderId, challenge.stake, `world-challenge:${challenge.id}:payout`, input.now);
      }
    } else if (challenge.stakeCellId === null && challenge.stake > 0) {
      // Legacy draw: the historical escrow goes back; there is no winner and no tile transfer.
      this.credit(challenge.challengerId, challenge.stake, `world-challenge:${challenge.id}:refund`, input.now);
    }
    challenge.status = 'resolved';
    challenge.winnerId = input.winnerId;
    challenge.resolvedAt = input.now;
    return { ok: true, challenge: { ...challenge }, settled: true, winnerId: challenge.winnerId, cellId: challenge.cellId, replayed: false };
  }

  async challengesAwaitingSettlement(): Promise<WorldChallenge[]> {
    return [...this.challenges.values()]
      .filter((challenge) => challenge.status === 'accepted' && challenge.matchId !== null)
      .map((challenge) => ({ ...challenge }));
  }

  /**
   * The public dispute list: every OPEN challenge, for the whole map, in one pass. Mirrors the SQL
   * store exactly (same filter, same shape, same order), so the map draws the same layer whichever
   * backend is running.
   */
  async disputedCells(): Promise<WorldDispute[]> {
    return [...this.challenges.values()]
      .filter((challenge) => challenge.status === 'pending' || challenge.status === 'accepted')
      .sort((a, b) => (a.cellId < b.cellId ? -1 : a.cellId > b.cellId ? 1 : 0))
      .map((challenge) => ({
        cellId: challenge.cellId,
        challengerId: challenge.challengerId,
        defenderId: challenge.defenderId,
        live: challenge.status === 'accepted',
      }));
  }

  async challengesInvolving(playerId: string, since: number): Promise<WorldChallenge[]> {
    return [...this.challenges.values()]
      .filter((c) =>
        (c.challengerId === playerId && c.createdAt >= since) ||
        (c.defenderId === playerId && (c.status === 'pending' || c.status === 'accepted' || c.createdAt >= since)))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((c) => ({ ...c }));
  }

  async expireChallenges(now: number): Promise<number> {
    let changed = 0;
    for (const challenge of this.challenges.values()) {
      if (challenge.status === 'pending' && challenge.expiresAt <= now) {
        // The owner's decision: an unanswered challenge is a FORFEIT. The challenger takes the
        // contested tile; their own staked tile was never escrowed, so it simply stays theirs. The
        // defender is never debited. (A legacy Seed row still gets its recorded stake back.)
        if (this.takeCell(challenge.cellId, challenge.defenderId, challenge.challengerId, now)) this.revision += 1;
        challenge.status = 'expired';
        challenge.winnerId = challenge.challengerId;
        challenge.resolvedAt = now;
        if (challenge.stakeCellId === null && challenge.stake > 0) {
          this.credit(challenge.challengerId, challenge.stake, `world-challenge:${challenge.id}:payout`, now);
        }
        changed += 1;
      } else if (challenge.status === 'accepted' && challenge.respondedAt !== null &&
        challenge.respondedAt + WORLD_CHALLENGE_STALE_MS <= now) {
        // Never transfers: a linked duel that never resolved closes honestly and nothing moves.
        challenge.status = 'stale';
        challenge.resolvedAt = now;
        if (challenge.stakeCellId === null && challenge.stake > 0) {
          this.credit(challenge.challengerId, challenge.stake, `world-challenge:${challenge.id}:refund`, now);
        }
        changed += 1;
      }
    }
    return changed;
  }

  // ---- Owner edits from the admin dashboard ---------------------------------

  async adminAdjustSeeds(input: { playerId: string; delta: number; requestId: string; actorId: string; reason: string; now: number }): Promise<AdminSeedAdjustResult> {
    const wallet = this.current(input.playerId);
    const sourceKey = `admin:${input.requestId}`;
    if (this.ledger.some((e) => e.playerId === input.playerId && e.sourceKey === sourceKey)) {
      const prior = this.ledger.find((e) => e.playerId === input.playerId && e.sourceKey === sourceKey)!;
      return { ok: true, wallet: { ...wallet }, delta: prior.delta, replayed: true };
    }
    if (wallet.balance + input.delta < 0) return { ok: false, code: 'BELOW_ZERO', wallet: { ...wallet } };
    // Lifetime counters are untouched: they describe what play earned and spent, and an owner's
    // test grant is neither. The ledger category is what makes the grant visible on its own.
    wallet.balance += input.delta;
    this.ledger.push({ id: newId(), playerId: input.playerId, delta: input.delta, category: 'admin_adjust', sourceKey, balanceAfter: wallet.balance, createdAt: input.now });
    return { ok: true, wallet: { ...wallet }, delta: input.delta, replayed: false };
  }

  async adminSetCell(input: { cellId: string; ownerId: string | null; now: number }): Promise<AdminCellResult> {
    if (!parseWorldCell(input.cellId)) return { ok: false, code: 'INVALID_CELL' };
    const previousOwnerId = this.claims.get(input.cellId)?.ownerId ?? null;
    if (previousOwnerId === input.ownerId) {
      return { ok: true, cellId: input.cellId, previousOwnerId, ownerId: input.ownerId, changed: false, revision: this.revision, challengesClosed: 0 };
    }
    // An open challenge on this cell — as the contested ground OR as the challenger's stake — would
    // otherwise settle against a tile that moved under it. Close it as stale and hand back only a
    // legacy Seed escrow, exactly as the 7-day close does. Nothing changes hands.
    let challengesClosed = 0;
    for (const challenge of this.openChallenges()) {
      if (challenge.cellId !== input.cellId && challenge.stakeCellId !== input.cellId) continue;
      challenge.status = 'stale';
      challenge.resolvedAt = input.now;
      if (challenge.stakeCellId === null && challenge.stake > 0) {
        this.credit(challenge.challengerId, challenge.stake, `world-challenge:${challenge.id}:refund`, input.now);
      }
      challengesClosed += 1;
    }
    for (const [key, id] of this.purchases) if (id === input.cellId) this.purchases.delete(key);
    if (input.ownerId === null) this.claims.delete(input.cellId);
    else this.claims.set(input.cellId, { cellId: input.cellId, ownerId: input.ownerId, ownerName: null, ownerLevel: null, claimedAt: input.now });
    this.revision += 1;
    return { ok: true, cellId: input.cellId, previousOwnerId, ownerId: input.ownerId, changed: true, revision: this.revision, challengesClosed };
  }
}
