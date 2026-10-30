import type { Action } from '../../../src/engine/index.js';
import { allNeighbors, coordKey, CURRENT_RULES_VERSION, homeCoord, matchSetup, stateFromSetup } from '../../../src/engine/index.js';
import { campaignLevelById } from '../../../src/campaign/index.js';
import { CURRENT_BOT_VERSION } from '../../../src/bots/versions.js';
import { playerTag } from '../../../src/player-tag.js';
import { ApiError } from '../errors.js';
import { newId, newInviteCode, newSeed } from '../ids.js';
import type { MatchRecord, PlayerRecord, Storage } from '../storage/types.js';
import { WORLD_VERSION, seenWorld } from '../world.js';
import { colourById, colourChangeAvailableAt, colourCooldownMs, colourIdFor, isColourId, resolveTileColours } from '../../../src/tile-colours.js';
import { SEED_ECONOMY, WORLD_CHALLENGE_LIST_WINDOW_MS } from './config.js';
import type {
  ChallengeSendFailure,
  WorldChallenge,
  WorldChallengeWire,
  WorldChallengesPayload,
  WorldEconomyStore,
} from './types.js';
import { verifyCampaignProof, verifyLessonProof, verifyTrainingProof } from './verify.js';
import { achievementById, achievementFacts, achievementSourceKey, achievementViews } from './achievements.js';
import type { AchievementHistory, AchievementView, ChallengeView, DuelView } from './achievements.js';
import { FINAL_LESSON } from '../../../web/src/lessons/final.js';
import { DailyTurnError, goalMet, playTurn } from '../../../src/daily/core.js';
import { puzzleNoOn } from '../../../src/daily/calendar.js';
import { dailyPuzzle } from '../../../src/daily/puzzles.js';
import { DAILY_EPOCH } from '../../../src/daily/schedule.js';

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
    // challenge list. The same lazy idiom settles a FINISHED linked duel: the map read is one of the
    // two places a player always passes through, so the winner gets the tile without pressing
    // CONFIRM / TAKE THE GROUND. Failures never break the map (the daily `/v1/sweep` path still
    // applies both), because a read must not fail on housekeeping.
    await this.settleFinished(this.now()).catch(() => 0);
    await this.store.expireChallenges(this.now()).catch(() => 0);
    const snapshot = await this.store.world();
    // THE PUBLIC DISPUTE LIST (owner, 2026-10-29). Read AFTER the two lazy closes above, so a row
    // that just expired or settled never marks the tile it no longer contests. A mark is
    // decoration: if this read fails (an unmigrated table, a replica blip) the map must still
    // answer, exactly like the two housekeeping calls above.
    const disputes = await this.store.disputedCells().catch(() => []);
    // THE COLOURS (owner, 2026-10-30). Each owner's stored choice (or the palette default derived
    // from their id) is resolved ACROSS THE WHOLE MAP first, so no two adjacent tiles of different
    // owners can wear the same colour — see `resolveTileColours`. Done here, in the service, so the
    // memory and Postgres backends answer identically by construction.
    const colours = resolveTileColours(snapshot.claims.map((claim) => ({
      cellId: claim.cellId, ownerId: claim.ownerId, claimedAt: claim.claimedAt, chosen: claim.colourId,
    })));
    return {
      // The SEEN map: the v2 coast plus two rings around every tile (server/src/world.ts).
      version: WORLD_VERSION, revision: snapshot.revision, cells: seenWorld(snapshot.claims.map((c) => c.cellId)),
      claims: snapshot.claims.map((claim) => ({
        cellId: claim.cellId, ownerId: claim.ownerId, ownerName: claim.ownerName,
        // Only a level NUMBER crosses the wire: no id, no email, no progress detail. `null` when the
        // owner has no recorded campaign receipts, so the pane shows nothing rather than "LEVEL 1".
        ownerLevel: claim.ownerLevel,
        ownerTag: playerTag(claim.ownerId),
        colour: colourById(colours.get(claim.cellId) ?? colourIdFor(claim.ownerId, claim.colourId)).css,
        claimedAt: claim.claimedAt,
      })),
      cost: SEED_ECONOMY.tileCost,
      /**
       * Historical shape kept for older clients: 0 since 2026-10-29, because a challenge costs no
       * Seeds at all. The client never prints a price from here any more; the stake it names is the
       * TILE the challenger puts up (`stakeCellId` on each challenge).
       */
      challengeStake: 0,
      /** Tiles under an open challenge, for everybody's map. Public shape only (`WorldDispute`). */
      disputes,
    };
  }

  wallet(player: PlayerRecord) { return this.store.wallet(player.id); }

  /**
   * THE PLAYER'S COLOUR (owner, 2026-10-30). Reading never writes: with no stored choice the answer
   * is derived from the player id, which is the same derivation the public map uses, so the picker
   * can mark the current swatch before the player ever chooses.
   *
   * The 24 h state rides this read so the picker can say "changes again in 19 h" BEFORE a press
   * (owner, 2026-10-30: "only once per 24h"). `canChange` is the server's own answer, not a client
   * timer: a client clock that is wrong cannot unlock the picker.
   */
  async colour(player: PlayerRecord) {
    const chosen = await this.store.colourChoice(player.id);
    return this.colourState(player, chosen);
  }

  /** The wire shape of a colour, with the 24 h rule applied to the stored row (if any). */
  private colourState(
    player: PlayerRecord,
    chosen: { colourId: number; chosenAt: number } | null,
  ) {
    const id = colourIdFor(player.id, chosen?.colourId ?? null);
    const now = this.now();
    const remainingMs = colourCooldownMs(chosen?.chosenAt ?? null, now);
    return {
      colourId: id,
      colour: colourById(id).css,
      name: colourById(id).name,
      chosen: chosen !== null,
      canChange: remainingMs === 0,
      changeAvailableAt: colourChangeAvailableAt(chosen?.chosenAt ?? null),
      remainingMs,
    };
  }

  /**
   * Save a choice. It is a preference, not a game action: no Seeds, no revision bump (the map's
   * ownership did not change), one row per player.
   *
   * ONE CHANGE PER 24 HOURS, SERVER-SIDE (owner, 2026-10-30). The row's `chosen_at` is the clock;
   * this method is the only writer, so no client can bypass the rule by posting again. Choosing the
   * colour you already have is not a change: it succeeds without touching the clock, so a double tap
   * or a retry can never cost the player their day.
   */
  async chooseColour(player: PlayerRecord, colourId: unknown) {
    if (!isColourId(colourId)) throw new ApiError('INVALID_REQUEST', 'Choose one of the tile colours.');
    const now = this.now();
    const current = await this.store.colourChoice(player.id);
    if (current && current.colourId === colourId) return this.colourState(player, current);
    const remainingMs = colourCooldownMs(current?.chosenAt ?? null, now);
    if (remainingMs > 0) {
      const hours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
      throw new ApiError('COLOUR_COOLDOWN', `You can change your colour again in ${hours} h.`);
    }
    const bucket = Math.floor(now / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:colour:${player.id}`, bucket, 60)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before changing colour again.');
    }
    try {
      await this.store.setColourChoice(player.id, colourId, now);
    } catch (error) {
      // The table lives in migration 0020. Refuse honestly rather than pretend it saved.
      if ((error as { code?: unknown } | null)?.code === 'COLOUR_MIGRATION_PENDING') {
        throw new ApiError('COLOUR_MIGRATION_PENDING', 'Colours are being updated. Try again shortly.');
      }
      throw error;
    }
    return this.colourState(player, { colourId, chosenAt: now });
  }

  /**
   * The signed-in account's place (owner report, 2026-10-25). Takes the AUTHENTICATED player, never
   * an id from the request, so one account can only ever read its own progress.
   */
  campaignHighestLevel(player: PlayerRecord) { return this.store.campaignHighestLevel(player.id); }

  async claim(player: PlayerRecord, cellId: string, requestId: string) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new ApiError('INVALID_REQUEST', 'A claim request ID is required.');
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:claim:${player.id}`, bucket, 120)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before claiming again.');
    }
    const result = await this.store.claim(player.id, cellId, requestId, this.now());
    return result;
  }

  /** Sell one of your own tiles back for its price (owner, 2026-10-27). */
  async sell(player: PlayerRecord, cellId: string, requestId: string) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new ApiError('INVALID_REQUEST', 'A sale request ID is required.');
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:sell:${player.id}`, bucket, 120)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before selling again.');
    }
    return this.store.sell(player.id, cellId, requestId, this.now());
  }

  async acknowledge(player: PlayerRecord): Promise<void> { await this.store.acknowledgeInvitation(player.id); }

  // ---- Achievements (server/src/seeds/achievements.ts) ------------------------------------------

  /**
   * The player's achievements: progress from the map, their own challenge rows, their finished
   * duels, and their campaign receipts/clears, plus which are paid. Every number comes from a
   * server-owned table; the request supplies only the authenticated player.
   */
  async achievements(player: PlayerRecord): Promise<AchievementView[]> {
    const [history, keys] = await Promise.all([
      this.achievementHistory(player),
      this.store.receiptKeys(player.id, 'achievement:'),
    ]);
    return achievementViews(achievementFacts(history), new Set(keys));
  }

  /** Assemble the one history the pure matcher reads. Reads only `FACTS_SOURCES`. */
  private async achievementHistory(player: PlayerRecord): Promise<AchievementHistory> {
    const [snapshot, challenges, receipts, clears, rows] = await Promise.all([
      this.store.world(),
      this.store.challengesInvolving(player.id, 0),
      this.store.receiptRows(player.id),
      this.store.campaignClears(player.id),
      this.matches.listMatchesForPlayer(player.id),
    ]);

    let highestLevel: number | null = null;
    let lessonCleared = false;
    for (const receipt of receipts) {
      const match = /^campaign:c\d+-(\d+)$/.exec(receipt.sourceKey);
      const level = match ? Number(match[1]) : receipt.sourceKey === `lesson:${FINAL_LESSON.level}` ? FINAL_LESSON.level : null;
      if (level === null) continue;
      if (receipt.sourceKey === `lesson:${FINAL_LESSON.level}`) lessonCleared = true;
      if (highestLevel === null || level > highestLevel) highestLevel = level;
    }

    const duels: DuelView[] = [];
    for (const row of rows) {
      const match = row.match;
      if (match.status !== 'finished' || !match.result) continue;
      const moves = await this.matches.movesOf(match.id, 0);
      let myCuts = 0;
      let myBlooms = 0;
      let myOtherGrows = 0;
      let throwDraws = 0;
      let megaBomb = false;
      for (const move of moves) {
        // A cut is recorded against the player who LOST the tiles, whoever moved; so every move's
        // events are inspected, not only this player's.
        for (const event of move.events) {
          if (event.t === 'Sever' && event.player === row.mySeat) myCuts += 1;
        }
        if (move.seat !== row.mySeat) {
          if (move.action.t === 'Draw' && move.action.from === 'discard') throwDraws += 1;
          continue;
        }
        if (move.action.t === 'Draw' && move.action.from === 'discard') throwDraws += 1;
        if (move.action.t === 'Bloom') myBlooms += 1;
        else if (move.action.t === 'Sprout' || move.action.t === 'PlayFruit' || move.action.t === 'MegaBomb') myOtherGrows += 1;
        if (move.action.t === 'MegaBomb') megaBomb = true;
      }
      // The root's six sides, from the final authoritative board: every one held by the opponent.
      const root = homeCoord(row.mySeat, match.config);
      const home = match.state.board[coordKey(root)];
      const rootSurrounded = !!home?.root && home.owner === row.mySeat &&
        allNeighbors(root).every((side) => {
          const tile = match.state.board[coordKey(side)];
          return !!tile && tile.owner !== row.mySeat;
        });
      duels.push({
        opponentId: row.opponentId,
        kind: match.kind ?? 'duel',
        openQueue: match.openQueue,
        live: match.liveManaged === true,
        finishedAt: match.finishedAt ?? match.updatedAt,
        won: match.result.winner !== null && match.result.winner === row.mySeat,
        draw: match.result.winner === null,
        undercut: match.result.undercut === true,
        reason: match.result.reason,
        myCuts,
        myBlooms,
        myOtherGrows,
        throwDraws,
        megaBomb,
        rootSurrounded,
        creator: row.mySeat === 0 && !match.openQueue && (match.kind ?? 'duel') === 'duel',
      });
    }

    const opponentLevels: Record<string, number | null> = {};
    await Promise.all([...new Set(duels.map((d) => d.opponentId).filter((id): id is string => id !== null))]
      .map(async (id) => {
        opponentLevels[id] = await this.store.campaignHighestLevel(id).catch(() => null);
      }));

    return {
      playerId: player.id,
      claims: snapshot.claims,
      challenges: challenges as ChallengeView[],
      duels,
      campaign: {
        highestLevel,
        chaptersCleared: highestLevel === null ? 0 : Math.min(7, Math.floor(highestLevel / 10)),
        lessonCleared,
        clears,
      },
      opponentLevels,
    };
  }

  /**
   * Record the shape of a verified Campaign clear (migration 0021). Best-effort: an unmigrated
   * database answers with a quiet no-op, and a failure here never turns a paid win into an error.
   */
  private async recordClear(player: PlayerRecord, levelKey: string, levelNumber: number, verified: ReturnType<typeof verifyCampaignProof>): Promise<void> {
    if (!verified) return;
    await this.store.recordCampaignClear(player.id, {
      levelKey,
      levelNumber,
      turns: verified.turns,
      throwDraws: verified.human.throwDraws,
      blooms: verified.human.blooms,
      grows: verified.human.grows,
      finishedAt: this.now(),
    }).catch(() => undefined);
  }

  /**
   * CLAIM one. Re-verified here from stored facts (never from the request), then paid through the
   * ordinary settlement under `achievement:<id>`: one receipt per player, so a retry replays it.
   */
  async claimAchievement(player: PlayerRecord, id: string) {
    const def = achievementById(id);
    if (!def) throw new ApiError('INVALID_REQUEST', 'Unknown achievement.');
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:achievement:${player.id}`, bucket, 120)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait a moment.');
    }
    const view = (await this.achievements(player)).find((a) => a.id === def.id)!;
    if (!view.done && !view.claimed) return { ok: false as const, code: 'NOT_EARNED' as const };
    const reward = await this.store.settle({
      playerId: player.id, sourceKey: achievementSourceKey(def.id), mode: 'campaign', outcome: 'win',
      opponentId: null, now: this.now(), achievementSeeds: def.seeds,
    });
    return { ok: true as const, id: def.id, awarded: reward.awarded, replayed: reward.replayed, wallet: reward.wallet };
  }

  async settleOnline(match: MatchRecord): Promise<Map<string, { awarded: number; reason: string | null }>> {
    if (match.status !== 'finished' || match.state.phase !== 'GAME_OVER' || !match.result ||
      match.result.reason === 'resigned' || match.result.reason === 'timeout') return new Map();
    const seats = await this.matches.participantsOf(match.id);
    if (seats.length !== 2 || seats[0]!.playerId === seats[1]!.playerId) return new Map();
    // What each seat was actually PAID, keyed by player id, so the finished view can report it.
    // Returned rather than discarded: the result card's Seeds line is this map or nothing, and it
    // can never be derived on the client (a daily cap pays 0). `settle` is idempotent, so a second
    // view returns the stored receipt's amount rather than paying twice.
    const settled = new Map<string, { awarded: number; reason: string | null }>();
    for (const seat of seats) {
      const opponent = seats.find((p) => p.seat !== seat.seat)!;
      const reward = await this.store.settle({
        playerId: seat.playerId,
        sourceKey: `duel:${match.id}`,
        mode: match.openQueue ? 'queue' : 'friend',
        outcome: match.result.winner === null ? 'draw' : match.result.winner === seat.seat ? 'win' : 'loss',
        opponentId: opponent.playerId,
        now: match.finishedAt ?? this.now(),
      });
      settled.set(seat.playerId, { awarded: reward.awarded, reason: reward.reason });
    }
    return settled;
  }

  async campaign(player: PlayerRecord, levelId: string, actions: readonly Action[], botVersion = CURRENT_BOT_VERSION) {
    if (levelId === FINAL_LESSON.id) return this.lesson(player, actions, botVersion);
    const level = campaignLevelById(levelId);
    if (!level) throw new ApiError('INVALID_REQUEST', 'That Campaign level is not available.');
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:proof:${player.id}`, bucket, 90)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before verifying another match.');
    }
    const verified = verifyCampaignProof(levelId, actions, botVersion);
    if (!verified || verified.winner !== 0) throw new ApiError('INVALID_REQUEST', 'That Campaign result could not be verified.');
    const settled = await this.store.settle({
      playerId: player.id, sourceKey: `campaign:${levelId}`, mode: 'campaign', outcome: 'win',
      opponentId: null, now: this.now(), campaignLevel: level.number,
    });
    await this.recordClear(player, levelId, level.number, verified);
    return settled;
  }

  /**
   * The final lesson's first win (owner, 2026-10-24): replayed against the real bot from its one
   * opening, then paid once through the same receipts as a Campaign first clear (mode `campaign`,
   * key `lesson:10`), so the database needs no new mode.
   */
  private async lesson(player: PlayerRecord, actions: readonly Action[], botVersion: string) {
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:proof:${player.id}`, bucket, 90)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before verifying another match.');
    }
    const verified = verifyLessonProof(FINAL_LESSON.id, actions, botVersion);
    if (!verified || verified.winner !== 0) throw new ApiError('INVALID_REQUEST', 'That lesson result could not be verified.');
    const settled = await this.store.settle({
      playerId: player.id, sourceKey: `lesson:${FINAL_LESSON.level}`, mode: 'campaign', outcome: 'win',
      opponentId: null, now: this.now(), lessonLevel: FINAL_LESSON.level,
    });
    await this.recordClear(player, FINAL_LESSON.id, FINAL_LESSON.level, verified);
    return settled;
  }

  /**
   * THE DAILY PUZZLE's tile (owner, 2026-10-27). The claimed turn is REPLAYED through the real rules
   * from the shipped puzzle's own start (src/daily/core.ts — the same check the game shows), and it
   * must meet the goal. Only today's puzzle pays, with yesterday's accepted as a grace for a solve
   * sent just after midnight UTC. Paid once per puzzle per player (receipt `daily:<no>`), as exactly
   * one tile's price, which the player spends at once by placing the tile.
   */
  async daily(player: PlayerRecord, no: number, actions: readonly Action[]) {
    const bucket = Math.floor(this.now() / 3_600_000) * 3_600_000;
    if (!(await this.matches.hitRateLimit(`seeds:proof:${player.id}`, bucket, 90)).ok) {
      throw new ApiError('RATE_LIMITED', 'Please wait before verifying another puzzle.');
    }
    const today = puzzleNoOn(this.now(), DAILY_EPOCH);
    const puzzle = Number.isInteger(no) ? dailyPuzzle(no) : null;
    if (!puzzle || today === null || (no !== today && no !== today - 1)) {
      throw new ApiError('INVALID_REQUEST', 'That Daily Puzzle is not open.');
    }
    let solved = false;
    try {
      solved = goalMet(puzzle.goal, playTurn(puzzle.start, actions));
    } catch (e) {
      if (!(e instanceof DailyTurnError)) throw e;
    }
    if (!solved) throw new ApiError('INVALID_REQUEST', 'That Daily Puzzle solve could not be verified.');
    return this.store.settle({
      playerId: player.id, sourceKey: `daily:${no}`, mode: 'campaign', outcome: 'win',
      opponentId: null, now: this.now(), dailyPuzzle: no,
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

  /**
   * AUTOMATIC SETTLEMENT (owner, 2026-10-29: "after the match, automatically give the tile to the
   * winner"). Called lazily by every world/challenge read, exactly like `expireChallenges`: there is
   * no new worker and no scheduler. For each accepted challenge whose linked duel is FINISHED, the
   * winner is read from the match result and the store settles it under its row lock. A challenge
   * whose duel is still running is never touched (the explicit `confirm` route stays as back-compat).
   *
   * Safe at any concurrency: `settleChallenge` is first-time-only and row-locked, so two clients (or
   * a client and the sweeper) settling at once produce exactly one transfer; later calls replay.
   */
  private async settleFinished(now: number): Promise<number> {
    const rows = await this.store.challengesAwaitingSettlement();
    let settled = 0;
    for (const challenge of rows) {
      if (challenge.matchId === null) continue;
      const match = await this.matches.matchById(challenge.matchId);
      if (!match || match.status !== 'finished' || !match.result) continue;
      const winnerSeat = match.result.winner;
      let winnerId: string | null = null;
      if (winnerSeat !== null) {
        const participants = await this.matches.participantsOf(challenge.matchId);
        winnerId = participants.find((p) => p.seat === winnerSeat)?.playerId ?? null;
        // Never settle a decided duel against a missing seat: that would be recorded as a draw.
        if (winnerId === null) continue;
      }
      const result = await this.store.settleChallenge({
        id: challenge.id, playerId: challenge.challengerId, winnerId, now,
      });
      if (result.ok && result.settled) settled += 1;
    }
    return settled;
  }

  private async challengeWire(c: WorldChallenge, viewerId: string, now: number): Promise<WorldChallengeWire> {
    const [challenger, defender] = await Promise.all([
      this.matches.playerById(c.challengerId),
      this.matches.playerById(c.defenderId),
    ]);
    const match = c.matchId === null ? null : await this.matches.matchById(c.matchId);
    // Only a finished duel has a winner to name; a running match or a draw reports none.
    let matchWinnerId: string | null = null;
    // WHO MOVES IN THE LINKED DUEL (owner, 2026-10-30). Read from the match's own actor and the
    // viewer's seat, so a Territory lamp never lights for the opponent's turn. The seats are read
    // once and shared with the winner lookup above; only an ACCEPTED row can be waiting.
    let matchWaitingForMe = false;
    if (match && (c.status === 'accepted' || match.status === 'finished')) {
      const participants = await this.matches.participantsOf(match.id);
      const result = match.result;
      if (match.status === 'finished' && result && result.winner !== null) {
        matchWinnerId = participants.find((p) => p.seat === result.winner)?.playerId ?? null;
      }
      if (c.status === 'accepted' && match.status === 'active' && match.state.phase !== 'GAME_OVER') {
        const seat = participants.find((p) => p.playerId === viewerId)?.seat;
        matchWaitingForMe = seat !== undefined && match.state.actor === seat;
      }
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
      stakeCellId: c.stakeCellId,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      respondedAt: c.respondedAt,
      matchId: c.matchId,
      // Only a FINISHED linked duel has a result. The server settles it on this very read, so the
      // client never has to offer a primary CONFIRM key.
      matchFinished: match?.status === 'finished' && match.result !== null,
      matchWaitingForMe,
      matchWinnerId,
      winnerId: c.winnerId,
      resolvedAt: c.resolvedAt,
      remainingMs: c.status === 'pending' ? Math.max(0, c.expiresAt - now) : 0,
      serverNow: now,
    };
  }

  async challenges(player: PlayerRecord): Promise<WorldChallengesPayload> {
    const now = this.now();
    // Lazy, like the map read: settle any finished linked duel first, then close what timed out.
    // Settle before expire so a duel that finished just inside the 7-day window is played, not
    // closed as stale. Both are idempotent; any failure is housekeeping, never a reason to hide the
    // player's list.
    await this.settleFinished(now).catch(() => 0);
    await this.store.expireChallenges(now).catch(() => 0);
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
    let result;
    try {
      result = await this.store.sendChallenge({
        challengerId: player.id,
        cellId,
        requestId,
        now,
      });
    } catch (error) {
      // The send is REFUSED, never guessed, when the tile-stake column is missing. Applying
      // `server/migrations/0019_challenge_tile_stake.sql` makes this disappear.
      if ((error as { code?: unknown } | null)?.code === 'STAKE_COLUMN_MISSING') {
        throw new ApiError('CHALLENGE_MIGRATION_PENDING', 'Territory is being updated. Try again shortly.');
      }
      throw error;
    }
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
