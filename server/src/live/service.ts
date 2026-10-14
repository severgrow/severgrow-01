// Live duels — the service. Every rule decision is a pure function in rules.ts or the engine; this
// file wires them to the storage and keeps each change inside ONE atomic `transact` step.
//
// The board, the score and the result are never touched by anything here: going live, leaving,
// strikes and the end of live mode only change clocks and live columns. The one thing that writes
// game state is the timed-out turn, and that goes through the normal move pipeline (commitBatch)
// with engine-legal actions.
import { matchSetup, stateFromSetup } from '../../../src/engine/index.js';
import type { Player } from '../../../src/engine/index.js';
import { safePublish } from '../broadcast.js';
import type { MatchBroadcaster } from '../broadcast.js';
import type { ServerConfig } from '../config.js';
import { newId, newInviteCode, newSeed } from '../ids.js';
import type { PlayerRecord, MatchRecord, Storage } from '../storage/types.js';
import { autoDecision, autoPlayTurn, drawnCardFrom } from './autoplay.js';
import type { LiveConfig } from './config.js';
import { ApiError } from '../errors.js';
import { LiveError } from './errors.js';
import type { LiveErrorCode } from './errors.js';
import type { LiveNotifier } from './notifier.js';
import { applyStrike, challengeBlock, effectiveStatus, endLive, inLeaveCooldown, presenceWord, startLive, visibleStrikes } from './rules.js';
import type { Challenge, ChallengeKind, LiveMatch, LivePlayer, LiveStore, LiveTx, LockedMatch, PresenceStatus } from './types.js';
import { PRESENCE_STATUSES, liveManaged } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const OUTGOING_WINDOW_MS = 3 * MINUTE_MS;

/** The challenge as a client sees it: names and ids only (hidden-information audit). */
export type ChallengeWire = {
  id: string;
  matchId: string;
  kind: ChallengeKind;
  fromName: string | null;
  toName: string | null;
  fromMe: boolean;
  limitMs: number;
  status: Challenge['status'];
  createdAt: number;
  expiresAt: number;
  newMatchId: string | null;
};

export type LiveStatusWire = {
  matchId: string;
  mySeat: Player;
  status: string;
  live: boolean;
  liveSince: number | null;
  limitMs: number | null;
  replayAllowanceMs: number;
  turnDeadlineAt: number | null;
  actor: Player;
  turnNumber: number;
  /** Consecutive strikes still standing, per seat. */
  strikes: [number, number];
  endedReason: LiveMatch['endedReason'];
  endedAt: number | null;
  endedBySeat: Player | null;
  leftBy: Player | null;
  opponent: { name: string | null; presence: 'online' | 'busy' | 'offline'; inLive: boolean; available: boolean };
  me: { liveMatchId: string | null; challengesEnabled: boolean; cooldown: boolean };
  /** Why a Go-live tap would be refused right now (null = allowed). */
  block: LiveErrorCode | null;
  rematchBlock: LiveErrorCode | null;
  pending: ChallengeWire | null;
  serverNow: number;
};

export type MyChallengesWire = {
  incoming: ChallengeWire[];
  outgoing: ChallengeWire[];
  liveMatchId: string | null;
  challengesEnabled: boolean;
  serverNow: number;
};

type TickPlan = { kind: 'autoplay'; rev: number; deadline: number; seat: Player } | { kind: 'changed' } | null;

export type LiveServiceOptions = {
  /** The UNWRAPPED base storage (the live layer must never re-enter its own wrapper). */
  storage: Storage;
  live: LiveStore;
  config: LiveConfig;
  server: ServerConfig;
  now: () => number;
  broadcaster?: MatchBroadcaster;
  notifier?: LiveNotifier;
};

export class LiveService {
  private readonly storage: Storage;
  private readonly live: LiveStore;
  readonly config: LiveConfig;
  private readonly server: ServerConfig;
  private readonly now: () => number;
  private readonly broadcaster: MatchBroadcaster | undefined;
  private readonly notifier: LiveNotifier | undefined;

  constructor(options: LiveServiceOptions) {
    this.storage = options.storage;
    this.live = options.live;
    this.config = options.config;
    this.server = options.server;
    this.now = options.now;
    this.broadcaster = options.broadcaster;
    this.notifier = options.notifier;
  }

  // ---------------------------------------------------------------- small helpers

  private async rateLimit(bucket: string, windowMs: number, max: number): Promise<void> {
    const now = this.now();
    const hit = await this.storage.hitRateLimit(bucket, Math.floor(now / windowMs) * windowMs, max);
    if (!hit.ok) throw new LiveError('RATE_LIMITED');
  }

  private async nameOf(playerId: string): Promise<string | null> {
    return (await this.storage.playerById(playerId))?.displayName ?? null;
  }

  private async wire(c: Challenge, me: string, now: number): Promise<ChallengeWire> {
    return {
      id: c.id,
      matchId: c.matchId,
      kind: c.kind,
      fromName: await this.nameOf(c.fromPlayer),
      toName: await this.nameOf(c.toPlayer),
      fromMe: c.fromPlayer === me,
      limitMs: c.limitMs,
      status: effectiveStatus(c, now),
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      newMatchId: c.newMatchId,
    };
  }

  private async seatIn(player: PlayerRecord, matchId: string): Promise<Player> {
    const p = await this.storage.participantOf(matchId, player.id);
    if (!p) throw new LiveError('CHALLENGE_NOT_FOUND', 'You are not in this match.');
    return p.seat;
  }

  private async ping(playerId: string, payload: { challengeId: string; fromName: string | null; kind: ChallengeKind }): Promise<void> {
    if (!this.notifier) return;
    try {
      await this.notifier.publish(`player:${playerId}`, payload);
    } catch {
      // A ping is a hint; the authoritative data comes from the authenticated request.
    }
  }

  private async matchPing(matchId: string): Promise<void> {
    const m = await this.storage.matchById(matchId);
    if (m) await safePublish(this.broadcaster, matchId, { revision: m.turnStartRevision, status: m.status });
  }

  // ---------------------------------------------------------------- presence and the switch

  async presence(player: PlayerRecord, status: unknown, matchId: unknown): Promise<{ status: PresenceStatus }> {
    if (typeof status !== 'string' || !PRESENCE_STATUSES.includes(status as PresenceStatus)) {
      throw new ApiError('INVALID_REQUEST', 'Unknown presence status.');
    }
    await this.rateLimit(`live:presence:${player.id}`, MINUTE_MS, this.config.presencePerPlayerPerMinute);
    let mid: string | null = null;
    if (typeof matchId === 'string' && matchId.length > 0 && matchId.length <= 64) {
      if (await this.storage.participantOf(matchId, player.id).catch(() => null)) mid = matchId;
    }
    await this.live.setPresence(player.id, status as PresenceStatus, mid, this.now());
    return { status: status as PresenceStatus };
  }

  async setChallengesEnabled(player: PlayerRecord, enabled: boolean): Promise<{ liveChallengesEnabled: boolean }> {
    await this.live.setChallengesEnabled(player.id, enabled);
    return { liveChallengesEnabled: enabled };
  }

  // ---------------------------------------------------------------- challenges

  async challenge(player: PlayerRecord, matchId: string, kindRaw: unknown): Promise<{ challenge: ChallengeWire; liveMatchId: string | null }> {
    const kind: ChallengeKind = kindRaw === 'rematch' ? 'rematch' : 'live';
    const seat = await this.seatIn(player, matchId);
    await this.tickMatch(matchId);
    await this.rateLimit(`live:challenge:${player.id}`, HOUR_MS, this.config.challengesPerPlayerPerHour);
    const now = this.now();
    const outcome = await this.live.transact(async (tx) => {
      const lm = await tx.match(matchId);
      if (!lm) throw new LiveError('CHALLENGE_NOT_FOUND', 'Unknown match.');
      const opp = lm.participants.find((p) => p.seat !== seat);
      if (!opp) throw new LiveError('MATCH_NOT_ACTIVE');
      const [p0, p1] = await tx.players([player.id, opp.playerId]);
      const from = p0!.playerId === player.id ? p0! : p1!;
      const to = p0!.playerId === player.id ? p1! : p0!;
      const pending = await tx.pendingForMatch(matchId);
      // Expire stale pending rows on the way (keeps the one-pending index honest).
      for (const c of pending) {
        if (effectiveStatus(c, now) === 'expired') await tx.saveChallenge({ ...c, status: 'expired', respondedAt: c.expiresAt });
      }
      const open = pending.filter((c) => effectiveStatus(c, now) === 'pending');
      const sent = await tx.sentSince(matchId, player.id, now - this.config.declineWindowMs);
      const block = challengeBlock({
        now,
        config: this.config,
        kind,
        matchStatus: lm.match.status,
        live: lm.live,
        fromSeat: seat,
        turnNumber: lm.match.state.turnNumber,
        from,
        to,
        pending: open,
        sentRecently: sent,
      });
      if (block) throw new LiveError(block);
      const mutual = open.find((c) => c.fromPlayer === to.playerId && c.toPlayer === player.id && c.kind === kind);
      if (mutual) {
        // Two players challenged each other at the same moment: that is ONE live session.
        if (kind === 'live') {
          const accepted = await this.acceptInTx(tx, mutual, lm, now);
          return { challenge: accepted, liveMatchId: matchId, mutualRematch: null as Challenge | null };
        }
        return { challenge: mutual, liveMatchId: null, mutualRematch: mutual };
      }
      const created: Challenge = {
        id: newId(),
        matchId,
        fromPlayer: player.id,
        toPlayer: to.playerId,
        kind,
        limitMs: this.config.turnMs,
        status: 'pending',
        createdAt: now,
        expiresAt: now + this.config.challengeTtlMs,
        respondedAt: null,
        newMatchId: null,
      };
      await tx.insertChallenge(created);
      return { challenge: created, liveMatchId: null, mutualRematch: null as Challenge | null };
    });
    if (outcome.mutualRematch) {
      const res = await this.accept(player, outcome.mutualRematch.id);
      return { challenge: res.challenge, liveMatchId: res.liveMatchId };
    }
    const c = outcome.challenge;
    const fromName = await this.nameOf(c.fromPlayer);
    if (c.status === 'pending') await this.ping(c.toPlayer, { challengeId: c.id, fromName, kind: c.kind });
    else {
      await this.ping(c.fromPlayer, { challengeId: c.id, fromName: await this.nameOf(player.id), kind: c.kind });
      await this.matchPing(matchId);
    }
    return { challenge: await this.wire(c, player.id, this.now()), liveMatchId: outcome.liveMatchId };
  }

  /** Start live on a locked match for both seats; marks the challenge accepted. */
  private async acceptInTx(tx: LiveTx, c: Challenge, lm: LockedMatch, now: number): Promise<Challenge> {
    const players = await tx.players(lm.participants.map((p) => p.playerId));
    if (players.some((p) => p.liveMatchId !== null) || lm.live.liveSince !== null) {
      await tx.saveChallenge({ ...c, status: 'cancelled', respondedAt: now });
      throw new LiveError('BUSY_LIVE');
    }
    if (lm.match.status !== 'active') {
      await tx.saveChallenge({ ...c, status: 'cancelled', respondedAt: now });
      throw new LiveError('CHALLENGE_CLOSED');
    }
    // Outside live mode the match clock IS the normal (24-hour) one; remember it for the way back.
    const normal = lm.live.liveSince === null ? lm.match.turnTimeoutMs : (lm.live.normalTimeoutMs ?? lm.match.turnTimeoutMs);
    await tx.saveLive(startLive(lm.live, now, c.limitMs, normal));
    // The current actor (both just agreed, so both are present) gets the live limit plus the entry allowance.
    await tx.saveClock(lm.match.id, {
      turnTimeoutMs: c.limitMs + this.config.replayAllowanceMs,
      turnDeadlineAt: now + c.limitMs + this.config.entryAllowanceMs,
    });
    for (const p of players) await tx.savePlayer({ ...p, liveMatchId: lm.match.id });
    const accepted: Challenge = { ...c, status: 'accepted', respondedAt: now };
    await tx.saveChallenge(accepted);
    return accepted;
  }

  async accept(player: PlayerRecord, challengeId: string): Promise<{ challenge: ChallengeWire; liveMatchId: string }> {
    const first = await this.readOpenChallenge(player, challengeId, 'to');
    if (first.kind === 'rematch') return this.acceptRematch(player, first);
    await this.tickMatch(first.matchId);
    const now = this.now();
    const accepted = await this.live.transact(async (tx) => {
      const c = await tx.challenge(challengeId);
      if (!c || c.toPlayer !== player.id) throw new LiveError('CHALLENGE_NOT_FOUND');
      if (effectiveStatus(c, now) !== 'pending') throw new LiveError('CHALLENGE_CLOSED');
      const lm = await tx.match(c.matchId);
      if (!lm) throw new LiveError('CHALLENGE_NOT_FOUND');
      return this.acceptInTx(tx, c, lm, now);
    });
    await this.ping(accepted.fromPlayer, { challengeId, fromName: player.displayName, kind: accepted.kind });
    await this.matchPing(accepted.matchId);
    return { challenge: await this.wire(accepted, player.id, this.now()), liveMatchId: accepted.matchId };
  }

  /** A rematch: a fresh match (engine lottery for who starts), created already live. */
  private async acceptRematch(player: PlayerRecord, c: Challenge): Promise<{ challenge: ChallengeWire; liveMatchId: string }> {
    for (const pid of [c.fromPlayer, c.toPlayer]) {
      const open = (await this.storage.matchesOfPlayer(pid)).filter((m) => m.status !== 'finished').length;
      if (open >= this.server.maxOpenMatchesPerPlayer) throw new LiveError('TOO_MANY_MATCHES');
    }
    const now = this.now();
    // Re-check before creating anything, so a busy player never gets a stray match.
    await this.live.transact(async (tx) => {
      const cur = await tx.challenge(c.id);
      if (!cur || effectiveStatus(cur, now) !== 'pending') throw new LiveError('CHALLENGE_CLOSED');
      const ps = await tx.players([c.fromPlayer, c.toPlayer]);
      if (ps.some((p) => p.liveMatchId !== null)) throw new LiveError('BUSY_LIVE');
    });
    const created = await this.createActiveMatch(c.fromPlayer, c.toPlayer, now);
    const accepted = await this.live.transact(async (tx) => {
      const cur = await tx.challenge(c.id);
      if (!cur || effectiveStatus(cur, now) !== 'pending') throw new LiveError('CHALLENGE_CLOSED');
      const lm = await tx.match(created.id);
      if (!lm) throw new LiveError('CHALLENGE_NOT_FOUND');
      const ok = await this.acceptInTx(tx, cur, lm, now);
      const done = { ...ok, newMatchId: created.id };
      await tx.saveChallenge(done);
      return done;
    });
    await this.ping(accepted.fromPlayer, { challengeId: c.id, fromName: player.displayName, kind: 'rematch' });
    return { challenge: await this.wire(accepted, player.id, this.now()), liveMatchId: created.id };
  }

  private async createActiveMatch(seat0: string, seat1: string, now: number): Promise<MatchRecord> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const setup = matchSetup(newSeed(), this.server.rulesVersion);
      const match: MatchRecord = {
        id: newId(),
        inviteCode: newInviteCode(this.server.inviteCodeLength),
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
        turnTimeoutMs: this.server.turnTimeoutMs,
        graceUsed: [0, 0],
        gracePeriods: this.server.gracePeriodsPerPlayer,
        graceExtensionMs: this.server.graceExtensionMs,
        turnStartRevision: 0,
        turnStartState: null,
        expiresAt: now + this.server.waitingExpireMs,
        openQueue: false,
      };
      const res = await this.storage.createMatch(match);
      if (!res.ok) continue;
      await this.storage.addParticipant({ matchId: match.id, playerId: seat0, seat: 0, joinedAt: now, lastSeenAt: now });
      await this.storage.addParticipant({ matchId: match.id, playerId: seat1, seat: 1, joinedAt: now, lastSeenAt: now });
      const active = await this.storage.activateMatch(match.id, now, this.server.turnTimeoutMs);
      if (active) return active;
    }
    throw new LiveError('MATCH_NOT_ACTIVE', 'Could not start the rematch.');
  }

  private async readOpenChallenge(player: PlayerRecord, id: string, side: 'to' | 'from'): Promise<Challenge> {
    const now = this.now();
    const c = await this.live.transact(async (tx) => tx.challenge(id));
    if (!c) throw new LiveError('CHALLENGE_NOT_FOUND');
    if ((side === 'to' ? c.toPlayer : c.fromPlayer) !== player.id) throw new LiveError('CHALLENGE_NOT_FOUND');
    if (effectiveStatus(c, now) !== 'pending') throw new LiveError('CHALLENGE_CLOSED');
    return c;
  }

  async decline(player: PlayerRecord, challengeId: string): Promise<{ challenge: ChallengeWire }> {
    return this.close(player, challengeId, 'to', 'declined');
  }

  async cancel(player: PlayerRecord, challengeId: string): Promise<{ challenge: ChallengeWire }> {
    return this.close(player, challengeId, 'from', 'cancelled');
  }

  private async close(player: PlayerRecord, id: string, side: 'to' | 'from', status: 'declined' | 'cancelled'): Promise<{ challenge: ChallengeWire }> {
    const now = this.now();
    const closed = await this.live.transact(async (tx) => {
      const c = await tx.challenge(id);
      if (!c || (side === 'to' ? c.toPlayer : c.fromPlayer) !== player.id) throw new LiveError('CHALLENGE_NOT_FOUND');
      if (effectiveStatus(c, now) !== 'pending') throw new LiveError('CHALLENGE_CLOSED');
      const next: Challenge = { ...c, status, respondedAt: now };
      await tx.saveChallenge(next);
      return next;
    });
    const other = side === 'to' ? closed.fromPlayer : closed.toPlayer;
    await this.ping(other, { challengeId: id, fromName: player.displayName, kind: closed.kind });
    return { challenge: await this.wire(closed, player.id, now) };
  }

  async myChallenges(player: PlayerRecord): Promise<MyChallengesWire> {
    const now = this.now();
    const me = await this.live.player(player.id);
    if (me.liveMatchId) await this.tickMatch(me.liveMatchId);
    const all = await this.live.challengesInvolving(player.id, now - OUTGOING_WINDOW_MS);
    const incoming: ChallengeWire[] = [];
    const outgoing: ChallengeWire[] = [];
    for (const c of all) {
      const w = await this.wire(c, player.id, now);
      if (c.toPlayer === player.id && w.status === 'pending') incoming.push(w);
      if (c.fromPlayer === player.id) outgoing.push(w);
    }
    outgoing.sort((a, b) => b.createdAt - a.createdAt);
    const fresh = await this.live.player(player.id);
    return { incoming, outgoing, liveMatchId: fresh.liveMatchId, challengesEnabled: fresh.challengesEnabled, serverNow: this.now() };
  }

  // ---------------------------------------------------------------- leave

  async leave(player: PlayerRecord, matchId: string): Promise<LiveStatusWire> {
    const seat = await this.seatIn(player, matchId);
    await this.tickMatch(matchId);
    const now = this.now();
    await this.live.transact(async (tx) => {
      const lm = await tx.match(matchId);
      if (!lm || lm.live.liveSince === null) throw new LiveError('NOT_LIVE');
      const players = await tx.players(lm.participants.map((p) => p.playerId));
      for (const p of players) if (p.liveMatchId === matchId) await tx.savePlayer({ ...p, liveMatchId: null });
      const normal = lm.live.normalTimeoutMs ?? this.server.turnTimeoutMs;
      const turnNumber = lm.match.state.turnNumber;
      const cooldownUntil: [number | null, number | null] = [lm.live.cooldownUntil[0], lm.live.cooldownUntil[1]];
      const cooldownTurn: [number | null, number | null] = [lm.live.cooldownTurn[0], lm.live.cooldownTurn[1]];
      cooldownUntil[seat] = now + this.config.leaveCooldownMs;
      cooldownTurn[seat] = turnNumber + 2 * this.config.leaveCooldownTurns;
      const myTurn = lm.match.state.actor === seat;
      const ended = endLive({ ...lm.live, leftBy: seat, cooldownUntil, cooldownTurn }, now, 'left', seat);
      // Leaving never gives extra time: on my own turn the live clock keeps running plus one grace,
      // then the turn is auto-played; the opponent's current turn becomes a normal 24-hour turn.
      await tx.saveLive({ ...ended, tailRev: myTurn ? lm.match.turnStartRevision : null });
      await tx.saveClock(matchId, {
        turnTimeoutMs: normal,
        turnDeadlineAt: myTurn ? (lm.match.turnDeadlineAt ?? now) + this.config.leaveGraceMs : now + normal,
      });
    });
    await this.matchPing(matchId);
    return this.status(player, matchId);
  }

  // ---------------------------------------------------------------- status (also the lazy clock check)

  async status(player: PlayerRecord, matchId: string): Promise<LiveStatusWire> {
    const seat = await this.seatIn(player, matchId);
    await this.tickMatch(matchId);
    const now = this.now();
    // Independent reads in parallel: this is polled every 1-3 s by both players while in a match.
    const [match, live, parts, me, involving] = await Promise.all([
      this.storage.matchById(matchId),
      this.live.liveOf(matchId),
      this.storage.participantsOf(matchId),
      this.live.player(player.id),
      this.live.challengesInvolving(player.id, now - OUTGOING_WINDOW_MS),
    ]);
    if (!match) throw new LiveError('CHALLENGE_NOT_FOUND', 'Unknown match.');
    const oppPart = parts.find((p) => p.seat !== seat) ?? null;
    const [opp, oppName] = oppPart
      ? await Promise.all([this.live.player(oppPart.playerId), this.nameOf(oppPart.playerId)])
      : [null as LivePlayer | null, null as string | null];
    const pendingRow = involving.find((c) => c.matchId === matchId && effectiveStatus(c, now) === 'pending') ?? null;
    const sent = involving.filter((c) => c.matchId === matchId && c.fromPlayer === player.id);
    // A wider window for the decline limit.
    const blockFor = (kind: ChallengeKind): LiveErrorCode | null =>
      opp
        ? challengeBlock({
            now,
            config: this.config,
            kind,
            matchStatus: match.status,
            live,
            fromSeat: seat,
            turnNumber: match.state.turnNumber,
            from: me,
            to: opp,
            pending: pendingRow ? [pendingRow] : [],
            sentRecently: sent,
          })
        : 'MATCH_NOT_ACTIVE';
    return {
      matchId,
      mySeat: seat,
      status: match.status,
      live: live.liveSince !== null,
      liveSince: live.liveSince,
      limitMs: live.limitMs,
      replayAllowanceMs: this.config.replayAllowanceMs,
      turnDeadlineAt: match.status === 'finished' ? null : match.turnDeadlineAt,
      actor: match.state.actor,
      turnNumber: match.state.turnNumber,
      strikes: visibleStrikes(live, match.state.turnNumber),
      endedReason: live.endedReason,
      endedAt: live.endedAt,
      endedBySeat: live.endedBySeat,
      leftBy: live.leftBy,
      opponent: {
        name: oppName,
        presence: opp ? presenceWord(opp, now, this.config) : 'offline',
        inLive: !!opp?.liveMatchId,
        available: opp?.challengesEnabled ?? false,
      },
      me: {
        liveMatchId: me.liveMatchId,
        challengesEnabled: me.challengesEnabled,
        cooldown: inLeaveCooldown(live, seat, now, match.state.turnNumber),
      },
      block: blockFor('live'),
      rematchBlock: blockFor('rematch'),
      pending: pendingRow ? await this.wire(pendingRow, player.id, now) : null,
      serverNow: this.now(),
    };
  }

  // ---------------------------------------------------------------- the live clock

  /** Run every live decision that is due on this match. Never throws (a read must not fail on it). */
  async tickMatch(matchId: string, now: number = this.now()): Promise<boolean> {
    let changed = false;
    try {
      // Cheap unlocked check first: the row lock is only taken when a decision is actually due.
      if (!(await this.live.needsTick(matchId, now))) return false;
      for (let i = 0; i < 6; i++) {
        const plan = await this.planTick(matchId, now);
        if (!plan) break;
        changed = true;
        if (plan.kind === 'autoplay') await this.autoplay(matchId, plan);
      }
    } catch (error) {
      console.warn(`live tick failed for a match: ${String(error).slice(0, 200)}`);
    }
    if (changed) await this.matchPing(matchId);
    return changed;
  }

  async tickDue(now: number = this.now()): Promise<number> {
    const ids = await this.live.dueMatchIds(now);
    for (const id of ids) await this.tickMatch(id, now);
    return ids.length;
  }

  needsTick(matchId: string, now: number): Promise<boolean> {
    return this.live.needsTick(matchId, now);
  }

  /** ONE row-locked decision: strike / end / tail / cleanup. Returns what to do next, if anything. */
  private planTick(matchId: string, now: number): Promise<TickPlan> {
    return this.live.transact(async (tx): Promise<TickPlan> => {
      const lm = await tx.match(matchId);
      if (!lm) return null;
      const { match } = lm;
      let live = lm.live;
      let dirty = false;
      if (match.status === 'finished') {
        if (!liveManaged(live)) return null;
        const wasLive = live.liveSince !== null;
        live = { ...(wasLive ? endLive(live, now, 'finished', null) : live), tailRev: null, autoplayRev: null };
        await tx.saveLive(live);
        const players = await tx.players(lm.participants.map((p) => p.playerId));
        for (const p of players) if (p.liveMatchId === matchId) await tx.savePlayer({ ...p, liveMatchId: null });
        return { kind: 'changed' };
      }
      if (match.status !== 'active') return null;
      if (live.autoplayRev !== null && live.autoplayRev !== match.revision) {
        live = { ...live, autoplayRev: null };
        dirty = true;
      }
      if (live.tailRev !== null && live.tailRev !== match.turnStartRevision) {
        live = { ...live, tailRev: null };
        dirty = true;
      }
      const deadline = match.turnDeadlineAt;
      const due = deadline !== null && now > deadline;
      const seat = match.state.actor;
      if (live.autoplayRev === match.revision && deadline !== null) {
        if (dirty) await tx.saveLive(live);
        return { kind: 'autoplay', rev: match.revision, deadline, seat };
      }
      if (!due || deadline === null) {
        if (dirty) {
          await tx.saveLive(live);
          return { kind: 'changed' };
        }
        return null;
      }
      if (live.liveSince !== null) {
        const struck = applyStrike(live, seat, match.state.turnNumber, this.config);
        live = { ...struck.live, autoplayRev: match.revision };
        if (struck.ends) {
          // Two consecutive strikes: back to 24-hour play. Nobody loses by a live timeout.
          live = endLive(live, now, 'strikes', seat);
          await tx.saveClock(matchId, { turnTimeoutMs: live.normalTimeoutMs ?? this.server.turnTimeoutMs, turnDeadlineAt: deadline });
          const players = await tx.players(lm.participants.map((p) => p.playerId));
          for (const p of players) if (p.liveMatchId === matchId) await tx.savePlayer({ ...p, liveMatchId: null });
        }
        await tx.saveLive(live);
        return { kind: 'autoplay', rev: match.revision, deadline, seat };
      }
      if (live.tailRev !== null && live.tailRev === match.turnStartRevision) {
        live = { ...live, tailRev: null, autoplayRev: match.revision };
        await tx.saveLive(live);
        return { kind: 'autoplay', rev: match.revision, deadline, seat };
      }
      if (dirty) {
        await tx.saveLive(live);
        return { kind: 'changed' };
      }
      return null;
    });
  }

  /** Commit the timed-out turn through the normal move pipeline, at the deadline instant. */
  private async autoplay(matchId: string, plan: { rev: number; deadline: number; seat: Player }): Promise<void> {
    const match = await this.storage.matchById(matchId);
    if (match && match.revision === plan.rev && match.status === 'active') {
      const parts = await this.storage.participantsOf(matchId);
      const who = parts.find((p) => p.seat === plan.seat);
      const moves = await this.storage.movesOf(matchId, match.turnStartRevision);
      const drawn = drawnCardFrom(moves.flatMap((m) => m.events), plan.seat);
      const actions = who && match.state.actor === plan.seat ? autoPlayTurn(match.state, plan.seat, drawn) : [];
      let committed = false;
      if (who && actions.length > 0) {
        const res = await this.storage.commitBatch({
          matchId,
          playerId: who.playerId,
          expectedRevision: plan.rev,
          requestId: `live-auto-${plan.rev}`,
          // "At the deadline": the next deadline is measured from it, so a late check never gifts time.
          now: plan.deadline,
          actions,
          decideOne: ({ match: m, seat, action }) => autoDecision(m.state, seat, action),
        });
        committed = res.ok;
      }
      if (!committed && match.revision === plan.rev) {
        // Nothing could be auto-played (should not happen): fall back to 24-hour play, never a loss.
        await this.live.transact(async (tx) => {
          const lm = await tx.match(matchId);
          if (!lm || lm.match.revision !== plan.rev) return;
          const normal = lm.live.normalTimeoutMs ?? this.server.turnTimeoutMs;
          const ended = lm.live.liveSince !== null ? endLive(lm.live, this.now(), 'strikes', plan.seat) : lm.live;
          await tx.saveLive({ ...ended, autoplayRev: null, tailRev: null });
          await tx.saveClock(matchId, { turnTimeoutMs: normal, turnDeadlineAt: this.now() + normal });
          const players = await tx.players(lm.participants.map((p) => p.playerId));
          for (const p of players) if (p.liveMatchId === matchId) await tx.savePlayer({ ...p, liveMatchId: null });
        });
        return;
      }
    }
    // Clear the marker so the 24-hour rule owns the match again when live is over.
    await this.live.transact(async (tx) => {
      const lm = await tx.match(matchId);
      if (!lm || lm.live.autoplayRev !== plan.rev || lm.match.revision === plan.rev) return;
      await tx.saveLive({ ...lm.live, autoplayRev: null });
    });
  }
}
