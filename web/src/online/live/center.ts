// Live duels — the global challenge listener: presence heartbeat, the per-player ping channel, the
// polling fallback, the pop-up deferral, and Accept / Not now. No DOM here (the pop-up is injected),
// so every rule is unit-tested with a fake server, a fake channel and a fake clock.
import type { ChallengeWire, LiveApi, MyChallengesWire, PresenceStatus } from './api.js';
import { deferDecision } from './deferral.js';
import type { ScreenState } from './deferral.js';

export const HEARTBEAT_MS = 20_000;
/** Inbox check when polling is the only path (Realtime down) or a challenge is in flight. */
export const POLL_MS = 4_000;
/**
 * Inbox check while the per-player Realtime ping is connected and nothing is pending. The ping is
 * what brings a new challenge at once; this slow poll is only the safety net. Every check is a
 * paid Edge Function call, so this is the line that keeps an idle app cheap (Supabase quota).
 */
export const REALTIME_IDLE_POLL_MS = 30_000;
export const DEFER_CHECK_MS = 250;

export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
};

export type Probe = {
  visible(): boolean;
  screen(): ScreenState;
  presence(): { status: PresenceStatus; matchId: string | null };
};

export type PopupPort = {
  show(c: ChallengeWire, actions: { accept: () => void; decline: () => void }): void;
  hide(): void;
  isOpen(): boolean;
};

/** Per-player ping channel: a hint to poll now. */
export type PlayerChannel = {
  subscribe(playerId: string, onPing: () => void): () => void;
  /** True while the Realtime channel is joined (pings can arrive). Absent = never connected. */
  connected?(): boolean;
};

export type CenterEvents = {
  /** A live session began for this player (as the accepter OR as the sender whose challenge was accepted). */
  onLiveStarted?(liveMatchId: string, via: ChallengeWire | null): void;
  /** Every fresh inbox (the controller uses outgoing statuses for the sender's window). */
  onInbox?(inbox: MyChallengesWire): void;
  onError?(error: unknown): void;
};

export type ChallengeCenter = {
  start(): void;
  stop(): void;
  pollNow(): Promise<void>;
  heartbeatNow(): Promise<void>;
  /** The live match the server says this player is in. */
  liveMatchId(): string | null;
  /** Tell the center the client itself started/left a live match (no duplicate onLiveStarted). */
  noteLive(matchId: string | null): void;
};

export const createChallengeCenter = (deps: {
  api: LiveApi;
  clock: Clock;
  probe: Probe;
  popup: PopupPort;
  playerId: string;
  channel?: PlayerChannel;
  events?: CenterEvents;
  /** Called when the page becomes visible/hidden (tests drive it directly). */
  onVisibility?: (cb: () => void) => () => void;
}): ChallengeCenter => {
  const { api, clock, probe, popup } = deps;
  let running = false;
  let pollTimer: unknown = null;
  let beatTimer: unknown = null;
  let deferTimer: unknown = null;
  let unsubscribe: (() => void) | null = null;
  let unVisibility: (() => void) | null = null;
  let current: ChallengeWire | null = null; // shown or waiting to be shown
  let waitingSince = 0;
  let accepting = false;
  const closed = new Set<string>();
  let live: string | null = null;
  let polling: Promise<void> | null = null;
  /** The first inbox is the baseline (a reload while live must not replay the go-live moment). */
  let baseline = true;

  const clear = (id: unknown) => {
    if (id !== null) clock.clearTimeout(id);
  };

  const heartbeatNow = async (): Promise<void> => {
    try {
      const p = probe.presence();
      await api.presence(p.status, p.matchId);
    } catch (error) {
      deps.events?.onError?.(error);
    }
  };

  const scheduleBeat = () => {
    clear(beatTimer);
    beatTimer = null;
    if (!running || !probe.visible()) return;
    beatTimer = clock.setTimeout(() => {
      void heartbeatNow().finally(scheduleBeat);
    }, HEARTBEAT_MS);
  };

  const schedulePoll = () => {
    clear(pollTimer);
    pollTimer = null;
    if (!running || !probe.visible()) return; // paused while hidden
    pollTimer = clock.setTimeout(() => {
      void pollNow().finally(schedulePoll);
    }, pollDelay());
  };

  /** Fast only when it matters: Realtime down, a pop-up open/queued, or my challenge awaiting an answer. */
  let outgoingPending = false;
  const pollDelay = (): number => {
    const realtime = deps.channel?.connected?.() === true;
    if (!realtime || current !== null || accepting || outgoingPending) return POLL_MS;
    return REALTIME_IDLE_POLL_MS;
  };

  const hidePopup = () => {
    clear(deferTimer);
    deferTimer = null;
    if (popup.isOpen()) popup.hide();
    current = null;
  };

  const tryShow = () => {
    deferTimer = null;
    if (!running || !current || popup.isOpen()) return;
    const d = deferDecision(probe.screen(), clock.now() - waitingSince);
    if (d === 'show') {
      const c = current;
      popup.show(c, { accept: () => void accept(c), decline: () => void decline(c) });
      return;
    }
    // 'never' (tutorial) keeps checking: if the tutorial ends while the challenge is still open, show it.
    deferTimer = clock.setTimeout(tryShow, DEFER_CHECK_MS);
  };

  const accept = async (c: ChallengeWire): Promise<void> => {
    if (accepting || closed.has(c.id)) return; // a double tap sends once
    accepting = true;
    closed.add(c.id);
    try {
      const res = await api.accept(c.id);
      hidePopup();
      live = res.liveMatchId;
      baseline = false;
      deps.events?.onLiveStarted?.(res.liveMatchId, res.challenge);
    } catch (error) {
      hidePopup();
      deps.events?.onError?.(error);
    } finally {
      accepting = false;
    }
  };

  const decline = async (c: ChallengeWire): Promise<void> => {
    if (closed.has(c.id)) return;
    closed.add(c.id);
    hidePopup();
    try {
      await api.decline(c.id);
    } catch (error) {
      deps.events?.onError?.(error);
    }
  };

  const applyInbox = (inbox: MyChallengesWire) => {
    deps.events?.onInbox?.(inbox);
    const wasPending = outgoingPending;
    outgoingPending = inbox.outgoing.some((c) => c.status === 'pending' && clock.now() <= c.expiresAt);
    // A challenge just went out: switch to the fast check now, not after the slow timer fires.
    if (outgoingPending && !wasPending && running && pollTimer !== null) schedulePoll();
    const was = live;
    live = inbox.liveMatchId;
    const first = baseline;
    baseline = false;
    if (live && live !== was && !first) {
      const via = inbox.outgoing.find((c) => c.status === 'accepted' && (c.newMatchId ?? c.matchId) === live) ?? null;
      hidePopup();
      deps.events?.onLiveStarted?.(live, via);
    }
    const open = inbox.incoming.filter((c) => c.status === 'pending' && !closed.has(c.id) && clock.now() <= c.expiresAt);
    if (current && !open.some((c) => c.id === current!.id)) hidePopup(); // expired / cancelled / answered elsewhere
    if (!current && open.length > 0 && !accepting && !live) {
      current = [...open].sort((a, b) => a.createdAt - b.createdAt)[0]!;
      waitingSince = clock.now();
      tryShow();
    }
  };

  const pollNow = async (): Promise<void> => {
    if (polling) return polling;
    polling = (async () => {
      try {
        applyInbox(await api.inbox());
      } catch (error) {
        deps.events?.onError?.(error);
      } finally {
        polling = null;
      }
    })();
    return polling;
  };

  const onVisible = () => {
    if (!running) return;
    if (probe.visible()) {
      void heartbeatNow();
      void pollNow();
      scheduleBeat();
      schedulePoll();
    } else {
      clear(pollTimer);
      clear(beatTimer);
      pollTimer = beatTimer = null;
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      unsubscribe = deps.channel?.subscribe(deps.playerId, () => void pollNow()) ?? null;
      unVisibility = deps.onVisibility?.(onVisible) ?? null;
      onVisible();
    },
    stop() {
      running = false;
      clear(pollTimer);
      clear(beatTimer);
      pollTimer = beatTimer = null;
      hidePopup();
      unsubscribe?.();
      unVisibility?.();
      unsubscribe = unVisibility = null;
    },
    pollNow,
    heartbeatNow,
    liveMatchId: () => live,
    noteLive(matchId) {
      live = matchId;
    },
  };
};
