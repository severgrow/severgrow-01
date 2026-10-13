// Live duels — the challenge listener with a fake server, a fake channel and a fake clock.
import { describe, expect, it } from 'vitest';
import type { ChallengeWire, LiveApi, MyChallengesWire } from '../src/online/live/api.js';
import { POLL_MS, createChallengeCenter } from '../src/online/live/center.js';
import type { PopupPort, Probe } from '../src/online/live/center.js';
import { MAX_SOFT_DEFER_MS, deferDecision } from '../src/online/live/deferral.js';
import { createReturnStore, restoreTarget, RETURN_KEY } from '../src/online/live/return-target.js';

const fakeClock = () => {
  let t = 1_000_000;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout: (fn: () => void, ms: number) => {
      seq += 1;
      timers.set(seq, { at: t + ms, fn });
      return seq;
    },
    clearTimeout: (id: unknown) => void timers.delete(id as number),
    async advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
      t = end;
    },
    pending: () => timers.size,
  };
};

const challenge = (o: Partial<ChallengeWire> = {}): ChallengeWire => ({
  id: 'c1',
  matchId: 'm1',
  kind: 'live',
  fromName: 'Fern',
  toName: 'Moss',
  fromMe: false,
  limitMs: 45_000,
  status: 'pending',
  createdAt: 1_000_000,
  expiresAt: 1_045_000,
  newMatchId: null,
  ...o,
});

const fakeServer = () => {
  const calls: string[] = [];
  let inbox: MyChallengesWire = { incoming: [], outgoing: [], liveMatchId: null, challengesEnabled: true, serverNow: 0 };
  const api: LiveApi = {
    presence: async (s, m) => void calls.push(`presence:${s}:${m ?? ''}`),
    status: async () => {
      throw new Error('unused');
    },
    challenge: async () => {
      throw new Error('unused');
    },
    accept: async (id) => {
      calls.push(`accept:${id}`);
      await Promise.resolve();
      inbox = { ...inbox, incoming: [], liveMatchId: 'm1' };
      return { challenge: challenge({ status: 'accepted' }), liveMatchId: 'm1' };
    },
    decline: async (id) => {
      calls.push(`decline:${id}`);
      inbox = { ...inbox, incoming: [] };
      return { challenge: challenge({ status: 'declined' }) };
    },
    cancel: async () => {
      throw new Error('unused');
    },
    inbox: async () => {
      calls.push('inbox');
      return inbox;
    },
    leave: async () => {
      throw new Error('unused');
    },
    setEnabled: async () => undefined,
  };
  return { api, calls, setInbox: (i: Partial<MyChallengesWire>) => void (inbox = { ...inbox, ...i }) };
};

const fakePopup = () => {
  let open: { c: ChallengeWire; accept: () => void; decline: () => void } | null = null;
  const shown: string[] = [];
  const port: PopupPort = {
    show: (c, a) => {
      open = { c, ...a };
      shown.push(c.id);
    },
    hide: () => void (open = null),
    isOpen: () => open !== null,
  };
  return { port, shown, open: () => open };
};

const setup = (screen: Partial<ReturnType<Probe['screen']>> = {}) => {
  const clock = fakeClock();
  const server = fakeServer();
  const popup = fakePopup();
  const state = { tutorial: false, hardBusy: false, softBusy: false, visible: true, ...screen };
  let pinged: (() => void) | null = null;
  const started: string[] = [];
  const center = createChallengeCenter({
    api: server.api,
    clock,
    popup: popup.port,
    playerId: 'p1',
    probe: {
      visible: () => state.visible,
      screen: () => ({ tutorial: state.tutorial, hardBusy: state.hardBusy, softBusy: state.softBusy }),
      presence: () => ({ status: state.tutorial ? 'tutorial' : 'idle', matchId: null }),
    },
    channel: {
      subscribe: (_id, cb) => {
        pinged = cb;
        return () => void (pinged = null);
      },
    },
    events: { onLiveStarted: (m) => void started.push(m) },
  });
  return { clock, server, popup, state, center, ping: () => pinged?.(), started, flush: () => clock.advance(0) };
};

describe('deferral rules', () => {
  it('never in the tutorial; waits for a drag/paint; waits for a replay at most 10 s', () => {
    expect(deferDecision({ tutorial: true, hardBusy: false, softBusy: false }, 99_999)).toBe('never');
    expect(deferDecision({ tutorial: false, hardBusy: true, softBusy: false }, 99_999)).toBe('wait');
    expect(deferDecision({ tutorial: false, hardBusy: false, softBusy: true }, MAX_SOFT_DEFER_MS - 1)).toBe('wait');
    expect(deferDecision({ tutorial: false, hardBusy: false, softBusy: true }, MAX_SOFT_DEFER_MS)).toBe('show');
    expect(deferDecision({ tutorial: false, hardBusy: false, softBusy: false }, 0)).toBe('show');
  });
});

describe('challenge listener', () => {
  it('heartbeats and polls while visible, pauses when hidden, cleans up on stop', async () => {
    const t = setup();
    t.center.start();
    await t.flush();
    expect(t.server.calls.filter((c) => c.startsWith('presence')).length).toBe(1);
    await t.clock.advance(POLL_MS * 3);
    const polls = t.server.calls.filter((c) => c === 'inbox').length;
    expect(polls).toBeGreaterThanOrEqual(3);
    t.state.visible = false;
    await t.clock.advance(POLL_MS); // the already-armed timer fires once, then nothing re-arms
    const after = t.server.calls.filter((c) => c === 'inbox').length;
    await t.clock.advance(POLL_MS * 5);
    expect(t.server.calls.filter((c) => c === 'inbox').length).toBe(after);
    t.center.stop();
    expect(t.clock.pending()).toBe(0);
  });

  it('a channel ping polls at once; the pop-up shows when idle', async () => {
    const t = setup();
    t.center.start();
    await t.flush();
    t.server.setInbox({ incoming: [challenge()] });
    t.ping();
    await t.flush();
    expect(t.popup.shown).toEqual(['c1']);
  });

  it('a challenge arriving mid-replay is delayed until the replay ends', async () => {
    const t = setup({ softBusy: true });
    t.center.start();
    await t.flush();
    t.server.setInbox({ incoming: [challenge()] });
    await t.center.pollNow();
    expect(t.popup.shown).toEqual([]);
    await t.clock.advance(2_000);
    expect(t.popup.shown).toEqual([]);
    t.state.softBusy = false;
    await t.clock.advance(300);
    expect(t.popup.shown).toEqual(['c1']);
  });

  it('a long replay only delays it up to 10 s; a drag delays it with no limit', async () => {
    const t = setup({ softBusy: true });
    t.center.start();
    await t.flush();
    t.server.setInbox({ incoming: [challenge({ expiresAt: 2_000_000 })] });
    await t.center.pollNow();
    await t.clock.advance(MAX_SOFT_DEFER_MS + 300);
    expect(t.popup.shown).toEqual(['c1']);
    const d = setup({ hardBusy: true });
    d.center.start();
    await d.flush();
    d.server.setInbox({ incoming: [challenge({ expiresAt: 2_000_000 })] });
    await d.center.pollNow();
    await d.clock.advance(30_000);
    expect(d.popup.shown).toEqual([]);
  });

  it('never shows during the tutorial (presence says tutorial, so the sender sees Busy)', async () => {
    const t = setup({ tutorial: true });
    t.center.start();
    await t.flush();
    expect(t.server.calls).toContain('presence:tutorial:');
    t.server.setInbox({ incoming: [challenge()] });
    await t.center.pollNow();
    await t.clock.advance(20_000);
    expect(t.popup.shown).toEqual([]);
  });

  it('a double-tap on Accept sends ONE accept', async () => {
    const t = setup();
    t.center.start();
    await t.flush();
    t.server.setInbox({ incoming: [challenge()] });
    await t.center.pollNow();
    const open = t.popup.open()!;
    open.accept();
    open.accept();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.server.calls.filter((c) => c.startsWith('accept')).length).toBe(1);
    expect(t.started).toEqual(['m1']);
    expect(t.popup.open()).toBeNull();
  });

  it('Not now declines once and closes; an expired challenge closes by itself', async () => {
    const t = setup();
    t.center.start();
    await t.flush();
    t.server.setInbox({ incoming: [challenge()] });
    await t.center.pollNow();
    t.popup.open()!.decline();
    await t.flush();
    expect(t.server.calls.filter((c) => c.startsWith('decline'))).toEqual(['decline:c1']);
    const e = setup();
    e.center.start();
    await e.flush();
    e.server.setInbox({ incoming: [challenge()] });
    await e.center.pollNow();
    expect(e.popup.open()).not.toBeNull();
    e.server.setInbox({ incoming: [] });
    await e.center.pollNow();
    expect(e.popup.open()).toBeNull();
  });

  it('the sender learns their challenge was accepted from the inbox (not on the first, baseline poll)', async () => {
    const t = setup();
    t.server.setInbox({ liveMatchId: 'old' });
    t.center.start();
    await t.flush();
    expect(t.started).toEqual([]);
    t.server.setInbox({ liveMatchId: null });
    await t.center.pollNow();
    t.server.setInbox({ liveMatchId: 'm9', outgoing: [challenge({ id: 'c9', fromMe: true, status: 'accepted', matchId: 'm9' })] });
    await t.center.pollNow();
    expect(t.started).toEqual(['m9']);
  });
});

describe('return target', () => {
  const kv = () => {
    const m = new Map<string, string>();
    return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
  };

  it('stores only a target (never a save) and restores bot / match-with-draft / menu', async () => {
    const store = kv();
    const save = 'the-offline-save-bytes';
    store.set('main2:severgrow.save', save);
    const r = createReturnStore(store);
    r.set({ kind: 'bot' });
    expect([...store.m.keys()].sort()).toEqual(['main2:severgrow.save', RETURN_KEY].sort());
    expect(store.get('main2:severgrow.save')).toBe(save);
    const did: string[] = [];
    const host = {
      continueBotGame: () => void did.push('bot'),
      openMatch: async (id: string) => void did.push(`match:${id}`),
      showMenu: () => void did.push('menu'),
    };
    await restoreTarget(r.get(), host);
    r.set({ kind: 'match', matchId: 'm2' });
    await restoreTarget(r.get(), host);
    r.clear();
    await restoreTarget(r.get(), host);
    expect(did).toEqual(['bot', 'match:m2', 'menu']);
    expect(store.get('main2:severgrow.save')).toBe(save);
  });

  it('ignores a corrupt stored target', () => {
    const store = kv();
    store.set(RETURN_KEY, '{"kind":"match"}');
    expect(createReturnStore(store).get()).toBeNull();
    store.set(RETURN_KEY, 'not json');
    expect(createReturnStore(store).get()).toBeNull();
  });
});
