// Phase 5 — OnlineSession Draw / draft / Throw / resign + offline flag regression.
import { describe, expect, it } from 'vitest';
import {
  allNeighbors,
  applyAs,
  boardCoords,
  coordKey,
  homeCoord,
  legalActions,
  strangledPlayers,
  newGame,
  onBoard,
  parseKey,
  viewFor,
  CURRENT_RULES_VERSION,
} from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import { fromEngineResult } from '../../server/src/protocol.js';
import type { MatchViewPayload } from '../../server/src/protocol.js';
import {
  OnlineSession,
  createOnlineDriver,
  duelUiFromSnapshot,
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

describe('a Grow that ENDS the game is committed at once (the owner\'s KO win)', () => {
  /**
   * The bug the owner hit in normal online play: a Bloom/Sprout that surrounds the opponent's home
   * is a MID-TURN DRAFT move. The draft's shadow became GAME_OVER, the page read that as "the match
   * is finished" and showed the winner an end screen, but nothing was ever sent to the server — so
   * the loser stayed on the board until the 24-hour deadline, and the winner's own screen showed the
   * fallback title instead of the result. The move must be committed the moment it ends the game.
   */
  const winningState = (): State => {
    const base = newGame(3107);
    const home = homeCoord(1, base.config);
    const board = { ...base.board };
    // A ring of my tiles around the opponent's home would be cut off by the Sever at the end of the
    // turn unless it is CONNECTED to my root, so lay a chain from my home to theirs first.
    const mine = homeCoord(0, base.config);
    const cells = boardCoords(base.config).map(coordKey);
    const rock = new Set(cells.filter((k) => base.terrain[k] === 'rock'));
    const prev = new Map<string, string | null>([[coordKey(mine), null]]);
    const queue: string[] = [coordKey(mine)];
    while (queue.length) {
      const k = queue.shift()!;
      if (k === coordKey(home)) break;
      for (const n of allNeighbors(parseKey(k)).map(coordKey)) {
        if (!cells.includes(n) || rock.has(n) || prev.has(n)) continue;
        prev.set(n, k);
        queue.push(n);
      }
    }
    for (let k: string | null = coordKey(home); k && k !== coordKey(mine); k = prev.get(k) ?? null) {
      if (k !== coordKey(home)) board[k] = { owner: 0 as const, strength: 9 };
    }
    // Rock never strangles, so the surrounding is built on the non-rock neighbours, all but one.
    const neighbours = allNeighbors(home).filter((n) => onBoard(n, base.config) && base.terrain[coordKey(n)] !== 'rock');
    for (const n of neighbours.slice(1)) board[coordKey(n)] = { owner: 0 as const, strength: 9 };
    if (neighbours.length < 3) throw new Error('not enough neighbours on this board');
    return {
      ...base,
      board,
      phase: 'ACT',
      actor: 0,
      turnPlayer: 0,
      sproutsThisTurn: 0,
      hands: [[{ id: 1002, suit: 0, rank: 5 }], base.hands[1]],
    };
  };

  /** The one open neighbour of the opponent's home: the hex that finishes the surround. */
  const openKeyOf = (state: State): string => {
    const home = homeCoord(1, state.config);
    const open = allNeighbors(home).filter((n) => onBoard(n, state.config) && state.terrain[coordKey(n)] !== 'rock');
    return coordKey(open[0]!);
  };

  it('the winning Sprout really does end the game in the engine', () => {
    const state = winningState();
    const sprout = legalActions(viewFor(state, 0)).find(
      (a) => a.t === 'Sprout' && coordKey(a.coord) === openKeyOf(state),
    );
    expect(sprout, 'a winning Sprout is legal on the last open neighbour').toBeTruthy();
    if (!sprout) return;
    const after = applyAs(state, 0, sprout);
    expect(after.phase).toBe('GAME_OVER');
    expect(after.result?.reason).toBe('strangle');
    expect(after.result?.winner).toBe(0);
  });

  it('playing it online commits the turn instead of leaving the match active', async () => {
    let serverState = winningState();
    let revision = 1;
    let posts = 0;
    const seat = 0 as const;
    /** The wire payload for the current server state (status/result follow the state, like the API). */
    const payload = (s: State, rev: number): MatchViewPayload => {
      const finished = s.phase === 'GAME_OVER';
      return {
        ...payloadFor(s, seat, rev),
        status: finished ? 'finished' : 'active',
        result: finished && s.result ? fromEngineResult(s.result) : null,
      };
    };
    const fetchImpl: FetchLike = async (url, init) => {
      const path = new URL(url).pathname;
      if (init.method === 'POST' && path.endsWith('/actions')) {
        posts++;
        const body = JSON.parse(init.body!) as { actions: Action[]; expectedRevision: number };
        let s = serverState;
        // Exactly what the server's `runCommit` does: apply the move that ENDED the game and drop
        // the rest of the turn, instead of rejecting the whole batch.
        for (const a of body.actions) {
          if (s.phase === 'GAME_OVER') break;
          s = applyAs(s, s.actor, a);
        }
        serverState = s;
        revision++;
        return { status: 200, ok: true, json: async () => ({ ok: true, replayed: false, player: payload(s, revision), serverNow: Date.now() }) };
      }
      if (init.method === 'GET' && path.includes('/view')) {
        return { status: 200, ok: true, json: async () => ({ ok: true, player: payload(serverState, revision), serverNow: Date.now() }) };
      }
      return { status: 404, ok: false, json: async () => ({ ok: false, code: 'NOT_FOUND', message: 'no' }) };
    };
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() }),
      token: 'tok',
      matchId: 'm1',
      initial: payload(serverState, revision),
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const os = new OnlineSession(driver);
    setOnlineSession(os);

    // Before the move: the match is active on the server, so the duel is NOT finished and the strip
    // must not say "Finished" (the local draft's shadow is what used to leak that word).
    const before = duelUiFromSnapshot(driver.snapshot(), false, false);
    expect(before.turn).toBe('mine');
    expect(os.finished).toBe(false);

    const sprout = os.legal.find((a) => a.t === 'Sprout' && coordKey(a.coord) === openKeyOf(serverState));
    expect(sprout, 'the winning Sprout is offered').toBeTruthy();
    if (!sprout) return;
    const res = await os.play(sprout);

    // The turn was committed to the server (the old code never sent it at all) …
    expect(posts).toBe(1);
    expect(serverState.phase).toBe('GAME_OVER');
    expect(serverState.result?.reason).toBe('strangle');
    // … the page knows the match is over, and the board shows the real ending.
    expect(res.ok).toBe(true);
    expect(res.ok && res.finished).toBe(true);
    expect(os.finished).toBe(true);
    const info = os.finishInfo();
    expect(info?.title).toBe('You won');
    expect(info?.reason).toContain('surrounded');
    // The strip reads the decided match (never "Your turn" on a finished duel).
    expect(duelUiFromSnapshot(driver.snapshot(), false, false).turn).toBe('finished');
    setOnlineSession(null);
  });
});

describe('a Grow that ENDS the game is committed at once', () => {
  /**
   * The owner's report: after a KO win on one device, the other device never showed the end screen.
   * Root cause: a Bloom/Blast/Sprout that strangles the opponent is a MID-TURN DRAFT move, so the
   * match on the server stayed `active` while this device's own display state said GAME_OVER — the
   * winning move was never sent, the opponent waited for the deadline, and this device could not
   * even offer its Throw (its own state had no legal actions left). The server already expects the
   * fix (`runCommit` applies the move that ended the game and drops the rest of the batch).
   *
   * This asserts the client half: one tap on a game-ending Grow must send `[move, EndAct]` as one
   * batch and surface `finished: true`.
   */
  it('sends the winning move (with EndAct) as one batch, and reports finished', async () => {
    // A Bloom that strangles. The ring around the opponent's root must survive the Sever that every
    // placement runs first (tiles cut off from their own root are removed), so our tiles are one
    // connected mass: the whole board is ours except the two roots, one open neighbour of THEIR
    // root, and a normal terrain everywhere (rock hexes never count towards a strangle).
    const base = newGame(3107);
    const oppRoot = homeCoord(1, base.config);
    const myRoot = homeCoord(0, base.config);
    const ring = allNeighbors(oppRoot).filter((n) => Object.prototype.hasOwnProperty.call(base.board, coordKey(n)));
    const target = ring[ring.length - 1]!;
    const terrain: State['terrain'] = { ...base.terrain };
    const board: State['board'] = {};
    for (const key of Object.keys(base.board)) {
      if (key === coordKey(myRoot)) board[key] = { owner: 0, strength: 0, root: true };
      else if (key === coordKey(oppRoot)) board[key] = { owner: 1, strength: 0, root: true };
      else board[key] = { owner: 0, strength: 1 };
    }
    for (const n of ring) {
      const key = coordKey(n);
      terrain[key] = 'normal';
      board[key] = { owner: 0, strength: 1 };
    }
    // The Bloom sits on three CONNECTED hexes of their ring: the empty one it fills and the two
    // they hold at strength 1 (a Bloom can take an enemy tile, never its own), so after it lands all
    // six neighbours of their root are ours — the strangle.
    board[coordKey(target)] = null;
    board[coordKey(ring[0]!)] = { owner: 1, strength: 1 };
    board[coordKey(ring[4]!)] = { owner: 1, strength: 1 };
    const state: State = {
      ...base,
      phase: 'ACT',
      actor: 0,
      turnPlayer: 0,
      startingPlayer: 0,
      board,
      terrain,
      hands: [[{ id: 0, suit: 0, rank: 3 }, { id: 1, suit: 1, rank: 3 }, { id: 2, suit: 2, rank: 3 }], base.hands[1]],
    };
    // The position really is one move from a strangle, and the move really ends the game.
    expect(strangledPlayers(state), 'not strangled yet').toEqual([]);

    const batches: Action[][] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      const path = new URL(url).pathname;
      if (init.method === 'POST' && path.endsWith('/actions')) {
        const body = JSON.parse(init.body!) as { actions?: Action[]; expectedRevision: number };
        batches.push(body.actions ?? []);
        // A committed batch of [winningMove, EndAct]: the server applies the move that ended the
        // game and drops the rest of the batch (its own `runCommit` rule), so the fake does too.
        let after = state;
        for (const a of body.actions!) {
          if (after.phase === 'GAME_OVER') break;
          after = applyAs(after, after.actor, a);
        }
        return {
          status: 200,
          ok: true,
          json: async () => ({
            ok: true,
            replayed: false,
            player: payloadFor(after, 0, 2, {
              status: 'finished',
              result: after.result ?? { winner: 0, reason: 'strangle', scores: [9, 1] },
            }),
            serverNow: Date.now(),
          }),
        };
      }
      if (init.method === 'GET' && path.includes('/view')) {
        return { status: 200, ok: true, json: async () => ({ ok: true, player: payloadFor(state, 0, 1), serverNow: Date.now() }) };
      }
      return { status: 404, ok: false, json: async () => ({ ok: false, code: 'NOT_FOUND', message: 'no' }) };
    };
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() }),
      token: 'tok',
      matchId: 'm1',
      initial: payloadFor(state, 0, 1),
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    const os = new OnlineSession(driver);
    setOnlineSession(os);
    const bloom = os.legal.find(
      (a): a is Extract<Action, { t: 'Bloom' }> =>
        a.t === 'Bloom' && a.hexes.some((h) => coordKey(h) === coordKey(target)),
    );
    expect(bloom, 'the position offers a game-ending Bloom (on the last open neighbour)').toBeTruthy();
    if (!bloom) return;
    const res = await os.play(bloom);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.finished, 'the session reports the match finished').toBe(true);
    // ONE batch, carrying the winning move and the turn-ending EndAct together.
    expect(batches).toHaveLength(1);
    expect(batches[0]!.some((a) => a.t === 'Bloom')).toBe(true);
    expect(batches[0]!.some((a) => a.t === 'EndAct')).toBe(true);
    setOnlineSession(null);
  });
});
