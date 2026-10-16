export type SeedWallet = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  worldInvitationSeen: boolean;
};
export type WorldClaim = {
  cellId: string;
  ownerId: string;
  ownerName: string | null;
  /**
   * The owner's highest settled Campaign level, read from their recorded receipts, or `null` when
   * they have none. A level id is an OPAQUE STRING here: the ordinal is parsed out of the recorded
   * `campaign:c<chapter>-<level>` key, never looked up in the campaign tables (docs/ADMIN.md, and
   * the guard in tests/campaign/isolation.test.ts). `null` rather than `1` so a player who never
   * played the campaign is not shown a level they did not reach.
   */
  ownerLevel: number | null;
  claimedAt: number;
};
export type WorldSnapshot = { revision: number; claims: WorldClaim[] };
export type RewardMode = 'queue' | 'friend' | 'training' | 'campaign';
export type RewardInput = {
  playerId: string;
  sourceKey: string;
  mode: RewardMode;
  outcome: 'win' | 'loss' | 'draw';
  opponentId: string | null;
  now: number;
  /** Only for server-verified campaign first clear. */
  campaignLevel?: number;
  /** Server-issued before a rewarded Training match starts. */
  trainingTicketId?: string;
};
export type RewardResult = { awarded: number; reason: string | null; wallet: SeedWallet; replayed: boolean };
export type ClaimResult =
  | { ok: true; cellId: string; revision: number; wallet: SeedWallet; replayed: boolean }
  | { ok: false; code: 'NO_FUNDS' | 'OCCUPIED' | 'NOT_ADJACENT' | 'INVALID_CELL'; revision: number; wallet: SeedWallet };
export type TrainingTicket = { id: string; playerId: string; seed: number; botLevel: number; createdAt: number; expiresAt: number; usedAt: number | null };

export interface WorldEconomyStore {
  wallet(playerId: string): Promise<SeedWallet>;
  world(): Promise<WorldSnapshot>;
  claim(playerId: string, cellId: string, requestId: string, now: number): Promise<ClaimResult>;
  settle(input: RewardInput): Promise<RewardResult>;
  acknowledgeInvitation(playerId: string): Promise<void>;
  issueTrainingTicket(ticket: TrainingTicket): Promise<void>;
  trainingTicket(id: string): Promise<TrainingTicket | null>;
}

export const emptyWallet = (): SeedWallet => ({ balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: false });
