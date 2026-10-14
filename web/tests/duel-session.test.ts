// Phase 5 — OnlineSession Draw / draft / Throw / resign + offline flag regression.
import { describe, expect, it } from 'vitest';
import {
  applyAs,
  legalActions,
  newGame,
  viewFor,
  CURRENT_RULES_VERSION,
} from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import type { MatchViewPayload } from '../../server/src/protocol.js';
import {
  OnlineSession,
  createOnlineDriver,
  isOnlineDuel,
  onlinePathsActive,
  setOnlineSession,
  stepsFromEvents,
} from '../src/online/index.js';

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

/** Advance until seat 0 is in ACT (Draw committed). */
const toActSeat0 = (seed: number): State => {
  let s = newGame(seed);
  for (let i = 0; i < 80; i++) {
    if (s.phase === 'ACT' && s.actor === 0) return s;
    const v = viewFor(s, s.actor);
    const legal = legalActions(v);
    const a = legal.find((x) => x.t === 'Draw') ?? legal.find((x) => x.t === 'EndAct') ?? legal[0];
    if (!a) break;
    s = applyAs(s, s.actor, a);
  }
  if (!(s.phase === 'ACT' && s.actor === 0)) throw new Error(`seed ${seed} never reached seat0 ACT`);
  return s;
};

/** Advance until seat 1 is in ACT. */
const toActSeat1 = (seed: number): State => {
  let s = newGame(seed);
  for (let i = 0; i < 120; i++) {
    if (s.phase === 'ACT' && s.actor === 1) return s;
    const v = viewFor(s, s.actor);
    const legal = legalActions(v);
    const a = legal.find((x) => x.t === 'Draw') ?? legal.find((x) => x.t === 'EndAct') ?? legal[0];
    if (!a) break;
    s = applyAs(s, s.actor, a);
  }
  if (!(s.phase === 'ACT' && s.actor === 1)) throw new Error(`seed ${seed} never reached seat1 ACT`);
  return s;
};

const payloadFor = (
  state: State,
  seat: 0 | 1,
  revision = 1,
  extra: Partial<MatchViewPayload> = {},
): MatchViewPayload => {
  const view = viewFor(state, seat);
  return {
    matchId: 'm1',
    rulesVersion: CURRENT_RULES_VERSION,
    status: 'active',
    revision,
    turnStartRevision: revision,
    seat,
    startingPlayer: view.turnPlayer,
    turnPlayer: view.turnPlayer,
    actor: view.actor,
    view,
    legalActions: legalActions(view),
    events: [],
    turnDeadlineAt: Date.now() + 3_600_000,
    graceUsed: [0, 0],
    gracePeriods: 1,
    opponent: { seat: seat === 0 ? 1 : 0, playerId: 'opp', displayName: 'Fern' },
    result: null,
    serverNow: Date.now(),
    ...extra,
  };
};

const makeFetch = (getState: () => State, getSeat: () => 0 | 1, getRev: () => number, setRev: (n: number) => void, setState: (s: State) => void) => {
  const fetchImpl: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    if (init.method === 'POST' && path.endsWith('/actions')) {
      const body = JSON.parse(init.body!) as { action?: Action; actions?: Action[]; expectedRevision: number };
      const actions = body.actions ?? (body.action ? [body.action] : []);
      let s = getState();
      for (const a of actions) s = applyAs(s, s.actor, a);
      setState(s);
      setRev(getRev() + 1);
      const player = payloadFor(s, getSeat(), getRev());
      return { status: 200, ok: true, json: async () => ({ ok: true, replayed: false, player, serverNow: Date.now() }) };
    }
    if (init.method === 'POST' && path.endsWith('/resign')) {
      setRev(getRev() + 1);
      const player = payloadFor(getState(), getSeat(), getRev(), {
        status: 'finished',
        result: { winner: getSeat() === 0 ? 1 : 0, reason: 'resigned', scores: [0, 0] },
      });
      // Mark view as over for finishInfo
      player.view = { ...player.view, phase: 'GAME_OVER' };
      return {
        status: 200,
        ok: true,
        json: async () => ({
          ok: true,
          match: { matchId: 'm1', status: 'finished', inviteCode: null },
          player,
          serverNow: Date.now(),
        }),
      };
    }
    if (init.method === 'GET' && path.includes('/view')) {
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true, player: payloadFor(getState(), getSeat(), getRev()), serverNow: Date.now() }),
      };
    }
    return { status: 404, ok: false, json: async () => ({ ok: false, code: 'NOT_FOUND', message: 'no' }) };
  };
  return fetchImpl;
};

describe('offline flag regression', () => {
  it('reports no online paths when no duel session is set', () => {
    setOnlineSession(null);
    expect(isOnlineDuel()).toBe(false);
    expect(onlinePathsActive()).toBe(false);
  });
});

describe('OnlineSession turn flow', () => {
  it('drafts Grow locally and Throws as a batch; Undo works', async () => {
    let serverState = toActSeat0(21);
    let revision = 1;
    const seat = 0 as const;
    const fetchImpl = makeFetch(
      () => serverState,
      () => seat,
      () => revision,
      (n) => {
        revision = n;
      },
      (s) => {
        serverState = s;
      },
    );
    const base = payloadFor(serverState, seat, revision);
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    const driver = createOnlineDriver({
      client,
      token: 'tok',
      matchId: 'm1',
      initial: base,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const os = new OnlineSession(driver);
    setOnlineSession(os);
    expect(isOnlineDuel()).toBe(true);
    expect(os.myTurn).toBe(true);

    const grow = os.legal.find((a) => a.t === 'Sprout' || a.t === 'Bloom');
    expect(grow).toBeTruthy();
    const mid = await os.play(grow!);
    expect(mid.ok).toBe(true);
    if (mid.ok) expect(mid.played).not.toBeNull();
    expect(os.canUndo).toBe(true);
    expect(os.undo()).toBe(true);
    expect(os.canUndo).toBe(false);

    await os.play(grow!);
    const end = os.legal.find((a) => a.t === 'EndAct');
    expect(end).toBeTruthy();
    const thrown = await os.play(end!);
    expect(thrown.ok).toBe(true);
    setOnlineSession(null);
    expect(onlinePathsActive()).toBe(false);
  });

  it('maps seat-1 draft taps through perspective before send', async () => {
    let state = toActSeat1(5);
    let revision = 2;
    const sent: Action[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      if (init.method === 'POST' && init.body) {
        const body = JSON.parse(init.body) as { actions?: Action[]; action?: Action };
        const actions = body.actions ?? (body.action ? [body.action] : []);
        sent.push(...actions);
        for (const a of actions) state = applyAs(state, state.actor, a);
        revision += 1;
        return {
          status: 200,
          ok: true,
          json: async () => ({
            ok: true,
            replayed: false,
            player: payloadFor(state, 1, revision),
            serverNow: Date.now(),
          }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true, player: payloadFor(state, 1, revision), serverNow: Date.now() }),
      };
    };
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() }),
      token: 'tok',
      matchId: 'm1',
      initial: payloadFor(state, 1, revision),
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const os = new OnlineSession(driver);
    expect(os.driver.perspective().rotated).toBe(true);
    const sprout = os.legal.find((a) => a.t === 'Sprout');
    expect(sprout && sprout.t === 'Sprout').toBe(true);
    if (!sprout || sprout.t !== 'Sprout') return;
    await os.play(sprout);
    const end = os.legal.find((a) => a.t === 'EndAct') ?? { t: 'EndAct' as const };
    await os.play(end);
    const batch = sent.find((a) => a.t === 'Sprout');
    expect(batch && batch.t === 'Sprout').toBe(true);
    if (batch && batch.t === 'Sprout') {
      expect(batch.coord).toEqual(os.driver.perspective().unmapCoord(sprout.coord));
    }
  });

  it('resign finishes the duel with a You lost / You won title', async () => {
    let serverState = toActSeat0(11);
    let revision = 1;
    const seat = 0 as const;
    const fetchImpl = makeFetch(
      () => serverState,
      () => seat,
      () => revision,
      (n) => {
        revision = n;
      },
      (s) => {
        serverState = s;
      },
    );
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() }),
      token: 'tok',
      matchId: 'm1',
      initial: payloadFor(serverState, seat, revision),
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const os = new OnlineSession(driver);
    const res = await os.resign();
    expect(res.ok).toBe(true);
    expect(os.finished).toBe(true);
    const info = os.finishInfo();
    expect(info?.title).toBe('You lost');
    // Same sentence offline renders for the same result (perspective-aware, one source).
    expect(info?.reason).toBe('You resigned.');
  });
});

describe('catch-up steps from events', () => {
  it('builds grow/sever steps and maps for seat 1', () => {
    const events = [
      { t: 'Sprout' as const, player: 1 as const, card: 3, coord: { q: 2, r: -2 } },
      { t: 'Sever' as const, player: 0 as const, coords: [{ q: 1, r: -1 }] },
    ];
    const steps = stepsFromEvents(events, null);
    expect(steps.some((s) => s.k === 'grow')).toBe(true);
    expect(steps.some((s) => s.k === 'sever')).toBe(true);
  });
});

describe('a finished match is never gated by an animation', () => {
  /**
   * The owner's report: the WINNER's device showed the end screen at once, while the LOSING device
   * sat on the board (it looked like it was waiting for the turn to time out). A terminal status
   * has to outrank the reveal gate: nothing can be played once the duel is decided, so an enemy
   * turn still queued for replay must never keep the gate shut or withhold the end screen.
   */
  it('is not revealing, and has a finish screen, even with a queued enemy turn', async () => {
    const serverState = toActSeat0(21);
    const base = payloadFor(serverState, 0, 1);
    // The finishing payload: the match is over AND the last turn's events are still queued.
    const finishView: State = { ...serverState, phase: 'GAME_OVER', result: { winner: 1, reason: 'strangle', scores: [4, 9] } };
    const finished = payloadFor(serverState, 0, 2, {
      status: 'finished',
      result: { winner: 1, reason: 'strangle', scores: [4, 9] },
      events: [
        { t: 'Sprout', player: 1, card: 5, coord: { q: 1, r: -1 } },
        { t: 'GameEnd', result: { winner: 1, reason: 'strangle', scores: [4, 9] } },
      ],
    });
    finished.view = viewFor(finishView, 0);
    const fetchImpl: FetchLike = async (url, init) => {
      const path = new URL(url).pathname;
      if (init.method === 'GET' && path.includes('/view')) {
        return { status: 200, ok: true, json: async () => ({ ok: true, player: finished, serverNow: Date.now() }) };
      }
      return { status: 404, ok: false, json: async () => ({ ok: false, code: 'NOT_FOUND', message: 'no' }) };
    };
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() }),
      token: 'tok',
      matchId: 'm1',
      initial: base,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const os = new OnlineSession(driver);
    setOnlineSession(os);
    // Force the finished view through the same path the first poll uses.
    await driver.start();
    await new Promise((r) => setTimeout(r, 30));
    expect(os.finished).toBe(true);
    expect(driver.pendingEvents().length).toBeGreaterThan(0);
    expect(os.isRevealing, 'the gate must be open once the duel is decided').toBe(false);
    expect(os.myTurn).toBe(false);
    expect(os.legal).toEqual([]);
    expect(os.finishInfo()?.title).toBe('You lost');
    setOnlineSession(null);
  });
});
