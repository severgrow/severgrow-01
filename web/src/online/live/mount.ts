// Live duels — the client controller, mounted once from main.ts (only when online is enabled and an
// identity exists on this device). It reads the page through `window.__severgrow` (read-only test
// hooks that already exist) and the online session handle; it never changes the replay gate, the
// animation queue, the turn reveal, the sync polling or the render path.
import { coordKey, homeCoord } from '../../../../src/engine/index.js';
import type { Player } from '../../../../src/engine/index.js';
import { LIVE } from '../../../../src/strings.js';
import { browserStorage } from '../../../../server/src/client.js';
import { Sound } from '../../ui/sound.js';
import { duelApiUrl, duelRegion, onlineBuildEnabled } from '../config.js';
import { getOnlineSession } from '../duel-runtime.js';
import { IDENTITY_STORAGE_KEY } from '../identity.js';
import { createLiveApi } from './api.js';
import type { ChallengeWire, LiveApi, LiveStatusWire, MyChallengesWire, PresenceStatus } from './api.js';
import { createChallengeCenter } from './center.js';
import type { ChallengeCenter } from './center.js';
import { createPlayerChannel } from './channel.js';
import { createReturnStore, restoreTarget } from './return-target.js';
import type { ReturnHost, ReturnTarget } from './return-target.js';
import {
  createAnnouncer,
  createChallengePopup,
  createEndWindow,
  createGlassNote,
  createHud,
  createPill,
  injectLiveStyles,
  mountLeaveItem,
  mountSettingsSwitch,
} from './ui.js';
import type { PillModel } from './ui.js';

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
type LiveDebug = { status: LiveStatusWire | null; inbox: MyChallengesWire | null; target: ReturnTarget | null; popup: boolean };

let mounted = false;

export const mountLive = (host: LiveHost): void => {
  if (mounted || !onlineBuildEnabled()) return;
  const api = duelApiUrl();
  if (!api) return;
  const start = () => {
    const id = readIdentity();
    if (!id) {
      window.setTimeout(start, 5_000); // the identity appears the first time the player opens Online
      return;
    }
    mounted = true;
    run(host, createLiveApi({ baseUrl: api, token: () => readIdentity()?.token ?? null, region: duelRegion() }), id.playerId);
  };
  start();
};

const run = (host: LiveHost, api: LiveApi, playerId: string): void => {
  injectLiveStyles();
  const returns = createReturnStore(browserStorage());
  const announce = createAnnouncer();
  const note = createGlassNote();
  const sound = new Sound();
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
  let pointerDown = false;
  for (const t of ['pointerdown'] as const) document.addEventListener(t, () => (pointerDown = true), { capture: true });
  for (const t of ['pointerup', 'pointercancel'] as const) document.addEventListener(t, () => (pointerDown = false), { capture: true });
  const hardBusy = () =>
    pointerDown || !!document.querySelector('.drag-source-dim') || !!document.querySelector('#draw-info:not([hidden])');
  const softBusy = () => !!page().busy?.() || !!page().online?.()?.revealing;
  const tutorial = () => !!page().tutorial?.();
  const currentMatchId = (): string | null => getOnlineSession()?.driver.snapshot().matchId ?? null;
  const presence = (): { status: PresenceStatus; matchId: string | null } => {
    if (tutorial()) return { status: 'tutorial', matchId: null };
    const m = currentMatchId();
    if (m) return { status: m === center?.liveMatchId() ? 'in_live' : 'in_match', matchId: m };
    if (gameVisible()) return { status: 'offline_game', matchId: null };
    return { status: 'idle', matchId: null };
  };

  // ---- the pop-up and the listener ----
  const popup = createChallengePopup({
    localDeadline: (c) => toLocal(c.expiresAt),
    onShown: () => {
      syncSound();
      sound.chime(0);
      sound.chime(0.16);
      haptic(10);
    },
  });
  let lastInbox: MyChallengesWire | null = null;
  const seenOutgoing = new Map<string, string>();
  let center: ChallengeCenter | null = null;
  center = createChallengeCenter({
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
      onInbox: (inbox) => {
        offset = inbox.serverNow - Date.now();
        lastInbox = inbox;
        setSwitch(inbox.challengesEnabled);
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
    },
  });

  // ---- match screen pieces ----
  const pill = createPill(
    () => void goLive('live'),
    () => void cancelWaiting(),
  );
  const hud = createHud();
  const end = createEndWindow();
  const setLeave = mountLeaveItem(() => void leave());
  const setSwitch = mountSettingsSwitch(true, (on) => void api.setEnabled(on).then(() => center?.pollNow()));

  let status: LiveStatusWire | null = null;
  let statusFor: string | null = null;
  let waiting: ChallengeWire | null = null;
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
    if (!matchId) return;
    try {
      const res = await api.challenge(matchId, kind);
      if (res.liveMatchId) {
        await liveStarted(res.liveMatchId, res.challenge);
        return;
      }
      waiting = res.challenge;
      seenOutgoing.set(res.challenge.id, 'pending');
      haptic(8);
    } catch (e) {
      note(errorWord((e as { code?: string }).code) ?? LIVE.failed);
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
    sound.chime(0);
    sound.bloom();
    haptic(18);
    const me = status?.mySeat ?? 0;
    const keys = [homeKey(me), homeKey(me === 0 ? 1 : 0)].filter((k): k is string => !!k);
    hud.lightUp(keys, reduceMotion());
  };

  const endReason = (s: LiveStatusWire): string =>
    s.endedReason === 'finished' ? LIVE.endedFinished : s.endedReason === 'strikes' ? LIVE.endedStrikes : LIVE.endedLeft;

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
    if (!s || s.status !== 'active' || s.live) return { kind: 'hidden' };
    const name = s.opponent.name ?? '';
    const pending = s.pending;
    if (pending && pending.fromMe) {
      waiting = pending;
      const secs = Math.max(0, Math.ceil((toLocal(pending.expiresAt) - Date.now()) / 1000));
      return { kind: 'waiting', label: LIVE.waiting(name, secs) };
    }
    if (s.opponent.presence === 'offline') return { kind: 'hidden' };
    if (s.me.liveMatchId || s.opponent.inLive || s.block === 'BUSY_LIVE') return { kind: 'disabled', label: LIVE.inLiveGame };
    if (s.block === 'NOT_AVAILABLE') return { kind: 'disabled', label: LIVE.notAvailable };
    if (s.block === 'BUSY' || s.opponent.presence === 'busy') return { kind: 'disabled', label: LIVE.busy };
    if (s.block === 'COOLDOWN') return { kind: 'disabled', label: LIVE.cooldown };
    if (s.block === 'RATE_LIMITED') return { kind: 'disabled', label: LIVE.rateLimited };
    if (s.block === 'OFFLINE') return { kind: 'hidden' };
    if (pending) return { kind: 'hidden' }; // their challenge is on its way to my pop-up
    return { kind: 'ready', name, secs: Math.round((s.limitMs ?? 45_000) / 1000) };
  };

  const paint = () => {
    const s = status && status.matchId === currentMatchId() ? status : null;
    pill.render(pillModel(s));
    setLeave(!!s?.live);
    if (!s || !s.live) {
      hud.render(null);
      return;
    }
    const actor = s.actor;
    const limit = s.limitMs ?? 45_000;
    hud.render({
      live: true,
      limitMs: limit,
      deadline: s.turnDeadlineAt === null ? null : toLocal(s.turnDeadlineAt),
      side: actor === s.mySeat ? 'me' : 'opp',
      homeKey: homeKey(actor),
      myStrikes: s.strikes[s.mySeat],
      reduceMotion: reduceMotion(),
    });
  };

  // Seconds: ticks under 5 s and screen-reader lines at thresholds only (2 s steps under 10 s).
  const second = () => {
    const s = status;
    if (s?.live && s.matchId === currentMatchId() && s.turnDeadlineAt !== null) {
      const left = Math.ceil((toLocal(s.turnDeadlineAt) - Date.now()) / 1000);
      if (left !== lastSecond && left >= 0 && left <= (s.limitMs ?? 45_000) / 1000) {
        lastSecond = left;
        const mine = s.actor === s.mySeat;
        if (left <= 5 && left > 0 && mine) {
          syncSound();
          sound.tick();
        }
        if (left <= 10 && left > 0 && left % 2 === 0) announce(LIVE.timeLeftSr(left));
        if (left === 0 && mine) announce(LIVE.timesUp);
      }
    }
    if (waiting) paint(); // the waiting countdown
  };
  window.setInterval(second, 250);

  // ---- the per-match status poll (1 s while live or waiting, 3 s otherwise; only in a match) ----
  let inflight = false;
  const refresh = async (): Promise<void> => {
    const m = currentMatchId();
    if (!m) {
      status = null;
      statusFor = null;
      paint();
      return;
    }
    if (inflight) return;
    inflight = true;
    try {
      const prev = statusFor === m ? status : null;
      const next = await api.status(m);
      offset = next.serverNow - Date.now();
      status = next;
      statusFor = m;
      if (next.live) liveSeen.add(m);
      if (prev && prev.live && !next.live && next.endedAt !== lastEndedAt) {
        lastEndedAt = next.endedAt;
        center?.noteLive(null);
        showEnd(next);
      } else if (prev && !prev.live && next.live) {
        center?.noteLive(m);
      }
      if (prev && next.live && prev.live && next.strikes[next.mySeat] > prev.strikes[next.mySeat]) {
        announce(LIVE.strikeSr(next.strikes[next.mySeat]));
      }
    } catch {
      /* quiet: the next poll tries again */
    } finally {
      inflight = false;
    }
    paint();
  };
  const loop = () => {
    const fast = !!status?.live || !!waiting || !!status?.pending;
    const delay = document.visibilityState !== 'visible' ? 10_000 : fast ? 1_000 : 3_000;
    void refresh().finally(() => window.setTimeout(loop, delay));
  };
  loop();
  center.start();

  (window as unknown as { __futasakuLive?: () => LiveDebug }).__futasakuLive = () => ({
    status,
    inbox: lastInbox,
    target: returns.get(),
    popup: popup.isOpen(),
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
    case 'COOLDOWN':
      return LIVE.cooldown;
    case 'RATE_LIMITED':
    case 'TOO_MANY_PENDING':
      return LIVE.rateLimited;
    default:
      return null;
  }
};
