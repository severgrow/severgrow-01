// Shared fake-clock harness for the live-duel server tests (not a test file itself).
import { legalActions } from '../../src/engine/index.js';
import type { Action, View } from '../../src/engine/index.js';
import { RecordingBroadcaster } from '../src/broadcast.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { DEFAULT_LIVE_CONFIG } from '../src/live/config.js';
import type { LiveConfig } from '../src/live/config.js';
import { MemoryLiveStore } from '../src/live/memory.js';
import { RecordingNotifier } from '../src/live/notifier.js';
import { createLiveRuntime } from '../src/live/runtime.js';
import type { PresenceStatus } from '../src/live/types.js';

export const DAY = 24 * 60 * 60 * 1000;
export const LIMIT = 45_000;
export const REPLAY = 6_000;
export const ENTRY = 15_000;
/** The real-time reconnect ladder, as `live-duels.test.ts` reasons about it. */
export const GRACE = 10_000;
export const GRACE_SHORT = 5_000;
export const STALE = 45_000;
export const BOTH_WINDOW = 3_000;
export const HOLD = 60_000;

export const liveTestConfig = (o: Partial<LiveConfig> = {}): LiveConfig => ({
  ...DEFAULT_LIVE_CONFIG,
  turnMs: LIMIT,
  replayAllowanceMs: REPLAY,
  entryAllowanceMs: ENTRY,
  challengeTtlMs: 45_000,
  presenceStaleMs: STALE,
  reconnectGraceMs: GRACE,
  reconnectShortMs: GRACE_SHORT,
  bothOfflineWindowMs: BOTH_WINDOW,
  bothOfflineHoldMs: HOLD,
  notNowCooldownMs: 120_000,
  declineLimit: 3,
  declineWindowMs: 30 * 60_000,
  challengesPerPlayerPerHour: 1000,
  presencePerPlayerPerMinute: 1000,
  ...o,
});

export const serverTestConfig = (o: Partial<ServerConfig> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  corsOrigin: '*',
  turnTimeoutMs: DAY,
  graceExtensionMs: DAY,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 10_000,
    joinPerPlayerPerHour: 10_000,
    joinPerIpPerHour: 10_000,
    actionsPerPlayerPerMinute: 10_000,
    sweepPerIpPerHour: 10_000,
  },
  ...o,
});

/**
 * The next action a player's turn needs, from that player's OWN view: Draw from the deck, then the
 * Grow step is skipped, then the drawn (or lowest) card is thrown. Pure; used only to drive a whole
 * turn quickly in these tests (the server itself no longer plays a turn for anyone — a real-time
 * timeout now LOSES the match, so nothing auto-plays).
 */
const nextTurnAction = (view: View): Action | null => {
  const legal = legalActions(view);
  if (legal.length === 0) return null;
  switch (view.phase) {
    case 'DRAW':
      return legal.find((a) => a.t === 'Draw' && a.from === 'deck') ?? legal.find((a) => a.t === 'Draw') ?? legal[0]!;
    case 'ACT':
      return legal.find((a) => a.t === 'EndAct') ?? legal[0]!;
    case 'DISCARD': {
      const throws = legal.filter((a): a is Extract<Action, { t: 'Discard' }> => a.t === 'Discard');
      throws.sort((a, b) => a.card - b.card);
      return throws[0] ?? legal[0]!;
    }
    case 'KNOCK':
      return legal.find((a) => a.t === 'Continue') ?? legal[0]!;
    default:
      return legal[0]!;
  }
};

export const makeLiveHarness = (opts: { live?: Partial<LiveConfig>; server?: Partial<ServerConfig> } = {}) => {
  let clock = 1_700_000_000_000;
  let seq = 0;
  const now = () => clock;
  const memory = new MemoryStorage();
  const liveStore = new MemoryLiveStore(memory);
  const server = serverTestConfig(opts.server);
  const notifier = new RecordingNotifier();
  const broadcaster = new RecordingBroadcaster();
  const rt = createLiveRuntime({ storage: memory, live: liveStore, server, config: liveTestConfig(opts.live), now, notifier, broadcaster });
  const service = new MatchService({ storage: rt.storage, config: server, now, broadcaster });
  const h = {
    memory,
    liveStore,
    service,
    live: rt.service,
    router: rt.router(service),
    notifier,
    broadcaster,
    now,
    advance: (ms: number) => {
      clock += ms;
    },
    async guest(): Promise<{ player: PlayerRecord; token: string }> {
      const g = await service.createGuest();
      return { player: await service.authenticate(g.token), token: g.token };
    },
    async pair(): Promise<{ a: PlayerRecord; b: PlayerRecord; matchId: string; ta: string; tb: string }> {
      const ga = await h.guest();
      const gb = await h.guest();
      const created = await service.createMatch(ga.player);
      await service.joinMatch(gb.player, created.match.inviteCode);
      return { a: ga.player, b: gb.player, matchId: created.match.matchId, ta: ga.token, tb: gb.token };
    },
    async online(...players: PlayerRecord[]): Promise<void> {
      for (const p of players) await rt.service.presence(p, 'idle' satisfies PresenceStatus, null);
    },
    async presence(p: PlayerRecord, status: PresenceStatus): Promise<void> {
      await rt.service.presence(p, status, null);
    },
    /** Whose player record is to act in this match right now. */
    async actorOf(matchId: string, a: PlayerRecord, b: PlayerRecord): Promise<PlayerRecord> {
      const m = (await memory.matchById(matchId))!;
      const parts = await memory.participantsOf(matchId);
      const id = parts.find((p) => p.seat === m.state.actor)!.playerId;
      return id === a.id ? a : b;
    },
    /** Draw only (mid-turn). */
    async draw(p: PlayerRecord, matchId: string): Promise<void> {
      const v = await service.viewPayload(p, matchId);
      const a = v.legalActions.find((x) => x.t === 'Draw')!;
      await service.submitAction(p, matchId, { expectedRevision: v.revision, requestId: `d-${(seq += 1)}`, action: a });
    },
    /** Play the rest of this player's turn quickly (Draw, skip Grow, Throw). */
    async playTurn(p: PlayerRecord, matchId: string): Promise<void> {
      for (let i = 0; i < 8; i++) {
        const v = await service.viewPayload(p, matchId);
        if (v.status !== 'active' || v.actor !== v.seat || v.legalActions.length === 0) return;
        const a = nextTurnAction(v.view)!;
        await service.submitAction(p, matchId, { expectedRevision: v.revision, requestId: `t-${(seq += 1)}`, action: a });
        const after = await service.viewPayload(p, matchId);
        if (after.actor !== after.seat) return;
      }
    },
    /** Challenge from `from` and accept by `to`: the match is live. */
    async goLive(from: PlayerRecord, to: PlayerRecord, matchId: string): Promise<void> {
      await h.online(from, to);
      const c = await rt.service.challenge(from, matchId, 'live');
      await rt.service.accept(to, c.challenge.id);
    },
  };
  return h;
};

export type LiveHarness = ReturnType<typeof makeLiveHarness>;
