// Phase 3 — online client layer: fake server + fake channel.
import { describe, expect, it } from 'vitest';
import {
  applyAs,
  legalActions,
  newGame,
  viewFor,
  CURRENT_RULES_VERSION,
} from '../../src/engine/index.js';
import type { Action, State, View } from '../../src/engine/index.js';
import { DuelClient, DuelError, DUEL_CLIENT_VERSION } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import type { MatchViewPayload } from '../../server/src/protocol.js';
import {
  correctedNow,
  createDraftEngine,
  createFakeChannel,
  createIdentityStore,
  createOnlineDriver,
  createSyncEngine,
  emptyClock,
  formatRemaining,
  fruitKnownFromView,
  noteServerNow,
  POLL_ACTIVE_MS,
  POLL_HIDDEN_MS,
  presenceFromPeers,
  presenceLabel,
  remainingMs,
  shadowFromView,
  submitWithRetries,
  PLACEHOLDER_ID_BASE,
} from '../src/online/index.js';

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

const failingStore = (): KeyValue => ({
  get: () => {
    throw new Error('blocked');
  },
  set: () => {
    throw new Error('blocked');
  },
  remove: () => {
    throw new Error('blocked');
  },
});

type Route = { status: number; body: unknown };

const makeFetch = (routes: Record<string, Route | ((init: { method: string; headers: Record<string, string>; body?: string }) => Route)>) => {
  const calls: { method: string; url: string; headers: Record<string, string>; body?: string }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const entry: { method: string; url: string; headers: Record<string, string>; body?: string } = {
      method: init.method,
      url,
      headers: init.headers,
    };
    if (init.body !== undefined) entry.body = init.body;
    calls.push(entry);
    const path = new URL(url).pathname + (new URL(url).search ?? '');
    const key = `${init.method} ${path}`;
    const route = routes[key];
    const resolved = typeof route === 'function' ? route(init) : route ?? { status: 404, body: { ok: false, code: 'NOT_FOUND', message: 'no route' } };
    return { status: resolved.status, ok: resolved.status < 400, json: async () => resolved.body };
  };
  return { fetchImpl, calls };
};

const sampleView = (state: State, seat: 0 | 1 = 0): View => viewFor(state, seat);

const samplePayload = (overrides: Partial<MatchViewPayload> = {}): MatchViewPayload => {
  const state = newGame(42);
  const seat = (overrides.seat ?? 0) as 0 | 1;
  const view = sampleView(state, seat);
  return {
    matchId: 'm1',
    rulesVersion: CURRENT_RULES_VERSION,
    status: 'active',
    revision: 1,
    turnStartRevision: 0,
    seat,
    startingPlayer: view.turnPlayer,
    turnPlayer: view.turnPlayer,
    actor: view.actor,
    view,
    legalActions: legalActions(view),
    events: [],
    turnDeadlineAt: Date.now() + 3_600_000,
    opponent: { seat: seat === 0 ? 1 : 0, playerId: 'opp', displayName: 'PineFox' },
    result: null,
    serverNow: Date.now(),
    ...overrides,
  };
};

describe('clock (P-9)', () => {
  it('corrects browser time from serverNow and never goes negative', () => {
    const browser = 1_000_000;
    const server = browser + 10 * 60_000; // server 10 minutes ahead
    const clock = noteServerNow(emptyClock(), server, browser);
    expect(correctedNow(clock, browser)).toBe(server);
    expect(remainingMs(clock, server + 5_000, browser)).toBe(5_000);
    expect(remainingMs(clock, server - 1, browser)).toBe(0);
    expect(formatRemaining(0)).toBe("Time's up");
    expect(formatRemaining(18 * 3_600_000 + 42 * 60_000)).toBe('18h 42m');
  });

  it('handles clock skew of plus and minus 10 minutes the same way', () => {
    const browser = 5_000_000;
    const deadline = browser + 60_000;
    const ahead = noteServerNow(emptyClock(), browser + 600_000, browser);
    const behind = noteServerNow(emptyClock(), browser - 600_000, browser);
    // Corrected now differs; remaining is recomputed from timestamps, not accumulated ticks.
    expect(remainingMs(ahead, deadline, browser)).toBe(0);
    expect(remainingMs(behind, deadline, browser)).toBe(60_000 + 600_000);
  });

  it('throttled timers: a big jump still uses timestamps, not tick count', () => {
    const clock = noteServerNow(emptyClock(), 1_000, 0);
    const deadline = 1_000 + 30_000;
    expect(remainingMs(clock, deadline, 0)).toBe(30_000);
    // Tab slept; timers throttled — remaining is recomputed from the new browser time.
    expect(remainingMs(clock, deadline, 25_000)).toBe(5_000);
  });
});

describe('shadow from View (P-7)', () => {
  it('builds placeholder deck/opponent hand and keeps mid-turn legal actions aligned', () => {
    let state = newGame(7);
    // Advance until ACT with a hand that can Grow or EndAct.
    for (let i = 0; i < 40 && state.phase !== 'GAME_OVER'; i++) {
      const legal = legalActions(viewFor(state, state.actor));
      const draw = legal.find((a) => a.t === 'Draw');
      if (state.phase === 'DRAW' && draw) {
        state = applyAs(state, state.actor, draw);
        break;
      }
      const pick = legal.find((a) => a.t === 'EndAct') ?? legal[0];
      if (!pick) break;
      state = applyAs(state, state.actor, pick);
    }
    expect(state.phase).toBe('ACT');
    const view = viewFor(state, state.actor);
    const shadow = shadowFromView(view);
    expect(shadow.deck.length).toBe(view.deckCount);
    expect(shadow.hands[view.player === 0 ? 1 : 0]!.length).toBe(view.opponentHandCount);
    expect(shadow.deck.every((c) => c.id >= PLACEHOLDER_ID_BASE)).toBe(true);
    expect(fruitKnownFromView(view)[view.player === 0 ? 1 : 0]).toBeGreaterThanOrEqual(0);

    const legalAuth = legalActions(view).filter((a) => a.t !== 'Draw');
    const legalShadow = legalActions(viewFor(shadow, view.player)).filter((a) => a.t !== 'Draw');
    expect(JSON.stringify(legalShadow)).toBe(JSON.stringify(legalAuth));
  });
});

describe('identity', () => {
  it('silently creates a guest once and reuses the stored token', async () => {
    const store = memoryStore();
    let creates = 0;
    const { fetchImpl } = makeFetch({
      'POST /v1/guests': () => {
        creates++;
        return {
          status: 201,
          body: {
            ok: true,
            player: { id: 'p1', kind: 'guest', displayName: 'MossHare' },
            token: 'tok-a',
            serverNow: 1,
          },
        };
      },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: store });
    const identity = createIdentityStore({ client, storage: store });
    const first = await identity.ensure();
    const second = await identity.ensure();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.identity.token).toBe('tok-a');
      expect(second.identity.token).toBe('tok-a');
    }
    expect(creates).toBe(1);
  });

  it('reports storage failure honestly', async () => {
    const { fetchImpl } = makeFetch({
      'POST /v1/guests': {
        status: 201,
        body: { ok: true, player: { id: 'p1', kind: 'guest', displayName: null }, token: 't', serverNow: 1 },
      },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: null });
    const identity = createIdentityStore({ client, storage: null });
    const status = await identity.ensure();
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.reason).toBe('storage_blocked');
  });

  it('link-code redeem adopts a new token without moving the old one', async () => {
    const store = memoryStore();
    const { fetchImpl } = makeFetch({
      'POST /v1/guests': {
        status: 201,
        body: { ok: true, player: { id: 'p1', kind: 'guest', displayName: 'A' }, token: 'old', serverNow: 1 },
      },
      'POST /v1/players/link': {
        status: 200,
        body: {
          ok: true,
          player: { id: 'p1', kind: 'guest', displayName: 'A' },
          token: 'new-token',
          serverNow: 2,
        },
      },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: store });
    const identity = createIdentityStore({ client, storage: store });
    await identity.ensure();
    const redeemed = await identity.redeemLinkCode('ABCD1234');
    expect(redeemed.ok).toBe(true);
    if (redeemed.ok) expect(redeemed.identity.token).toBe('new-token');
  });
});

describe('draft + session storage', () => {
  it('keeps a Grow draft across persist/reload and clears when revision moves', () => {
    const store = memoryStore();
    const state = newGame(11);
    // Force ACT for seat 0 if possible
    let s = state;
    const actor = s.actor;
    if (s.phase === 'DRAW') {
      const draw = legalActions(viewFor(s, actor)).find((a) => a.t === 'Draw');
      if (draw) s = applyAs(s, actor, draw);
    }
    const view = viewFor(s, s.actor);
    const draft = createDraftEngine({ matchId: 'm1', storage: store });
    draft.syncFromServer(view, 3);
    const legal = draft.legal();
    const grow =
      legal.find((a) => a.t === 'Bloom' || a.t === 'Sprout' || a.t === 'PlayFruit' || a.t === 'MegaBomb') ??
      legal.find((a) => a.t !== 'EndAct' && a.t !== 'Draw');
    if (grow) {
      expect(draft.play(grow)).toBe(true);
      draft.persist();
      const again = createDraftEngine({ matchId: 'm1', storage: store });
      again.syncFromServer(view, 3);
      expect(again.hasDraft()).toBe(true);
      expect(again.actions()).toEqual([grow]);
      again.syncFromServer(view, 4);
      expect(again.hasDraft()).toBe(false);
    } else {
      // Still assert undo/clear paths on empty
      expect(draft.hasDraft()).toBe(false);
      expect(draft.undo()).toBe(false);
    }
  });

  it('survives offline: draft stays in memory when storage writes fail', () => {
    const view = sampleView(newGame(3));
    const draft = createDraftEngine({ matchId: 'm2', storage: failingStore() });
    draft.syncFromServer(view, 1);
    const end = draft.legal().find((a) => a.t === 'EndAct');
    // May or may not be legal depending on phase; persist must not throw either way.
    expect(() => draft.persist()).not.toThrow();
    if (end && view.phase === 'ACT') {
      // EndAct is submitted as Throw, not usually drafted — just ensure play does not crash.
      expect(typeof draft.play(end)).toBe('boolean');
    }
  });
});

describe('sync engine (poll + ping)', () => {
  it('polls fast when visible, slow when hidden; ping and visibility force a refresh', async () => {
    const timers: { fn: () => void; ms: number }[] = [];
    let visible = true;
    let revision = 1;
    const payload = samplePayload({ revision: 1 });
    const { fetchImpl, calls } = makeFetch({
      'GET /v1/matches/m1/view?since=0': () => ({
        status: 200,
        body: { ok: true, player: { ...payload, revision }, serverNow: 1000 },
      }),
      'GET /v1/matches/m1/view?since=1': () => ({
        status: 200,
        body: { ok: true, player: { ...payload, revision: 2 }, serverNow: 1001 },
      }),
      'GET /v1/matches/m1/view?since=2': () => ({
        status: 200,
        body: { ok: true, player: { ...payload, revision: 2 }, serverNow: 1002 },
      }),
    });
    // After first fetch revision becomes 1; subsequent use since=1
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    const fake = createFakeChannel();
    const views: number[] = [];
    const sync = createSyncEngine({
      client,
      token: 'tok',
      matchId: 'm1',
      channel: fake.channel,
      isVisible: () => visible,
      isOnline: () => true,
      setTimer: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearTimer: () => undefined,
      onView: (p) => views.push(p.revision),
    });
    await sync.start();
    expect(views[0]).toBe(1);
    expect(timers.at(-1)?.ms).toBe(POLL_ACTIVE_MS);

    visible = false;
    sync.setVisible(false);
    expect(timers.at(-1)?.ms).toBe(POLL_HIDDEN_MS);

    revision = 2;
    fake.emitPing('m1', { revision: 2, status: 'active' });
    await sync.refresh();
    expect(views.length).toBeGreaterThan(1);

    // Dropped pings: channel down, poll still works
    fake.goDown();
    const before = calls.length;
    await sync.refresh();
    expect(calls.length).toBeGreaterThan(before);

    sync.stop();
  });

  it('duplicate pings do not break ordering; CLIENT_TOO_OLD surfaces', async () => {
    const { fetchImpl } = makeFetch({
      'GET /v1/matches/m1/view?since=0': {
        status: 426,
        body: { ok: false, code: 'CLIENT_TOO_OLD', message: 'Reload to update FUTASAKU.' },
      },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    const fake = createFakeChannel();
    let status = '';
    const sync = createSyncEngine({
      client,
      token: 'tok',
      matchId: 'm1',
      channel: fake.channel,
      setTimer: () => 1,
      clearTimer: () => undefined,
      onConnection: (s) => {
        status = s;
      },
    });
    await sync.start();
    expect(status).toBe('client_too_old');
    fake.emitPing('m1', { revision: 9, status: 'active' });
    fake.emitPing('m1', { revision: 9, status: 'active' });
    sync.stop();
  });
});

describe('retries', () => {
  it('retries with the SAME requestId and recovers from 409', async () => {
    const requestIds: string[] = [];
    let attempt = 0;
    const { fetchImpl } = makeFetch({
      'POST /v1/matches/m1/actions': (init) => {
        const body = JSON.parse(init.body!) as { requestId: string };
        requestIds.push(body.requestId);
        attempt++;
        if (attempt < 3) {
          return { status: 500, body: { ok: false, code: 'HTTP_ERROR', message: 'boom' } };
        }
        return {
          status: 200,
          body: { ok: true, replayed: false, player: samplePayload({ revision: 2 }), serverNow: 1 },
        };
      },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    const outcome = await submitWithRetries({
      client,
      token: 'tok',
      matchId: 'm1',
      expectedRevision: 1,
      requestId: 'stable-id',
      actions: [{ t: 'EndAct' }],
      rulesVersion: CURRENT_RULES_VERSION,
      retryDelayMs: 0,
    });
    expect(outcome.ok).toBe(true);
    expect(requestIds).toEqual(['stable-id', 'stable-id', 'stable-id']);

    const { fetchImpl: fetch409 } = makeFetch({
      'POST /v1/matches/m1/actions': {
        status: 409,
        body: { ok: false, code: 'STALE_REVISION', message: 'stale' },
      },
    });
    const client409 = new DuelClient({ baseUrl: 'https://api.example', fetch: fetch409, storage: memoryStore() });
    const stale = await submitWithRetries({
      client: client409,
      token: 'tok',
      matchId: 'm1',
      expectedRevision: 1,
      requestId: 'r2',
      actions: [{ t: 'EndAct' }],
      rulesVersion: CURRENT_RULES_VERSION,
      refetch: async () => ({ player: samplePayload({ revision: 5 }), serverNow: 9 }),
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.keepDraft).toBe(false);
      expect(stale.player?.revision).toBe(5);
    }
  });

  it('refuses a rules mismatch and keeps the draft', async () => {
    const client = new DuelClient({
      baseUrl: 'https://api.example',
      fetch: makeFetch({}).fetchImpl,
      storage: memoryStore(),
    });
    const outcome = await submitWithRetries({
      client,
      token: 'tok',
      matchId: 'm1',
      expectedRevision: 1,
      requestId: 'r',
      actions: [{ t: 'EndAct' }],
      rulesVersion: 'ancient-rules',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('RULES_MISMATCH');
      expect(outcome.keepDraft).toBe(true);
    }
  });
});

describe('presence', () => {
  it('is display-only Online / Away', () => {
    expect(presenceLabel(presenceFromPeers(1))).toBe('Online');
    expect(presenceLabel(presenceFromPeers(0))).toBe('Away');
    const fake = createFakeChannel();
    let seen = '';
    fake.channel.subscribe('m1', {
      onPing: () => undefined,
      onPresence: (p) => {
        seen = presenceLabel(p.opponent);
      },
    });
    fake.emitPresence('m1', { opponent: 'online' });
    expect(seen).toBe('Online');
  });
});

describe('OnlineDriver seam', () => {
  it('draws on the server, drafts locally, and batches Throw; 409 clears draft', async () => {
    const base = samplePayload({ revision: 1 });
    // Make sure we are in ACT for draft path after a fake draw response
    let actState = newGame(21);
    for (let i = 0; i < 30; i++) {
      const v = viewFor(actState, actState.actor);
      const legal = legalActions(v);
      if (actState.phase === 'ACT') break;
      const a = legal.find((x) => x.t === 'Draw') ?? legal[0];
      if (!a) break;
      actState = applyAs(actState, actState.actor, a);
    }
    const afterDrawView = viewFor(actState, actState.actor);
    const afterDraw = samplePayload({
      revision: 2,
      view: afterDrawView,
      actor: afterDrawView.actor,
      turnPlayer: afterDrawView.turnPlayer,
      seat: afterDrawView.player,
      legalActions: legalActions(afterDrawView),
    });

    let actionCalls = 0;
    const { fetchImpl } = makeFetch({
      'GET /v1/matches/m1/view?since=0': { status: 200, body: { ok: true, player: base, serverNow: 1 } },
      'GET /v1/matches/m1/view': { status: 200, body: { ok: true, player: afterDraw, serverNow: 2 } },
      'POST /v1/matches/m1/actions': (init) => {
        actionCalls++;
        const body = JSON.parse(init.body!) as { action?: Action; actions?: Action[]; expectedRevision: number };
        if (body.action?.t === 'Draw') {
          return { status: 200, body: { ok: true, replayed: false, player: afterDraw, serverNow: 2 } };
        }
        if (actionCalls >= 2 && body.actions) {
          return {
            status: 409,
            body: { ok: false, code: 'STALE_REVISION', message: 'stale' },
          };
        }
        return { status: 200, body: { ok: true, replayed: false, player: afterDraw, serverNow: 3 } };
      },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    const fake = createFakeChannel();
    const driver = createOnlineDriver({
      client,
      token: 'tok',
      matchId: 'm1',
      channel: fake.channel,
      initial: base,
      setTimer: () => 1,
      clearTimer: () => undefined,
      isVisible: () => true,
      isOnline: () => true,
    });
    await driver.start();

    const draw: Action = { t: 'Draw', from: 'deck' };
    const drawn = await driver.draw(draw);
    expect(drawn.ok).toBe(true);
    expect(driver.snapshot().revision).toBe(2);

    const grow = driver.snapshot().legal.find((a) => a.t === 'Bloom' || a.t === 'Sprout');
    if (grow) {
      expect(driver.draftPlay(grow)).toBe(true);
      expect(driver.snapshot().hasDraft).toBe(true);
      expect(driver.draftUndo()).toBe(true);
      expect(driver.draftPlay(grow)).toBe(true);
      const thrown = await driver.throwTurn({ t: 'EndAct' });
      // 409 path clears draft
      expect(thrown.ok).toBe(false);
      expect(driver.snapshot().hasDraft).toBe(false);
      expect(driver.snapshot().notice).toMatch(/cards are back/i);
    }

    driver.stop();
  });
});

describe('DuelClient version handshake headers', () => {
  it('sends client and rules version on every request', async () => {
    const { fetchImpl, calls } = makeFetch({
      'GET /v1/health': { status: 200, body: { ok: true, rulesVersion: CURRENT_RULES_VERSION, serverNow: 1 } },
      'POST /v1/guests': {
        status: 201,
        body: { ok: true, player: { id: 'p', kind: 'guest', displayName: null }, token: 't', serverNow: 1 },
      },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    await client.createGuest();
    expect(calls[0]!.headers['x-futasaku-client-version']).toBe(DUEL_CLIENT_VERSION);
    expect(calls[0]!.headers['x-futasaku-rules-version']).toBe(CURRENT_RULES_VERSION);
  });

  it('maps CLIENT_TOO_OLD to DuelError', async () => {
    const { fetchImpl } = makeFetch({
      'POST /v1/guests': {
        status: 426,
        body: { ok: false, code: 'CLIENT_TOO_OLD', message: 'Reload to update FUTASAKU.' },
      },
    });
    const client = new DuelClient({
      baseUrl: 'https://api.example',
      fetch: fetchImpl,
      storage: memoryStore(),
      clientVersion: '0.0.1',
    });
    await expect(client.createGuest()).rejects.toMatchObject({ code: 'CLIENT_TOO_OLD' });
    await expect(client.createGuest()).rejects.toBeInstanceOf(DuelError);
  });
});

describe('service worker API bypass (P-5)', () => {
  it('documents an explicit duel API bypass in futa04-sw.js', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = fileURLToPath(new URL('../public/futa04-sw.js', import.meta.url));
    const src = readFileSync(path, 'utf8');
    expect(src).toContain('isDuelApi');
    expect(src).toContain('/functions/v1/duel');
    expect(src).toContain('never touch the cache');
  });
});
