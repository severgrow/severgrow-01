import { publishOpponentStatus } from './opponent-status.js';
// Live duels — the client controller, mounted once from main.ts (only when online is enabled and an
// identity exists on this device). It reads the page through `window.__severgrow` (read-only test
// hooks that already exist) and the online session handle; it never changes the replay gate, the
// animation queue, the turn reveal, the sync polling or the render path.
import { coordKey, homeCoord } from '../../../../src/engine/index.js';
import type { Player } from '../../../../src/engine/index.js';
import { LIVE } from '../../../../src/strings.js';
import { browserStorage } from '../../../../server/src/client.js';
import { SOUND_REMOVED, Sound } from '../../ui/sound.js';
import { RecordedFx } from '../../ui/recorded.js';
import { duelApiUrl, duelRegion, onlineBuildEnabled } from '../config.js';
import { getOnlineMatchId, getOnlineSession, subscribeOnlineSession } from '../duel-runtime.js';
import { STORAGE_PREFIX } from '../../channel.js';
import { IDENTITY_STORAGE_KEY, isIdentityStorageEvent, subscribeIdentityChanges } from '../identity.js';
import { createLiveApi } from './api.js';
import type { ChallengeWire, LiveApi, LiveStatusWire, MyChallengesWire, PresenceStatus } from './api.js';
import { createChallengeCenter } from './center.js';
import type { ChallengeCenter } from './center.js';
import { createPlayerChannel } from './channel.js';
import { createReturnStore, restoreTarget } from './return-target.js';
import type { ReturnHost, ReturnTarget } from './return-target.js';
import {
  createAnnouncer,
  createChallengeConfirm,
  createChallengePopup,
  createEndWindow,
  createGlassNote,
  createHud,
  createPill,
  injectLiveStyles,
  mountLeaveItem,
} from './ui.js';
import type { PillModel } from './ui.js';
import { blitzClockIn } from '../../blitz/timer.js';
import { createLiveTicker } from './ticker.js';
import { mountPointerBusy } from './pointer-busy.js';

export type LiveHost = ReturnHost;

type PageHooks = {
  busy?: () => boolean;
  online?: () => { revealing: boolean } | null;
  tutorial?: () => unknown;
  settings?: () => { sound: boolean; vibration: boolean; reduceMotion: boolean; sfxVolume: number; music: boolean; musicVolume: number };
};

const page = (): PageHooks => ((window as unknown as { __severgrow?: PageHooks }).__severgrow ?? {});

const readIdentity = (): { token: string; playerId: string } | null => {
  try {
    const raw = browserStorage()?.get(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { token?: unknown; playerId?: unknown };
    return typeof v.token === 'string' && typeof v.playerId === 'string' ? { token: v.token, playerId: v.playerId } : null;
  } catch {
    return null;
  }
};

const gameVisible = (): boolean => {
  const g = document.getElementById('game');
  return !!g && !g.hidden;
};

/** Expose a read-only snapshot for the browser tests (nothing is sent anywhere). */
type LiveDebug = { status: LiveStatusWire | null; inbox: MyChallengesWire | null; target: ReturnTarget | null; popup: boolean;
  presentation: readonly {at:number;kind:PillModel['kind'];matchId:string|null}[] };

let mounted = false;

export const mountLive = (host: LiveHost): void => {
  if (mounted || !onlineBuildEnabled()) return;
  const api = duelApiUrl();
  if (!api) return;
  mounted = true;
  let unsubscribe = () => {};
  const start = () => {
    const id = readIdentity();
    if (!id) return;
    unsubscribe();
    window.removeEventListener('storage', storageChanged);
    run(host, createLiveApi({ baseUrl: api, token: () => readIdentity()?.token ?? null, region: duelRegion() }), id.playerId);
  };
  const storageChanged = (event: StorageEvent) => {
    if (isIdentityStorageEvent(event.key, STORAGE_PREFIX)) start();
  };
  unsubscribe = subscribeIdentityChanges(start);
  window.addEventListener('storage', storageChanged);
  start();
};

const run = (host: LiveHost, api: LiveApi, playerId: string): void => {
  injectLiveStyles();
  const returns = createReturnStore(browserStorage());
  const announce = createAnnouncer();
  const note = createGlassNote();
  const sound = new Sound(SOUND_REMOVED, new RecordedFx()); // the owner's recorded takes (2026-11-05)
  let offset = 0; // server clock minus local clock
  const toLocal = (serverMs: number) => serverMs - offset;
  const settings = () => page().settings?.();
  const reduceMotion = () => !!settings()?.reduceMotion || document.documentElement.classList.contains('reduce-motion');
  const syncSound = () => {
    const s = settings();
    sound.enabled = !!s?.sound;
    if (s) sound.setMix(s);
  };
  document.addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true });
  const haptic = (ms = 12) => {
    if (settings()?.vibration && 'vibrate' in navigator) navigator.vibrate(ms);
  };

  // ---- what the screen is doing ----
  const pointer = mountPointerBusy();
  const hardBusy = () =>
    pointer.active() || !!document.querySelector('.drag-source-dim') || !!document.querySelector('#draw-info:not([hidden])');
  const softBusy = () => !!page().busy?.() || !!page().online?.()?.revealing;
  const tutorial = () => !!page().tutorial?.();
  const currentMatchId = getOnlineMatchId;
  const presence = (): { status: PresenceStatus; matchId: string | null } => {
    if (tutorial()) return { status: 'tutorial', matchId: null };
    const m = currentMatchId();
    if (m) return { status: m === center?.liveMatchId() ? 'in_live' : 'in_match', matchId: m };
    if (gameVisible()) return { status: 'offline_game', matchId: null };
    return { status: 'idle', matchId: null };
  };

  // ---- the pop-up and the listener ----
  // The sender's confirmation is created below (it needs the pill), but the incoming window must be
  // able to dismiss it first: the two windows never stack (owner, 2026-10-26).
  let confirm: ReturnType<typeof createChallengeConfirm> | null = null;
  const popup = createChallengePopup({
    localDeadline: (c) => toLocal(c.expiresAt),
    onShown: () => {
      confirm?.hide();
      syncSound();
      // A challenge arrives: the owner's "someone moved" droplet (sound.chime when the takes are not in yet).
      sound.notify();
      haptic(10);
    },
  });
  let lastInbox: MyChallengesWire | null = null;
  const seenOutgoing = new Map<string, string>();
  let center: ChallengeCenter | null = null;
  const makeCenter = (playerId: string) => createChallengeCenter({
    api,
    playerId,
    popup,
    channel: createPlayerChannel(),
    clock: { now: () => Date.now() + offset, setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (id) => window.clearTimeout(id as number) },
    probe: {
      visible: () => document.visibilityState === 'visible',
      screen: () => ({ tutorial: tutorial(), hardBusy: hardBusy(), softBusy: softBusy() }),
      presence,
    },
    onVisibility: (cb) => {
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    events: {
      onPing: reason => {
        if (reason === 'connected') void center?.heartbeatNow().then(() => refresh());
        else void refresh();
      },
      onInbox: (inbox) => {
        offset = inbox.serverNow - Date.now();
        lastInbox = inbox;
        keepChallengesOn(inbox.challengesEnabled);
        // The sender's quiet answers: "Not now" / no answer.
        for (const c of inbox.outgoing) {
          const before = seenOutgoing.get(c.id);
          seenOutgoing.set(c.id, c.status);
          if (before === 'pending' && (c.status === 'declined' || c.status === 'expired')) {
            note(c.status === 'declined' ? LIVE.notNowFrom(c.toName ?? '') : LIVE.expired);
            if (waiting?.id === c.id) waiting = null;
            void refresh();
          }
        }
      },
      onLiveStarted: (matchId, via) => void liveStarted(matchId, via),
      onError: () => undefined,
      onActionError: () => note(LIVE.failed),
    },
  });
  center = makeCenter(playerId);

  // ---- match screen pieces ----
  // A tap on a ready bolt ASKS first; only Send challenge sends the invite (owner, 2026-10-26).
  confirm = createChallengeConfirm({
    onSend: () => void goLive('live'),
    onClose: () => pill.element.focus({ preventScroll: true }),
  });
  const pill = createPill(
    () => {
      const s = status && status.matchId === currentMatchId() ? status : null;
      const model = pillModel(s);
      // Only a genuinely available opponent opens the question. An incoming invitation owns the
      // screen: the sender's window must never stack on top of it.
      if (model.kind !== 'ready' || popup.isOpen()) return;
      confirm?.show(model.name, model.secs);
    },
    () => void cancelWaiting(),
  );
  const hud = createHud();
  const end = createEndWindow();
  const setLeave = mountLeaveItem(() => void leave());
  // Real-time challenges are always on (owner, 2026-10-23: no setting for it). A player who switched
  // them off before is switched back on, once per session, the first time the server says so.
  let reenabling = false;
  const keepChallengesOn = (enabled: boolean) => {
    if (enabled || reenabling) return;
    reenabling = true;
    void api.setEnabled(true).then(() => center?.pollNow());
  };

  let status: LiveStatusWire | null = null;
  let statusFor: string | null = null;
  let waiting: ChallengeWire | null = null;
  let sending = false;
  let sendGeneration = 0;
  /** Matches that were live on this device (their end never overwrites the saved return target). */
  const liveSeen = new Set<string>();
  let lastEndedAt: number | null = null;
  let lastSecond = -1;

  const homeKey = (seat: Player): string | null => {
    const os = getOnlineSession();
    if (!os) return null;
    const snap = os.driver.snapshot();
    return os.driver.perspective().mapKey(coordKey(homeCoord(seat, snap.view.config)));
  };

  const goLive = async (kind: 'live' | 'rematch', matchId = currentMatchId()): Promise<void> => {
    if (!matchId || sending) return;
    const attempt = ++sendGeneration;
    const token = readIdentity()?.token;
    sending = true;
    paint();
    scheduleStatus();
    try {
      const res = await api.challenge(matchId, kind);
      if (attempt !== sendGeneration || readIdentity()?.token !== token || currentMatchId() !== matchId) return;
      if (res.liveMatchId) {
        await liveStarted(res.liveMatchId, res.challenge);
        return;
      }
      waiting = res.challenge;
      seenOutgoing.set(res.challenge.id, 'pending');
      void center?.pollNow(); // the listener sees it is waiting and checks fast until answered
      haptic(8);
    } catch (e) {
      if (attempt === sendGeneration && readIdentity()?.token === token) note(errorWord((e as { code?: string }).code) ?? LIVE.failed);
    } finally {
      if (attempt === sendGeneration) { sending = false; paint(); }
    }
    await refresh();
  };

  const cancelWaiting = async (): Promise<void> => {
    const w = waiting;
    waiting = null;
    if (w) await api.cancel(w.id).catch(() => undefined);
    await refresh();
  };

  const leave = async (): Promise<void> => {
    const m = currentMatchId();
    if (!m) return;
    try {
      status = await api.leave(m);
      center?.noteLive(null);
    } catch {
      note(LIVE.failed);
    }
    paint();
  };

  /** Remember where the player was, then bring them to the live match and play the go-live moment. */
  const liveStarted = async (matchId: string, _via: ChallengeWire | null): Promise<void> => {
    waiting = null;
    center?.noteLive(matchId);
    const here = currentMatchId();
    if (here !== matchId) {
      // A rematch from a finished live match keeps the ORIGINAL return target for afterwards.
      if (!(here && liveSeen.has(here))) {
        const target: ReturnTarget = here ? { kind: 'match', matchId: here } : gameVisible() ? { kind: 'bot' } : { kind: 'menu' };
        returns.set(target);
      }
      await host.openMatch(matchId);
    }
    liveSeen.add(matchId);
    end.hide();
    // Wait (by state, not time) for the board of this match to be on screen.
    for (let i = 0; i < 40 && currentMatchId() !== matchId; i++) await new Promise((r) => setTimeout(r, 100));
    await refresh();
    syncSound();
    sound.matchFound();
    haptic(18);
    const me = status?.mySeat ?? 0;
    const keys = [homeKey(me), homeKey(me === 0 ? 1 : 0)].filter((k): k is string => !!k);
    hud.lightUp(keys, reduceMotion());
  };

  // The ONLY reason a live session ends now is that the MATCH ended (a resignation, a real-time
  // timeout or a natural finish), so the end window says "Match over". `endedLeft` stays as the
  // fallback for a row written by the older lenient leave.
  const endReason = (s: LiveStatusWire): string =>
    s.endedReason === 'finished' ? LIVE.endedFinished : LIVE.endedLeft;

  const showEnd = (s: LiveStatusWire) => {
    const target = returns.get();
    const back =
      target && !(target.kind === 'match' && target.matchId === s.matchId)
        ? {
            label: target.kind === 'bot' ? LIVE.backToYourGame : LIVE.backTo(target.kind === 'match' ? LIVE.targetMatch : LIVE.targetMenu),
            run: () => {
              returns.clear();
              void restoreTarget(target, host);
            },
          }
        : null;
    const rematch = s.endedReason === 'finished' && s.status === 'finished' ? () => void goLive('rematch', s.matchId) : null;
    end.show({ reason: endReason(s), back, rematch });
  };

  const pillModel = (s: LiveStatusWire | null): PillModel => {
    if (!s || s.status !== 'active') return { kind: 'hidden' };
    if (typeof s.limitMs !== 'number' || !Number.isFinite(s.limitMs) || s.limitMs <= 0) return { kind: 'disabled', label: LIVE.notAvailable };
    if (s.live) return { kind: 'live' };
    if (sending) return { kind: 'disabled', label: LIVE.sendingChallenge };
    const name = s.opponent.name ?? '';
    const pending = s.pending ?? (waiting?.matchId === s.matchId && waiting.status === 'pending' && Date.now() < toLocal(waiting.expiresAt) ? waiting : null);
    if (pending && pending.fromMe) {
      waiting = pending;
      const secs = Math.max(0, Math.ceil((toLocal(pending.expiresAt) - Date.now()) / 1000));
      return { kind: 'waiting', label: LIVE.waiting(name, secs), name, secs };
    }
    if (s.opponent.presence === 'offline') return { kind: 'away', name };
    if (s.me.liveMatchId || s.opponent.inLive || s.block === 'BUSY_LIVE') return { kind: 'disabled', label: LIVE.inLiveGame };
    if (s.block === 'NOT_AVAILABLE') return { kind: 'disabled', label: LIVE.notAvailable };
    if (s.block === 'BUSY' || s.opponent.presence === 'busy') return { kind: 'disabled', label: LIVE.busy };
    if (s.block === 'RATE_LIMITED') return { kind: 'disabled', label: LIVE.rateLimited };
    if (s.block === 'OFFLINE') return { kind: 'away', name };
    if (pending) return { kind: 'hidden' }; // their challenge is on its way to my pop-up
    return { kind: 'ready', name, secs: Math.round(s.limitMs / 1000) };
  };

  const presentation: {at:number;kind:PillModel['kind'];matchId:string|null}[] = [];
  const paint = () => {
    const s = status && status.matchId === currentMatchId() ? status : null;
    seconds.setActive(document.visibilityState === 'visible' && (!!s?.live || !!waiting));
    const model = pillModel(s);
    // The opponent may leave, the invite may be started elsewhere, or their own invitation may
    // arrive: the confirmation stands down rather than showing a decision that is no longer real.
    if (model.kind !== 'ready' && confirm?.isOpen()) confirm.hide();
    pill.render(model);
    const last = presentation.at(-1);
    if (last?.kind !== model.kind || last?.matchId !== (s?.matchId ?? null)) {
      presentation.push({at:Date.now(),kind:model.kind,matchId:s?.matchId??null});
      if (presentation.length > 12) presentation.shift();
    }
    setLeave(!!s?.live);
    const root = document.documentElement;
    if (!s || !s.live || typeof s.limitMs !== 'number' || !Number.isFinite(s.limitMs) || s.limitMs <= 0) {
      hud.render(null);
      if (root.dataset.blitzDuel) {
        delete root.dataset.blitzDuel;
        blitzClock()?.off();
      }
      return;
    }
    // BLITZ REPLACES REAL TIME (owner, 2026-11-06): the cockpit's LED stopwatch counts the server's own
    // turn deadline for whoever is moving (YOU / OPP), and every move is sent the moment it is made
    // (online/duel-session.ts reads `data-blitz-duel`). The old ring on the home gives way to it.
    root.dataset.blitzDuel = '1';
    hud.render(null);
    const actor = s.actor;
    const limit = s.limitMs;
    const side = actor === s.mySeat ? 'mine' : 'theirs';
    const clock = blitzClock();
    if (s.turnDeadlineAt === null) clock?.hold(side, limit);
    else clock?.run(side, toLocal(s.turnDeadlineAt));
  };
  /** The shared Blitz stopwatch in the cockpit (null before the cockpit exists). */
  const blitzClock = () => {
    const host = document.getElementById('smart-panel');
    return host ? blitzClockIn(host, { reduceMotion, tick: () => undefined }) : null;
  };

  // Seconds: ticks under 5 s and screen-reader lines at thresholds only (2 s steps under 10 s).
  const second = () => {
    if (document.visibilityState !== 'visible') return;
    const s = status;
    if (s?.live && typeof s.limitMs === 'number' && s.matchId === currentMatchId() && s.turnDeadlineAt !== null) {
      const left = Math.ceil((toLocal(s.turnDeadlineAt) - Date.now()) / 1000);
      if (left !== lastSecond && left >= 0 && left <= s.limitMs / 1000) {
        lastSecond = left;
        const mine = s.actor === s.mySeat;
        if (left <= 5 && left > 0 && mine) {
          syncSound();
          sound.timerTick();
        }
        if (left <= 10 && left > 0 && left % 2 === 0) announce(LIVE.timeLeftSr(left));
        if (left === 0 && mine) announce(LIVE.timesUp);
      }
    }
    if (waiting) paint(); // the waiting countdown
  };
  const seconds = createLiveTicker(second, {setTimeout:(fn,ms)=>window.setTimeout(fn,ms),clearTimeout:id=>window.clearTimeout(id as number)});

  // ---- the per-match status poll (1 s while live or waiting, 10 s otherwise; only in a match) ----
  let inflight: Promise<void> | null = null;
  let refreshAgain = false;
  let statusTimer: number | null = null;
  const scheduleStatus = () => {
    if (statusTimer !== null) window.clearTimeout(statusTimer);
    statusTimer = null;
    if (document.visibilityState !== 'visible' || !currentMatchId() || !readIdentity()) return;
    const fast = sending || !!status?.live || !!waiting || !!status?.pending;
    statusTimer = window.setTimeout(loop, fast ? 1_000 : 10_000);
  };
  const refresh = async (): Promise<void> => {
    if (inflight) { refreshAgain = true; return inflight; }
    inflight = (async () => {
      do {
        refreshAgain = false;
        const m = currentMatchId();
        const token = readIdentity()?.token;
        if (!m) {
          status = null;
          statusFor = null;
          publishOpponentStatus(null, null);
          paint();
          return;
        }
        try {
          const prev = statusFor === m ? status : null;
          const next = await api.status(m);
          if (currentMatchId() !== m || readIdentity()?.token !== token) { refreshAgain = true; continue; }
          publishOpponentStatus(m, next);
          offset = next.serverNow - Date.now();
          status = next;
          statusFor = m;
          if(sending && next.pending?.fromMe){
            // The server accepted the invitation even if its POST reply is still travelling.
            // Adopt that authoritative row and retire the stale send continuation.
            sendGeneration++; sending=false; waiting=next.pending;
            seenOutgoing.set(next.pending.id,'pending');
            void center?.pollNow();
          }
          center?.hintPending(next.pending);
          if (next.live) liveSeen.add(m);
          if (prev && prev.live && !next.live && next.endedAt !== lastEndedAt) {
            lastEndedAt = next.endedAt;
            center?.noteLive(null);
            showEnd(next);
          } else if (prev && !prev.live && next.live) {
            center?.noteLive(m);
          }
        } catch {
          if (currentMatchId() === m && readIdentity()?.token === token) publishOpponentStatus(m, null);
          /* quiet: the next poll tries again */
        }
        paint();
      } while (refreshAgain);
    })();
    try { await inflight; } finally { inflight = null; scheduleStatus(); }
  };
  function loop() {
    statusTimer = null;
    void refresh();
  }
  loop();
  center.start();

  let enteredMatch = currentMatchId();
  const entered = () => {
    const matchId = currentMatchId();
    if (matchId === enteredMatch) return;
    enteredMatch = matchId;
    sendGeneration++;sending = false;waiting = null;
    confirm?.hide();
    if (document.visibilityState !== 'visible') return;
    // Publish match entry before checking eligibility. Ordinary safety timers stay inexpensive.
    void center?.heartbeatNow().then(() => refresh());
    void refresh();
    void center?.pollNow();
  };
  subscribeOnlineSession(session => {
    // Dispatch entry before board construction can occupy the main thread. A departure waits
    // for the same task's screen teardown, so an idle menu is not published as an offline game.
    if (session) entered();
    else queueMicrotask(entered);
  });
  let identityToken = readIdentity()?.token;
  const identityChanged = () => {
    const identity = readIdentity();
    if (identity?.token === identityToken) return;
    identityToken = identity?.token;
    sendGeneration++;sending = false;
    center?.stop();
    center = identity ? makeCenter(identity.playerId) : null;
    status = null;statusFor = null;lastInbox = null;waiting = null;
    seenOutgoing.clear();liveSeen.clear();lastEndedAt = null;
    confirm?.hide();end.hide();publishOpponentStatus(null,null);paint();
    center?.start();
    void refresh();
  };
  subscribeIdentityChanges(identityChanged);
  window.addEventListener('storage', event => {
    if (isIdentityStorageEvent(event.key, STORAGE_PREFIX)) identityChanged();
  });
  document.addEventListener('visibilitychange', () => {
    seconds.setActive(document.visibilityState === 'visible' && (!!status?.live || !!waiting));
    if (document.visibilityState === 'visible') void refresh();
    else if (statusTimer !== null) { window.clearTimeout(statusTimer); statusTimer = null; }
  });
  window.addEventListener('online', () => {
    if (document.visibilityState !== 'visible') return;
    void center?.heartbeatNow().then(() => refresh());
    void center?.pollNow();
    void refresh();
  });

  (window as unknown as { __futasakuLive?: () => LiveDebug }).__futasakuLive = () => ({
    status,
    inbox: lastInbox,
    target: returns.get(),
    popup: popup.isOpen(),
    presentation: [...presentation],
  });
};

const errorWord = (code: string | undefined): string | null => {
  switch (code) {
    case 'BUSY_LIVE':
      return LIVE.inLiveGame;
    case 'NOT_AVAILABLE':
      return LIVE.notAvailable;
    case 'BUSY':
      return LIVE.busy;
    case 'RATE_LIMITED':
    case 'TOO_MANY_PENDING':
      return LIVE.rateLimited;
    default:
      return null;
  }
};
