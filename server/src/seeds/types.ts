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
  /** Only for the server-verified final lesson (level 10): paid once, a fixed amount. */
  lessonLevel?: number;
  /** Server-issued before a rewarded Training match starts. */
  trainingTicketId?: string;
  /** Only for a server-verified Daily Puzzle solve (receipt `daily:<no>`): pays exactly one tile. */
  dailyPuzzle?: number;
};
export type RewardResult = { awarded: number; reason: string | null; wallet: SeedWallet; replayed: boolean };
export type ClaimResult =
  | { ok: true; cellId: string; revision: number; wallet: SeedWallet; replayed: boolean }
  | { ok: false; code: 'NO_FUNDS' | 'OCCUPIED' | 'NOT_ADJACENT' | 'INVALID_CELL'; revision: number; wallet: SeedWallet };
export type TrainingTicket = { id: string; playerId: string; seed: number; botLevel: number; createdAt: number; expiresAt: number; usedAt: number | null };

/**
 * Territory challenges — one paid tile may change hands when a linked duel finishes.
 *
 * `status` mirrors the design doc exactly:
 *   pending   the defender has 24 h to answer (the challenger's stake is escrowed)
 *   accepted  a linked `kind = 'territory'` duel exists; the first confirm settles it
 *   declined  the defender refused; the stake is refunded
 *   expired   the 24 h window passed unanswered; the challenger takes the tile by forfeit
 *   resolved  a played duel settled it; the winner took the tile and the stake
 *   stale     accepted but not settled within 7 days; the stake is refunded, nothing transfers
 */
export type WorldChallengeStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'resolved' | 'stale';

export type WorldChallenge = {
  id: string;
  cellId: string;
  challengerId: string;
  defenderId: string;
  status: WorldChallengeStatus;
  stake: number;
  createdAt: number;
  expiresAt: number;
  respondedAt: number | null;
  matchId: string | null;
  winnerId: string | null;
  resolvedAt: number | null;
};

export type ChallengeSendFailure =
  | 'INVALID_CELL'
  | 'NOT_OWNED'
  | 'OWN_TILE'
  | 'NOT_ADJACENT'
  | 'CELL_BUSY'
  | 'TOO_MANY_OPEN'
  | 'DEFENDER_TOO_MANY'
  | 'NO_FUNDS';

export type ChallengeSendResult =
  | { ok: true; challenge: WorldChallenge; replayed: boolean }
  | { ok: false; code: ChallengeSendFailure };

export type ChallengeRespondResult =
  | { ok: true; challenge: WorldChallenge; replayed: boolean }
  | { ok: false; code: 'CHALLENGE_NOT_FOUND' | 'CHALLENGE_CLOSED' };

export type ChallengeSettleResult =
  | {
      ok: true;
      challenge: WorldChallenge;
      /** True only for the confirmation that actually applied the settlement. */
      settled: boolean;
      winnerId: string | null;
      cellId: string;
      replayed: boolean;
    }
  | { ok: false; code: 'CHALLENGE_NOT_FOUND' | 'CHALLENGE_CLOSED' | 'NOT_PARTICIPANT' };

/** The challenge as one participant sees it. Names only; no balance, no email, no token. */
export type WorldChallengeWire = {
  id: string;
  cellId: string;
  challengerId: string;
  defenderId: string;
  challengerName: string | null;
  defenderName: string | null;
  fromMe: boolean;
  status: WorldChallengeStatus;
  stake: number;
  createdAt: number;
  expiresAt: number;
  respondedAt: number | null;
  matchId: string | null;
  /** True once the linked duel is over: the signal that `confirm` may be used. */
  matchFinished: boolean;
  /**
   * The finished duel's winner, before settlement (null for a draw or a running match). It lets the
   * confirmation sheet say who actually won without exposing anything about the board.
   */
  matchWinnerId: string | null;
  winnerId: string | null;
  resolvedAt: number | null;
  /** Pending only: milliseconds left on the 24 h answer timer (never negative). */
  remainingMs: number;
  serverNow: number;
};

export type WorldChallengesPayload = {
  incoming: WorldChallengeWire[];
  outgoing: WorldChallengeWire[];
  serverNow: number;
};

export interface WorldEconomyStore {
  wallet(playerId: string): Promise<SeedWallet>;
  /**
   * The furthest Campaign level this player has a verified first-clear receipt for, read from the
   * recorded `campaign:c<chapter>-<level>` keys; null when they have never cleared one. This is the
   * account's place: no campaign table exists, and a paid clear is a verified win. Only the player's
   * own id is accepted — callers pass the authenticated player, never one from the request.
   */
  campaignHighestLevel(playerId: string): Promise<number | null>;
  world(): Promise<WorldSnapshot>;
  claim(playerId: string, cellId: string, requestId: string, now: number): Promise<ClaimResult>;
  settle(input: RewardInput): Promise<RewardResult>;
  acknowledgeInvitation(playerId: string): Promise<void>;
  issueTrainingTicket(ticket: TrainingTicket): Promise<void>;
  trainingTicket(id: string): Promise<TrainingTicket | null>;

  // ---- Territory challenges -------------------------------------------------
  /** One challenge by id (unlocked read; a transition re-reads it under its row lock). */
  challenge(id: string): Promise<WorldChallenge | null>;
  /** Send: locks the wallet, inserts the escrow and the challenge in ONE transaction. */
  sendChallenge(input: { challengerId: string; cellId: string; requestId: string; stake: number; now: number }): Promise<ChallengeSendResult>;
  /** Accept (with the linked match id) or decline. Decline refunds in the same transaction. */
  respondChallenge(input: { id: string; defenderId: string; accept: boolean; matchId: string | null; now: number }): Promise<ChallengeRespondResult>;
  /** First-confirmed-wins settlement. Only the first call transfers; later calls replay it. */
  settleChallenge(input: { id: string; playerId: string; winnerId: string | null; now: number }): Promise<ChallengeSettleResult>;
  /** Rows involving this player: open incoming plus recent outgoing. */
  challengesInvolving(playerId: string, since: number): Promise<WorldChallenge[]>;
  /** Apply due forfeits (24 h) and stale closes (7 d). Returns how many rows changed. */
  expireChallenges(now: number): Promise<number>;

  // ---- Owner edits from the admin dashboard (docs/ADMIN.md §3a) -------------
  /** Add or remove Seeds as ONE `admin_adjust` ledger row. Never below zero; a repeated request id replays. */
  adminAdjustSeeds(input: { playerId: string; delta: number; requestId: string; actorId: string; reason: string; now: number }): Promise<AdminSeedAdjustResult>;
  /** Give a cell to a player, or clear it (`ownerId: null`). Open challenges on it are closed and refunded first. */
  adminSetCell(input: { cellId: string; ownerId: string | null; now: number }): Promise<AdminCellResult>;
}

export type AdminSeedAdjustResult =
  | { ok: true; wallet: SeedWallet; delta: number; replayed: boolean }
  | { ok: false; code: 'BELOW_ZERO'; wallet: SeedWallet };

export type AdminCellResult =
  | { ok: true; cellId: string; previousOwnerId: string | null; ownerId: string | null; changed: boolean; revision: number; challengesClosed: number }
  | { ok: false; code: 'INVALID_CELL' };

/** The largest single adjustment the dashboard accepts, either way. A typo is not a million Seeds. */
export const ADMIN_SEED_ADJUST_MAX = 1_000_000;

export const emptyWallet = (): SeedWallet => ({ balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: false });
