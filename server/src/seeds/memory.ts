import { SEED_ECONOMY, utcDay } from './config.js';
import { planSeedReward } from './rewards.js';
import type { ClaimResult, RewardInput, RewardResult, SeedWallet, TrainingTicket, WorldClaim, WorldEconomyStore, WorldSnapshot } from './types.js';
import { emptyWallet } from './types.js';
import { WORLD_CELL_IDS, worldNeighbours } from '../world.js';

type Receipt = { input: RewardInput; awarded: number; reason: string | null };

/** Synchronous critical sections under Node's event loop; the Postgres store uses row locks. */
export class MemoryWorldEconomyStore implements WorldEconomyStore {
  readonly claims = new Map<string, WorldClaim>();
  readonly receipts = new Map<string, Receipt>();
  readonly ledger: { playerId: string; delta: number; sourceKey: string; balanceAfter: number }[] = [];
  readonly tickets = new Map<string, TrainingTicket>();
  readonly purchases = new Map<string, string>();
  readonly wallets = new Map<string, SeedWallet>();
  revision = 0;

  private current(playerId: string): SeedWallet {
    let wallet = this.wallets.get(playerId);
    if (!wallet) { wallet = emptyWallet(); this.wallets.set(playerId, wallet); }
    return wallet;
  }
  async wallet(playerId: string): Promise<SeedWallet> { return { ...this.current(playerId) }; }
  async world(): Promise<WorldSnapshot> {
    return { revision: this.revision, claims: [...this.claims.values()].map((v) => ({ ...v })) };
  }
  async claim(playerId: string, cellId: string, requestId: string, now: number): Promise<ClaimResult> {
    const wallet = this.current(playerId);
    const previous = this.purchases.get(`${playerId}:${requestId}`);
    if (previous) return { ok: true, cellId: previous, revision: this.revision, wallet: { ...wallet }, replayed: true };
    const fail = (code: 'NO_FUNDS' | 'OCCUPIED' | 'NOT_ADJACENT' | 'INVALID_CELL'): ClaimResult =>
      ({ ok: false, code, revision: this.revision, wallet: { ...wallet } });
    if (!WORLD_CELL_IDS.has(cellId)) return fail('INVALID_CELL');
    if (this.claims.has(cellId)) return fail('OCCUPIED');
    const own = [...this.claims.values()].filter((claim) => claim.ownerId === playerId);
    if (own.length && !worldNeighbours(cellId).some((id) => this.claims.get(id)?.ownerId === playerId)) return fail('NOT_ADJACENT');
    if (wallet.balance < SEED_ECONOMY.tileCost) return fail('NO_FUNDS');
    wallet.balance -= SEED_ECONOMY.tileCost;
    wallet.lifetimeSpent += SEED_ECONOMY.tileCost;
    this.ledger.push({ playerId, delta: -SEED_ECONOMY.tileCost, sourceKey: `world:${requestId}`, balanceAfter: wallet.balance });
    this.claims.set(cellId, { cellId, ownerId: playerId, ownerName: null, claimedAt: now });
    this.purchases.set(`${playerId}:${requestId}`, cellId);
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
      this.ledger.push({ playerId: input.playerId, delta: decision.amount, sourceKey: input.sourceKey, balanceAfter: wallet.balance });
    }
    return { awarded: decision.amount, reason: decision.reason, wallet: { ...wallet }, replayed: false };
  }
  async acknowledgeInvitation(playerId: string): Promise<void> { this.current(playerId).worldInvitationSeen = true; }
  async issueTrainingTicket(ticket: TrainingTicket): Promise<void> { this.tickets.set(ticket.id, { ...ticket }); }
  async trainingTicket(id: string): Promise<TrainingTicket | null> { return this.tickets.get(id) ?? null; }
}
