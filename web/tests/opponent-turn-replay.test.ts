// Replay the opponent's last turn in an ONLINE duel (owner report, 2026-10-26:
// "the replay last round button was disabled all the time, so i wasnt able to rewatch opponents
// last turn").
//
// The offline game replays the bot's turn from `Session.turns`, which only the LOCAL player's own
// `Session.play` fills. Online there is no such record (the session keeps this seat's actions only),
// so the turn is rebuilt from the match's public event history instead — and the rebuild is only
// offered when a MANDATORY self-check proves it: the fold is continued through the rest of the
// history and the final board must equal the live board exactly.
import { describe, expect, it } from 'vitest';
import {
  applyAs,
  eventsOf,
  legalActions,
  newGame,
  viewFor,
  CURRENT_RULES_VERSION,
} from '../../src/engine/index.js';
import type { Action, Event, Player, State } from '../../src/engine/index.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import type { MatchViewPayload } from '../../server/src/protocol.js';
import {
  OnlineSession,
  createOnlineDriver,
  groupTurns,
  onlinePerspective,
  openingBoard,
  pickOpponentTurn,
  buildOpponentTurnReplay,
  stepContextFor,
} from '../src/online/index.js';
import { applyStep } from '../src/logic/anim.js';
import type { Board } from '../src/logic/anim.js';

// ---------- helpers ----------

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

/**
 * One whole turn played through the engine exactly as the server commits it: Draw, one Grow,
 * EndAct, Discard — collecting the public events the server would store for that turn.
 */
const playTurn = (start: State): { state: State; events: Event[] } => {
  const events: Event[] = [];
  let cur = start;
  const mover = cur.turnPlayer;
  const play = (pick: (legal: Action[]) => Action | undefined): void => {
    if (cur.phase === 'GAME_OVER' || cur.turnPlayer !== mover) return;
    const a = pick(legalActions(viewFor(cur, cur.actor)));
    if (!a) return;
    const after = applyAs(cur, cur.actor, a);
    events.push(...eventsOf(cur, a, after));
    cur = after;
  };
  play((l) => l.find((x) => x.t === 'Draw'));
  play((l) => l.find((x) => x.t === 'Bloom') ?? l.find((x) => x.t === 'Sprout'));
  play((l) => l.find((x) => x.t === 'EndAct'));
  play((l) => l.find((x) => x.t === 'Discard'));
  return { state: cur, events };
};

/** The history the server would hand this seat: every event, the opponent's deck draws hidden. */
const historyFor = (seat: Player, events: readonly Event[]): Event[] =>
  events.map((e) =>
    e.t === 'Draw' && e.from === 'deck' && e.player !== seat ? { t: 'Draw', player: e.player, from: 'deck' } : e,
  );

/** Only the DRAW of the next turn: enough for that seat's group to be the last (and open) one. */
const drawOnly = (start: State): { state: State; events: Event[] } => {
  const a = legalActions(viewFor(start, start.actor)).find((x) => x.t === 'Draw');
  if (!a) throw new Error('no Draw offered');
  const after = applyAs(start, start.actor, a);
  return { state: after, events: eventsOf(start, a, after) };
};

type Server = { state: State; events: Event[]; seat: Player; gets: number };

const payloadFor = (server: Server, extra: Partial<MatchViewPayload> = {}): MatchViewPayload => {
  const view = viewFor(server.state, server.seat);
  return {
    matchId: 'm1',
    rulesVersion: CURRENT_RULES_VERSION,
    status: 'active',
    revision: 1,
    turnStartRevision: 1,
    seat: server.seat,
    startingPlayer: server.state.startingPlayer ?? 0,
    turnPlayer: view.turnPlayer,
    actor: view.actor,
    view,
    legalActions: legalActions(view),
    events: historyFor(server.seat, server.events),
    turnDeadlineAt: Date.now() + 3_600_000,
    graceUsed: [0, 0],
    gracePeriods: 1,
    opponent: { seat: (server.seat === 0 ? 1 : 0) as Player, playerId: 'opp', displayName: 'Fern' },
    result: null,
    serverNow: Date.now(),
    ...extra,
  };
};

const serverFetch = (server: Server, options: { failHistory?: boolean } = {}): FetchLike => async (url, init) => {
  const path = new URL(url).pathname;
  if (init.method === 'GET' && path.includes('/view')) {
    server.gets += 1;
    if (options.failHistory) return { status: 500, ok: false, json: async () => ({ ok: false, code: 'BOOM', message: 'no' }) };
    return { status: 200, ok: true, json: async () => ({ ok: true, player: payloadFor(server), serverNow: Date.now() }) };
  }
  return { status: 404, ok: false, json: async () => ({ ok: false, code: 'NOT_FOUND', message: 'no' }) };
};

const openSession = (server: Server, options: { failHistory?: boolean } = {}): OnlineSession => {
  const driver = createOnlineDriver({
    client: new DuelClient({ baseUrl: 'https://api.example', fetch: serverFetch(server, options), storage: memoryStore() }),
    token: 'tok',
    matchId: 'm1',
    // The device has already seen everything up to this revision (a normal reconnect): nothing is
    // waiting to be revealed, so a replay question is the ONLY read this session makes.
    initial: { ...payloadFor(server), events: [] },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  return new OnlineSession(driver);
};

/** The live board in the same space the display uses (identity for seat 0, rotated for seat 1). */
const displayBoard = (state: State, seat: Player): Board => onlinePerspective(seat).toDisplayState(state).board;

/** The opening board as the page sees it: built from the DISPLAY config (the state it paints). */
const openingFor = (state: State, seat: Player): Board =>
  openingBoard(onlinePerspective(seat).toDisplayState(state).config);

// ---------- the group / boundary selector ----------

describe('the public history, grouped into turns', () => {
  it('never splits a turn at a Sever or a Strangle (neither names the mover)', () => {
    // A Sever names the player whose tiles were CUT — often the opponent — and a Strangle names the
    // player who was surrounded. Grouping on `event.player` would invent a turn for the opponent in
    // the middle of the mover's own turn.
    const events: Event[] = [
      { t: 'Draw', player: 0, from: 'deck', card: 1 },
      { t: 'Sprout', player: 0, card: 2, coord: { q: 0, r: 1 } },
      { t: 'Sever', player: 1, coords: [{ q: 1, r: 1 }] },
      { t: 'Discard', player: 0, card: 3 },
      { t: 'Draw', player: 1, from: 'deck', card: 4 },
      { t: 'Bloom', player: 1, cards: [5, 6], hexes: [{ q: 1, r: -1 }, { q: 1, r: -2 }] },
      { t: 'Sever', player: 0, coords: [{ q: 0, r: 2 }] },
      { t: 'Discard', player: 1, card: 7 },
    ];
    const groups = groupTurns(events);
    expect(groups.map((g) => g.player)).toEqual([0, 1]);
    // Each turn keeps the cut it caused, whoever's tiles were removed.
    expect(groups[0]!.events.filter((e) => e.t === 'Sever')).toHaveLength(1);
    expect(groups[0]!.events.some((e) => e.t === 'Sever' && e.player === 1)).toBe(true);
    expect(groups[1]!.events.some((e) => e.t === 'Sever' && e.player === 0)).toBe(true);
    expect(groups[1]!.events.some((e) => e.t === 'Bloom')).toBe(true);
    expect(groups[1]!.events.at(-1)!.t).toBe('Discard');
  });

  it('keeps a GameEnd with the turn that produced it', () => {
    const events: Event[] = [
      { t: 'Draw', player: 0, from: 'deck', card: 1 },
      { t: 'Sprout', player: 0, card: 2, coord: { q: 0, r: 1 } },
      { t: 'Discard', player: 0, card: 3 },
      { t: 'Draw', player: 1, from: 'deck', card: 4 },
      { t: 'Bloom', player: 1, cards: [5, 6], hexes: [{ q: 1, r: -1 }, { q: 1, r: -2 }] },
      { t: 'Strangle', player: 0 },
      { t: 'GameEnd', result: { winner: 1, reason: 'strangle', scores: [1, 2] } },
    ];
    const groups = groupTurns(events);
    expect(groups.map((g) => g.player)).toEqual([0, 1]);
    expect(groups[1]!.events.at(-1)!.t).toBe('GameEnd');
  });
});

describe('choosing the opponent\'s last COMPLETED turn', () => {
  const live = (actor: Player, finished = false) => ({ actor, finished });

  it('offers the turn that has just ended, even before the player has drawn', () => {
    const events: Event[] = [
      { t: 'Draw', player: 0, from: 'deck', card: 1 },
      { t: 'Sprout', player: 0, card: 2, coord: { q: 0, r: 1 } },
      { t: 'Discard', player: 0, card: 3 },
      { t: 'Draw', player: 1, from: 'deck', card: 4 },
      { t: 'Sprout', player: 1, card: 5, coord: { q: 1, r: -1 } },
      { t: 'Discard', player: 1, card: 6 },
    ];
    const groups = groupTurns(events);
    // It is seat 0's turn (the opponent, seat 1, has finished): their group is the last one in the
    // history and it is still the one to replay. This is the exact moment the owner asked for.
    expect(pickOpponentTurn(groups, 1, live(0))).toBe(1);
  });

  it('offers nothing while the opponent\'s group is still open', () => {
    const events: Event[] = [
      { t: 'Draw', player: 0, from: 'deck', card: 1 },
      { t: 'Discard', player: 0, card: 3 },
      { t: 'Draw', player: 1, from: 'deck', card: 4 },
      { t: 'Sprout', player: 1, card: 5, coord: { q: 1, r: -1 } },
    ];
    const groups = groupTurns(events);
    expect(pickOpponentTurn(groups, 1, live(1))).toBeNull();
  });

  it('offers nothing on turn one, when the opponent has not moved at all', () => {
    const events: Event[] = [
      { t: 'Draw', player: 0, from: 'deck', card: 1 },
      { t: 'Sprout', player: 0, card: 2, coord: { q: 0, r: 1 } },
    ];
    expect(pickOpponentTurn(groupTurns(events), 1, live(0))).toBeNull();
  });

  it('offers nothing on a finished match (the finish screen owns the full replay)', () => {
    const events: Event[] = [
      { t: 'Draw', player: 0, from: 'deck', card: 1 },
      { t: 'Discard', player: 0, card: 2 },
      { t: 'Draw', player: 1, from: 'deck', card: 3 },
      { t: 'Strangle', player: 0 },
      { t: 'GameEnd', result: { winner: 1, reason: 'strangle', scores: [1, 2] } },
    ];
    expect(pickOpponentTurn(groupTurns(events), 1, live(0, true))).toBeNull();
  });
});

// ---------- the fold self-check (against REAL histories) ----------

describe('the opening board, rebuilt without the seed', () => {
  // A live online payload never carries the seed (protocol.ts), so `newGame` cannot be used. The
  // shortcut must be exactly the board `newGame` deals — proved against the engine itself.
  it('is exactly the board newGame deals, in engine space and in display space', () => {
    for (const seed of [1, 21, 33, 987, 4242]) {
      const start = newGame(seed);
      expect(openingBoard(start.config)).toEqual(start.board);
      expect(openingBoard(onlinePerspective(0).toDisplayState(start).config)).toEqual(start.board);
      expect(openingBoard(onlinePerspective(1).toDisplayState(start).config)).toEqual(displayBoard(start, 1));
    }
  });
});

describe('the fold self-check', () => {
  /** Three turns from a real game: me (turn 1), the opponent (turn 2), then me mid-turn 3. */
  const threeTurns = (seed: number) => {
    const t1 = playTurn(newGame(seed));
    const t2 = playTurn(t1.state);
    return { t1, t2, live: t2.state };
  };

  it('offers the opponent\'s turn when the fold reproduces the live board', async () => {
    const { t1, t2, live } = threeTurns(21);
    expect(t2.events.some((e) => e.t === 'Bloom' || e.t === 'Sprout'), 'the opponent grew something').toBe(true);
    const seat = 0 as const;
    const server: Server = { state: live, events: [...t1.events, ...t2.events], seat, gets: 0 };
    const os = openSession(server);

    const liveBoard = displayBoard(live, seat);
    const built = buildOpponentTurnReplay({
      events: historyFor(seat, server.events),
      opponent: 1,
      live: { actor: live.actor, finished: false },
      perspective: onlinePerspective(seat),
      startBoard: openingFor(live, seat),
      liveBoard,
      context: stepContextFor(viewFor(live, seat)),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // The board it starts on is the board BEFORE the opponent's turn …
    expect(built.replay.startBoard).toEqual(displayBoard(t1.state, seat));
    // … and its own steps end exactly where their turn ended.
    let board = built.replay.startBoard;
    for (const step of built.replay.steps) board = applyStep(board, step);
    expect(board).toEqual(displayBoard(t2.state, seat));
    // The session exposes the same turn, with the turn-start scores read off that board.
    await os.prepareOpponentTurnReplay();
    expect(os.opponentTurnReplay).not.toBeNull();
    const at = viewFor({ ...os.state, board: built.replay.startBoard }, 0);
    expect(os.opponentTurnReplay!.scores).toEqual([at.score, at.opponentScore]);
  });

  it('REFUSES a history one event short (a dropped Bloom)', () => {
    const { t1, t2, live } = threeTurns(21);
    const seat = 0 as const;
    const dropped = t2.events.findIndex((e) => e.t === 'Bloom' || e.t === 'Sprout');
    expect(dropped, 'the opponent placed tiles').toBeGreaterThanOrEqual(0);
    const corrupted = [...t1.events, ...t2.events].filter((_, i) => i !== t1.events.length + dropped);
    const built = buildOpponentTurnReplay({
      events: historyFor(seat, corrupted),
      opponent: 1,
      live: { actor: live.actor, finished: false },
      perspective: onlinePerspective(seat),
      startBoard: openingFor(live, seat),
      liveBoard: displayBoard(live, seat),
      context: stepContextFor(viewFor(live, seat)),
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toBe('unverified');
  });

  it('REFUSES when the live board has moved on (a draft of ours is on the screen)', () => {
    const { t1, t2, live } = threeTurns(21);
    const seat = 0 as const;
    // Our own un-committed Grow: the server history cannot know it, so the fold must disagree.
    const grown: Board = { ...displayBoard(live, seat) };
    const mine = Object.entries(grown).find(([, t]) => t && t.owner === 0 && !t.root);
    expect(mine).toBeTruthy();
    grown[mine![0]] = { owner: 0, strength: 9 };
    const built = buildOpponentTurnReplay({
      events: historyFor(seat, [...t1.events, ...t2.events]),
      opponent: 1,
      live: { actor: live.actor, finished: false },
      perspective: onlinePerspective(seat),
      startBoard: openingFor(live, seat),
      liveBoard: grown,
      context: stepContextFor(viewFor(live, seat)),
    });
    expect(built.ok).toBe(false);
  });

  it('works for seat 1, where every coord and owner is mirrored for display', () => {
    const { t1, live } = threeTurns(33);
    const seat = 1 as const;
    const built = buildOpponentTurnReplay({
      events: historyFor(seat, [...t1.events, ...playTurn(t1.state).events]),
      // For seat 1 the opponent is seat 0, whose only completed turn is the first one.
      opponent: 0,
      live: { actor: live.actor, finished: false },
      perspective: onlinePerspective(seat),
      startBoard: openingFor(live, seat),
      liveBoard: displayBoard(live, seat),
      context: stepContextFor(viewFor(live, seat)),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // It starts on the true opening board, mirrored like the live one …
    expect(built.replay.startBoard).toEqual(openingFor(live, seat));
    // … and its steps end exactly where seat 0's turn ended, in display space.
    let board = built.replay.startBoard;
    for (const step of built.replay.steps) board = applyStep(board, step);
    expect(board).toEqual(displayBoard(t1.state, seat));
    // The display board really is mirrored: seat 0's tiles are painted as the opponent (owner 1).
    expect(Object.values(board).some((t) => t && t.owner === 1 && !t.root)).toBe(true);
  });
});

// ---------- the online path: no mutation, one fetch, honest refusals ----------

describe('the online session offers the turn without touching the match', () => {
  const threeTurns = (seed: number) => {
    const t1 = playTurn(newGame(seed));
    const t2 = playTurn(t1.state);
    return { t1, t2, live: t2.state };
  };

  it('never mutates the committed state, the log or the driver', async () => {
    const { t1, t2, live } = threeTurns(21);
    const server: Server = { state: live, events: [...t1.events, ...t2.events], seat: 0, gets: 0 };
    const os = openSession(server);
    const before = JSON.stringify({ state: os.state, log: os.log });
    const snapBefore = { ...os.driver.snapshot() };
    await os.prepareOpponentTurnReplay();
    expect(os.opponentTurnReplay).not.toBeNull();
    expect(JSON.stringify({ state: os.state, log: os.log })).toBe(before);
    expect(os.log).toHaveLength(0);
    expect(os.driver.snapshot().revision).toBe(snapBefore.revision);
    expect(os.driver.pendingEvents()).toHaveLength(0);
    expect(os.isRevealing).toBe(false);
  });

  it('fetches the history once per revision, not per render', async () => {
    const { t1, t2, live } = threeTurns(21);
    const server: Server = { state: live, events: [...t1.events, ...t2.events], seat: 0, gets: 0 };
    const os = openSession(server);
    await os.prepareOpponentTurnReplay();
    const afterFirst = server.gets;
    for (let i = 0; i < 5; i++) {
      await os.prepareOpponentTurnReplay();
      void os.opponentTurnReplay;
    }
    expect(server.gets).toBe(afterFirst);
  });

  it('refuses quietly when the history cannot be fetched', async () => {
    const { t1, t2, live } = threeTurns(21);
    const server: Server = { state: live, events: [...t1.events, ...t2.events], seat: 0, gets: 0 };
    const os = openSession(server, { failHistory: true });
    await expect(os.prepareOpponentTurnReplay()).resolves.toBeUndefined();
    expect(os.opponentTurnReplay).toBeNull();
    expect(os.canReplayOpponentTurn).toBe(false);
    expect(os.turnReplayReason).toBe('unverified');
  });

  it('is not offered while the opponent is still moving, and is offered once they finish', async () => {
    const { t1 } = threeTurns(21);
    // The opponent's turn 2 has started (they drew) and nothing else: their group is the LAST one
    // and the actor is them, so it is still open. Their mid-turn moves are drafts on their own
    // device and are not in the public history, so there is nothing to replay yet.
    const mid = drawOnly(t1.state);
    const server: Server = { state: mid.state, events: [...t1.events, ...mid.events], seat: 0, gets: 0 };
    const waiting = openSession(server);
    await waiting.prepareOpponentTurnReplay();
    expect(mid.state.actor).toBe(1); // it really is their turn
    expect(waiting.turnReplayReason).toBe('no-turn');
    expect(waiting.opponentTurnReplay).toBeNull();
    expect(waiting.canReplayOpponentTurn).toBe(false);

    // …and the very same match, once their turn has ended, IS offered.
    const { t2, live } = threeTurns(21);
    const done: Server = { state: live, events: [...t1.events, ...t2.events], seat: 0, gets: 0 };
    const os = openSession(done);
    await os.prepareOpponentTurnReplay();
    expect(os.turnReplayReason).toBe('ok');
    expect(os.canReplayOpponentTurn).toBe(true);
    expect(os.opponentTurnReplay!.steps.length).toBeGreaterThan(0);
  });

  it('offers the mirrored turn to seat 1 as well', async () => {
    const { t1, t2, live } = threeTurns(33);
    // Seat 1's opponent is seat 0, whose turn is t1; the live position is after both turns.
    const server: Server = { state: live, events: [...t1.events, ...t2.events], seat: 1, gets: 0 };
    const os = openSession(server);
    await os.prepareOpponentTurnReplay();
    expect(os.turnReplayReason).toBe('ok');
    const replay = os.opponentTurnReplay!;
    expect(replay.opponent).toBe(0);
    // In display space the opponent (seat 0) is painted as the lava side, owner 1.
    expect(Object.values(replay.startBoard).some((t) => t && t.owner === 1)).toBe(true);
    let board = replay.startBoard;
    for (const step of replay.steps) board = applyStep(board, step);
    expect(board).toEqual(displayBoard(t1.state, 1));
  });
});
