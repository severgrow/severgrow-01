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
  /**
   * The owner's CHOSEN palette slot (`src/tile-colours.ts`), or null when they have never chosen one
   * — in which case their colour is derived from their id and nothing is written. Kept as an id, not
   * a colour string, so the map and the picker can never disagree; the service resolves it.
   */
  colourId: number | null;
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
  /** Only for a server-verified Territory achievement (receipt `achievement:<id>`): its fixed amount. */
  achievementSeeds?: number;
};
export type RewardResult = { awarded: number; reason: string | null; wallet: SeedWallet; replayed: boolean };
export type ClaimResult =
  | { ok: true; cellId: string; revision: number; wallet: SeedWallet; replayed: boolean }
  | { ok: false; code: 'NO_FUNDS' | 'OCCUPIED' | 'NOT_ADJACENT' | 'INVALID_CELL'; revision: number; wallet: SeedWallet };
/** Selling a tile back (owner, 2026-10-27): the tile price returns, the tile is free again. */
export type SellResult =
  | { ok: true; cellId: string; revision: number; wallet: SeedWallet; replayed: boolean }
  | { ok: false; code: 'NOT_OWNED' | 'CELL_BUSY' | 'INVALID_CELL'; revision: number; wallet: SeedWallet };
export type TrainingTicket = { id: string; playerId: string; seed: number; botLevel: number; createdAt: number; expiresAt: number; usedAt: number | null };

/**
 * Territory challenges — FREE to send since owner direction 2026-10-29: "make challenging free ...
 * challenging is like putting your tile at stake". Each side now risks a TILE, never Seeds:
 *
 *   - the challenger stakes one of their OWN tiles (auto-chosen, `stakeCellId`);
 *   - the defender risks the CONTESTED tile (unchanged);
 *   - the winner takes the LOSER's tile, and nobody's wallet moves.
 *
 * `status` mirrors the design doc:
 *   pending   the defender has 24 h to answer; the challenger's own tile is at stake
 *   accepted  a linked `kind = 'territory'` duel exists; it settles itself when the duel finishes
 *   declined  the defender refused; nothing changes hands
 *   expired   the 24 h window passed unanswered; the challenger takes the contested tile by forfeit
 *   resolved  a played duel settled it; the winner took the loser's tile
 *   stale     accepted but not settled within 7 days; nothing transfers
 *
 * `stake` is KEPT for history: rows created before 2026-10-29 escrowed 50 Seeds and may still settle
 * under their original rule (`stakeCellId === null && stake > 0`). Every NEW row is created with
 * `stake = 0`; the tile stake is `stakeCellId`.
 */
export type WorldChallengeStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'resolved' | 'stale';

export type WorldChallenge = {
  id: string;
  cellId: string;
  challengerId: string;
  defenderId: string;
  status: WorldChallengeStatus;
  /** Historical escrow (50 before 2026-10-29). New rows are 0: a challenge costs no Seeds. */
  stake: number;
  /** The challenger's own tile put at risk. Null for legacy Seed-stake rows and for a missing stake. */
  stakeCellId: string | null;
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
  /** The challenger holds no tile to put at stake (a challenge is never paid in Seeds). */
  | 'NO_TILE'
  | 'CELL_BUSY'
  | 'TOO_MANY_OPEN'
  | 'DEFENDER_TOO_MANY';

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
  /** Historical Seeds escrow (0 for every challenge created since 2026-10-29). */
  stake: number;
  /** The challenger's own tile at risk. Null on legacy Seed-stake rows. */
  stakeCellId: string | null;
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

/**
 * A TILE UNDER DISPUTE, as the PUBLIC map shows it (owner, 2026-10-29: "have that icon on EVERY
 * players tile that is in duel challenge right now, but also, other people challenges").
 *
 * The map is a public read, and a claim has always published its owner's id and display name, so a
 * dispute adds no privacy beyond what the map already shows — as long as it carries ONLY the two
 * ids and the phase. It must never carry the stake, the stake cell, the match id, a request key or
 * anything from a wallet; `server/tests/territory-disputes.test.ts` pins the exact key set and
 * checks the whole `/v1/world` body for those values.
 *
 * `cellId` is the contested ground. Exactly one open dispute per cell exists (the partial unique
 * index `world_challenges_one_open_idx`), so this list is one entry per disputed tile.
 */
export type WorldDispute = {
  cellId: string;
  challengerId: string;
  defenderId: string;
  /** true = the defender accepted and the linked duel is live; false = still waiting for an answer. */
  live: boolean;
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
  /** This player's recorded receipt keys that start with `prefix` (e.g. `achievement:`); own id only. */
  receiptKeys(playerId: string, prefix: string): Promise<string[]>;
  world(): Promise<WorldSnapshot>;
  /**
   * The player's stored palette choice, or null when they have none. A READ: it never writes the
   * derived default, so "no choice" stays "no row" and the map's colours do not depend on who read
   * them first.
   */
  colourChoice(playerId: string): Promise<number | null>;
  /** Persist a palette choice (`src/tile-colours.ts`). Idempotent: the same id twice is one write. */
  setColourChoice(playerId: string, colourId: number, now: number): Promise<void>;
  claim(playerId: string, cellId: string, requestId: string, now: number): Promise<ClaimResult>;
  /** Sell one of the player's own tiles back for `SEED_ECONOMY.tileSaleReturn`; idempotent by request. */
  sell(playerId: string, cellId: string, requestId: string, now: number): Promise<SellResult>;
  settle(input: RewardInput): Promise<RewardResult>;
  acknowledgeInvitation(playerId: string): Promise<void>;
  issueTrainingTicket(ticket: TrainingTicket): Promise<void>;
  trainingTicket(id: string): Promise<TrainingTicket | null>;

  // ---- Territory challenges -------------------------------------------------
  /** One challenge by id (unlocked read; a transition re-reads it under its row lock). */
  challenge(id: string): Promise<WorldChallenge | null>;
  /**
   * Send: picks the challenger's own tile nearest the contested one, then inserts the challenge in
   * ONE transaction. Challenging is FREE (no wallet debit, no ledger row).
   */
  sendChallenge(input: { challengerId: string; cellId: string; requestId: string; now: number }): Promise<ChallengeSendResult>;
  /** Accept (with the linked match id) or decline. Nothing is refunded: no Seeds were ever taken. */
  respondChallenge(input: { id: string; defenderId: string; accept: boolean; matchId: string | null; now: number }): Promise<ChallengeRespondResult>;
  /** First-confirmed-wins settlement. Only the first call moves a tile; later calls replay it. */
  settleChallenge(input: { id: string; playerId: string; winnerId: string | null; now: number }): Promise<ChallengeSettleResult>;
  /** Rows involving this player: open incoming plus recent outgoing. */
  challengesInvolving(playerId: string, since: number): Promise<WorldChallenge[]>;
  /**
   * THE PUBLIC DISPUTE LIST, for the whole map in ONE read (never one query per cell). Open rows
   * only — `pending` and `accepted`, because a running duel has not settled anything yet — in the
   * minimal public shape (`WorldDispute`). Read on every `/v1/world` poll, so it must stay cheap.
   */
  disputedCells(): Promise<WorldDispute[]>;
  /**
   * Accepted challenges whose linked duel may have finished. The service reads them to settle
   * LAZILY on any world/challenge read: the same idiom as `expireChallenges`, and the reason a
   * player never has to press CONFIRM / TAKE THE GROUND.
   */
  challengesAwaitingSettlement(): Promise<WorldChallenge[]>;
  /** Apply due forfeits (24 h) and stale closes (7 d), and settle finished duels. Returns rows changed. */
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
